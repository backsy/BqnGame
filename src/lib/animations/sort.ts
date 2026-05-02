// ∧ / ∨ sort: each bar slides from its old position to its sorted slot,
// with a slight upward arc and a left-to-right stagger so the row reads
// as 'leftmost finds its place first, the rest ripple in'. The cell
// tracker preserves ids (sorted-by-value) so this is FLIP from
// pre-commit positions to post-commit positions, same shape as ⌽.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const ARC_PEAK = 12;

export const sort: AnimationFn = async ({ oldRects, getNode, commit }) => {
	const newCells = await commit();
	const tasks: Promise<unknown>[] = [];

	for (let i = 0; i < newCells.length; i++) {
		const cell = newCells[i];
		const node = getNode(cell.id);
		const oldRect = oldRects.get(cell.id);
		if (!node || !oldRect) continue;
		const newRect = node.getBoundingClientRect();
		const dx = oldRect.left - newRect.left;
		if (Math.abs(dx) < 0.5) continue;
		const a = animate(
			node,
			{ x: [dx, 0], y: [0, -ARC_PEAK, 0] },
			{ duration: 0.55, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }
		);
		tasks.push(a.finished);
	}

	await Promise.all(tasks);
};
