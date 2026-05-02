// N↑ take: count off the first N cells (the kept ones), then drop the
// rest. After the dropped cells are off-screen, commit and let the kept
// cells settle into the re-centered row.

import { animate } from 'motion';
import type { AnimationFn } from './types';
import { selectFirst, fadeBadges, clearWrapStyles, SELECT_LIFT_PX } from './select';

const DROP_PX = 38;

export function take(n: number): AnimationFn {
	return async ({ cells, oldRects, getNode, commit }) => {
		const dropped = cells.slice(n);
		const { selected, introFinished } = selectFirst(cells, n, getNode);

		// Unselected cells dim and slide down in parallel with the count
		// intro — the overlap reads as 'these are leaving' before the
		// count even finishes.
		const dropTasks = dropped.map((cell, i) => {
			const node = getNode(cell.id);
			if (!node) return Promise.resolve();
			return animate(
				node,
				{ opacity: [1, 0.35, 0], y: [0, 0, DROP_PX] },
				{ duration: 0.7, ease: [0.4, 0, 0.6, 1], delay: 0.18 + i * 0.04 }
			).finished;
		});

		await Promise.all([introFinished, ...dropTasks]);
		await commit();

		// FLIP: kept cells settle from old positions (still lifted) to
		// new re-centered positions (no lift).
		const settleTasks: Promise<unknown>[] = [];
		for (const sel of selected) {
			const node = getNode(sel.cell.id);
			const oldRect = oldRects.get(sel.cell.id);
			if (!node || !oldRect) continue;
			const newRect = node.getBoundingClientRect();
			const dx = oldRect.left - newRect.left;
			const a = animate(
				node,
				{ x: [dx, 0], y: [-SELECT_LIFT_PX, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			);
			settleTasks.push(a.finished);
		}
		await Promise.all(settleTasks);

		await fadeBadges(selected.map((s) => s.badge));
		clearWrapStyles(selected.map((s) => s.node));
	};
}
