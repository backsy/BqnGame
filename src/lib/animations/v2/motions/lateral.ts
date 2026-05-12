import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { BqnValue } from '../value.js';
import { blackBox } from './black-box.js';

// ── Motion vocabulary entry #2: lateral ──────────────────────────────────
// Bars slide preserving identity: each before-cell glides from its starting
// position to its destination in the after layout.
//
// FLIP technique:
//   1. Measure before-cell rects and after-cell rects.
//   2. For each before-cell i, animate it from its before-rect to the
//      after-rect at permutation[i], while hiding the matching after-cell.
//   3. On completion, hide all before-cells and reveal after-cells.
//
// Pure pixel math + permutation — no game-state knowledge.

const DURATION_SLIDE = 0.4; // seconds

export function lateralMove(
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	permutation: ReadonlyArray<number>,
): Promise<void> {
	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];

	if (beforeCells.length === 0 || afterCells.length === 0) {
		// Nothing to animate — fall through and let stage commit.
		afterRoot.style.opacity = '';
		return Promise.resolve();
	}

	// Measure positions while both roots are in the DOM.
	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	// Hide after-cells: we animate before-cells to their destinations and
	// swap visibility at the end.
	for (const cell of afterCells) {
		cell.style.visibility = 'hidden';
	}
	// afterRoot itself was prepared with opacity:0 by the stage; reveal it
	// so its children are measurable and the container has correct size,
	// but keep afterRoot's children hidden via visibility above.
	afterRoot.style.opacity = '1';
	// Keep afterRoot pointer-events-free during animation so it doesn't
	// intercept clicks — it will be committed by stage.commit after we finish.
	afterRoot.style.pointerEvents = 'none';

	// Animate each before-cell to its destination rect.
	const animations = beforeCells.map((cell, i) => {
		const destIndex = permutation[i];
		const afterRect = afterRects[destIndex];
		const beforeRect = beforeRects[i];

		const dx = afterRect.left - beforeRect.left;
		const dy = afterRect.top - beforeRect.top;

		// Bring cell to the top layer so it overlaps other cells during travel.
		cell.style.position = 'relative';
		cell.style.zIndex = '5';

		return animate(
			cell,
			{ x: [0, dx], y: [0, dy] },
			{ duration: DURATION_SLIDE, ease: [0.25, 0.1, 0.25, 1.0] }
		).finished;
	});

	return Promise.all(animations).then(() => {
		// Reveal after-cells; before-cells will be removed by stage.commit.
		for (const cell of afterCells) {
			cell.style.visibility = '';
		}
		afterRoot.style.pointerEvents = '';
		// Hide before-root so the transition from animated-before to
		// committed-after is invisible (stage.commit removes beforeRoot next).
		beforeRoot.style.opacity = '0';
	});
}

// ── Permutation helpers ───────────────────────────────────────────────────

function reversePermutation(n: number): ReadonlyArray<number> {
	return Array.from({ length: n }, (_, i) => n - 1 - i);
}

function sortPermutation(
	values: ReadonlyArray<number>,
	dir: 'asc' | 'desc',
): ReadonlyArray<number> {
	// Returns perm where perm[i] = destination index of element i in sorted order.
	// Stable: equal elements keep their original relative order.
	const indexed = values.map((v, i) => ({ v, i }));
	indexed.sort((a, b) => {
		const cmp = dir === 'asc' ? a.v - b.v : b.v - a.v;
		if (cmp !== 0) return cmp;
		return a.i - b.i; // stable
	});
	const perm = new Array<number>(values.length);
	for (let dest = 0; dest < indexed.length; dest++) {
		perm[indexed[dest].i] = dest;
	}
	return perm;
}

function transposePermutation(
	beforeShape: ReadonlyArray<number>,
): ReadonlyArray<number> {
	// 2D transpose: element at row r, col c (before) goes to row c, col r (after).
	// Flat index before: r * cols + c.  Flat index after: c * rows + r.
	if (beforeShape.length !== 2) {
		// Non-2D: identity permutation (no meaningful visual slide).
		return Array.from({ length: beforeShape.reduce((a, b) => a * b, 1) }, (_, i) => i);
	}
	const [rows, cols] = beforeShape;
	const perm = new Array<number>(rows * cols);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			perm[r * cols + c] = c * rows + r;
		}
	}
	return perm;
}

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

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return Promise.resolve();
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());

	// Pivot at the geometric centre of the row's first and last bar centres.
	const first = beforeRects[0];
	const last = beforeRects[beforeRects.length - 1];
	const cx = (first.left + first.width / 2 + last.left + last.width / 2) / 2;
	const cy = (first.top + first.height / 2 + last.top + last.height / 2) / 2;

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	const tasks = beforeCells.map((cell, i) => {
		const rect = beforeRects[i];
		const bx = rect.left + rect.width / 2;
		const by = rect.top + rect.height / 2;
		const dx = bx - cx;
		const dy = by - cy;

		// 2D rotation by θ around (cx, cy). The matrix below rotates clockwise
		// in math coords, which corresponds to counter-clockwise in screen
		// coords (because screen y is flipped) — so bars on the right side
		// arc UP through the top half of the wheel.
		const xs: number[] = [];
		const ys: number[] = [];
		for (let s = 0; s <= REVERSE_SAMPLES; s++) {
			const t = s / REVERSE_SAMPLES;
			const theta = Math.PI * t;
			const cos = Math.cos(theta);
			const sin = Math.sin(theta);
			const rdx = dx * cos + dy * sin;
			const rdy = -dx * sin + dy * cos;
			xs.push(cx + rdx - bx);
			ys.push(cy + rdy - by);
		}

		cell.style.position = 'relative';
		cell.style.zIndex = '5';

		return animate(
			cell,
			{ x: xs, y: ys },
			{ duration: REVERSE_DURATION, ease: [0.4, 0, 0.6, 1] }
		).finished;
	});

	return Promise.all(tasks).then(() => {
		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
	});
};

export const sortUpMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	const nums = numericData(step.x);
	if (nums === null) return blackBox(step, beforeRoot, afterRoot);
	return lateralMove(beforeRoot, afterRoot, sortPermutation(nums, 'asc'));
};

export const sortDownMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	const nums = numericData(step.x);
	if (nums === null) return blackBox(step, beforeRoot, afterRoot);
	return lateralMove(beforeRoot, afterRoot, sortPermutation(nums, 'desc'));
};

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

export const transposeMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array') return blackBox(step, beforeRoot, afterRoot);
	return lateralMove(beforeRoot, afterRoot, transposePermutation(step.x.shape));
};

