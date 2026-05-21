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

	// More than 3 rows means inner pairs whose cells share the
	// column with the outer pair's lateral track, plus each other.
	// The current one-pair-at-a-time L-detour can't separate them
	// without nested lateral slots. Refuse for now; game levels use
	// 2–3 row tables.
	if (R > 3) return [prevScene];

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

	// Required lateral detour: a moving row's far edge must clear
	// the column's near edge by at least PADDING. The column is
	// the union of stationary rows' x extents. We compare against
	// start AND end positions to cover the cell's whole trajectory.
	const allRects = [...startCells, ...endScene.cells];
	const columnLeft = Math.min(...allRects.map((c) => c.x));
	const columnRight = Math.max(...allRects.map((c) => c.x + c.w));
	let needDeltaRight = 0;
	let needDeltaLeft = 0;
	for (let k = 0; k < Math.floor(R / 2); k++) {
		const topIdx = sortedByY[k];
		const botIdx = sortedByY[R - 1 - k];
		const topCell = startCells[topIdx];
		const botCell = startCells[botIdx];
		const topTargetX = endScene.cells[R - 1 - k].x;
		const botTargetX = endScene.cells[k].x;
		// Top-half row goes RIGHT — its left edge must end up right
		// of the column. delta is measured from max(start, target).x.
		const topAnchor = Math.max(topCell.x, topTargetX);
		needDeltaRight = Math.max(needDeltaRight, columnRight + PADDING - topAnchor);
		// Bottom-half row goes LEFT — its right edge must end up
		// left of the column.
		const botAnchor = Math.min(botCell.x, botTargetX);
		needDeltaLeft = Math.max(needDeltaLeft, botAnchor + botCell.w - (columnLeft - PADDING));
	}
	const needDelta = Math.max(needDeltaRight, needDeltaLeft);

	// Feasibility against the viewBox.
	let rightRoom = Infinity;
	let leftRoom = Infinity;
	for (let k = 0; k < Math.floor(R / 2); k++) {
		const topIdx = sortedByY[k];
		const botIdx = sortedByY[R - 1 - k];
		const topCell = startCells[topIdx];
		const botCell = startCells[botIdx];
		const topTargetX = endScene.cells[R - 1 - k].x;
		const botTargetX = endScene.cells[k].x;
		const topAnchor = Math.max(topCell.x, topTargetX);
		const botAnchor = Math.min(botCell.x, botTargetX);
		rightRoom = Math.min(
			rightRoom,
			vb.x + vb.w - PADDING - (topAnchor + topCell.w),
		);
		leftRoom = Math.min(leftRoom, botAnchor - (vb.x + PADDING));
	}
	if (!isFinite(rightRoom)) rightRoom = 0;
	if (!isFinite(leftRoom)) leftRoom = 0;
	const delta = Math.min(needDelta, rightRoom, leftRoom);
	if (delta < needDelta - 0.5) return [prevScene];

	const pairs: Array<{ topIdx: number; botIdx: number; sortedPos: number }> = [];
	for (let k = 0; k < Math.floor(R / 2); k++) {
		pairs.push({
			topIdx: sortedByY[k],
			botIdx: sortedByY[R - 1 - k],
			sortedPos: k,
		});
	}

	const snapshots: Scene[] = [prevScene];

	// Staged frame: the maximal x extent any cell will visit, plus
	// PADDING, clamped to viewBox.
	const stagedRects: Rect[] = [];
	for (const c of startCells) {
		stagedRects.push({ x: c.x - delta, y: c.y, w: c.w + 2 * delta, h: c.h });
	}
	const stagedFrame = frameOfRects(stagedRects, vb);
	let curScene: ArrayScene = { ...prevScene, frame: stagedFrame };
	for (let k = 1; k <= FRAME_MORPH_SNAPS; k++) {
		const t = k / FRAME_MORPH_SNAPS;
		snapshots.push(lerpFrameOnly(prevScene, curScene, t));
	}
	snapshots.push(curScene);

	// All cells NOT in pair 0: lerp Y to the natural-reversed Y for
	// their CURRENT sorted position in parallel with pair 0's phase
	// B. Without this, an inner pair's cell (or the self-mirror in
	// odd-R) sits at its prev Y while pair 0 lands at the reversed
	// layout's natural Y — those two can be in different stacking
	// positions, so when pair 0's phase C slides the active cell
	// back to the column it walks through the inactive cell. By
	// piggy-backing the Y shift on pair 0's phase B (active pair
	// is laterally offset, column is otherwise empty), the inactive
	// cells reach their natural slots before phase C starts.
	const passengerIndices: number[] = [];
	for (let k = 1; k < R - 1; k++) {
		if (k === 0 || k === R - 1) continue;
		passengerIndices.push(sortedByY[k]);
	}
	const passengerTargetY = new Map<number, number>();
	const passengerStartY = new Map<number, number>();
	for (const idx of passengerIndices) {
		const sp = sortedByY.indexOf(idx);
		passengerStartY.set(idx, curScene.cells[idx].y);
		passengerTargetY.set(idx, endScene.cells[sp].y);
	}

	for (const { topIdx, botIdx, sortedPos } of pairs) {
		const top = curScene.cells[topIdx];
		const bot = curScene.cells[botIdx];
		const topStartX = top.x;
		const botStartX = bot.x;
		const topStartY = top.y;
		const botStartY = bot.y;
		// The cell currently at sorted-position k targets the natural
		// reversed layout's row at sorted-position R-1-k, and vice
		// versa. `endScene.cells[i]` is in shape-traversal order so
		// `endScene.cells[0]` is the topmost row, `cells[R-1]` the
		// bottommost.
		const topEndRect = endScene.cells[R - 1 - sortedPos];
		const botEndRect = endScene.cells[sortedPos];
		const topTargetX = topEndRect.x;
		const topTargetY = topEndRect.y;
		const botTargetX = botEndRect.x;
		const botTargetY = botEndRect.y;
		const topShiftedX = Math.max(topStartX, topTargetX) + delta;
		const botShiftedX = Math.min(botStartX, botTargetX) - delta;

		// Phase A: top RIGHT, bottom LEFT.
		for (let k = 1; k <= PHASE_SNAPS; k++) {
			const t = k / PHASE_SNAPS;
			curScene = moveCells(curScene, [
				{ idx: topIdx, x: lerpNum(topStartX, topShiftedX, t), y: topStartY },
				{ idx: botIdx, x: lerpNum(botStartX, botShiftedX, t), y: botStartY },
			]);
			snapshots.push(curScene);
		}

		// Phase B: top DOWN, bottom UP. Rows are now horizontally
		// separated by 2Δ > maxW, so they never share x-extent and
		// pass each other cleanly. For the outermost pair only, the
		// passenger cells (any row not in pair 0) ride along by
		// lerping y to their natural-reversed slot — see
		// `passengerIndices`.
		const includePassengers = sortedPos === 0;
		for (let k = 1; k <= PHASE_SNAPS; k++) {
			const t = k / PHASE_SNAPS;
			const updates = [
				{ idx: topIdx, x: topShiftedX, y: lerpNum(topStartY, topTargetY, t) },
				{ idx: botIdx, x: botShiftedX, y: lerpNum(botStartY, botTargetY, t) },
			];
			if (includePassengers) {
				for (const idx of passengerIndices) {
					updates.push({
						idx,
						x: curScene.cells[idx].x,
						y: lerpNum(passengerStartY.get(idx)!, passengerTargetY.get(idx)!, t),
					});
				}
			}
			curScene = moveCells(curScene, updates);
			snapshots.push(curScene);
		}

		// Phase C: top LEFT to its natural target column (from
		// `endScene`), bottom RIGHT to its natural target column.
		// Final positions equal a fresh layout of the reversed value.
		for (let k = 1; k <= PHASE_SNAPS; k++) {
			const t = k / PHASE_SNAPS;
			curScene = moveCells(curScene, [
				{ idx: topIdx, x: lerpNum(topShiftedX, topTargetX, t), y: topTargetY },
				{ idx: botIdx, x: lerpNum(botShiftedX, botTargetX, t), y: botTargetY },
			]);
			snapshots.push(curScene);
		}
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
	if (N > 3) return [prevScene];

	const endScene = computeReversedEndScene(prevScene);
	if (endScene === null || endScene.cells.length !== N) return [prevScene];

	const sortedByX = [...Array(N).keys()].sort((a, b) => {
		const ca = startCells[a];
		const cb = startCells[b];
		return ca.x + ca.w / 2 - (cb.x + cb.w / 2);
	});

	// Perpendicular detour magnitude: a moving cell's far edge must
	// clear the row's near edge (the union of every cell's y extent)
	// by PADDING. Without this the active cell would still share y
	// with a stationary cell when their x ranges cross during phase B.
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

	const pairs: Array<{ leftIdx: number; rightIdx: number; sortedPos: number }> = [];
	for (let k = 0; k < Math.floor(N / 2); k++) {
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

	// Passengers: cells not in pair 0. They ride along by lerping x
	// to their natural-reversed-slot x in parallel with pair 0's
	// phase B.
	const passengerIndices: number[] = [];
	for (let k = 1; k < N - 1; k++) {
		passengerIndices.push(sortedByX[k]);
	}
	const passengerStartX = new Map<number, number>();
	const passengerTargetX = new Map<number, number>();
	for (const idx of passengerIndices) {
		const sp = sortedByX.indexOf(idx);
		passengerStartX.set(idx, curScene.cells[idx].x);
		passengerTargetX.set(idx, endScene.cells[sp].x);
	}

	for (const { leftIdx, rightIdx, sortedPos } of pairs) {
		const left = curScene.cells[leftIdx];
		const right = curScene.cells[rightIdx];
		const leftStartX = left.x;
		const rightStartX = right.x;
		const leftStartY = left.y;
		const rightStartY = right.y;
		// Sorted-position k swaps to sorted-position N-1-k. The
		// natural reversed layout's `endScene.cells[i]` is in
		// shape-traversal order = left→right by x.
		const leftEndRect = endScene.cells[N - 1 - sortedPos];
		const rightEndRect = endScene.cells[sortedPos];
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

		// Phase B: left slides RIGHT over the row, right slides
		// LEFT under it. Vertical separation 2Δ > maxH keeps the
		// two rectangles from sharing y-extent. For the outermost
		// pair only, passenger cells ride along (lerp x to their
		// natural-reversed slot).
		const includePassengers = sortedPos === 0;
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

		// Phase C: drop / climb back to each cell's natural target
		// y from the reversed scene.
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
