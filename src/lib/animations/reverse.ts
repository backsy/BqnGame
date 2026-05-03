// ⌽ reverse: each cell physically arcs over its neighbours from its
// old position to its mirror position on the other end of the row.
// Pure function: take a list of items with their from/to rects,
// arc each one. The controller decides who's in the list.

import { animate } from 'motion';

const ARC_PEAK = 60;
const SAMPLES = 16;

export type ReverseItem = {
	node: HTMLElement;
	oldRect: DOMRect;
	newRect: DOMRect;
};

export async function reverse(items: ReverseItem[]): Promise<void> {
	const tasks: Promise<unknown>[] = [];
	for (const { node, oldRect, newRect } of items) {
		const dx = oldRect.left - newRect.left;
		const dy = oldRect.top - newRect.top;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

		// Cosine half-cycle keyframes give a smooth arc with no
		// midpoint pause (which sparse keyframes cause via Motion's
		// per-pair re-easing).
		const xs: number[] = [];
		const ys: number[] = [];
		for (let i = 0; i <= SAMPLES; i++) {
			const t = i / SAMPLES;
			const tEase = (1 - Math.cos(Math.PI * t)) / 2;
			xs.push(dx * (1 - tEase));
			ys.push(dy * (1 - t) - ARC_PEAK * Math.sin(Math.PI * t));
		}

		tasks.push(
			animate(node, { x: xs, y: ys }, { duration: 0.85, ease: 'linear' }).finished
		);
	}
	await Promise.all(tasks);
}
