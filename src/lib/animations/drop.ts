// N↓ drop: count off the first N cells (the ones being removed),
// then THOSE cells fall away while the survivors slide left to fill
// the gap. Inverse of take — same intro, opposite fate.
//
// Pure function: takes the dropped (ghost) wraps and the surviving
// (live) wraps with their FLIP rects.

import { animate } from 'motion';
import { selectFirst, SELECT_LIFT_PX } from './select';

const FALL_PX = 60;

export type DropDropped = { wrap: HTMLElement }; // ghost
export type DropSurvivor = {
	wrap: HTMLElement;       // live
	oldRect: DOMRect;
	newRect: DOMRect;
};

export async function drop(
	dropped: DropDropped[],
	survivors: DropSurvivor[]
): Promise<void> {
	const { selected, introFinished } = selectFirst(
		dropped.map((d) => d.wrap),
		dropped.length
	);

	await introFinished;

	// The selected (dropped) ghosts fall — their badges fall with
	// them since they're DOM children of the wrap.
	const fallTasks = selected.map((sel, i) =>
		animate(
			sel.node,
			{ opacity: [1, 0.5, 0], y: [-SELECT_LIFT_PX, -SELECT_LIFT_PX, FALL_PX] },
			{ duration: 0.55, ease: [0.5, 0, 0.7, 1], delay: i * 0.04 }
		).finished
	);
	await Promise.all(fallTasks);

	// FLIP: survivors slide from old positions to new (re-centered).
	const settleTasks: Promise<unknown>[] = [];
	for (const { wrap, oldRect, newRect } of survivors) {
		const dx = oldRect.left - newRect.left;
		if (Math.abs(dx) < 0.5) continue;
		settleTasks.push(
			animate(
				wrap,
				{ x: [dx, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);
}
