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
	const startCells = prevScene.cells;

	// Same reasoning as the mat path: more than 3 cells means inner
	// pairs that would tangle with the outer pair's perpendicular
	// track. Refuse for now.
	// Vec animation has known holes (mixed-sign and N>3); refuse
	// those rather than ship clipping. The mat path is the focus of
	// the current work.
	if (N > 3) return [prevScene];

	const endScene = computeReversedEndScene(prevScene);
	if (endScene === null || endScene.cells.length !== N) return [prevScene];

	const sortedByX = [...Array(N).keys()].sort((a, b) => {
		const ca = startCells[a];
		const cb = startCells[b];
		return ca.x + ca.w / 2 - (cb.x + cb.w / 2);
	});

	// Single global Δ. Cells in the swap pair must have enough
	// y-separation at mid x-swap to not overlap. For uniform-height
	// rows this is straightforward; for mixed-sign vecs the
	// asymmetric y baselines make this hard and we refuse instead.
	const allRects = [...startCells, ...endScene.cells];
	const rowTop = Math.min(...allRects.map((c) => c.y));
	const rowBottom = Math.max(...allRects.map((c) => c.y + c.h));
	let needDeltaUp = 0;
	let needDeltaDown = 0;
	for (let k = 0; k < Math.floor(N / 2); k++) {
		const leftIdx = sortedByX[k];
		const rightIdx = sortedByX[N - 1 - k];
		const leftCell = startCells[leftIdx];
		const rightCell = startCells[rightIdx];
		const leftTargetY = endScene.cells[N - 1 - k].y;
		const rightTargetY = endScene.cells[k].y;
		const leftAnchor = Math.min(leftCell.y, leftTargetY);
		needDeltaUp = Math.max(
			needDeltaUp,
			leftAnchor + leftCell.h - (rowTop - PADDING),
		);
		const rightAnchor = Math.max(rightCell.y, rightTargetY);
		needDeltaDown = Math.max(needDeltaDown, rowBottom + PADDING - rightAnchor);
	}
	const needDelta = Math.max(needDeltaUp, needDeltaDown);

	let upRoom = Infinity;
	let downRoom = Infinity;
	for (let k = 0; k < Math.floor(N / 2); k++) {
		const leftIdx = sortedByX[k];
		const rightIdx = sortedByX[N - 1 - k];
		const leftCell = startCells[leftIdx];
		const rightCell = startCells[rightIdx];
		const leftTargetY = endScene.cells[N - 1 - k].y;
		const rightTargetY = endScene.cells[k].y;
		const leftAnchor = Math.min(leftCell.y, leftTargetY);
		const rightAnchor = Math.max(rightCell.y, rightTargetY);
		upRoom = Math.min(upRoom, leftAnchor - (vb.y + PADDING));
		downRoom = Math.min(
			downRoom,
			vb.y + vb.h - PADDING - (rightAnchor + rightCell.h),
		);
	}
	if (!isFinite(upRoom)) upRoom = 0;
	if (!isFinite(downRoom)) downRoom = 0;
	const delta = Math.min(needDelta, upRoom, downRoom);
	if (delta < needDelta - 0.5) return [prevScene];

	// Innermost pair first, outermost last (sequential).
	const pairs: Array<{ leftIdx: number; rightIdx: number; sortedPos: number }> = [];
	for (let k = Math.floor(N / 2) - 1; k >= 0; k--) {
		pairs.push({
			leftIdx: sortedByX[k],
			rightIdx: sortedByX[N - 1 - k],
			sortedPos: k,
		});
	}

	const snapshots: Scene[] = [prevScene];

	const stagedRects: Rect[] = [];
	for (const c of startCells) {
		stagedRects.push({ x: c.x, y: c.y - delta, w: c.w, h: c.h + 2 * delta });
	}
	const stagedFrame = frameOfRects(stagedRects, vb);
	let curScene: ArrayScene = { ...prevScene, frame: stagedFrame };
	for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
		const t = k / FRAME_MORPH_SNAPS;
		snapshots.push(lerpFrameOnly(prevScene, curScene, t));
	}
	snapshots.push(curScene);

	// Self-mirror only (odd N) lerps X during the first pair's phase B.
	const passengerIndices: number[] = [];
	const passengerStartX = new Map<number, number>();
	const passengerTargetX = new Map<number, number>();
	if (N % 2 === 1) {
		const midSp = Math.floor(N / 2);
		const idx = sortedByX[midSp];
		passengerIndices.push(idx);
		passengerStartX.set(idx, curScene.cells[idx].x);
		passengerTargetX.set(idx, endScene.cells[midSp].x);
	}

	let pairIter = 0;
	for (const { leftIdx, rightIdx, sortedPos } of pairs) {
		const isFirstPair = pairIter === 0;
		pairIter++;
		void sortedPos;
		const left = curScene.cells[leftIdx];
		const right = curScene.cells[rightIdx];
		const leftStartX = left.x;
		const rightStartX = right.x;
		const leftStartY = left.y;
		const rightStartY = right.y;
		const leftEndRect = endScene.cells[N - 1 - sortedByX.indexOf(leftIdx)];
		const rightEndRect = endScene.cells[sortedByX.indexOf(leftIdx)];
		const leftTargetX = leftEndRect.x;
		const leftTargetY = leftEndRect.y;
		const rightTargetX = rightEndRect.x;
		const rightTargetY = rightEndRect.y;
		const leftShiftedY = Math.min(leftStartY, leftTargetY) - delta;
		const rightShiftedY = Math.max(rightStartY, rightTargetY) + delta;

		// Phase A: left UP, right DOWN.
		for (let k = 1; k <= PHASE_SNAPS; k++) {
			const t = k / PHASE_SNAPS;
			curScene = moveCells(curScene, [
				{ idx: leftIdx, x: leftStartX, y: lerpNum(leftStartY, leftShiftedY, t) },
				{ idx: rightIdx, x: rightStartX, y: lerpNum(rightStartY, rightShiftedY, t) },
			]);
			snapshots.push(curScene);
		}

		// Phase B: swap X. Self-mirror lerps X here if this is the first pair.
		const includePassengers = isFirstPair;
		for (let k = 1; k <= PHASE_SNAPS; k++) {
			const t = k / PHASE_SNAPS;
			const updates = [
				{ idx: leftIdx, x: lerpNum(leftStartX, leftTargetX, t), y: leftShiftedY },
				{ idx: rightIdx, x: lerpNum(rightStartX, rightTargetX, t), y: rightShiftedY },
			];
			if (includePassengers) {
				for (const idx of passengerIndices) {
					updates.push({
						idx,
						x: lerpNum(passengerStartX.get(idx)!, passengerTargetX.get(idx)!, t),
						y: curScene.cells[idx].y,
					});
				}
			}
			curScene = moveCells(curScene, updates);
			snapshots.push(curScene);
		}

		// Phase C: drop/climb back to natural Y.
		for (let k = 1; k <= PHASE_SNAPS; k++) {
			const t = k / PHASE_SNAPS;
			curScene = moveCells(curScene, [
				{ idx: leftIdx, x: leftTargetX, y: lerpNum(leftShiftedY, leftTargetY, t) },
				{ idx: rightIdx, x: rightTargetX, y: lerpNum(rightShiftedY, rightTargetY, t) },
			]);
			snapshots.push(curScene);
		}
	}

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
