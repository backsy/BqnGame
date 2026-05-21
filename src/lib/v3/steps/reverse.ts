// reverse animation — visual choreography for BQN ⌽ (reverse on the
// major axis).
//
// Two shape-specific paths, both designed so cells stay inside the
// viewBox and never pass through each other at any point along the
// motion:
//
//   • Rank-2 (mat): rows swap top↔bottom along axis 0. Each swap-pair
//     follows an L-shaped detour in x — the top row steps RIGHT out
//     of the column, slides DOWN past the column gap, then steps LEFT
//     back into the column at the partner's slot. The bottom row
//     mirrors on the other side (LEFT, UP, RIGHT). Pairs swap one at
//     a time so intermediate rows (and pairs that already swapped)
//     don't get walked over.
//
//   • Rank-1 (vec): cells swap left↔right along axis 0. Each
//     swap-pair detours perpendicular to the row — left-half cell
//     UP, RIGHT, DOWN; right-half cell DOWN, LEFT, UP. Same
//     one-pair-at-a-time sequencing, same containment guarantee.
//
// In both shapes the self-mirror element (the middle cell when N is
// odd) doesn't move.
//
// The detour magnitude is chosen so the moving cell never overlaps a
// stationary cell at any frame, then clamped against the viewBox. If
// the clamp would shrink the detour below the no-overlap threshold
// (matrix too wide / vec too tall for the available perpendicular
// room), the animation returns just [prevScene] rather than produce
// a snapshot list with clipping. The harness can fall back to a
// jump-cut for those inputs.
//
// Scenes that contain `kind: 'ellipsis'` cells are also refused —
// fit-based ellipsis is lossy (CLAUDE.md rule 15) and the hidden
// cells can't ride along.

import {
	PADDING,
	autoFitFrame,
	bqnValueToScene,
	sceneToBqnValue,
	translateScene,
} from '../layout';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import type { Cell, Rect, Scene, ViewBox } from '../scene';
import { lerpScene } from '../tween';

const FRAME_MORPH_SNAPS = 4;
const PHASE_SNAPS = 6;

// ── public entry ─────────────────────────────────────────────────────────────

export function reverseAnimation(prevScene: Scene): Scene[] {
	if (prevScene.kind !== 'array') {
		throw new Error('reverseAnimation: requires an array scene');
	}
	if (prevScene.cells.length <= 1) return [prevScene];

	if (sceneHasEllipsis(prevScene)) return [prevScene];

	if (prevScene.shape.length === 2) return matReverseAnimation(prevScene);
	if (prevScene.shape.length === 1) return vecReverseAnimation(prevScene);
	return [prevScene];
}

// ── shared helpers ───────────────────────────────────────────────────────────

/** End scene for a reverse animation: layout fresh from the reversed
 *  BQN value. We use its cell rects as the per-cell target rects
 *  (cell #i in `prevScene` targets `endScene.cells[N-1-i]`). Returns
 *  null if the scene can't be roundtripped (only happens when the
 *  caller skipped the ellipsis guard). */
function computeReversedEndScene(prevScene: Scene): Extract<Scene, { kind: 'array' }> | null {
	try {
		const data = sceneToBqnValue(prevScene);
		const reversed = reverseFirstAxis(data);
		const end = bqnValueToScene(reversed, prevScene.viewBox);
		if (end.kind !== 'array') return null;
		return end;
	} catch {
		return null;
	}
}

function reverseFirstAxis(v: BqnStructuredValue): BqnStructuredValue {
	if (v.kind !== 'array') throw new Error('reverseFirstAxis: requires array');
	const first = v.shape[0];
	const stride = first === 0 ? 0 : v.data.length / first;
	const data: BqnStructuredValue[] = [];
	for (let i = first - 1; i >= 0; i--) {
		for (let j = 0; j < stride; j++) data.push(v.data[i * stride + j]);
	}
	return { kind: 'array', shape: v.shape, data };
}

function sceneHasEllipsis(scene: Scene): boolean {
	if (scene.kind === 'atom') return false;
	for (const c of scene.cells) {
		if (c.kind === 'ellipsis') return true;
		if (c.inner !== null && sceneHasEllipsis(c.inner)) return true;
	}
	return false;
}

const lerpNum = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Move two cells (by index) to new (x, y), translating their inner
 *  scenes to ride along. All other cells unchanged. Frame untouched
 *  — the caller is responsible for keeping it ahead of the cells. */
type ArrayScene = Extract<Scene, { kind: 'array' }>;

function moveCells(
	scene: ArrayScene,
	updates: Array<{ idx: number; x: number; y: number }>,
): ArrayScene {
	const byIdx = new Map(updates.map((u) => [u.idx, u]));
	const cells = scene.cells.map((cell, i) => {
		const upd = byIdx.get(i);
		if (!upd) return cell;
		const dx = upd.x - cell.x;
		const dy = upd.y - cell.y;
		return {
			...cell,
			x: upd.x,
			y: upd.y,
			inner: cell.inner === null ? null : translateScene(cell.inner, dx, dy),
		};
	});
	return { ...scene, cells };
}

/** Auto-fit + clamp to viewBox. */
function fittedFrame(cells: readonly Cell[], vb: ViewBox): Rect {
	const r = autoFitFrame(cells);
	return clampToViewBox(r, vb);
}

function clampToViewBox(r: Rect, vb: ViewBox): Rect {
	const x = Math.max(r.x, vb.x);
	const y = Math.max(r.y, vb.y);
	const right = Math.min(r.x + r.w, vb.x + vb.w);
	const bottom = Math.min(r.y + r.h, vb.y + vb.h);
	return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

/** Frame big enough to contain every (x, y, w, h) in `rects`, padded
 *  by PADDING and clamped to the viewBox. */
function frameOfRects(rects: readonly Rect[], vb: ViewBox): Rect {
	if (rects.length === 0) return { x: vb.x, y: vb.y, w: 0, h: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const r of rects) {
		if (r.x < minX) minX = r.x;
		if (r.y < minY) minY = r.y;
		if (r.x + r.w > maxX) maxX = r.x + r.w;
		if (r.y + r.h > maxY) maxY = r.y + r.h;
	}
	const padded: Rect = {
		x: minX - PADDING,
		y: minY - PADDING,
		w: maxX - minX + 2 * PADDING,
		h: maxY - minY + 2 * PADDING,
	};
	return clampToViewBox(padded, vb);
}

// ── rank-2: row-swap L-path ─────────────────────────────────────────────────

function matReverseAnimation(prevScene: Scene): Scene[] {
	if (prevScene.kind !== 'array') {
		throw new Error('matReverseAnimation: requires array scene');
	}
	const R = prevScene.cells.length;
	const vb = prevScene.viewBox;
	const startCells = prevScene.cells;

	// End positions: a fresh layout of the reversed value. We can't
	// just swap Y positions of the existing wrappers — rows of
	// different heights produce different total stacking, so the
	// natural layout shifts the rest of the column to fit. Cell #i's
	// rect at the end of the animation is `endScene.cells[R-1-i]`.
	const endScene = computeReversedEndScene(prevScene);
	if (endScene === null || endScene.cells.length !== R) return [prevScene];

	// Pair cells by their CURRENT sorted-Y position (top↔bottom),
	// NOT by array index. Array order is preserved across snapshots
	// for cell-id stability, but after one reverse it no longer
	// matches visual order. Sorted-Y pairing makes reverse∘reverse
	// = identity on cell positions for any input.
	const sortedByY = [...Array(R).keys()].sort((a, b) => {
		const ca = startCells[a];
		const cb = startCells[b];
		return ca.y + ca.h / 2 - (cb.y + cb.h / 2);
	});

	// Parallel pair swap with nested lateral slots. All pairs do
	// their L-detour at the same time, each at its own lateral
	// offset Δ_k. The outermost pair (k=0) sits at the largest Δ;
	// inner pairs are nested inside.
	//
	// Slot spacing: each pair's cell must clear the next-outer
	// pair's cell horizontally by at least PADDING. With per-pair
	// step W + PADDING the rectangles never overlap.
	//
	//   Δ_innermost = W/2 + PADDING   (so the inner pair clears
	//                                   itself across the column)
	//   Δ_k         = Δ_innermost + (innermost − k) · (W + PADDING)
	//
	// Phase A (all pairs lateral out), phase B (all pairs swap Y +
	// self-mirror lerps Y), phase C (all pairs back to column at
	// natural Y). At every frame each pair lives in its own
	// vertical strip — column or one of the lateral slots — so no
	// pair shares an x-range with any other pair.
	const numPairs = Math.floor(R / 2);
	const hasSelfMirror = R % 2 === 1;
	const allRects = [...startCells, ...endScene.cells];
	const maxW = Math.max(...allRects.map((c) => c.w));
	// Innermost pair's Δ has to clear the column cell at the
	// self-mirror sortedPos (one cell-width + padding). When there
	// is no self-mirror the column is empty during the swap, so the
	// innermost pair only needs to separate from its own partner
	// across the column → ½W + PADDING is enough.
	const baseDelta = (hasSelfMirror ? maxW : maxW / 2) + PADDING;
	const nestStep = maxW + PADDING;
	const deltaForPair = (k: number): number =>
		baseDelta + (numPairs - 1 - k) * nestStep;

	type PairData = {
		topIdx: number;
		botIdx: number;
		sortedPos: number;
		topStartX: number;
		topStartY: number;
		botStartX: number;
		botStartY: number;
		topTargetX: number;
		topTargetY: number;
		botTargetX: number;
		botTargetY: number;
		topShiftedX: number;
		botShiftedX: number;
	};
	const pairData: PairData[] = [];
	for (let k = 0; k < numPairs; k++) {
		const topIdx = sortedByY[k];
		const botIdx = sortedByY[R - 1 - k];
		const top = startCells[topIdx];
		const bot = startCells[botIdx];
		const topEnd = endScene.cells[R - 1 - k];
		const botEnd = endScene.cells[k];
		const d = deltaForPair(k);
		pairData.push({
			topIdx,
			botIdx,
			sortedPos: k,
			topStartX: top.x,
			topStartY: top.y,
			botStartX: bot.x,
			botStartY: bot.y,
			topTargetX: topEnd.x,
			topTargetY: topEnd.y,
			botTargetX: botEnd.x,
			botTargetY: botEnd.y,
			topShiftedX: Math.max(top.x, topEnd.x) + d,
			botShiftedX: Math.min(bot.x, botEnd.x) - d,
		});
	}

	// Feasibility: every shifted x must stay inside the viewBox.
	for (const p of pairData) {
		const topCell = startCells[p.topIdx];
		const botCell = startCells[p.botIdx];
		if (p.topShiftedX + topCell.w > vb.x + vb.w - PADDING) return [prevScene];
		if (p.botShiftedX < vb.x + PADDING) return [prevScene];
	}

	// Self-mirror (odd R): not in any pair. Slides Y to its natural
	// slot during phase B, when the column is otherwise empty.
	let selfMirror: { idx: number; startY: number; targetY: number } | null = null;
	if (R % 2 === 1) {
		const midSp = Math.floor(R / 2);
		const idx = sortedByY[midSp];
		selfMirror = {
			idx,
			startY: startCells[idx].y,
			targetY: endScene.cells[midSp].y,
		};
	}

	const snapshots: Scene[] = [prevScene];

	// Staged frame: bounding box of every lateral slot all pairs
	// will occupy.
	const stagedRects: Rect[] = [];
	for (const p of pairData) {
		const topCell = startCells[p.topIdx];
		const botCell = startCells[p.botIdx];
		stagedRects.push({ x: p.topShiftedX, y: topCell.y, w: topCell.w, h: topCell.h });
		stagedRects.push({ x: p.botShiftedX, y: botCell.y, w: botCell.w, h: botCell.h });
	}
	for (const c of startCells) {
		stagedRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
	}
	for (const c of endScene.cells) {
		stagedRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
	}
	const stagedFrame = frameOfRects(stagedRects, vb);
	let curScene: ArrayScene = { ...prevScene, frame: stagedFrame };
	for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
		const t = k / FRAME_MORPH_SNAPS;
		snapshots.push(lerpFrameOnly(prevScene, curScene, t));
	}
	snapshots.push(curScene);

	// Phase A: all pairs lateral out in parallel.
	for (let s = 1; s <= PHASE_SNAPS; s++) {
		const t = s / PHASE_SNAPS;
		const updates: Array<{ idx: number; x: number; y: number }> = [];
		for (const p of pairData) {
			updates.push({
				idx: p.topIdx,
				x: lerpNum(p.topStartX, p.topShiftedX, t),
				y: p.topStartY,
			});
			updates.push({
				idx: p.botIdx,
				x: lerpNum(p.botStartX, p.botShiftedX, t),
				y: p.botStartY,
			});
		}
		curScene = moveCells(curScene, updates);
		snapshots.push(curScene);
	}

	// Phase B: all pairs swap Y in parallel. Self-mirror also lerps
	// Y here (column is empty of active-pair cells, all of which
	// are at their lateral slots).
	for (let s = 1; s <= PHASE_SNAPS; s++) {
		const t = s / PHASE_SNAPS;
		const updates: Array<{ idx: number; x: number; y: number }> = [];
		for (const p of pairData) {
			updates.push({
				idx: p.topIdx,
				x: p.topShiftedX,
				y: lerpNum(p.topStartY, p.topTargetY, t),
			});
			updates.push({
				idx: p.botIdx,
				x: p.botShiftedX,
				y: lerpNum(p.botStartY, p.botTargetY, t),
			});
		}
		if (selfMirror) {
			updates.push({
				idx: selfMirror.idx,
				x: curScene.cells[selfMirror.idx].x,
				y: lerpNum(selfMirror.startY, selfMirror.targetY, t),
			});
		}
		curScene = moveCells(curScene, updates);
		snapshots.push(curScene);
	}

	// Phase C: all pairs back to column at natural Y.
	for (let s = 1; s <= PHASE_SNAPS; s++) {
		const t = s / PHASE_SNAPS;
		const updates: Array<{ idx: number; x: number; y: number }> = [];
		for (const p of pairData) {
			updates.push({
				idx: p.topIdx,
				x: lerpNum(p.topShiftedX, p.topTargetX, t),
				y: p.topTargetY,
			});
			updates.push({
				idx: p.botIdx,
				x: lerpNum(p.botShiftedX, p.botTargetX, t),
				y: p.botTargetY,
			});
		}
		curScene = moveCells(curScene, updates);
		snapshots.push(curScene);
	}

	// Contract the frame back to auto-fit of the swapped layout.
	const endFrame = fittedFrame(curScene.cells, vb);
	const beforeContract = curScene;
	for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
		const t = k / FRAME_MORPH_SNAPS;
		const f = {
			x: lerpNum(beforeContract.frame.x, endFrame.x, t),
			y: lerpNum(beforeContract.frame.y, endFrame.y, t),
			w: lerpNum(beforeContract.frame.w, endFrame.w, t),
			h: lerpNum(beforeContract.frame.h, endFrame.h, t),
		};
		snapshots.push({ ...beforeContract, frame: f });
	}

	return snapshots;
}

// ── rank-1: per-cell L-path perpendicular to the row ────────────────────────

function vecReverseAnimation(prevScene: Scene): Scene[] {
	if (prevScene.kind !== 'array') {
		throw new Error('vecReverseAnimation: requires array scene');
	}
	const N = prevScene.cells.length;
	const vb = prevScene.viewBox;

	const naturalEnd = computeReversedEndScene(prevScene);
	if (naturalEnd === null || naturalEnd.cells.length !== N) return [prevScene];

	// Squish bars uniformly if the natural L-detour wouldn't fit
	// the viewBox. We pick the largest h_max such that the
	// outermost nested slot still fits above/below the row.
	// `picked` <= naturalHMax; if no squish is needed picked equals
	// naturalHMax and the helpers are no-ops.
	const naturalHMax = Math.max(...prevScene.cells.map((c) => c.h));
	const numPairs = Math.floor(N / 2);
	const hasSelfMirror = N % 2 === 1;
	const pickedHMax = pickHMaxForDetour(vb, naturalHMax, numPairs, hasSelfMirror);
	const squishFactor = pickedHMax / naturalHMax;
	if (squishFactor <= 0) return [prevScene];

	const squishedPrev =
		squishFactor < 1 ? squishVecScene(prevScene, vb, squishFactor) : prevScene;
	const squishedEndAny =
		squishFactor < 1 ? squishVecScene(naturalEnd, vb, squishFactor) : naturalEnd;
	if (squishedPrev.kind !== 'array' || squishedEndAny.kind !== 'array') {
		return [prevScene];
	}
	const squishedEnd = squishedEndAny;
	const startCells = squishedPrev.cells;

	const sortedByX = [...Array(N).keys()].sort((a, b) => {
		const ca = startCells[a];
		const cb = startCells[b];
		return ca.x + ca.w / 2 - (cb.x + cb.w / 2);
	});

	// Parallel pair swap with nested perpendicular slots — mirror of
	// the mat path, rotated 90°. Outermost pair (k=0) at the largest
	// Δ above/below the row; inner pairs nested inside.
	const allRects = [...startCells, ...squishedEnd.cells];
	const maxH = Math.max(...allRects.map((c) => c.h));
	const baseDelta = (hasSelfMirror ? maxH : maxH / 2) + PADDING;
	const nestStep = maxH + PADDING;
	const deltaForPair = (k: number): number =>
		baseDelta + (numPairs - 1 - k) * nestStep;

	type VecPairData = {
		leftIdx: number;
		rightIdx: number;
		leftStartX: number;
		leftStartY: number;
		rightStartX: number;
		rightStartY: number;
		leftTargetX: number;
		leftTargetY: number;
		rightTargetX: number;
		rightTargetY: number;
		leftShiftedY: number;
		rightShiftedY: number;
	};
	const pairData: VecPairData[] = [];
	for (let k = 0; k < numPairs; k++) {
		const leftIdx = sortedByX[k];
		const rightIdx = sortedByX[N - 1 - k];
		const left = startCells[leftIdx];
		const right = startCells[rightIdx];
		const leftEnd = squishedEnd.cells[N - 1 - k];
		const rightEnd = squishedEnd.cells[k];
		const d = deltaForPair(k);
		pairData.push({
			leftIdx,
			rightIdx,
			leftStartX: left.x,
			leftStartY: left.y,
			rightStartX: right.x,
			rightStartY: right.y,
			leftTargetX: leftEnd.x,
			leftTargetY: leftEnd.y,
			rightTargetX: rightEnd.x,
			rightTargetY: rightEnd.y,
			leftShiftedY: Math.min(left.y, leftEnd.y) - d,
			rightShiftedY: Math.max(right.y, rightEnd.y) + d,
		});
	}

	for (const p of pairData) {
		const rightCell = startCells[p.rightIdx];
		if (p.leftShiftedY < vb.y + PADDING) return [prevScene];
		if (p.rightShiftedY + rightCell.h > vb.y + vb.h - PADDING) return [prevScene];
	}

	let selfMirror: { idx: number; startX: number; targetX: number } | null = null;
	if (hasSelfMirror) {
		const midSp = Math.floor(N / 2);
		const idx = sortedByX[midSp];
		selfMirror = {
			idx,
			startX: startCells[idx].x,
			targetX: squishedEnd.cells[midSp].x,
		};
	}

	const snapshots: Scene[] = [prevScene];

	// Squish phase: lerp from natural prev to squished prev. Frame
	// expands to staged extent in the same window. The staged frame
	// has to contain EVERY rect cells will occupy at ANY phase —
	// squished cells at lateral slots (L-detour), squished cells at
	// the column (start + end), AND natural cells (prev + final
	// end after unsquish).
	const stagedRects: Rect[] = [];
	for (const p of pairData) {
		const leftCell = startCells[p.leftIdx];
		const rightCell = startCells[p.rightIdx];
		stagedRects.push({ x: leftCell.x, y: p.leftShiftedY, w: leftCell.w, h: leftCell.h });
		stagedRects.push({ x: rightCell.x, y: p.rightShiftedY, w: rightCell.w, h: rightCell.h });
	}
	for (const c of startCells) stagedRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
	for (const c of squishedEnd.cells) {
		stagedRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
	}
	for (const c of prevScene.cells) stagedRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
	for (const c of naturalEnd.cells) {
		stagedRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
	}
	const stagedFrame = frameOfRects(stagedRects, vb);
	const squishedStaged: ArrayScene = { ...squishedPrev, frame: stagedFrame };
	let curScene: ArrayScene = squishedStaged;
	if (squishFactor < 1) {
		for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
			const t = k / FRAME_MORPH_SNAPS;
			snapshots.push(lerpScene(prevScene, squishedStaged, t) as ArrayScene);
		}
	} else {
		for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
			const t = k / FRAME_MORPH_SNAPS;
			snapshots.push(lerpFrameOnly(prevScene, squishedStaged, t));
		}
	}
	snapshots.push(curScene);

	// Phase A: all pairs out vertically in parallel.
	for (let s = 1; s <= PHASE_SNAPS; s++) {
		const t = s / PHASE_SNAPS;
		const updates: Array<{ idx: number; x: number; y: number }> = [];
		for (const p of pairData) {
			updates.push({
				idx: p.leftIdx,
				x: p.leftStartX,
				y: lerpNum(p.leftStartY, p.leftShiftedY, t),
			});
			updates.push({
				idx: p.rightIdx,
				x: p.rightStartX,
				y: lerpNum(p.rightStartY, p.rightShiftedY, t),
			});
		}
		curScene = moveCells(curScene, updates);
		snapshots.push(curScene);
	}

	// Phase B: all pairs swap X in parallel. Self-mirror lerps X.
	for (let s = 1; s <= PHASE_SNAPS; s++) {
		const t = s / PHASE_SNAPS;
		const updates: Array<{ idx: number; x: number; y: number }> = [];
		for (const p of pairData) {
			updates.push({
				idx: p.leftIdx,
				x: lerpNum(p.leftStartX, p.leftTargetX, t),
				y: p.leftShiftedY,
			});
			updates.push({
				idx: p.rightIdx,
				x: lerpNum(p.rightStartX, p.rightTargetX, t),
				y: p.rightShiftedY,
			});
		}
		if (selfMirror) {
			updates.push({
				idx: selfMirror.idx,
				x: lerpNum(selfMirror.startX, selfMirror.targetX, t),
				y: curScene.cells[selfMirror.idx].y,
			});
		}
		curScene = moveCells(curScene, updates);
		snapshots.push(curScene);
	}

	// Phase C: all pairs back to the row baseline at natural Y.
	for (let s = 1; s <= PHASE_SNAPS; s++) {
		const t = s / PHASE_SNAPS;
		const updates: Array<{ idx: number; x: number; y: number }> = [];
		for (const p of pairData) {
			updates.push({
				idx: p.leftIdx,
				x: p.leftTargetX,
				y: lerpNum(p.leftShiftedY, p.leftTargetY, t),
			});
			updates.push({
				idx: p.rightIdx,
				x: p.rightTargetX,
				y: lerpNum(p.rightShiftedY, p.rightTargetY, t),
			});
		}
		curScene = moveCells(curScene, updates);
		snapshots.push(curScene);
	}

	// Unsquish phase: grow each cell's h back to its natural value
	// while keeping its id and x (= the L-detour landing column).
	// Cells were assigned values from `prevScene` and never lose
	// them; natural h is whatever the cell had in prevScene under
	// the same id.
	const unsquishedAny = unsquishToNatural(curScene, prevScene, vb);
	if (unsquishedAny.kind !== 'array') return [prevScene];
	const unsquishedEnd: ArrayScene = unsquishedAny;
	const endFrame = fittedFrame(unsquishedEnd.cells, vb);
	const finalEnd: ArrayScene = { ...unsquishedEnd, frame: endFrame };
	if (squishFactor < 1) {
		const intermediate: ArrayScene = { ...unsquishedEnd, frame: stagedFrame };
		for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
			const t = k / FRAME_MORPH_SNAPS;
			snapshots.push(lerpScene(curScene, intermediate, t) as ArrayScene);
		}
		for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
			const t = k / FRAME_MORPH_SNAPS;
			snapshots.push(lerpFrameOnly(intermediate, finalEnd, t));
		}
	} else {
		for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
			const t = k / FRAME_MORPH_SNAPS;
			snapshots.push(lerpFrameOnly(curScene, finalEnd, t));
		}
	}

	return snapshots;
}

// ── squish helpers (vec) ─────────────────────────────────────────────────────

/** Pick the largest h_max <= naturalHMax such that the outermost
 *  nested L-detour slot fits in the viewBox. Returns naturalHMax
 *  if no squish needed; returns 0 if even a squish doesn't fit. */
function pickHMaxForDetour(
	vb: ViewBox,
	naturalHMax: number,
	numPairs: number,
	hasSelfMirror: boolean,
): number {
	const usable = vb.h - 2 * PADDING;
	const baseCoef = hasSelfMirror ? 1 : 0.5;
	const k = numPairs - 1;
	// Stack budget (worst case): hMax (row) + 2 * Δ_outer.
	// Δ_outer = baseCoef * h + PAD + k * (h + PAD)
	// Substitute and solve for hMax:
	//   (1 + 2*(baseCoef+k)) * h + 2*(k+1)*PAD ≤ usable.
	const slope = 1 + 2 * (baseCoef + k);
	const cap = usable - 2 * (k + 1) * PADDING;
	if (cap <= 0) return 0;
	// Pull the result in by a few pixels so the L-detour doesn't
	// land exactly on the viewBox edge, where floating-point can
	// flip the feasibility check.
	const allowed = cap / slope - 2;
	return Math.max(0, Math.min(naturalHMax, allowed));
}

/** Re-anchor a vec scene's cells assuming bars shrink uniformly by
 *  `factor`. New baseline computed so the squished row sits at the
 *  viewBox's vertical centre. Atom-only vec (cell.inner null) is
 *  the common case. */
function squishVecScene(scene: Scene, vb: ViewBox, factor: number): Scene {
	if (scene.kind !== 'array' || scene.shape.length !== 1) return scene;
	const newHMax = factor * Math.max(...scene.cells.map((c) => c.h));
	const newBaseline = vb.y + vb.h / 2 + newHMax / 2;
	const newCells = scene.cells.map((c): Cell => {
		const isNeg = c.value < 0;
		const newH = c.h * factor;
		const newY = isNeg ? newBaseline : newBaseline - newH;
		return { ...c, y: newY, h: newH };
	});
	return { ...scene, cells: newCells, frame: autoFitFrame(newCells) };
}

/** Inverse of squish: grow each cell's h back to its natural value
 *  (looked up by id from prevScene), keep its x, recompute y for
 *  the new baseline. ids are stable so the unsquish lerp goes
 *  cell-to-cell. */
function unsquishToNatural(
	curScene: Scene,
	prevScene: Scene,
	vb: ViewBox,
): Scene {
	if (curScene.kind !== 'array' || prevScene.kind !== 'array') return curScene;
	const naturalHById = new Map<string, number>();
	for (const c of prevScene.cells) naturalHById.set(c.id, c.h);
	const naturalHMax = Math.max(...prevScene.cells.map((c) => c.h));
	const naturalBaseline = vb.y + vb.h / 2 + naturalHMax / 2;
	const newCells = curScene.cells.map((c): Cell => {
		const naturalH = naturalHById.get(c.id) ?? c.h;
		const isNeg = c.value < 0;
		const newY = isNeg ? naturalBaseline : naturalBaseline - naturalH;
		return { ...c, y: newY, h: naturalH };
	});
	return { ...curScene, cells: newCells, frame: autoFitFrame(newCells) };
}

// ── small helpers ────────────────────────────────────────────────────────────

/** Lerp just the frame between two structurally-identical scenes. */
function lerpFrameOnly(a: Scene, b: Scene, t: number): Scene {
	if (a.kind !== 'array' || b.kind !== 'array') {
		throw new Error('lerpFrameOnly: array scenes only');
	}
	return {
		...a,
		frame: {
			x: lerpNum(a.frame.x, b.frame.x, t),
			y: lerpNum(a.frame.y, b.frame.y, t),
			w: lerpNum(a.frame.w, b.frame.w, t),
			h: lerpNum(a.frame.h, b.frame.h, t),
		},
	};
}
