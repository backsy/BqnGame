// ⥊ deshape: each grid cell flies to its row position (row-major
// flattening). 2D pre, 1D post.

import { animate } from 'motion';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type DeshapeItem = {
	ghostCell: HTMLElement;
	targetRect: DOMRect;
};

export async function deshape(items: DeshapeItem[]): Promise<void> {
	if (items.length === 0) return;
	const tasks: Promise<unknown>[] = [];
	for (let i = 0; i < items.length; i++) {
		const { ghostCell, targetRect } = items[i];
		const cur = ghostCell.getBoundingClientRect();
		const dx = targetRect.left - cur.left;
		const dy = targetRect.top - cur.top;
		tasks.push(
			animate(
				ghostCell,
				{ x: dx, y: dy },
				{
					duration: 0.65,
					delay: i * 0.03,
					ease: [0.34, 1.2, 0.64, 1]
				}
			).finished
		);
	}
	await Promise.all(tasks);
	await delay(120);
}
