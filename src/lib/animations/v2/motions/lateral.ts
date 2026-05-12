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

function rotatePermutation(n: number, rotateBy: number): ReadonlyArray<number> {
	// BQN: W⌽X shifts elements left by W (positive).
	// Element originally at index i ends up at index ((i - rotateBy) % n + n) % n.
	const r = ((rotateBy % n) + n) % n;
	return Array.from({ length: n }, (_, i) => ((i - r) + n) % n);
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
// The row rotates 180° around its centre. Each bar travels along a circular
// arc whose radius is its distance from the centre. Bars right of centre
// arc upward; bars left of centre arc downward. The row sweeps through a
// half-turn as a rigid body, ending in reverse order.
//
// Identity preserved by animating the before-cells. On completion they fade
// out and the after-cells (visibility:hidden during flight) take their place.

const REVERSE_DURATION = 0.85;
const REVERSE_SAMPLES = 24;

export const reverseMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return Promise.resolve();
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());

	// Centre of the row: midpoint of the first and last bar centres. Using
	// rect centres (not lefts) means the rotation pivot is the geometric
	// centre of the bar layout, so the operation looks symmetric regardless
	// of how the row is positioned within the stage.
	const first = beforeRects[0];
	const last = beforeRects[beforeRects.length - 1];
	const cx = (first.left + first.width / 2 + last.left + last.width / 2) / 2;
	const cy = (first.top + first.height / 2 + last.top + last.height / 2) / 2;

	// Hide after-cells; reveal afterRoot so its layout is realised but its
	// cells stay invisible until the rotation completes.
	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	const tasks = beforeCells.map((cell, i) => {
		const rect = beforeRects[i];
		const bx = rect.left + rect.width / 2;
		const by = rect.top + rect.height / 2;
		const dx = bx - cx;
		const dy = by - cy;

		// 2D rotation by angle θ around (cx, cy). Counter-clockwise visually
		// (i.e. clockwise in math coords because screen y is flipped) so that
		// bars on the right side arc UP through the rotation.
		const xs: number[] = [];
		const ys: number[] = [];
		for (let s = 0; s <= REVERSE_SAMPLES; s++) {
			const t = s / REVERSE_SAMPLES;
			const theta = Math.PI * t;
			const cos = Math.cos(theta);
			const sin = Math.sin(theta);
			const rdx = dx * cos + dy * sin;
			const rdy = -dx * sin + dy * cos;
			// Translate from rect centre coords to transform offset relative
			// to the cell's natural position.
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

export const rotateDyadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
	const n = step.x.kind === 'array' ? step.x.data.length : 1;
	if (step.w.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);
	return lateralMove(beforeRoot, afterRoot, rotatePermutation(n, step.w.value));
};

export const transposeMonadic: AnimateStep = (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array') return blackBox(step, beforeRoot, afterRoot);
	return lateralMove(beforeRoot, afterRoot, transposePermutation(step.x.shape));
};

