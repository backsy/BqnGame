// R‿C⊸⥊ reshape: a flat row of R*C bars rearranges into an R×C grid.
// The .viz container has its min-height pinned to the target grid's
// expected height, so the source row sits centered with empty space
// above and below. The animation then fans bars symmetrically around
// the cell center: row 0 of the grid moves up, last row moves down,
// middle rows go where they need to. Bars stay bottom-aligned within
// their grid row.

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

		// Cumulative bottom y of each grid row (relative to grid top).
		const rowBottoms: number[] = [];
		let acc = 0;
		for (let r = 0; r < rows; r++) {
			acc += rowMaxes[r];
			rowBottoms.push(acc + r * ROW_GAP);
		}
		const gridH = rowBottoms[rows - 1];

		// Source row's height = max bar height (bars bottom-align in row).
		const sourceRowH = Math.max(...heights, 1);

		// .viz centers content vertically with min-height = gridH, so the
		// source row's bottom sits at (gridH + sourceRowH) / 2 in viz
		// coords, and grid row r's bottom is at rowBottoms[r].
		const sourceBottom = (gridH + sourceRowH) / 2;

		const tasks: Promise<unknown>[] = [];
		for (let i = 0; i < wraps.length; i++) {
			const w = wraps[i];
			if (!w) continue;
			const col = i % cols;
			const r = Math.floor(i / cols);
			const dx = (col - i) * COL_STEP;
			const dy = rowBottoms[r] - sourceBottom;
			tasks.push(
				animate(
					w,
					{ x: dx, y: dy },
					{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }
				).finished
			);
		}
		await Promise.all(tasks);

		await delay(200);
		await commit();
	};
}
