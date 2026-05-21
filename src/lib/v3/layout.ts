// v3 layout — pure projection from a BQN value to a Scene.
//
// Visual constants match v2-harness's makeBar 1:1 so scalars look the
// same here as they do in v2 and the game. This module deals only in
// geometry (where rectangles sit, how tall they are); the renderer in
// the harness .svelte picks colours from `value` at draw time.

import type { BqnStructuredValue } from '$lib/bqn/protocol';
import type { Cell, Rect, Scene, ViewBox } from './scene';

// ── Geometric helpers shared with primitives ───────────────────────────────

/** Translate every cell (and recursively every inner scene's cells and
 *  frame) by (dx, dy). Pure: returns a fresh Scene; the input is untouched.
 *  Used by `rotate` to ride inner contents along upright with their wrapper,
 *  and by `squeeze` to slide a wrapper cell to its respaced position. */
export function translateScene(scene: Scene, dx: number, dy: number): Scene {
	if (scene.kind === 'atom') {
		const c = scene.atom;
		return { ...scene, atom: { ...c, x: c.x + dx, y: c.y + dy } };
	}
	return {
		...scene,
		cells: scene.cells.map((cell) => ({
			...cell,
			x: cell.x + dx,
			y: cell.y + dy,
			inner:
				cell.inner === null ? null : translateScene(cell.inner, dx, dy),
		})),
		frame: {
			x: scene.frame.x + dx,
			y: scene.frame.y + dy,
			w: scene.frame.w,
			h: scene.frame.h,
		},
	};
}

export function bboxOf(cells: readonly Cell[]): Rect {
	if (cells.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const c of cells) {
		if (c.x < minX) minX = c.x;
		if (c.y < minY) minY = c.y;
		if (c.x + c.w > maxX) maxX = c.x + c.w;
		if (c.y + c.h > maxY) maxY = c.y + c.h;
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The default "auto-fit" frame: bbox of cells inflated by PADDING.
 *  Used by initial layout and by unsqueeze when restoring the data view. */
export function autoFitFrame(cells: readonly Cell[]): Rect {
	const bb = bboxOf(cells);
	return {
		x: bb.x - PADDING,
		y: bb.y - PADDING,
		w: bb.w + 2 * PADDING,
		h: bb.h + 2 * PADDING,
	};
}

// ── Bar geometry ──────────────────────────────────────────────────────────
// Width is fixed (so labels line up across scenes); height is dynamic and
// scaled to the scene contents (see `pickBarCeil` below).
export const BAR_WIDTH = 24;

// Floor: shortest bar — also what zeros and uniformly-zero scenes
// render at. Picked so a zero reads as a substantial tile rather than
// a sliver.
export const BAR_FLOOR = 24;
// Hard cap on the ceiling — even when there's lots of vertical room
// (e.g. a single atom in a big viewBox) we don't want runaway bars.
const BAR_CEIL_CAP = 100;
// Hard floor on the ceiling — below this, neighbouring bars are
// indistinguishable. If the structural budget forces us under this,
// we accept the overflow rather than collapse all variance.
const BAR_CEIL_MIN = 40;

// ── Container layout ──────────────────────────────────────────────────────
// PADDING sits inside an array's outline, between the outline and the
// cells. GAP separates adjacent cells in a vec or row.
export const PADDING = 8;
export const GAP = 4;

// ── Ellipsis: fit-based, recursive ────────────────────────────────────────
// No fixed count. At every container we ask "do my children fit in the
// budget my parent gave me?". If not, we drop middle children and put a
// `…` (or `⋮` between rows of a mat) in their place. The threshold for
// dropping is whatever it takes to fit — viewBox size, sibling sizes,
// and nesting depth all matter.
//
// MIN_VISIBLE is the smallest slot count we'll let an ellipsized container
// shrink to: head[1] + ellipsis + tail[1]. Below this you'd just be
// showing the marker with one neighbour, which doesn't read as "list".
//
// MAX_ELLIPSIZED_VISIBLE caps head/tail at 3 each (3 + ellipsis + 3 = 7).
// Beyond that the visual is too dense to read and animations on the
// surviving cells get unreadable. A list with > 7 items ellipsizes even
// when the budget would technically fit more.

const MIN_VISIBLE = 3;
const MAX_ELLIPSIZED_VISIBLE = 7;

type VecSlot =
	| { kind: 'data'; idx: number }
	| { kind: 'ellipsis' };

/** Build slots for a 1-D axis with K visible positions out of N data
 *  items. If K ≥ N, every item is shown. Otherwise: head + ellipsis +
 *  tail, with head/tail counts balanced (head ≥ tail). */
function buildSlots(K: number, N: number): VecSlot[] {
	if (K >= N) {
		return Array.from({ length: N }, (_, i) => (
			{ kind: 'data' as const, idx: i }
		));
	}
	const dataCount = Math.max(0, K - 1);
	const head = Math.ceil(dataCount / 2);
	const tail = dataCount - head;
	const slots: VecSlot[] = [];
	for (let i = 0; i < head; i++) slots.push({ kind: 'data', idx: i });
	slots.push({ kind: 'ellipsis' });
	for (let i = N - tail; i < N; i++) slots.push({ kind: 'data', idx: i });
	return slots;
}

/**
 * Pick the largest K (visible slots, ellipsis included) that fits the
 * total laid-out size in `budget`. `sizes[i]` is the i-th data item's
 * extent along the axis; `ellipsisSize` is what the marker takes.
 * Returns the slot list — no ellipsis if everything fits at K = N.
 */
function chooseSlotsForFit(
	sizes: number[],
	ellipsisSize: number,
	gap: number,
	budget: number,
): VecSlot[] {
	const N = sizes.length;
	const totalForK = (K: number): number => {
		const slots = buildSlots(K, N);
		let total = 0;
		for (let i = 0; i < slots.length; i++) {
			const s = slots[i];
			total += s.kind === 'ellipsis' ? ellipsisSize : sizes[s.idx];
			if (i < slots.length - 1) total += gap;
		}
		return total;
	};
	// "No ellipsis" is only an option when the data is short enough to
	// stay readable in full AND it fits the budget. Otherwise the cap
	// at MAX_ELLIPSIZED_VISIBLE wins, even if a larger K would fit.
	if (N <= MAX_ELLIPSIZED_VISIBLE && totalForK(N) <= budget) {
		return buildSlots(N, N);
	}
	const Kmax = Math.min(MAX_ELLIPSIZED_VISIBLE, N - 1);
	for (let K = Kmax; K >= MIN_VISIBLE; K--) {
		if (totalForK(K) <= budget) return buildSlots(K, N);
	}
	return buildSlots(Math.min(MIN_VISIBLE, N), N);
}

// Top-level value is centred vertically in the viewBox: its frame
// (or just the bar for an atom) is positioned so its centre lands on
// the viewBox's centre. baselineY is computed per-value from its
// above/below dims; there's no fixed fraction.

/**
 * Per-scene scaling. `maxAbs` is the largest absolute atom value in
 * the value being laid out (or 0 if the scene is all zeros). `ceil`
 * is the tallest bar this scene will produce — picked once at the
 * top of `bqnValueToScene` so the worst-case stack of bars fits the
 * viewBox. Every bar in the scene scales linearly inside
 * `[BAR_FLOOR, ceil]`, normalised to `maxAbs`.
 */
export type BarScale = { maxAbs: number; ceil: number };

export function barHeight(value: number, scale: BarScale): number {
	if (scale.maxAbs === 0) return BAR_FLOOR;
	return BAR_FLOOR
		+ (Math.abs(value) / scale.maxAbs) * (scale.ceil - BAR_FLOOR);
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, x));
}

function maxAbsAtom(v: BqnStructuredValue): number {
	if (v.kind === 'number') return Math.abs(v.value);
	if (v.kind === 'array') {
		let m = 0;
		for (const d of v.data) {
			const c = maxAbsAtom(d);
			if (c > m) m = c;
		}
		return m;
	}
	return 0;
}

function hasMixedSigns(v: BqnStructuredValue): boolean {
	let pos = false;
	let neg = false;
	function visit(x: BqnStructuredValue): void {
		if (x.kind === 'number') {
			if (x.value > 0) pos = true;
			if (x.value < 0) neg = true;
		} else if (x.kind === 'array') {
			for (const d of x.data) visit(d);
		}
	}
	visit(v);
	return pos && neg;
}

/**
 * Pick the tallest bar this scene will produce.
 *
 * The structural worst case is "how many bars can stack vertically",
 * counting one slot per row of frames and a second slot when a row
 * has bars on both sides of the baseline (mixed signs). We then
 * divide the viewBox's vertical budget among those slots, after
 * deducting the frame/gap overhead the scene's structure will eat.
 *
 * Single atoms hit the cap; busy mats compress toward the floor.
 */
function pickBarCeil(v: BqnStructuredValue, viewBox: ViewBox): number {
	const fullBudget = viewBox.h - 2 * PADDING;
	const mixed = hasMixedSigns(v);
	const slotsPerRow = mixed ? 2 : 1;

	if (v.kind === 'number') {
		return clamp(fullBudget, BAR_CEIL_MIN, BAR_CEIL_CAP);
	}
	if (v.kind !== 'array') {
		return clamp(60, BAR_CEIL_MIN, BAR_CEIL_CAP);
	}
	if (v.shape.length === 0) {
		// One bar's worth of vertical room, minus an extra inset for the
		// box frame. Recurse so doubly-boxed values keep eating padding.
		const innerViewBox: ViewBox = {
			...viewBox,
			h: viewBox.h - 2 * PADDING,
		};
		return pickBarCeil(v.data[0], innerViewBox);
	}
	if (v.shape.length === 1) {
		// One row of bars; mixed signs eat two slots vertically.
		return clamp(fullBudget / slotsPerRow, BAR_CEIL_MIN, BAR_CEIL_CAP);
	}
	if (v.shape.length === 2) {
		const R = v.shape[0];
		// R row frames stacked vertically; each carries 2 PADDING, plus
		// GAP between rows.
		const rowOverhead = R * 2 * PADDING + Math.max(0, R - 1) * GAP;
		const barsBudget = fullBudget - rowOverhead;
		return clamp(
			barsBudget / (R * slotsPerRow),
			BAR_CEIL_MIN,
			BAR_CEIL_CAP,
		);
	}
	return clamp(60, BAR_CEIL_MIN, BAR_CEIL_CAP);
}

// ── Plan: laid-out structure with ellipsis decisions baked in ─────────────
// Layout is two phases: build a Plan top-down (knows dims + slot
// decisions for each container, respecting budgets), then apply the
// Plan to emit positioned cells. Splitting it lets each level decide
// "what to show" before any level decides "where to put it".

type ValueDims = { width: number; above: number; below: number };

type Budget = { w: number; h: number };
const INFINITE_BUDGET: Budget = { w: Infinity, h: Infinity };

type AtomPlan = { kind: 'atom'; dims: ValueDims };
type BoxPlan = { kind: 'box'; dims: ValueDims; inner: Plan };
type VecPlan = {
	kind: 'vec';
	dims: ValueDims;
	slots: VecSlot[];
	childPlans: Map<number, Plan>;
};
type MatPlan = {
	kind: 'mat';
	dims: ValueDims;
	R: number;
	C: number;
	rowSlots: VecSlot[];
	colSlots: VecSlot[];
	rowDims: Map<number, ValueDims>;
	cellPlans: Map<number, Plan>;
};
type Plan = AtomPlan | BoxPlan | VecPlan | MatPlan;

function makePlan(
	v: BqnStructuredValue,
	scale: BarScale,
	budget: Budget,
): Plan {
	if (v.kind === 'number') {
		const h = barHeight(v.value, scale);
		return {
			kind: 'atom',
			dims: v.value < 0
				? { width: BAR_WIDTH, above: 0, below: h }
				: { width: BAR_WIDTH, above: h, below: 0 },
		};
	}
	if (v.kind !== 'array') {
		throw new Error(`makePlan: '${v.kind}' not implemented`);
	}
	if (v.shape.length === 0) {
		const innerBudget: Budget = {
			w: budget.w - 2 * PADDING,
			h: budget.h - 2 * PADDING,
		};
		const inner = makePlan(v.data[0], scale, innerBudget);
		return {
			kind: 'box',
			inner,
			dims: {
				width: inner.dims.width + 2 * PADDING,
				above: inner.dims.above + PADDING,
				below: inner.dims.below + PADDING,
			},
		};
	}
	if (v.shape.length === 1) {
		return makeVecPlan(v.data, scale, budget);
	}
	if (v.shape.length === 2) {
		return makeMatPlan(v.data, v.shape[0], v.shape[1], scale, budget);
	}
	throw new Error(`makePlan: rank ${v.shape.length} not implemented`);
}

function makeVecPlan(
	data: BqnStructuredValue[],
	scale: BarScale,
	budget: Budget,
): VecPlan {
	const N = data.length;

	// Try each K (total visible slots, ellipsis included if K < N) and
	// keep the first that fits. K decreases until it fits or we hit
	// MIN_VISIBLE. Each attempt re-plans visible children with a
	// per-child sub-budget so nested containers can ellipsize within
	// their fair share.
	const attempt = (K: number): { plan: VecPlan; fits: boolean } => {
		const slots = buildSlots(K, N);
		const dataSlotCount = slots.filter((s) => s.kind === 'data').length;
		const ellCount = slots.length - dataSlotCount;
		const fixedW
			= 2 * PADDING
			+ Math.max(0, slots.length - 1) * GAP
			+ ellCount * BAR_WIDTH;
		const availForData = Math.max(0, budget.w - fixedW);
		const perChildW = dataSlotCount > 0
			? Math.max(BAR_WIDTH, availForData / dataSlotCount)
			: BAR_WIDTH;
		const subBudget: Budget = { w: perChildW, h: budget.h };

		const childPlans = new Map<number, Plan>();
		for (const slot of slots) {
			if (slot.kind === 'data') {
				childPlans.set(slot.idx, makePlan(data[slot.idx], scale, subBudget));
			}
		}

		let totalW = 2 * PADDING;
		let maxAbove = 0;
		let maxBelow = 0;
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (slot.kind === 'ellipsis') {
				totalW += BAR_WIDTH;
				if (BAR_FLOOR > maxAbove) maxAbove = BAR_FLOOR;
			} else {
				const cp = childPlans.get(slot.idx)!;
				totalW += cp.dims.width;
				if (cp.dims.above > maxAbove) maxAbove = cp.dims.above;
				if (cp.dims.below > maxBelow) maxBelow = cp.dims.below;
			}
			if (i < slots.length - 1) totalW += GAP;
		}
		const dims: ValueDims = {
			width: totalW,
			above: maxAbove + PADDING,
			below: maxBelow + PADDING,
		};
		return {
			plan: { kind: 'vec', dims, slots, childPlans },
			fits: totalW <= budget.w,
		};
	};

	// Try the un-ellipsized layout only when the data is short enough
	// to stay readable. Long vecs always show ellipsis even if they'd
	// fit the budget — see MAX_ELLIPSIZED_VISIBLE.
	if (N <= MAX_ELLIPSIZED_VISIBLE) {
		const full = attempt(N);
		if (full.fits) return full.plan;
	}
	const Kmax = Math.min(MAX_ELLIPSIZED_VISIBLE, N - 1);
	let best: VecPlan | null = null;
	for (let K = Kmax; K >= MIN_VISIBLE; K--) {
		const a = attempt(K);
		if (a.fits) return a.plan;
		if (best === null || a.plan.dims.width < best.dims.width) best = a.plan;
	}
	return best ?? attempt(N).plan;
}

function makeMatPlan(
	data: BqnStructuredValue[],
	R: number,
	C: number,
	scale: BarScale,
	budget: Budget,
): MatPlan {
	// Step 1: natural cell plans (no budget pressure on individual cells
	// — they're atoms or shallow at the cell level in current usage).
	const cellNatural = new Map<number, Plan>();
	for (let i = 0; i < R * C; i++) {
		cellNatural.set(i, makePlan(data[i], scale, INFINITE_BUDGET));
	}

	// Step 2: per-column natural widths (max over rows).
	const colNatural: number[] = [];
	for (let c = 0; c < C; c++) {
		let m = 0;
		for (let r = 0; r < R; r++) {
			const p = cellNatural.get(r * C + c)!;
			if (p.dims.width > m) m = p.dims.width;
		}
		colNatural.push(m);
	}

	// Step 3: column ellipsis. Each row's content area (inside the row
	// frame, which itself sits inside the mat frame) gets
	// budget.w - 2*PADDING (mat outer) - 2*PADDING (row inner).
	const rowContentBudgetW = Math.max(0, budget.w - 4 * PADDING);
	const colSlots = chooseSlotsForFit(
		colNatural,
		BAR_WIDTH,
		GAP,
		rowContentBudgetW,
	);

	// Step 4: each row's actual content dims given surviving columns.
	const rowDims = new Map<number, ValueDims>();
	for (let r = 0; r < R; r++) {
		let w = 0;
		let above = 0;
		let below = 0;
		for (let i = 0; i < colSlots.length; i++) {
			const cslot = colSlots[i];
			if (cslot.kind === 'ellipsis') {
				w += BAR_WIDTH;
				if (BAR_FLOOR > above) above = BAR_FLOOR;
			} else {
				const p = cellNatural.get(r * C + cslot.idx)!;
				w += p.dims.width;
				if (p.dims.above > above) above = p.dims.above;
				if (p.dims.below > below) below = p.dims.below;
			}
			if (i < colSlots.length - 1) w += GAP;
		}
		rowDims.set(r, { width: w, above, below });
	}

	// Step 5: row ellipsis based on row frame heights fitting the mat's
	// content height (budget.h - mat outer padding).
	const rowFrameHeights: number[] = [];
	for (let r = 0; r < R; r++) {
		const rd = rowDims.get(r)!;
		rowFrameHeights.push(rd.above + rd.below + 2 * PADDING);
	}
	const matContentBudgetH = Math.max(0, budget.h - 2 * PADDING);
	const rowSlots = chooseSlotsForFit(
		rowFrameHeights,
		BAR_FLOOR,
		GAP,
		matContentBudgetH,
	);

	// Step 6: collect plans for surviving (row, col) pairs.
	const cellPlans = new Map<number, Plan>();
	for (const rslot of rowSlots) {
		if (rslot.kind === 'ellipsis') continue;
		for (const cslot of colSlots) {
			if (cslot.kind === 'ellipsis') continue;
			const idx = rslot.idx * C + cslot.idx;
			cellPlans.set(idx, cellNatural.get(idx)!);
		}
	}

	// Step 7: mat dims. The bottom row's baseline IS the mat's
	// baseline, so dims.below covers that row plus mat-outer padding.
	let totalContentH = 0;
	let maxRowFrameW = 0;
	for (let i = 0; i < rowSlots.length; i++) {
		const rslot = rowSlots[i];
		if (rslot.kind === 'ellipsis') {
			totalContentH += BAR_FLOOR;
		} else {
			totalContentH += rowFrameHeights[rslot.idx];
			const rowFrameW = rowDims.get(rslot.idx)!.width + 2 * PADDING;
			if (rowFrameW > maxRowFrameW) maxRowFrameW = rowFrameW;
		}
		if (i < rowSlots.length - 1) totalContentH += GAP;
	}
	// Find the bottom-most data row (always present — buildSlots keeps
	// at least one data slot on each side of the ellipsis).
	let bottomDataIdx = -1;
	for (let i = rowSlots.length - 1; i >= 0; i--) {
		const s = rowSlots[i];
		if (s.kind === 'data') {
			bottomDataIdx = s.idx;
			break;
		}
	}
	const bottomRowBelow = bottomDataIdx >= 0
		? rowDims.get(bottomDataIdx)!.below
		: 0;
	const matFrameW = maxRowFrameW + 2 * PADDING;
	const matFrameH = totalContentH + 2 * PADDING;
	const below = bottomRowBelow + 2 * PADDING; // bottom-row's below + row-frame PADDING + mat-frame PADDING
	const above = matFrameH - below;

	return {
		kind: 'mat',
		R,
		C,
		dims: { width: matFrameW, above, below },
		rowSlots,
		colSlots,
		rowDims,
		cellPlans,
	};
}

// ── applyPlan ─────────────────────────────────────────────────────────────
// Walk a Plan and emit positioned cells. The plan has already decided
// which children are visible and where ellipses sit; this just does
// the geometry. Returns a Scene.
function applyPlan(
	v: BqnStructuredValue,
	plan: Plan,
	idPath: string,
	contentX: number,
	baselineY: number,
	viewBox: ViewBox,
): Scene {
	if (plan.kind === 'atom') {
		const num = v as { kind: 'number'; value: number };
		const h = plan.dims.below > 0 ? plan.dims.below : plan.dims.above;
		const cell: Cell = {
			id: idPath,
			x: contentX,
			y: num.value < 0 ? baselineY : baselineY - h,
			w: BAR_WIDTH,
			h,
			value: num.value,
			inner: null,
		};
		return { kind: 'atom', viewBox, atom: cell };
	}

	const arr = v as { kind: 'array'; data: BqnStructuredValue[]; shape: number[] };

	if (plan.kind === 'box') {
		const cellPath = `${idPath}.0`;
		const innerScene = applyPlan(
			arr.data[0],
			plan.inner,
			cellPath,
			contentX + PADDING,
			baselineY,
			viewBox,
		);
		const wrapper: Cell = {
			id: cellPath,
			x: contentX + PADDING,
			y: baselineY - plan.inner.dims.above,
			w: plan.inner.dims.width,
			h: plan.inner.dims.above + plan.inner.dims.below,
			value: 0,
			inner: innerScene,
		};
		return {
			kind: 'array',
			viewBox,
			shape: [],
			cells: [wrapper],
			frame: autoFitFrame([wrapper]),
		};
	}

	if (plan.kind === 'vec') {
		const cells: Cell[] = [];
		let cursorX = contentX + PADDING;
		for (const slot of plan.slots) {
			if (slot.kind === 'ellipsis') {
				cells.push({
					id: `${idPath}.…`,
					x: cursorX,
					y: baselineY - BAR_FLOOR,
					w: BAR_WIDTH,
					h: BAR_FLOOR,
					value: 0,
					inner: null,
					kind: 'ellipsis',
				});
				cursorX += BAR_WIDTH + GAP;
				continue;
			}
			const i = slot.idx;
			const inner = arr.data[i];
			const cp = plan.childPlans.get(i)!;
			const cellPath = `${idPath}.${i}`;
			const innerScene = applyPlan(inner, cp, cellPath, cursorX, baselineY, viewBox);
			if (innerScene.kind === 'atom') {
				// Hoist the atom's own cell up so vec.cells holds the bar
				// directly — matches the prior layout shape.
				cells.push(innerScene.atom);
			} else {
				cells.push({
					id: cellPath,
					x: cursorX,
					y: baselineY - cp.dims.above,
					w: cp.dims.width,
					h: cp.dims.above + cp.dims.below,
					value: 0,
					inner: innerScene,
				});
			}
			cursorX += cp.dims.width + GAP;
		}
		return {
			kind: 'array',
			viewBox,
			shape: arr.shape,
			cells,
			frame: autoFitFrame(cells),
		};
	}

	if (plan.kind === 'mat') {
		const cells: Cell[] = [];
		// Mat content area top: baselineY - dims.above + PADDING.
		let cursorY = baselineY - plan.dims.above + PADDING;
		for (let i = 0; i < plan.rowSlots.length; i++) {
			const rslot = plan.rowSlots[i];
			if (rslot.kind === 'ellipsis') {
				// Slim wide strip standing in for hidden rows. Renderer
				// picks `⋮` based on its wide-and-short shape.
				cells.push({
					id: `${idPath}.…r`,
					x: contentX + PADDING,
					y: cursorY,
					w: plan.dims.width - 2 * PADDING,
					h: BAR_FLOOR,
					value: 0,
					inner: null,
					kind: 'ellipsis',
				});
				cursorY += BAR_FLOOR;
			} else {
				const rd = plan.rowDims.get(rslot.idx)!;
				const rowFrameH = rd.above + rd.below + 2 * PADDING;
				const rowBaseline = cursorY + PADDING + rd.above;

				const rowCells: Cell[] = [];
				let rowCursorX = contentX + 2 * PADDING;
				for (let ci = 0; ci < plan.colSlots.length; ci++) {
					const cslot = plan.colSlots[ci];
					if (cslot.kind === 'ellipsis') {
						rowCells.push({
							id: `${idPath}.${rslot.idx}.…c`,
							x: rowCursorX,
							y: rowBaseline - BAR_FLOOR,
							w: BAR_WIDTH,
							h: BAR_FLOOR,
							value: 0,
							inner: null,
							kind: 'ellipsis',
						});
						rowCursorX += BAR_WIDTH + GAP;
						continue;
					}
					const cIdx = cslot.idx;
					const cellIdx = rslot.idx * plan.C + cIdx;
					const inner = arr.data[cellIdx];
					const cp = plan.cellPlans.get(cellIdx)!;
					const cellPath = `${idPath}.${rslot.idx}.${cIdx}`;
					const innerScene = applyPlan(
						inner,
						cp,
						cellPath,
						rowCursorX,
						rowBaseline,
						viewBox,
					);
					if (innerScene.kind === 'atom') {
						rowCells.push(innerScene.atom);
					} else {
						rowCells.push({
							id: cellPath,
							x: rowCursorX,
							y: rowBaseline - cp.dims.above,
							w: cp.dims.width,
							h: cp.dims.above + cp.dims.below,
							value: 0,
							inner: innerScene,
						});
					}
					rowCursorX += cp.dims.width + GAP;
				}

				const rowScene: Scene = {
					kind: 'array',
					viewBox,
					shape: [plan.C],
					cells: rowCells,
					frame: autoFitFrame(rowCells),
				};

				let minX = Infinity;
				let minY = Infinity;
				let maxX = -Infinity;
				let maxY = -Infinity;
				for (const rc of rowCells) {
					if (rc.x < minX) minX = rc.x;
					if (rc.y < minY) minY = rc.y;
					if (rc.x + rc.w > maxX) maxX = rc.x + rc.w;
					if (rc.y + rc.h > maxY) maxY = rc.y + rc.h;
				}
				cells.push({
					id: `${idPath}.${rslot.idx}`,
					x: minX - PADDING,
					y: minY - PADDING,
					w: maxX - minX + 2 * PADDING,
					h: maxY - minY + 2 * PADDING,
					value: 0,
					inner: rowScene,
				});
				cursorY += rowFrameH;
			}
			if (i < plan.rowSlots.length - 1) cursorY += GAP;
		}
		return {
			kind: 'array',
			viewBox,
			shape: arr.shape,
			cells,
			frame: autoFitFrame(cells),
		};
	}

	// Exhaustive — TS narrowing should make this unreachable, but the
	// runtime guard means a new Plan variant fails loudly, not silently.
	throw new Error('applyPlan: unreachable');
}

// ── sceneToBqnValue ───────────────────────────────────────────────────────
// Inverse projection: read the BQN value back out of a Scene by visiting
// each level's cells in VISUAL order (sorted by their current centre along
// the level's major axis). The shape comes from the Scene itself.
//
// Used by `unsqueeze` to reconstruct the value from a possibly-permuted
// post-rotate Scene and then call `bqnValueToScene` fresh — so unsqueeze
// is a pure re-layout from data, with no information carried over from
// squeeze.
//
// Major axis per rank:
//   rank-1 (vec) — cells stacked horizontally → sort by x centre.
//   rank-2 (mat) — top-level cells are row wrappers stacked vertically
//                  → sort by y centre. Each row's inner is rank-1.
//   rank-0 (box) — exactly one cell; no sort needed.
export function sceneToBqnValue(scene: Scene): BqnStructuredValue {
	if (scene.kind === 'atom') {
		return { kind: 'number', value: scene.atom.value };
	}
	if (scene.shape.length === 0) {
		const cell = scene.cells[0];
		const inner: BqnStructuredValue = cell.inner
			? sceneToBqnValue(cell.inner)
			: { kind: 'number', value: cell.value };
		return { kind: 'array', shape: [], data: [inner] };
	}
	if (scene.shape.length === 1) {
		const sorted = [...scene.cells].sort(
			(a, b) => (a.x + a.w / 2) - (b.x + b.w / 2),
		);
		for (const c of sorted) {
			if (c.kind === 'ellipsis') {
				throw new Error(
					'sceneToBqnValue: scene contains an ellipsis cell. '
					+ 'Fit-based ellipsis is lossy and cannot be roundtripped — '
					+ 'animations on scenes that have ellipsized must take the '
					+ 'BQN value as input rather than reading it back from the scene.',
				);
			}
		}
		const data = sorted.map((c): BqnStructuredValue =>
			c.inner ? sceneToBqnValue(c.inner) : { kind: 'number', value: c.value },
		);
		return { kind: 'array', shape: [...scene.shape], data };
	}
	if (scene.shape.length === 2) {
		const rows = [...scene.cells].sort(
			(a, b) => (a.y + a.h / 2) - (b.y + b.h / 2),
		);
		const data: BqnStructuredValue[] = [];
		for (const row of rows) {
			if (row.inner === null) {
				throw new Error('sceneToBqnValue: rank-2 row missing inner scene');
			}
			const rowVal = sceneToBqnValue(row.inner);
			if (rowVal.kind !== 'array') {
				throw new Error('sceneToBqnValue: row inner did not yield array');
			}
			for (const x of rowVal.data) data.push(x);
		}
		return { kind: 'array', shape: [...scene.shape], data };
	}
	throw new Error(
		`sceneToBqnValue: rank ${scene.shape.length} not implemented`,
	);
}

// ── bqnValueToScene ───────────────────────────────────────────────────────
// Public entry. Position the value centered horizontally in the viewBox,
// with bar bottoms anchored to a baseline at BASELINE_FRAC of viewBox
// height.
export function bqnValueToScene(
	value: BqnStructuredValue,
	viewBox: ViewBox,
): Scene {
	if (value.kind === 'char' || value.kind === 'fn' || value.kind === 'namespace') {
		throw new Error(`bqnValueToScene: '${value.kind}' not implemented yet`);
	}
	// Scale once at the top; budget is the viewBox itself. The plan
	// decides ellipsis recursively given the budget; applyPlan turns
	// that plan into positioned cells.
	const scale: BarScale = {
		maxAbs: maxAbsAtom(value),
		ceil: pickBarCeil(value, viewBox),
	};
	const budget: Budget = { w: viewBox.w, h: viewBox.h };
	const plan = makePlan(value, scale, budget);
	const dims = plan.dims;
	const vbCx = viewBox.x + viewBox.w / 2;
	const vbCy = viewBox.y + viewBox.h / 2;
	const contentX = vbCx - dims.width / 2;
	const baselineY = vbCy + (dims.above - dims.below) / 2;
	return applyPlan(value, plan, 'root', contentX, baselineY, viewBox);
}
