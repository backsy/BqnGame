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

// ── transposeMonadic ──────────────────────────────────────────────────────
// ⍉ on a 2D matrix swaps rows and columns. Cells trade places across the
// matrix diagonal. Pairs like (r,c) ↔ (c,r) follow the SAME straight-line
// path between them, so naive translation makes them collide mid-motion.
// Fix: each cell takes a PERPENDICULAR ARC around the straight line.
// Because of how the perpendicular is computed (rotate the movement vector
// 90° CCW), the two cells in a swap pair arc to OPPOSITE sides of the line.
// They orbit each other instead of clipping through.

const TRANSPOSE_DURATION = 0.95;
const TRANSPOSE_SAMPLES = 28;
const TRANSPOSE_ARC_FACTOR = 0.35; // arc peak / journey length

export const transposeMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array' || step.x.shape.length !== 2) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return Promise.resolve();
	}

	const [R, C] = step.x.shape;
	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	const tasks = beforeCells.map((cell, i) => {
		const r = Math.floor(i / C);
		const c = i % C;
		// BEFORE cell at (r, c) → AFTER cell at (c, r). AFTER has shape
		// [C, R], so its flat index for (c, r) is c * R + r.
		const destIndex = c * R + r;
		const startRect = beforeRects[i];
		const endRect = afterRects[destIndex];

		const sx = startRect.left + startRect.width / 2;
		const sy = startRect.top + startRect.height / 2;
		const ex = endRect.left + endRect.width / 2;
		const ey = endRect.top + endRect.height / 2;

		const dx = ex - sx;
		const dy = ey - sy;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist < 0.5) {
			// Cell doesn't move (e.g. on the matrix diagonal for square).
			return Promise.resolve();
		}

		// Unit vector perpendicular to the straight-line trajectory,
		// rotated 90° CCW from (dx, dy). For a swap pair where one cell's
		// (dx, dy) is the other's negation, this gives opposite-sign
		// perpendiculars → the two cells orbit on opposite sides.
		const perpX = -dy / dist;
		const perpY = dx / dist;
		const arcMag = dist * TRANSPOSE_ARC_FACTOR;

		const xs: number[] = [];
		const ys: number[] = [];
		for (let s = 0; s <= TRANSPOSE_SAMPLES; s++) {
			const t = s / TRANSPOSE_SAMPLES;
			// Cosine half-cycle for the straight-line progress: 0 → 1 with
			// smooth ends; sin half-cycle for the perpendicular bump:
			// 0 → arcMag → 0 with peak at the midpoint.
			const progress = (1 - Math.cos(Math.PI * t)) / 2;
			const arc = Math.sin(Math.PI * t) * arcMag;
			xs.push(dx * progress + perpX * arc);
			ys.push(dy * progress + perpY * arc);
		}

		cell.style.position = 'relative';
		cell.style.zIndex = '5';
		return animate(
			cell,
			{ x: xs, y: ys },
			{ duration: TRANSPOSE_DURATION, ease: 'linear' }
		).finished;
	});

	return Promise.all(tasks).then(() => {
		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
	});
};

