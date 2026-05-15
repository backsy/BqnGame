import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { BqnValue } from '../value.js';
import type { Step } from '../step.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Extract numeric data from a BqnValue array ────────────────────────────

function numericData(v: BqnValue): ReadonlyArray<number> | null {
	if (v.kind !== 'array') return null;
	const nums: number[] = [];
	for (const d of v.data) {
		if (d.kind !== 'number') return null;
		nums.push(d.value);
	}
	return nums;
}

// ── reverseMonadic ────────────────────────────────────────────────────────
// The row rotates 180° around its centre as a rigid wheel: each bar's centre
// traces a half-circle around the row's midpoint. Bars right of centre arc
// UP-and-over; bars left of centre arc DOWN-and-under; they meet on the
// opposite side. Bars stay upright (translation only — they do NOT rotate
// around their own axes), so the visual is "wheel turning," not "bars
// tumbling."
//
// Identity preserved by animating the before-cells. On completion they fade
// out and the after-cells (visibility:hidden during flight) take their place.

const REVERSE_DURATION = 0.95;
const REVERSE_SAMPLES = 28;

export const reverseMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array') return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return Promise.resolve();
	}

	const rank = step.x.shape.length;
	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	const tasks: Promise<unknown>[] = [];

	if (rank === 1) {
		// 1D row: wheel rotates clockwise around vertical axis through row
		// centre. Bars right of centre arc DOWN through the bottom of the
		// wheel; bars left of centre arc UP through the top. Pivot is the
		// bars' SHARED BASELINE so translation is height-independent —
		// no handoff jump regardless of bar heights.
		const first = beforeRects[0];
		const last = beforeRects[beforeRects.length - 1];
		const cx = (first.left + first.width / 2 + last.left + last.width / 2) / 2;

		for (let i = 0; i < beforeCells.length; i++) {
			const cell = beforeCells[i];
			const rect = beforeRects[i];
			const bx = rect.left + rect.width / 2;
			const dx = bx - cx;
			const xs: number[] = [];
			const ys: number[] = [];
			for (let s = 0; s <= REVERSE_SAMPLES; s++) {
				const t = s / REVERSE_SAMPLES;
				const theta = Math.PI * t;
				xs.push(dx * (Math.cos(theta) - 1));
				ys.push(dx * Math.sin(theta));
			}
			cell.style.position = 'relative';
			cell.style.zIndex = '5';
			tasks.push(
				animate(cell, { x: xs, y: ys }, { duration: scaled(REVERSE_DURATION), ease: 'linear' }).finished
			);
		}
	} else {
		// Rank ≥ 2: BQN ⌽ swaps along the MAJOR axis — for a matrix, rows
		// swap and columns within rows stay put. Visual: wheel rotates
		// around the HORIZONTAL axis through the grid's vertical centre.
		// Top-row cells arc DOWN through the right side of the wheel;
		// bottom-row cells arc UP through the left.
		//
		// We compute the destination position from AFTER rects, not by
		// mirroring BEFORE positions. The AFTER grid may have different row
		// heights than BEFORE (each row auto-sizes to its tallest bar, and
		// reverse swaps those heights along with the rows). Without
		// destination measurement we'd land where the BEFORE-mirror was,
		// then teleport at handoff to the actual post-commit y.
		const majorDim = step.x.shape[0];
		const sliceSize = step.x.shape.slice(1).reduce((a, b) => a * b, 1);
		const afterRects = afterCells.map(c => c.getBoundingClientRect());

		for (let i = 0; i < beforeCells.length; i++) {
			const cell = beforeCells[i];
			const r = Math.floor(i / sliceSize);
			const c = i % sliceSize;
			const destIndex = (majorDim - 1 - r) * sliceSize + c;
			const startRect = beforeRects[i];
			const endRect = afterRects[destIndex];

			const startCy = startRect.top + startRect.height / 2;
			const endCy = endRect.top + endRect.height / 2;
			const dyTotal = endCy - startCy;
			const xs: number[] = [];
			const ys: number[] = [];
			for (let s = 0; s <= REVERSE_SAMPLES; s++) {
				const t = s / REVERSE_SAMPLES;
				const theta = Math.PI * t;
				xs.push((dyTotal / 2) * Math.sin(theta));
				ys.push((dyTotal * (1 - Math.cos(theta))) / 2);
			}
			cell.style.position = 'relative';
			cell.style.zIndex = '5';
			tasks.push(
				animate(cell, { x: xs, y: ys }, { duration: scaled(REVERSE_DURATION), ease: 'linear' }).finished
			);
		}
	}

	return Promise.all(tasks).then(() => {
		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
	});
};

// ── sortUp/sortDownMonadic ────────────────────────────────────────────────
// Insertion-sort visualisation. Each ITERATION takes ONE unsorted element
// and slides it leftward through the sorted prefix via ADJACENT swaps until
// it finds its place. The animation makes the iteration boundaries clear:
// brief pauses BETWEEN swaps within an iteration, longer pauses BETWEEN
// iterations. The result reads as "deal with one element, place it, then
// move to the next."
//
// Two paths:
//   - rank 1: swap individual cells horizontally.
//   - rank 2: rows are the major-axis cells in BQN. Insertion-sort the
//     rows (lex comparison), swap pairs of adjacent rows vertically.
//
// During each adjacent swap the two participants take opposing arcs so
// they exchange places without sharing screen space mid-swap.

const SORT_SWAP_DURATION = 0.42;        // seconds per single adjacent swap
const SORT_INTRA_ITER_MS = 60;          // pause between swaps within one iteration
const SORT_INTER_ITER_MS = 260;         // pause between iterations
// Per-swap arc peak. The cells participating in a swap arc opposite-y
// to clear each other in flight. The clearance has to exceed the sum of
// half-heights of the two cells; for our bar palette (max barHeight = 58
// for value 5 in a 5-vector) that's up to ~50. 50 covers the realistic
// range; if bar heights ever scale up, this needs to grow with them.
const SORT_ARC_PEAK = 50;
const SORT_SAMPLES = 14;

function alreadySorted<T>(
	swaps: ReadonlyArray<Array<T>>,
): boolean {
	return swaps.every(it => it.length === 0);
}

async function sortByPairwiseSwap(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	ascending: boolean,
): Promise<void> {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array') return blackBox(step, beforeRoot, afterRoot);

	if (step.x.shape.length === 1) {
		return sort1DByCellSwap(step, beforeRoot, afterRoot, ascending);
	}
	if (step.x.shape.length === 2) {
		return sort2DByRowSwap(step, beforeRoot, afterRoot, ascending);
	}
	return blackBox(step, beforeRoot, afterRoot);
}

async function sort1DByCellSwap(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	ascending: boolean,
): Promise<void> {
	if (step.kind !== 'monadic') return;
	const values = numericData(step.x);
	if (values === null) return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	const n = beforeCells.length;
	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());

	// Group swaps by iteration: swapsByIter[i] = the adjacent swaps
	// performed while placing element i.
	const arr = [...values];
	const swapsByIter: Array<Array<[number, number]>> = [];
	for (let i = 1; i < n; i++) {
		const itSwaps: Array<[number, number]> = [];
		let j = i;
		while (j > 0) {
			const outOfOrder = ascending ? arr[j] < arr[j - 1] : arr[j] > arr[j - 1];
			if (!outOfOrder) break;
			itSwaps.push([j - 1, j]);
			[arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
			j--;
		}
		swapsByIter.push(itSwaps);
	}

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of beforeCells) cell.style.position = 'relative';

	if (alreadySorted(swapsByIter)) {
		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
		return;
	}

	const order = beforeCells.map((_, i) => i);
	const currentX = beforeCells.map(() => 0);

	for (let iter = 0; iter < swapsByIter.length; iter++) {
		const itSwaps = swapsByIter[iter];
		for (let s = 0; s < itSwaps.length; s++) {
			const [slotA, slotB] = itSwaps[s];
			const idxA = order[slotA];
			const idxB = order[slotB];
			const cellA = beforeCells[idxA];
			const cellB = beforeCells[idxB];

			const cellAOriginX = beforeRects[idxA].left + beforeRects[idxA].width / 2;
			const cellBOriginX = beforeRects[idxB].left + beforeRects[idxB].width / 2;
			const slotAX = beforeRects[slotA].left + beforeRects[slotA].width / 2;
			const slotBX = beforeRects[slotB].left + beforeRects[slotB].width / 2;
			const newXA = slotBX - cellAOriginX;
			const newXB = slotAX - cellBOriginX;

			const xsA: number[] = [];
			const ysA: number[] = [];
			const xsB: number[] = [];
			const ysB: number[] = [];
			for (let k = 0; k <= SORT_SAMPLES; k++) {
				const t = k / SORT_SAMPLES;
				const eased = (1 - Math.cos(Math.PI * t)) / 2;
				xsA.push(currentX[idxA] + (newXA - currentX[idxA]) * eased);
				ysA.push(-SORT_ARC_PEAK * Math.sin(Math.PI * t));
				xsB.push(currentX[idxB] + (newXB - currentX[idxB]) * eased);
				ysB.push(SORT_ARC_PEAK * Math.sin(Math.PI * t));
			}

			cellA.style.zIndex = '5';
			cellB.style.zIndex = '5';

			await Promise.all([
				animate(cellA, { x: xsA, y: ysA }, { duration: scaled(SORT_SWAP_DURATION), ease: 'linear' }).finished,
				animate(cellB, { x: xsB, y: ysB }, { duration: scaled(SORT_SWAP_DURATION), ease: 'linear' }).finished,
			]);

			currentX[idxA] = newXA;
			currentX[idxB] = newXB;
			[order[slotA], order[slotB]] = [order[slotB], order[slotA]];

			if (s < itSwaps.length - 1) await _delayMs(scaledMs(SORT_INTRA_ITER_MS));
		}
		if (iter < swapsByIter.length - 1) await _delayMs(scaledMs(SORT_INTER_ITER_MS));
	}

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
}

async function sort2DByRowSwap(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	ascending: boolean,
): Promise<void> {
	if (step.kind !== 'monadic') return;
	if (step.x.kind !== 'array' || step.x.shape.length !== 2) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const [R, C] = step.x.shape;
	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	// Extract row values for lex comparison.
	const rowValues: number[][] = [];
	for (let r = 0; r < R; r++) {
		const row: number[] = [];
		for (let c = 0; c < C; c++) {
			const v = step.x.data[r * C + c];
			if (v.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);
			row.push(v.value);
		}
		rowValues.push(row);
	}

	const cmpRows = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return a[i] - b[i];
		}
		return 0;
	};

	// Insertion sort the rows, grouping adjacent-row swaps by iteration.
	const arr = rowValues.map(r => [...r]);
	const swapsByIter: Array<Array<[number, number]>> = [];
	for (let i = 1; i < R; i++) {
		const itSwaps: Array<[number, number]> = [];
		let j = i;
		while (j > 0) {
			const cmp = cmpRows(arr[j], arr[j - 1]);
			const outOfOrder = ascending ? cmp < 0 : cmp > 0;
			if (!outOfOrder) break;
			itSwaps.push([j - 1, j]);
			[arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
			j--;
		}
		swapsByIter.push(itSwaps);
	}

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of beforeCells) cell.style.position = 'relative';

	if (alreadySorted(swapsByIter)) {
		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
		return;
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());

	// rowOrder[slot_row] = original row index of cells currently at that slot.
	const rowOrder = Array.from({ length: R }, (_, i) => i);
	const currentY = beforeCells.map(() => 0);

	for (let iter = 0; iter < swapsByIter.length; iter++) {
		const itSwaps = swapsByIter[iter];
		for (let s = 0; s < itSwaps.length; s++) {
			const [slotA, slotB] = itSwaps[s];  // slotA = slotB - 1, adjacent
			const origRowA = rowOrder[slotA];
			const origRowB = rowOrder[slotB];

			// All cells in original row A move down to slot row B's y;
			// all cells in original row B move up to slot row A's y.
			// Cells in row A arc RIGHT during transit; cells in row B arc
			// LEFT — opposite x bumps keep them from sharing screen space.
			const tasks: Promise<unknown>[] = [];
			for (let c = 0; c < C; c++) {
				const cellAIdx = origRowA * C + c;
				const cellBIdx = origRowB * C + c;
				const cellA = beforeCells[cellAIdx];
				const cellB = beforeCells[cellBIdx];

				const cellAOriginY = beforeRects[cellAIdx].top + beforeRects[cellAIdx].height / 2;
				const cellBOriginY = beforeRects[cellBIdx].top + beforeRects[cellBIdx].height / 2;
				const targetAY = beforeRects[slotB * C + c].top + beforeRects[slotB * C + c].height / 2;
				const targetBY = beforeRects[slotA * C + c].top + beforeRects[slotA * C + c].height / 2;
				const newYA = targetAY - cellAOriginY;
				const newYB = targetBY - cellBOriginY;

				const xsA: number[] = [];
				const ysA: number[] = [];
				const xsB: number[] = [];
				const ysB: number[] = [];
				for (let k = 0; k <= SORT_SAMPLES; k++) {
					const t = k / SORT_SAMPLES;
					const eased = (1 - Math.cos(Math.PI * t)) / 2;
					xsA.push(SORT_ARC_PEAK * Math.sin(Math.PI * t));
					ysA.push(currentY[cellAIdx] + (newYA - currentY[cellAIdx]) * eased);
					xsB.push(-SORT_ARC_PEAK * Math.sin(Math.PI * t));
					ysB.push(currentY[cellBIdx] + (newYB - currentY[cellBIdx]) * eased);
				}

				cellA.style.zIndex = '5';
				cellB.style.zIndex = '5';

				tasks.push(animate(cellA, { x: xsA, y: ysA }, { duration: scaled(SORT_SWAP_DURATION), ease: 'linear' }).finished);
				tasks.push(animate(cellB, { x: xsB, y: ysB }, { duration: scaled(SORT_SWAP_DURATION), ease: 'linear' }).finished);

				currentY[cellAIdx] = newYA;
				currentY[cellBIdx] = newYB;
			}

			await Promise.all(tasks);
			[rowOrder[slotA], rowOrder[slotB]] = [rowOrder[slotB], rowOrder[slotA]];

			if (s < itSwaps.length - 1) await _delayMs(scaledMs(SORT_INTRA_ITER_MS));
		}
		if (iter < swapsByIter.length - 1) await _delayMs(scaledMs(SORT_INTER_ITER_MS));
	}

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
}

export const sortUpMonadic: AnimateStep = (step, beforeRoot, afterRoot) =>
	sortByPairwiseSwap(step, beforeRoot, afterRoot, true);

export const sortDownMonadic: AnimateStep = (step, beforeRoot, afterRoot) =>
	sortByPairwiseSwap(step, beforeRoot, afterRoot, false);

// ── rotateDyadic ──────────────────────────────────────────────────────────
// W⌽X in BQN takes the first W elements and moves them to the back (with
// wrapping for negative W). The animation breaks the rotation into k single-
// position shifts, performed sequentially: at each iteration, the leftmost
// bar arcs over the row to the back while the others slide left by one slot.
// A counter above the row ticks 1, 2, ..., k so the magnitude of the rotation
// is legible.
//
// Inspired by the old range animation's counter pattern.

const ROTATE_ITER_DURATION = 0.55;     // seconds per single-position shift
// The wrapping bar's arc must clear the tallest neighbour AND stay
// out of the sliding bars' lateral path during the early part of the
// iteration (when bar0 is still close to slot 0 in x while bar1 is
// sliding left). 100px peak + sqrt-shaped y rise lifts it fast enough
// that the rectangles never share screen space.
const ROTATE_ARC_PEAK = 100;
const ROTATE_ARC_SCALE_SHRINK = 0.4;   // wrapping bar shrinks to (1-shrink) at apex
const ROTATE_ARC_SAMPLES = 16;
const ROTATE_BETWEEN_MS = 100;         // pause between iterations
const ROTATE_COUNTER_SIZE = 36;        // px
const ROTATE_COUNTER_OFFSET = 50;      // px above the row

export const rotateDyadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array' || step.x.shape.length !== 1) return blackBox(step, beforeRoot, afterRoot);
	if (step.w.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	const n = beforeCells.length;
	// Normalise to a positive left-rotation count: -1⌽X ≡ (n-1)⌽X.
	const k = ((step.w.value % n) + n) % n;

	if (k === 0) {
		// Identity rotation — just commit without animation.
		afterRoot.style.opacity = '';
		return;
	}

	const slotRects = beforeCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	for (const cell of beforeCells) cell.style.position = 'relative';

	// Counter element, positioned above the row's horizontal centre.
	const rowRect = beforeRoot.getBoundingClientRect();
	const counter = document.createElement('div');
	Object.assign(counter.style, {
		position: 'fixed',
		top: `${rowRect.top - ROTATE_COUNTER_OFFSET}px`,
		left: `${rowRect.left + rowRect.width / 2 - ROTATE_COUNTER_SIZE / 2}px`,
		width: `${ROTATE_COUNTER_SIZE}px`,
		height: `${ROTATE_COUNTER_SIZE}px`,
		display: 'grid',
		placeItems: 'center',
		background: '#5fcc5f',
		color: '#0a0a0a',
		borderRadius: '50%',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: '1rem',
		fontWeight: '700',
		opacity: '0',
		transform: 'scale(0)',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: '0 0 16px rgba(95, 204, 95, 0.6)',
	});
	document.body.appendChild(counter);

	await animate(
		counter,
		{ opacity: [0, 1], transform: ['scale(0)', 'scale(1)'] },
		{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }
	).finished;

	// k iterations of "rotate left by 1". For each bar i, its position at
	// iteration j is (i - j + n) % n. The bar at iter j's position 0
	// (i.e. the bar originally at index j-1) wraps from leftmost to rightmost.
	for (let j = 1; j <= k; j++) {
		counter.textContent = String(j);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.25)', 'scale(1)'] },
			{ duration: 0.25 }
		);

		const tasks: Promise<unknown>[] = [];
		for (let i = 0; i < n; i++) {
			const prevPos = (i - (j - 1) + n) % n;
			const nextPos = (i - j + n) % n;
			const bar = beforeCells[i];
			const startX = slotRects[prevPos].left - slotRects[i].left;
			const endX = slotRects[nextPos].left - slotRects[i].left;

			if (prevPos === 0) {
				// Wrapping bar — arc over the row. y rises with sqrt
				// shape so the bar clears the row's tallest neighbour
				// FAST (real wheel rotation lifts fast initially); x
				// uses the standard ease so the bar drifts smoothly
				// across the row's width. Scale pulses small at the
				// apex so the bar's rect doesn't graze the sliding
				// bars during the early-iter convergence.
				const xs: number[] = [];
				const ys: number[] = [];
				const scales: number[] = [];
				const dx = endX - startX;
				for (let s = 0; s <= ROTATE_ARC_SAMPLES; s++) {
					const t = s / ROTATE_ARC_SAMPLES;
					const tEase = (1 - Math.cos(Math.PI * t)) / 2;
					const sinT = Math.sin(Math.PI * t);
					xs.push(startX + dx * tEase);
					ys.push(-ROTATE_ARC_PEAK * Math.sqrt(sinT));
					scales.push(1 - ROTATE_ARC_SCALE_SHRINK * sinT);
				}
				bar.style.zIndex = '5';
				tasks.push(
					animate(
						bar,
						{ x: xs, y: ys, scale: scales },
						{ duration: scaled(ROTATE_ITER_DURATION), ease: 'linear' }
					).finished
				);
			} else {
				// Sliding bar — one slot left.
				tasks.push(
					animate(
						bar,
						{ x: endX, y: 0 },
						{ duration: scaled(ROTATE_ITER_DURATION), ease: [0.4, 0, 0.6, 1] }
					).finished
				);
			}
		}

		await Promise.all(tasks);
		if (j < k) await _delayMs(scaledMs(ROTATE_BETWEEN_MS));
	}

	await _delayMs(scaledMs(180));

	await animate(
		counter,
		{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
		{ duration: 0.3, ease: 'easeIn' }
	).finished;
	counter.remove();

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

// ── transposeMonadic ──────────────────────────────────────────────────────
// Three-phase animation with a strict no-overlap invariant: at every
// instant every cell occupies a unique screen position and no path
// crosses through another cell.
//
// Phase 0 — Right-shift: the entire BEFORE matrix slides RIGHT as a rigid
// block by (afterWidth + gap) / 2 pixels, clearing the left half of the
// container for the staging area. This shift is dynamic — based on the
// actual matrix widths — so on narrow mobile screens BEFORE doesn't go
// off-screen and STAGING fits on-screen too.
//
// Phase 1 — Build the new shape in the cleared staging area to the LEFT
// of the shifted BEFORE. Cells leave their origin one at a time, in
// row-major order, and arrive at their AFTER position inside staging.
// Only one cell is in motion at a time, the staging area is empty, and
// the staging area is geometrically separated from BEFORE — so paths
// can't collide and positions can't overlap.
//
// Phase 2 — Slide-to-centre: the assembled new shape glides from staging
// to its centred final position. All cells move in unison by the same
// x-offset, preserving relative positions.

const TRANSPOSE_MATRIX_GAP = 18;          // px between BEFORE and STAGING side-by-side
const TRANSPOSE_PHASE0_DURATION = 0.32;   // seconds for the right-shift pre-roll
const TRANSPOSE_PER_CELL_DURATION = 0.35; // seconds per Phase-1 cell move
const TRANSPOSE_INTER_CELL_MS = 80;       // pause between Phase-1 cell moves
const TRANSPOSE_PHASE2_HOLD_MS = 220;     // pause after Phase 1 before Phase 2
const TRANSPOSE_PHASE2_DURATION = 0.55;   // seconds for the slide-to-centre

export const transposeMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array' || step.x.shape.length !== 2) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	const [R, C] = step.x.shape;
	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	// After-cells stay hidden for the entire animation. The before-cells
	// ARE the visible matrix throughout.
	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of beforeCells) {
		cell.style.position = 'relative';
		cell.style.zIndex = '5';
	}

	// Phase 0/1/2 layout offsets, computed dynamically from the actual
	// rendered widths so the entire animation stays on-screen on phones.
	// BEFORE shifts RIGHT by half the AFTER-width (+ gap) so the centre-
	// left region is freed. STAGING sits to the LEFT of centre by half
	// the BEFORE-width (+ gap). The two regions abut with TRANSPOSE_MATRIX
	// _GAP between them; everything stays inside the centred container.
	const beforeWidth = beforeRoot.getBoundingClientRect().width;
	const afterWidth = afterRoot.getBoundingClientRect().width;
	const shiftBeforeX = (afterWidth + TRANSPOSE_MATRIX_GAP) / 2;
	const stagingOffsetX = -(beforeWidth + TRANSPOSE_MATRIX_GAP) / 2;

	// Compute per-cell final translations (relative to each cell's natural
	// origin). Staging position is the same plus stagingOffsetX in x.
	const finalTranslate: { dx: number; dy: number }[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		const r = Math.floor(i / C);
		const c = i % C;
		const destIndex = c * R + r;
		const startRect = beforeRects[i];
		const endRect = afterRects[destIndex];
		const sx = startRect.left + startRect.width / 2;
		const sy = startRect.top + startRect.height / 2;
		const fx = endRect.left + endRect.width / 2;
		const fy = endRect.top + endRect.height / 2;
		finalTranslate.push({ dx: fx - sx, dy: fy - sy });
	}

	// ── Phase 0: BEFORE matrix shifts right as one rigid block ──────────
	// Animate every cell in parallel by the same dx, so the entire grid
	// translates together (no relative motion within the matrix).
	const phase0 = beforeCells.map(cell =>
		animate(
			cell,
			{ x: shiftBeforeX, y: 0 },
			{ duration: scaled(TRANSPOSE_PHASE0_DURATION), ease: [0.4, 0, 0.6, 1] }
		).finished
	);
	await Promise.all(phase0);

	// ── Phase 1: sequential per-cell move from shifted BEFORE to staging.
	// L-shaped trajectory: each cell moves x FIRST (clearing the rest of
	// the shifted BEFORE block laterally), THEN y. The keyframe arrays
	// encode the timing — y holds at its prior value for the first ~2/3
	// of the move, then ramps to the staging y. Without this hold, a
	// cell heading to the FAR side of staging (e.g. shifted row-0 col-2
	// → staging row-2) would clip through the rows of shifted BEFORE
	// still parked underneath it. The L-path keeps every cell in flight
	// outside the shifted block's vertical band until x has cleared.
	for (let i = 0; i < beforeCells.length; i++) {
		const cell = beforeCells[i];
		const f = finalTranslate[i];
		const stagingDx = f.dx + stagingOffsetX;
		const stagingDy = f.dy;

		await animate(
			cell,
			{
				x: stagingDx,
				y: [0, 0, 0, stagingDy],
			},
			{ duration: scaled(TRANSPOSE_PER_CELL_DURATION), ease: [0.4, 0, 0.6, 1] }
		).finished;

		if (i < beforeCells.length - 1) await _delayMs(scaledMs(TRANSPOSE_INTER_CELL_MS));
	}

	// Brief hold so the user sees the assembled new shape before it slides.
	await _delayMs(scaledMs(TRANSPOSE_PHASE2_HOLD_MS));

	// ── Phase 2: assembled new matrix slides right to its centred final ──
	const phase2 = beforeCells.map((cell, i) => {
		const f = finalTranslate[i];
		return animate(
			cell,
			{ x: f.dx, y: f.dy },
			{ duration: scaled(TRANSPOSE_PHASE2_DURATION), ease: [0.4, 0, 0.6, 1] }
		).finished;
	});
	await Promise.all(phase2);

	// Hand off. Before-cells are now at the natural after-positions; reveal
	// the after-cells (which live at the same positions) and hide before.
	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

