// R‿C⊸⥊ reshape: a flat row of R*C bars rearranges into an R×C grid.
// Bars destined for row 0 stay put; bars for row 1 move down and
// left; bars for row 2 further down and even more left; etc.
// After commit, AnimatedRow unmounts and ValueViz renders the actual
// grid — positions are approximate so the handoff looks continuous.

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
		const firstWrap = wraps[0];
		if (!firstWrap) {
			await commit();
			return;
		}

		// Estimate row height from any bar's rendered height. Falls back
		// to 60 if nothing's been laid out yet.
		const probeBar = wraps
			.map((w) => w?.querySelector('.bar') as HTMLElement | null)
			.find((b): b is HTMLElement => !!b && !!b.style.height);
		const barH = probeBar ? parseFloat(probeBar.style.height) || 60 : 60;
		const ROW_STEP = barH + ROW_GAP;

		const tasks: Promise<unknown>[] = [];
		for (let i = 0; i < wraps.length; i++) {
			const w = wraps[i];
			if (!w) continue;
			const col = i % cols;
			const row = Math.floor(i / cols);
			const dx = (col - i) * COL_STEP;
			const dy = row * ROW_STEP;
			tasks.push(
				animate(
					w,
					{ x: dx, y: dy },
					{ duration: 0.55, delay: row * 0.08, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}
		await Promise.all(tasks);

		await delay(180);
		await commit();
	};
}
