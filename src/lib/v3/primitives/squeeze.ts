// squeeze primitive — normalise the scene so any subsequent motion
// primitive (rotate, …) is geometrically CLEAN: every cell at every level
// becomes a unit-sized tile, and the cells at each level are RE-SPACED
// along their major axis so the rotation arc around the bbox centre is
// overlap-free for any angle.
//
// Per level the work is:
//
//   1) Every leaf atomic cell collapses to a unit square (BAR_WIDTH ×
//      BAR_WIDTH) bottom-anchored to its row baseline. Negatives move up
//      to sit alongside positives — colour and label tell sign, geometry
//      is uniform.
//   2) Wrapper cells recurse, then have their rect rebuilt to match the
//      new inner scene's frame.
//   3) Cells at this level are RE-SPACED along the level's major axis
//      (rank-1 = x, rank-2 outer = y) so that adjacent centres are at
//      least `max(cell perpendicular dim) + GAP` apart. That guarantees:
//      at any rotation angle around the level's bbox centre, two cells'
//      axis-aligned rects (cells stay axis-aligned in our rotate; only
//      their centres orbit) cannot overlap, because at the worst-case
//      angle (centres rotated onto the perpendicular axis) the centre
//      separation still exceeds each cell's width along that axis.
//   4) The cells' bbox centre is preserved by the respacing — the
//      rotation pivot stays put.
//   5) The TOP-LEVEL frame is then STAGED: a square centred on the cells
//      and large enough to fit any 180° rotation extent of those (now
//      respaced) cells. The stage IS the working area for whatever
//      primitive runs next.
//
// Spec (paraphrased from user):
//   "We need to normalize with squeeze and denormalize with unsqueeze.
//    Squeeze normalizes centers and things so that rotate is always a
//    clean thing. No data should carry over so unsqueeze can figure out
//    from data what it should be."

import {
	BAR_WIDTH,
	GAP,
	PADDING,
	autoFitFrame,
	bboxOf,
	translateScene,
} from '../layout';
import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type SqueezeParams = Record<string, never>;

function squeezeAtomCell(c: Cell): Cell {
	const baseline = c.value < 0 ? c.y : c.y + c.h;
	return { ...c, y: baseline - BAR_WIDTH, h: BAR_WIDTH };
}

function rebuildWrapperRect(cell: Cell, newInner: Scene): Cell {
	if (newInner.kind === 'atom') {
		const a = newInner.atom;
		return { ...cell, x: a.x, y: a.y, w: a.w, h: a.h, inner: newInner };
	}
	return {
		...cell,
		x: newInner.frame.x,
		y: newInner.frame.y,
		w: newInner.frame.w,
		h: newInner.frame.h,
		inner: newInner,
	};
}

function translateCell(c: Cell, dx: number, dy: number): Cell {
	return {
		...c,
		x: c.x + dx,
		y: c.y + dy,
		inner: c.inner === null ? null : translateScene(c.inner, dx, dy),
	};
}

// Respace cells along the level's major axis so adjacent centre-to-centre
// distance ≥ max(cell perpendicular dim) + GAP. Preserves the cells' bbox
// centre on the major axis (so the rotation pivot is unaffected) and the
// perpendicular position of each cell.
function respaceAlongMajorAxis(
	cells: Cell[],
	rank: number,
): Cell[] {
	if (cells.length <= 1) return cells;
	// rank-1 stacks along x; rank-2 outer stacks along y. Higher ranks are
	// not laid out yet (layoutValue throws), so we won't see them.
	const majorY = rank === 2;
	let maxPerp = 0;
	for (const c of cells) {
		const perp = majorY ? c.w : c.h;
		if (perp > maxPerp) maxPerp = perp;
	}
	const spacing = maxPerp + GAP;
	// Old centre on the major axis (preserve this — rotation pivot).
	const bb = bboxOf(cells);
	const oldMid = majorY ? (bb.y + bb.h / 2) : (bb.x + bb.w / 2);
	// Sort original indices by their cell's centre on the major axis.
	const order = cells.map((_, i) => i).sort((i, j) => {
		const ci = majorY ? cells[i].y + cells[i].h / 2 : cells[i].x + cells[i].w / 2;
		const cj = majorY ? cells[j].y + cells[j].h / 2 : cells[j].x + cells[j].w / 2;
		return ci - cj;
	});
	const N = cells.length;
	const startCentre = oldMid - ((N - 1) * spacing) / 2;
	const out = [...cells];
	for (let k = 0; k < N; k++) {
		const idx = order[k];
		const cell = cells[idx];
		const oldCentre = majorY ? cell.y + cell.h / 2 : cell.x + cell.w / 2;
		const newCentre = startCentre + k * spacing;
		const delta = newCentre - oldCentre;
		if (delta === 0) {
			out[idx] = cell;
		} else {
			out[idx] = translateCell(cell, majorY ? 0 : delta, majorY ? delta : 0);
		}
	}
	return out;
}

function squeezeRecursive(scene: Scene): Scene {
	if (scene.kind === 'atom') {
		return { ...scene, atom: squeezeAtomCell(scene.atom) };
	}
	// 1. Recursively squeeze each cell, then rebuild wrapper rects from
	//    the freshly-squeezed inner.
	let newCells = scene.cells.map((cell) => {
		if (cell.inner === null) return squeezeAtomCell(cell);
		const newInner = squeezeRecursive(cell.inner);
		return rebuildWrapperRect(cell, newInner);
	});
	// 2. Respace along this level's major axis (no-op for length ≤ 1; near
	//    no-op for unit-square atoms already at GAP-tight spacing).
	newCells = respaceAlongMajorAxis(newCells, scene.shape.length);
	// 3. Inner-level frame auto-fits the now-respaced cells. The top-level
	//    frame is staged separately, after this returns.
	return { ...scene, cells: newCells, frame: autoFitFrame(newCells) };
}

function stageTopFrame(scene: Scene): Scene {
	if (scene.kind === 'atom') return scene;
	if (scene.cells.length === 0) return scene;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let maxHalfDim = 0;
	for (const c of scene.cells) {
		if (c.x < minX) minX = c.x;
		if (c.y < minY) minY = c.y;
		if (c.x + c.w > maxX) maxX = c.x + c.w;
		if (c.y + c.h > maxY) maxY = c.y + c.h;
		const halfW = c.w / 2;
		const halfH = c.h / 2;
		if (halfW > maxHalfDim) maxHalfDim = halfW;
		if (halfH > maxHalfDim) maxHalfDim = halfH;
	}
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	let rMax = 0;
	for (const c of scene.cells) {
		const dx = c.x + c.w / 2 - cx;
		const dy = c.y + c.h / 2 - cy;
		const r = Math.sqrt(dx * dx + dy * dy);
		if (r > rMax) rMax = r;
	}
	const side = 2 * (rMax + maxHalfDim) + 2 * PADDING;
	const frame = {
		x: cx - side / 2,
		y: cy - side / 2,
		w: side,
		h: side,
	};
	return { ...scene, frame };
}

export const squeeze: Primitive<SqueezeParams> = (
	fromScene,
): PrimitiveResult => {
	const squeezed = squeezeRecursive(fromScene);
	const staged = stageTopFrame(squeezed);
	return { snapshots: [fromScene, staged], toScene: staged };
};
