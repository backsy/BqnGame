// F⌜˜ tables: a 1D row x produces a 2D grid where T[i][j] = x[i] F x[j].
//
// Story:
//   1. Source row pulses (the inputs).
//   2. Source row slides down to the BOTTOM row of the post-grid and
//      morphs from xs[c] to T[N-1][c].
//   3. Upper rows materialize one at a time from bottom up at their
//      exact post-commit grid positions.
//
// Pure function: takes the ghost source wraps + values + operator,
// plus the live grid we're handing off to so we can query target
// positions.

import { animate } from 'motion';

const OP_FN: Record<string, (a: number, b: number) => number> = {
	'+': (a, b) => a + b,
	'-': (a, b) => a - b,
	'×': (a, b) => a * b,
	'÷': (a, b) => (b === 0 ? 0 : a / b),
	'⌈': (a, b) => Math.max(a, b),
	'⌊': (a, b) => Math.min(a, b),
	'=': (a, b) => (a === b ? 1 : 0),
	'<': (a, b) => (a < b ? 1 : 0),
	'>': (a, b) => (a > b ? 1 : 0)
};

const BAR_WIDTH = 30;
const COL_GAP = 4;
const PAD_Y = 3.2;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type TablesInput = {
	ghostWraps: HTMLElement[];
	xs: number[];
	operator: string;
	/** The post-commit grid (still hidden). We read the target rects
	 *  from it to land each bar pixel-clean. */
	liveGrid: HTMLElement;
};

export async function tables({
	ghostWraps,
	xs,
	operator,
	liveGrid
}: TablesInput): Promise<void> {
	const op = OP_FN[operator];
	if (!op || ghostWraps.length < 2 || xs.length !== ghostWraps.length) return;

	const N = xs.length;
	const T: number[][] = [];
	for (let r = 0; r < N; r++) {
		const row: number[] = [];
		for (let c = 0; c < N; c++) row.push(op(xs[r], xs[c]));
		T.push(row);
	}

	// Grab target rects from the live grid (its children are flat
	// row-major). If the grid hasn't laid out yet (we hid the .viz
	// before commit), we need to temporarily reveal it for measurement.
	const liveCells = Array.from(liveGrid.children) as HTMLElement[];
	if (liveCells.length !== N * N) return;
	const restoreVisibility = (liveGrid.parentElement as HTMLElement | null)?.style.visibility;
	const liveViz = liveGrid.parentElement as HTMLElement | null;
	if (liveViz) liveViz.style.visibility = '';
	const targetRects = liveCells.map((el) => el.getBoundingClientRect());
	if (liveViz) liveViz.style.visibility = restoreVisibility ?? '';

	const allVals = T.flat().concat(xs);
	const visualMax = Math.max(...allVals.map(Math.abs), 4);
	const valToH = (v: number) =>
		Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

	// Phase 1: pulse source bars.
	await Promise.all(
		ghostWraps.map((w, i) =>
			animate(
				w,
				{ scale: [1, 1.15, 1] },
				{ duration: 0.32, delay: i * 0.05, ease: [0.34, 1.56, 0.64, 1] }
			).finished
		)
	);
	await delay(120);

	// Phase 2: source row slides to bottom-row positions and morphs
	// xs[c] → T[N-1][c].
	const phase2: Promise<unknown>[] = [];
	for (let c = 0; c < N; c++) {
		const ghost = ghostWraps[c];
		const target = targetRects[(N - 1) * N + c];
		const cur = ghost.getBoundingClientRect();
		const dx = target.left - cur.left;
		const dy = target.top - cur.top;
		phase2.push(
			animate(ghost, { x: dx, y: dy }, { duration: 0.5, ease: [0.22, 1, 0.36, 1] }).finished
		);

		const bar = ghost.querySelector('.bar') as HTMLElement | null;
		const num = bar?.querySelector('.num') as HTMLElement | null;
		if (bar) {
			const oldH = valToH(xs[c]);
			const newH = valToH(T[N - 1][c]);
			phase2.push(
				animate(
					bar,
					{ height: [`${oldH}px`, `${newH}px`] },
					{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
			setTimeout(() => {
				if (num) num.textContent = formatNum(T[N - 1][c]);
			}, 250);
		}
	}
	await Promise.all(phase2);

	// Phase 3: upper rows materialize bottom-up. Build absolute clone
	// bars in body at the target rects. Fade them in row-by-row.
	const clones: HTMLElement[] = [];
	const ROW_DUR = 0.42;
	const ROW_STAGGER = 0.32;
	for (let step = 0; step < N - 1; step++) {
		const r = N - 2 - step;
		const stepDelay = step * ROW_STAGGER;
		for (let c = 0; c < N; c++) {
			const v = T[r][c];
			const target = targetRects[r * N + c];
			const bar = document.createElement('div');
			bar.className = 'bar';
			const num = document.createElement('span');
			num.className = 'num';
			num.textContent = formatNum(v);
			bar.appendChild(num);
			Object.assign(bar.style, {
				position: 'fixed',
				left: `${target.left}px`,
				top: `${target.top}px`,
				width: `${BAR_WIDTH}px`,
				height: `${valToH(v)}px`,
				margin: '0',
				opacity: '0',
				transform: 'translateY(10px) scale(0.85)',
				zIndex: '21',
				pointerEvents: 'none'
			});
			document.body.appendChild(bar);
			clones.push(bar);
			animate(
				bar,
				{
					opacity: [0, 1],
					transform: [
						'translateY(10px) scale(0.85)',
						'translateY(0) scale(1)'
					]
				},
				{
					duration: ROW_DUR,
					delay: stepDelay + c * 0.04,
					ease: [0.34, 1.56, 0.64, 1]
				}
			);
		}
	}

	const totalUpperMs = (N - 2) * ROW_STAGGER * 1000 + ROW_DUR * 1000 + 220;
	await delay(totalUpperMs);

	// Cleanup happens when the controller removes the ghost; remove
	// our extra clone bars too.
	for (const c of clones) c.remove();
}
