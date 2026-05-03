// F⌜˜ tables: a 1D row x produces a 2D grid where T[i][j] = x[i] F x[j].
// `⌜` is the table modifier — it pairs every left element against
// every right element. `˜` swaps so the right argument is x itself,
// giving the symmetric self-table.
//
// Story:
//   1. Source row pulses (each bar in turn) — these are the inputs.
//   2. Source row slides down to the BOTTOM row of the post-grid and
//      morphs from xs[c] to T[N-1][c] — that's the "x[N-1] F x[c]"
//      row in the table.
//   3. Upper rows materialize one at a time from bottom up, each row
//      r showing T[r][*]. Lands at the exact positions ValueViz will
//      render the post-commit grid.
//
// Pixel-clean handoff per types.ts: visualMax matches +page.svelte's
// vizMax (so heights line up), and bar layout (BAR_WIDTH, gaps,
// padding) mirrors ValueViz's grid.

import { animate } from 'motion';
import type { AnimationFn } from './types';

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
const ROW_GAP = 4;
const PAD_Y = 3.2; // .bar's padding-top in px (0.2rem)

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function tables(operator: string): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		const op = OP_FN[operator];
		if (
			!op ||
			cells.length < 2 ||
			cells.some((c) => typeof c.value !== 'number')
		) {
			await commit();
			return;
		}

		const N = cells.length;
		const xs = cells.map((c) => c.value as number);

		// Result table: T[r][c] = op(xs[r], xs[c]).
		const T: number[][] = [];
		for (let r = 0; r < N; r++) {
			const row: number[] = [];
			for (let c = 0; c < N; c++) row.push(op(xs[r], xs[c]));
			T.push(row);
		}

		// visualMax mirrors +page.svelte's vizMax (max abs across all
		// numbers in current + target). Source bars and grid bars
		// render with the same scale.
		const allVals = T.flat().concat(xs);
		const visualMax = Math.max(...allVals.map(Math.abs), 4);
		const valToH = (v: number) =>
			Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

		// Per-row max height & cumulative bottoms — same formulae as
		// reshape so the post-commit grid lands at exactly these spots.
		const rowMaxes = T.map((row) =>
			Math.max(...row.map((v) => valToH(v) + PAD_Y))
		);
		const rowBottoms: number[] = [];
		let acc = 0;
		for (let r = 0; r < N; r++) {
			acc += rowMaxes[r];
			rowBottoms.push(acc + r * ROW_GAP);
		}
		const gridH = rowBottoms[N - 1];

		// Source row's max bar height (with padding) — needed for the
		// vertical-center calc below.
		const sourceH = Math.max(...xs.map((v) => valToH(v) + PAD_Y));

		const wraps = cells.map((c) => getNode(c.id));
		const firstWrap = wraps[0];
		if (!firstWrap) {
			await commit();
			return;
		}
		const row = firstWrap.parentElement;
		const viz = row?.parentElement;
		if (!row || !viz) {
			await commit();
			return;
		}

		// .viz min-height = gridH (set by +page.svelte's --target-h
		// for 2D targets), and .viz centers content vertically. So
		// the source row's bottom sits at (gridH + sourceH)/2 from
		// .viz top, and grid row r's bottom sits at rowBottoms[r].
		const sourceBottom = (gridH + sourceH) / 2;
		const bottomRowDy = rowBottoms[N - 1] - sourceBottom;

		viz.style.position = 'relative';

		// Phase 1: pulse the source row so the player sees the inputs
		// before they fan out.
		await Promise.all(
			wraps.map((w, i) =>
				w
					? animate(
							w,
							{ scale: [1, 1.15, 1] },
							{
								duration: 0.32,
								delay: i * 0.05,
								ease: [0.34, 1.56, 0.64, 1]
							}
						).finished
					: Promise.resolve()
			)
		);
		await delay(120);

		// Phase 2: source row slides down to the bottom grid row,
		// while bar heights morph xs[c] → T[N-1][c] and the .num
		// text snaps mid-animation.
		const phase2: Promise<unknown>[] = [];
		for (let c = 0; c < N; c++) {
			const w = wraps[c];
			if (!w) continue;
			phase2.push(
				animate(
					w,
					{ y: bottomRowDy },
					{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
			const bar = w.querySelector('.bar') as HTMLElement | null;
			const num = bar?.querySelector('.num') as HTMLElement | null;
			if (bar) {
				const oldH = parseFloat(bar.style.height) || valToH(xs[c]);
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

		// Phase 3: upper rows (N-2 down to 0) materialize one by one.
		// Each row is built as N absolutely-positioned .bar elements
		// inside .viz. Source and grid have the same horizontal layout
		// (both N columns, same widths/gaps), so the source row's left
		// edge equals each grid row's left edge.
		const vizRect = viz.getBoundingClientRect();
		const rowRect = row.getBoundingClientRect();
		const rowLeftFromViz = rowRect.left - vizRect.left;

		const upperBars: HTMLElement[] = [];
		const ROW_DUR = 0.42;
		const ROW_STAGGER = 0.32;

		for (let step = 0; step < N - 1; step++) {
			const r = N - 2 - step; // bottom-up: N-2, N-3, …, 0.
			const rowDelay = step * ROW_STAGGER;
			for (let c = 0; c < N; c++) {
				const v = T[r][c];
				const bar = document.createElement('div');
				bar.className = 'bar';
				const num = document.createElement('span');
				num.className = 'num';
				num.textContent = formatNum(v);
				bar.appendChild(num);
				const h = valToH(v);
				Object.assign(bar.style, {
					position: 'absolute',
					width: `${BAR_WIDTH}px`,
					height: `${h}px`,
					left: `${rowLeftFromViz + c * (BAR_WIDTH + COL_GAP)}px`,
					bottom: `${gridH - rowBottoms[r]}px`,
					margin: '0',
					opacity: '0',
					transform: 'translateY(10px) scale(0.85)'
				});
				viz.appendChild(bar);
				upperBars.push(bar);
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
						delay: rowDelay + c * 0.04,
						ease: [0.34, 1.56, 0.64, 1]
					}
				);
			}
		}

		// Wait for the last row to finish settling before committing.
		const totalUpperMs = (N - 2) * ROW_STAGGER * 1000 + ROW_DUR * 1000 + 180;
		await delay(totalUpperMs);

		await commit();

		// ValueViz now owns the post-grid at the same positions;
		// remove our temporary bars in the same tick.
		for (const b of upperBars) b.remove();
		viz.style.position = '';
	};
}
