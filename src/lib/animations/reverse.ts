// ⌽ reverse: each cell physically arcs over its neighbours from its
// old position to its mirror position on the other end of the row.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const ARC_PEAK = 60;

export const reverse: AnimationFn = async ({ cells, getNode, oldRects }) => {
	const tasks: Promise<unknown>[] = [];
	for (const cell of cells) {
		const node = getNode(cell.id);
		const oldRect = oldRects.get(cell.id);
		if (!node || !oldRect) continue;
		const newRect = node.getBoundingClientRect();
		const dx = oldRect.left - newRect.left;
		const dy = oldRect.top - newRect.top;
		// Cell didn't move (odd-length middle item) — no animation needed.
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
		const a = animate(
			node,
			{
				x: [dx, dx / 2, 0],
				y: [dy, dy - ARC_PEAK, 0]
			},
			{ duration: 0.85, ease: [0.4, 0, 0.2, 1] }
		);
		tasks.push(a.finished);
	}
	await Promise.all(tasks);
};
