// ⍉ transpose: each grid cell flies from (r, c) to (c, r). Both pre
// and post are 2D ValueViz grids — different DOM, no cell continuity.
// Pure function: takes ghost cells + the target rect for each.

import { animate } from 'motion';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type TransposeItem = {
	ghostCell: HTMLElement;
	targetRect: DOMRect;
	/** Stagger key — typically Math.abs(r - c) so diagonal cells move first. */
	staggerKey: number;
};

export async function transpose(items: TransposeItem[]): Promise<void> {
	if (items.length === 0) return;
	const tasks: Promise<unknown>[] = [];
	for (const { ghostCell, targetRect, staggerKey } of items) {
		const cur = ghostCell.getBoundingClientRect();
		const dx = targetRect.left - cur.left;
		const dy = targetRect.top - cur.top;
		tasks.push(
			animate(
				ghostCell,
				{ x: dx, y: dy },
				{
					duration: 0.7,
					delay: staggerKey * 0.05,
					ease: [0.34, 1.2, 0.64, 1]
				}
			).finished
		);
	}
	await Promise.all(tasks);
	await delay(140);
}
