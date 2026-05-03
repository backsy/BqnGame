// ∧ / ∨ sort: each bar slides from its old position to its sorted
// slot, with a slight upward arc and a left-to-right stagger so the
// row reads as 'leftmost finds its place first, the rest ripple in'.
// Pure function: take items with from/to rects and an output-index
// stagger key (so we can stagger by the bar's NEW position).

import { animate } from 'motion';

const ARC_PEAK = 12;

export type SortItem = {
	node: HTMLElement;
	oldRect: DOMRect;
	newRect: DOMRect;
	/** Stagger order — typically the bar's index in the post-commit row. */
	staggerIndex: number;
};

export async function sort(items: SortItem[]): Promise<void> {
	const tasks: Promise<unknown>[] = [];
	for (const { node, oldRect, newRect, staggerIndex } of items) {
		const dx = oldRect.left - newRect.left;
		if (Math.abs(dx) < 0.5) continue;
		tasks.push(
			animate(
				node,
				{ x: [dx, 0], y: [0, -ARC_PEAK, 0] },
				{ duration: 0.55, delay: staggerIndex * 0.04, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(tasks);
}
