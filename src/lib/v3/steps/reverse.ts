// reverse animation — visual choreography for BQN ⌽ (reverse on the
// major axis). NO squeeze. Cells keep canonical sizes end-to-end.
//
// Per-cell motion (not a global rotation):
//   * Outer pairs (cells[i] and cells[N-1-i] where i ≠ N-1-i): each
//     traces a bulged arc from its canonical position to its mirror's
//     canonical position. The bulge for that pair is the smallest one
//     that keeps it non-overlapping with every other cell at every
//     angle — data-driven, tight, no global one-size-fits-all margin.
//   * Self-mirror (the middle cell when N is odd): linear interpolation
//     from canonical-value position to canonical-⌽value position. No
//     horizontal detour — just slides directly. For symmetric layouts
//     this is a no-op; for asymmetric layouts (rows of different heights
//     in matrices) it moves only along the perpendicular-to-major axis.
//
// Frame is the union of cell paths inflated by PADDING, clamped to the
// viewBox so the outline never escapes the drawing area even when the
// input is large enough that the cells themselves do.
//
// Invariants across every snapshot:
//   * cells.length and cells[i].value are constant.
//   * cells[i].inner structure is constant.
//   * cells[i].id preserved from prevScene.
//   * No two cell rects share interior area at any frame.

import {
	PADDING,
	autoFitFrame,
	bboxOf,
	bqnValueToScene,
	sceneToBqnValue,
	translateScene,
} from '../layout';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import type { Cell, Rect, Scene, ViewBox } from '../scene';
import { lerpScene } from '../tween';

const FRAME_MORPH_SNAPS = 6;
const ROTATE_SNAPS = 24;
const BULGE_SAFETY = 1.03;
const BULGE_SAMPLES = 120;

type Point = { x: number; y: number };

export function reverseAnimation(prevScene: Scene): Scene[] {
	if (prevScene.kind !== 'array') {
		throw new Error('reverseAnimation: requires an array scene');
	}
	if (prevScene.cells.length <= 1) return [prevScene];

	const N = prevScene.cells.length;
	const { cx, cy } = bboxCentre(prevScene.cells);

	// End positions: canonical-⌽value layout.
	const data = sceneToBqnValue(prevScene);
	const reversedData = reverseFirstAxis(data);
	const endScene = bqnValueToScene(reversedData, prevScene.viewBox);
	if (endScene.kind !== 'array') {
		throw new Error('reverseAnimation: end scene must be array');
	}

	// canonical positions per cell (relative to pivot)
	const startPos: Point[] = prevScene.cells.map((c) => ({
		x: c.x + c.w / 2 - cx,
		y: c.y + c.h / 2 - cy,
	}));
	// for each cells[i], its end is the canonical position of cells[N-1-i]
	// in the reversed scene (that's where the content at index i in the
	// reversed value sits).
	const endPos: Point[] = prevScene.cells.map((_, i) => {
		const m = endScene.cells[N - 1 - i];
		return { x: m.x + m.w / 2 - cx, y: m.y + m.h / 2 - cy };
	});

	// Classify cells: outer (i ≠ N-1-i) take bulged arc; self-mirror
	// (i === N-1-i) takes linear lerp with no horizontal motion.
	const isSelfMirror = (i: number): boolean => i === N - 1 - i;

	// Per-cell bulge for outer cells. The bulge needed for cell i is
	// the largest one demanded by avoiding any other cell j at any θ
	// while both are on their respective paths.
	const bulges = prevScene.cells.map((cell, i) =>
		isSelfMirror(i)
			? 0
			: computeBulgeForCell(
					i,
					cell,
					prevScene.cells,
					startPos,
					endPos,
					isSelfMirror,
				),
	);

	// Replace prevScene's frame (which may legitimately exceed the
	// viewBox for inputs whose canonical layout is taller/wider than
	// the drawing area) with a viewBox-clamped version, so every
	// snapshot the animation emits has its outline inside the drawing
	// area. Cells inside may still exceed; that's the "no squeeze"
	// trade-off.
	const startFr = clampToViewBox(prevScene.frame, prevScene.viewBox);
	const animPrev: Scene = { ...prevScene, frame: startFr };
	const snapshots: Scene[] = [animPrev];

	// Phase 1: morph frame from clamped-canonical to staged.
	const stagedFr = stagedFrame(
		prevScene.cells,
		cx,
		cy,
		startPos,
		endPos,
		bulges,
		isSelfMirror,
		prevScene.viewBox,
	);
	const staged: Scene = { ...prevScene, frame: stagedFr };
	for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
		const t = k / FRAME_MORPH_SNAPS;
		snapshots.push(lerpScene(animPrev, staged, t));
	}

	// Phase 2: per-cell motion. Each cell moves along its own path.
	for (let k = 1; k <= ROTATE_SNAPS; k++) {
		const theta = (k / ROTATE_SNAPS) * Math.PI;
		snapshots.push(
			moveAllCells(
				staged,
				theta,
				cx,
				cy,
				startPos,
				endPos,
				bulges,
				isSelfMirror,
			),
		);
	}

	// Phase 3: contract frame back to auto-fit on the (now ⌽-positioned)
	// cells.
	const rotated = snapshots[snapshots.length - 1];
	if (rotated.kind !== 'array') {
		throw new Error('reverseAnimation: motion broke scene structure');
	}
	const endFr = clampToViewBox(autoFitFrame(rotated.cells), prevScene.viewBox);
	const endSnap: Scene = { ...rotated, frame: endFr };
	for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
		const t = k / FRAME_MORPH_SNAPS;
		snapshots.push(lerpScene(rotated, endSnap, t));
	}

	return snapshots;
}

// ── geometry helpers ──────────────────────────────────────────────────────

function bboxCentre(cells: readonly Cell[]): { cx: number; cy: number } {
	const bb = bboxOf(cells);
	return { cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
}

function clampToViewBox(r: Rect, vb: ViewBox): Rect {
	let x = Math.max(r.x, vb.x);
	let y = Math.max(r.y, vb.y);
	let right = Math.min(r.x + r.w, vb.x + vb.w);
	let bottom = Math.min(r.y + r.h, vb.y + vb.h);
	return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

function reverseFirstAxis(v: BqnStructuredValue): BqnStructuredValue {
	if (v.kind !== 'array') throw new Error('reverseFirstAxis: requires array');
	const first = v.shape[0];
	const stride = first === 0 ? 0 : v.data.length / first;
	const newData: BqnStructuredValue[] = [];
	for (let i = first - 1; i >= 0; i--) {
		for (let j = 0; j < stride; j++) {
			newData.push(v.data[i * stride + j]);
		}
	}
	return { kind: 'array', shape: v.shape, data: newData };
}

// ── per-cell paths ─────────────────────────────────────────────────────────

// Outer cell path: rotate canonical position around the pivot by θ, with
// the radial distance scaled by f(θ) = 1 + bulge·sin θ. So θ=0 is
// canonical-value, θ=π is canonical-⌽value (since 180° rotation maps the
// cell to its mirror, and f returns to 1), with the bulge swinging
// outward in between.
function outerPathAt(
	start: Point,
	bulge: number,
	theta: number,
): Point {
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const f = 1 + bulge * Math.sin(theta); // sin θ ≥ 0 for θ ∈ [0, π]
	return {
		x: f * (start.x * cos - start.y * sin),
		y: f * (start.x * sin + start.y * cos),
	};
}

// Self-mirror cell path: linear interpolation from canonical-value to
// canonical-⌽value, parameterised by θ/π. No bulge, no rotation —
// straight line.
function selfMirrorPathAt(
	start: Point,
	end: Point,
	theta: number,
): Point {
	const t = theta / Math.PI;
	return {
		x: start.x + (end.x - start.x) * t,
		y: start.y + (end.y - start.y) * t,
	};
}

function cellCentreAt(
	i: number,
	startPos: Point[],
	endPos: Point[],
	bulges: number[],
	isSelfMirror: (i: number) => boolean,
	theta: number,
): Point {
	return isSelfMirror(i)
		? selfMirrorPathAt(startPos[i], endPos[i], theta)
		: outerPathAt(startPos[i], bulges[i], theta);
}

// ── bulge computation ─────────────────────────────────────────────────────

// Smallest bulge for cell `i` such that at every θ ∈ (0, π) it doesn't
// overlap any other cell. The "other cells" follow whatever path they
// follow — bulged for outer pairs, linear for self-mirrors. For
// pairs of outer cells we make a conservative pass first (other cell at
// bulge=0 — i.e. just rotation), then bump cell i's bulge to compensate.
function computeBulgeForCell(
	i: number,
	cell: Cell,
	allCells: readonly Cell[],
	startPos: Point[],
	endPos: Point[],
	isSelfMirror: (i: number) => boolean,
): number {
	let bulge = 0;
	for (let j = 0; j < allCells.length; j++) {
		if (j === i) continue;
		const other = allCells[j];
		const halfWSum = (cell.w + other.w) / 2;
		const halfHSum = (cell.h + other.h) / 2;
		for (let s = 1; s < BULGE_SAMPLES; s++) {
			const theta = (s / BULGE_SAMPLES) * Math.PI;
			const otherPos = isSelfMirror(j)
				? selfMirrorPathAt(startPos[j], endPos[j], theta)
				: outerPathAt(startPos[j], 0, theta); // assume other has no bulge yet
			// Position of cell i at θ with current trial bulge:
			// |Δx| ≥ halfWSum OR |Δy| ≥ halfHSum.
			// Solve for bulge that makes that true.
			const cos = Math.cos(theta);
			const sin = Math.sin(theta);
			const rotX = startPos[i].x * cos - startPos[i].y * sin;
			const rotY = startPos[i].x * sin + startPos[i].y * cos;
			// p_i(θ) = f * (rotX, rotY); f = 1 + bulge * sin θ.
			// Δx = f * rotX − otherPos.x. Want |Δx| ≥ halfWSum.
			// (Same for y.)
			const sinTheta = Math.sin(theta);
			if (sinTheta < 1e-6) continue;
			const fForX = solveAbsLinear(rotX, -otherPos.x, halfWSum);
			const fForY = solveAbsLinear(rotY, -otherPos.y, halfHSum);
			// Easier side (lower f).
			const fNeeded = Math.min(fForX, fForY);
			if (fNeeded <= 1) continue;
			const bulgeNeeded = (fNeeded - 1) / sinTheta;
			if (bulgeNeeded > bulge) bulge = bulgeNeeded;
		}
	}
	return bulge * BULGE_SAFETY;
}

// Smallest non-negative f satisfying |a·f + b| ≥ c (c ≥ 0). If a=0 we
// need |b| ≥ c — return Infinity if not, 0 if yes (any f works). When a
// has a sign, the inequality splits into two half-lines; we take the
// smaller positive f that satisfies it. For the rotation case f ≥ 0
// always, so the meaningful root is the positive one.
function solveAbsLinear(a: number, b: number, c: number): number {
	if (Math.abs(a) < 1e-9) {
		return Math.abs(b) >= c ? 0 : Infinity;
	}
	// |a*f + b| ≥ c ⟺ a*f + b ≥ c OR a*f + b ≤ −c.
	// Solve each branch for the smallest f ≥ 0 that satisfies.
	const f1 = (c - b) / a; // a*f + b = c
	const f2 = (-c - b) / a; // a*f + b = −c
	// Branch satisfaction by sign of a:
	const candidates: number[] = [];
	if (a > 0) {
		if (f1 >= 0) candidates.push(f1); // a*f+b ≥ c when f ≥ f1
		// a*f+b ≤ −c when f ≤ f2 — requires f ≤ f2 AND f ≥ 0; need f2 ≥ 0.
		// But for f ≥ 0 and a > 0, this branch only has f = 0 as candidate
		// if 0 ≤ f2 (i.e., -c-b ≥ 0 → b ≤ -c).
		// Easier: take the boundary at f = 0 and check explicitly.
	} else {
		if (f2 >= 0) candidates.push(f2);
	}
	// f = 0 always works if |b| ≥ c.
	if (Math.abs(b) >= c) candidates.push(0);
	if (candidates.length === 0) return Infinity;
	return Math.min(...candidates);
}

// ── motion helpers ────────────────────────────────────────────────────────

function moveAllCells(
	scene: Scene,
	theta: number,
	cx: number,
	cy: number,
	startPos: Point[],
	endPos: Point[],
	bulges: number[],
	isSelfMirror: (i: number) => boolean,
): Scene {
	if (scene.kind !== 'array') return scene;
	const newCells = scene.cells.map((cell, i) => {
		const target = cellCentreAt(
			i,
			startPos,
			endPos,
			bulges,
			isSelfMirror,
			theta,
		);
		const newCx = cx + target.x;
		const newCy = cy + target.y;
		const newX = newCx - cell.w / 2;
		const newY = newCy - cell.h / 2;
		const tx = newX - cell.x;
		const ty = newY - cell.y;
		return {
			...cell,
			x: newX,
			y: newY,
			inner:
				cell.inner === null ? null : translateScene(cell.inner, tx, ty),
		};
	});
	return { ...scene, cells: newCells };
}

// Staged frame: tight rectangle containing every cell's path extent,
// inflated by PADDING, then clamped to the viewBox so the outline never
// escapes the drawing area.
function stagedFrame(
	cells: readonly Cell[],
	cx: number,
	cy: number,
	startPos: Point[],
	endPos: Point[],
	bulges: number[],
	isSelfMirror: (i: number) => boolean,
	viewBox: ViewBox,
): Rect {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	// Sample each cell's path and union the rects.
	for (let i = 0; i < cells.length; i++) {
		const c = cells[i];
		const halfW = c.w / 2;
		const halfH = c.h / 2;
		const SAMPLES = 48;
		for (let s = 0; s <= SAMPLES; s++) {
			const theta = (s / SAMPLES) * Math.PI;
			const p = cellCentreAt(
				i,
				startPos,
				endPos,
				bulges,
				isSelfMirror,
				theta,
			);
			const cellMinX = cx + p.x - halfW;
			const cellMaxX = cx + p.x + halfW;
			const cellMinY = cy + p.y - halfH;
			const cellMaxY = cy + p.y + halfH;
			if (cellMinX < minX) minX = cellMinX;
			if (cellMaxX > maxX) maxX = cellMaxX;
			if (cellMinY < minY) minY = cellMinY;
			if (cellMaxY > maxY) maxY = cellMaxY;
		}
	}
	let x = minX - PADDING;
	let y = minY - PADDING;
	let w = maxX - minX + 2 * PADDING;
	let h = maxY - minY + 2 * PADDING;
	// Clamp to viewBox so the outline stays in the drawing area.
	if (x < viewBox.x) {
		w -= viewBox.x - x;
		x = viewBox.x;
	}
	if (y < viewBox.y) {
		h -= viewBox.y - y;
		y = viewBox.y;
	}
	if (x + w > viewBox.x + viewBox.w) w = viewBox.x + viewBox.w - x;
	if (y + h > viewBox.y + viewBox.h) h = viewBox.y + viewBox.h - y;
	return { x, y, w, h };
}
