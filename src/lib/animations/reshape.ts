// R‿C⊸⥊ reshape: a flat row of R*C bars rearranges into an R×C grid.
// Each ghost bar moves from its row position to its grid position.
//
// Pure function: takes ghost wraps + the target rect for each one
// (where the post-commit grid cell will be).

import { animate } from 'motion';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ReshapeItem = {
	ghostWrap: HTMLElement;
	targetRect: DOMRect;
};

export async function reshape(items: ReshapeItem[]): Promise<void> {
	if (items.length === 0) return;

	const tasks: Promise<unknown>[] = [];
	for (const { ghostWrap, targetRect } of items) {
		const cur = ghostWrap.getBoundingClientRect();
		const dx = targetRect.left - cur.left;
		const dy = targetRect.top - cur.top;
		tasks.push(
			animate(
				ghostWrap,
				{ x: dx, y: dy },
				{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }
			).finished
		);
	}
	await Promise.all(tasks);
	await delay(200);
}
