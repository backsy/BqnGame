// R‿C⊸⥊ reshape: a flat row of R*C bars rearranges into an R×C grid.
// Bars are bottom-aligned within each grid row (matching the row
// layout's flex-end alignment), so dy is uniform within a row: it's
// the cumulative bottom offset of that row minus the original row's
// bottom. dx is the column delta.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const BAR_WIDTH = 30;
const COL_GAP = 4;
const ROW_GAP = 4;
const COL_STEP = BAR_WIDTH + COL_GAP;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function reshape(rows: number, cols: number): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		if (cells.length !== rows * cols || cells.length < 2) {
			await commit();
			return;
		}

		const wraps = cells.map((c) => getNode(c.id));
		if (!wraps[0]) {
			await commit();
			return;
		}

		const heights = wraps.map((w) => {
			const b = w?.querySelector('.bar') as HTMLElement | null;
			if (b && b.style.height) {
				const h = parseFloat(b.style.height);
				if (!isNaN(h)) return h;
			}
			return 60;
		});

		// Per-row max height (each grid row sized to its tallest bar).
		const rowMaxes = new Array(rows).fill(0);
		for (let i = 0; i < heights.length; i++) {
			const r = Math.floor(i / cols);
			if (heights[i] > rowMaxes[r]) rowMaxes[r] = heights[i];
		}

		// Cumulative bottom of each row in the grid.
		const rowBottoms: number[] = [];
		let acc = 0;
		for (let r = 0; r < rows; r++) {
			acc += rowMaxes[r];
			rowBottoms.push(acc + r * ROW_GAP);
		}

		// AnimatedRow bottom-aligns bars; current row's bottom = max height.
		const sourceBottom = Math.max(...heights, 1);

		const tasks: Promise<unknown>[] = [];
		for (let i = 0; i < wraps.length; i++) {
			const w = wraps[i];
			if (!w) continue;
			const col = i % cols;
			const r = Math.floor(i / cols);
			const dx = (col - i) * COL_STEP;
			// Bottom-aligned target: dy = grid-row-bottom - source-row-bottom.
			const dy = rowBottoms[r] - sourceBottom;
			tasks.push(
				animate(
					w,
					{ x: dx, y: dy },
					{ duration: 0.55, delay: r * 0.08, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}
		await Promise.all(tasks);

		await delay(180);
		await commit();
	};
}
