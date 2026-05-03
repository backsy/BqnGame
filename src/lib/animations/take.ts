// N↑ take: count off the first N cells (the kept ones), then drop
// the rest. After the dropped cells are off-screen, the kept cells
// settle into the re-centered row.
//
// Pure function: takes a 'kept' list (live wraps + FLIP rects) and a
// 'dropped' list (ghost wraps that fall off, since the live ones are
// already gone post-commit).

import { animate } from 'motion';
import { selectFirst, fadeBadges, clearWrapStyles, SELECT_LIFT_PX } from './select';

const DROP_PX = 38;

export type TakeKept = {
	wrap: HTMLElement; // live (post-commit)
	oldRect: DOMRect;
	newRect: DOMRect;
};

export type TakeDropped = {
	wrap: HTMLElement; // ghost (pre-commit clone)
};

export async function take(
	kept: TakeKept[],
	dropped: TakeDropped[]
): Promise<void> {
	// Intro counts off the live KEPT wraps. Lifts them with badges.
	const { selected, introFinished } = selectFirst(
		kept.map((k) => k.wrap),
		kept.length
	);

	// Unselected (dropped) ghost wraps dim and slide down.
	const dropTasks = dropped.map((d, i) =>
		animate(
			d.wrap,
			{ opacity: [1, 0.35, 0], y: [0, 0, DROP_PX] },
			{ duration: 0.7, ease: [0.4, 0, 0.6, 1], delay: 0.18 + i * 0.04 }
		).finished
	);

	await Promise.all([introFinished, ...dropTasks]);

	// FLIP: kept wraps settle from old positions (still lifted) to
	// their new re-centered positions (no lift).
	const settleTasks: Promise<unknown>[] = [];
	for (let i = 0; i < kept.length; i++) {
		const { wrap, oldRect, newRect } = kept[i];
		const dx = oldRect.left - newRect.left;
		settleTasks.push(
			animate(
				wrap,
				{ x: [dx, 0], y: [-SELECT_LIFT_PX, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);

	await fadeBadges(selected.map((s) => s.badge));
	clearWrapStyles(selected.map((s) => s.node));
}
