import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { BqnValue } from '../value.js';
import type { Step } from '../step.js';
import { blackBox } from './black-box.js';

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
				animate(cell, { x: xs, y: ys }, { duration: REVERSE_DURATION, ease: 'linear' }).finished
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
			// Side bump for the wheel feel — magnitude proportional to the
			// distance travelled, sign carries the rotation direction
			// (clockwise: top→right→bottom). dyTotal is positive when
			// moving down (top row), so xs is positive at midpoint = RIGHT.
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
				animate(cell, { x: xs, y: ys }, { duration: REVERSE_DURATION, ease: 'linear' }).finished
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
// Insertion-sort visualisation: each iteration takes the next unsorted
// element and slides it leftward through the sorted prefix by ADJACENT
// swaps until it finds its place. Every swap moves cells exactly one
// slot — no big jumps, every move is small and traceable.
//
// During each adjacent swap the two cells take opposing arcs:
//   - The cell at the lower slot index arcs UP.
//   - The cell at the higher slot index arcs DOWN.
// They exchange places without sharing screen space mid-swap.
// Stationary cells stay at y=0 so the arcing cells pass safely above
// and below them.
//
// Total swap count equals the number of inversions in the input. For
// already-sorted inputs that's zero — commit immediately.

const SORT_ARC_PEAK = 32;
const SORT_SWAP_DURATION = 0.28;
const SORT_BETWEEN_MS = 50;
const SORT_SAMPLES = 14;

async function sortByPairwiseSwap(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	ascending: boolean,
): Promise<void> {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
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

	// Compute the insertion-sort ADJACENT swap sequence on a copy of the
	// values. Each swap is [slot, slot+1] — cells exchange with their
	// immediate neighbour, never jumping over intermediate slots.
	const arr = [...values];
	const swaps: Array<[number, number]> = [];
	for (let i = 1; i < n; i++) {
		let j = i;
		while (j > 0) {
			const outOfOrder = ascending ? arr[j] < arr[j - 1] : arr[j] > arr[j - 1];
			if (!outOfOrder) break;
			swaps.push([j - 1, j]);
			[arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
			j--;
		}
	}

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of beforeCells) cell.style.position = 'relative';

	if (swaps.length === 0) {
		// Already sorted — just hand off.
		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
		return;
	}

	// Track which original-index cell is currently at each slot.
	// order[slot] = original index of cell at slot.
	const order = beforeCells.map((_, i) => i);
	// Accumulated x-transform per cell.
	const currentX = beforeCells.map(() => 0);

	for (let s = 0; s < swaps.length; s++) {
		const [slotA, slotB] = swaps[s];
		const idxA = order[slotA];
		const idxB = order[slotB];
		const cellA = beforeCells[idxA];
		const cellB = beforeCells[idxB];

		// Target x for each cell (relative to its original layout position).
		const cellAOriginX = beforeRects[idxA].left + beforeRects[idxA].width / 2;
		const cellBOriginX = beforeRects[idxB].left + beforeRects[idxB].width / 2;
		const slotAX = beforeRects[slotA].left + beforeRects[slotA].width / 2;
		const slotBX = beforeRects[slotB].left + beforeRects[slotB].width / 2;
		const newXA = slotBX - cellAOriginX;
		const newXB = slotAX - cellBOriginX;

		// Build cosine-eased keyframes for each cell. Cell at the lower slot
		// arcs UP; cell at the higher slot arcs DOWN. Opposite arcs keep
		// them from sharing screen space mid-swap.
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
			animate(cellA, { x: xsA, y: ysA }, { duration: SORT_SWAP_DURATION, ease: 'linear' }).finished,
			animate(cellB, { x: xsB, y: ysB }, { duration: SORT_SWAP_DURATION, ease: 'linear' }).finished,
		]);

		currentX[idxA] = newXA;
		currentX[idxB] = newXB;
		[order[slotA], order[slotB]] = [order[slotB], order[slotA]];

		if (s < swaps.length - 1) await _delayMs(SORT_BETWEEN_MS);
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
const ROTATE_ARC_PEAK = 56;            // upward arc for the wrapping bar
const ROTATE_ARC_SAMPLES = 16;
const ROTATE_BETWEEN_MS = 100;         // pause between iterations
const ROTATE_COUNTER_SIZE = 36;        // px
const ROTATE_COUNTER_OFFSET = 50;      // px above the row

const _delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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
				// Wrapping bar — arc over the row.
				const xs: number[] = [];
				const ys: number[] = [];
				const dx = endX - startX;
				for (let s = 0; s <= ROTATE_ARC_SAMPLES; s++) {
					const t = s / ROTATE_ARC_SAMPLES;
					const tEase = (1 - Math.cos(Math.PI * t)) / 2;
					xs.push(startX + dx * tEase);
					ys.push(-ROTATE_ARC_PEAK * Math.sin(Math.PI * t));
				}
				bar.style.zIndex = '5';
				tasks.push(
					animate(
						bar,
						{ x: xs, y: ys },
						{ duration: ROTATE_ITER_DURATION, ease: 'linear' }
					).finished
				);
			} else {
				// Sliding bar — one slot left.
				tasks.push(
					animate(
						bar,
						{ x: endX, y: 0 },
						{ duration: ROTATE_ITER_DURATION, ease: [0.4, 0, 0.6, 1] }
					).finished
				);
			}
		}

		await Promise.all(tasks);
		if (j < k) await _delay(ROTATE_BETWEEN_MS);
	}

	await _delay(180);

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
// Two-phase animation with a strict no-overlap invariant: at every instant
// during the animation, every cell occupies a unique screen position and no
// path crosses through another cell.
//
// Phase 1 — Build the new shape in a staging area. The staging area sits
// to the LEFT of the original matrix's centred position (offset by
// TRANSPOSE_STAGING_OFFSET_X px). Cells leave their origin one at a time,
// in row-major order of the BEFORE matrix, and arrive at their AFTER
// position INSIDE the staging area. Because only one cell is in motion
// at a time and the staging area starts empty, paths never collide and
// cells never share a screen point.
//
// Phase 2 — Once the new shape is fully assembled in staging, the entire
// matrix slides together from the staging area back to its natural
// centred location. All cells move in unison, by the same amount, so
// they preserve their relative positions and again don't overlap.

const TRANSPOSE_STAGING_OFFSET_X = -160; // px to the left of centred AFTER
const TRANSPOSE_PER_CELL_DURATION = 0.35; // seconds per Phase-1 cell move
const TRANSPOSE_INTER_CELL_MS = 80;       // pause between Phase-1 cell moves
const TRANSPOSE_PHASE2_HOLD_MS = 220;     // pause after Phase 1 before Phase 2
const TRANSPOSE_PHASE2_DURATION = 0.55;   // seconds for the slide-to-centre

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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
	// ARE the visible matrix throughout — they travel to staging, form the
	// new shape there, and slide back to the centre. Only at the very end
	// do we swap visibility, when the before-cells are already at the
	// natural after positions.
	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of beforeCells) {
		cell.style.position = 'relative';
		cell.style.zIndex = '5';
	}

	// Compute per-cell final and staging translations (relative to each
	// cell's natural origin).
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

	// ── Phase 1: sequential move to staging area ─────────────────────────
	for (let i = 0; i < beforeCells.length; i++) {
		const cell = beforeCells[i];
		const f = finalTranslate[i];
		const stagingDx = f.dx + TRANSPOSE_STAGING_OFFSET_X;
		const stagingDy = f.dy;

		await animate(
			cell,
			{ x: stagingDx, y: stagingDy },
			{ duration: TRANSPOSE_PER_CELL_DURATION, ease: [0.4, 0, 0.6, 1] }
		).finished;

		if (i < beforeCells.length - 1) await _delayMs(TRANSPOSE_INTER_CELL_MS);
	}

	// Brief hold so the user sees the assembled new shape in the staging
	// area before it slides back to centre.
	await _delayMs(TRANSPOSE_PHASE2_HOLD_MS);

	// ── Phase 2: whole new matrix slides from staging to centre ──────────
	// All cells animate the same offset (back to their natural after-
	// position) in parallel, so the entire new shape moves as one rigid
	// block. No cells cross each other; they just translate together.
	const phase2 = beforeCells.map((cell, i) => {
		const f = finalTranslate[i];
		return animate(
			cell,
			{ x: f.dx, y: f.dy },
			{ duration: TRANSPOSE_PHASE2_DURATION, ease: [0.4, 0, 0.6, 1] }
		).finished;
	});
	await Promise.all(phase2);

	// Hand off. Before-cells are now at the natural after-positions; reveal
	// the after-cells (which live at the same positions) and hide before.
	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

