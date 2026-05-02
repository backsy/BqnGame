// N↓ drop: count off the first N cells (the ones being removed), then
// THOSE cells fall away while the survivors slide left to fill the gap.
// Inverse of take — same intro, opposite fate.

import { animate } from 'motion';
import type { AnimationFn } from './types';
import { selectFirst, SELECT_LIFT_PX } from './select';

const FALL_PX = 60;

export function drop(n: number): AnimationFn {
	return async ({ cells, oldRects, getNode, commit }) => {
		const survivors = cells.slice(n);
		const { selected, introFinished } = selectFirst(cells, n, getNode);

		await introFinished;

		// The selected cells fall (their badges fall with them — both
		// children of the same wrap). They unmount on commit.
		const fallTasks = selected.map((sel, i) =>
			animate(
				sel.node,
				{ opacity: [1, 0.5, 0], y: [-SELECT_LIFT_PX, -SELECT_LIFT_PX, FALL_PX] },
				{ duration: 0.55, ease: [0.5, 0, 0.7, 1], delay: i * 0.04 }
			).finished
		);
		await Promise.all(fallTasks);

		await commit();

		// FLIP: survivors slide from old positions to new (re-centered).
		const settleTasks: Promise<unknown>[] = [];
		for (const cell of survivors) {
			const node = getNode(cell.id);
			const oldRect = oldRects.get(cell.id);
			if (!node || !oldRect) continue;
			const newRect = node.getBoundingClientRect();
			const dx = oldRect.left - newRect.left;
			if (Math.abs(dx) < 0.5) continue;
			const a = animate(
				node,
				{ x: [dx, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			);
			settleTasks.push(a.finished);
		}
		await Promise.all(settleTasks);
	};
}
