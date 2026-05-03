// ∾ join: existing bars FLIP-shift to make room (the row's center
// stays put, so they slide outward by half the added width), and new
// bars cascade in from the appropriate side.
//
// Pure function: takes existing items (with from/to rects) and new
// items (with their position and slide-direction) plus the side
// from which new bars enter.

import { animate } from 'motion';

const SLIDE_DIST = 120;

export type JoinExisting = {
	wrap: HTMLElement;
	oldRect: DOMRect;
	newRect: DOMRect;
};

export type JoinNew = {
	wrap: HTMLElement;
	cascadeIndex: number; // staggers entry order
};

export async function join(
	existing: JoinExisting[],
	added: JoinNew[],
	direction: 'left' | 'right'
): Promise<void> {
	const slideFromX = direction === 'left' ? -SLIDE_DIST : SLIDE_DIST;

	// Hide new wraps synchronously so the browser doesn't paint them
	// before the cascade starts.
	for (const { wrap } of added) {
		wrap.style.opacity = '0';
		wrap.style.transform = `translateX(${slideFromX}px)`;
	}

	const tasks: Promise<unknown>[] = [];

	// FLIP existing from old to new positions.
	for (const { wrap, oldRect, newRect } of existing) {
		const dx = oldRect.left - newRect.left;
		if (Math.abs(dx) < 0.5) continue;
		tasks.push(
			animate(
				wrap,
				{ x: [dx, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}

	// Cascade added wraps in from the appropriate side.
	for (const { wrap, cascadeIndex } of added) {
		tasks.push(
			animate(
				wrap,
				{ opacity: [0, 1], x: [slideFromX, 0] },
				{
					duration: 0.5,
					delay: cascadeIndex * 0.07,
					ease: [0.34, 1.2, 0.64, 1]
				}
			).finished
		);
	}

	await Promise.all(tasks);

	for (const { wrap } of added) {
		wrap.style.opacity = '';
		wrap.style.transform = '';
	}
}
