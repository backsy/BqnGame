// N↓ drop: count off the first N cells (the ones being removed),
// then THOSE cells fall away while the survivors slide left to fill
// the gap. Inverse of take — same intro, opposite fate.
//
// Pure function: takes ALL pre-commit ghost wraps in order, the
// split point N, and the post-commit target rects for the surviving
// wraps. Everything runs on the ghost.

import { animate } from 'motion';
import { selectFirst, SELECT_LIFT_PX } from './select';

const FALL_PX = 60;

export type DropInput = {
	/** All pre-commit ghost wraps in order. First N are dropped; the rest survive. */
	ghostWraps: HTMLElement[];
	n: number;
	/** Pre-commit (pre-lift) viewport rects for the survivors, in order. */
	survivorOldRects: DOMRect[];
	/** Post-commit target rects for the survivors, in order. */
	survivorTargetRects: DOMRect[];
};

export async function drop({
	ghostWraps,
	n,
	survivorOldRects,
	survivorTargetRects
}: DropInput): Promise<void> {
	const droppedGhosts = ghostWraps.slice(0, n);
	const survivorGhosts = ghostWraps.slice(n);

	// Phase 1: count-off intro on the dropped ghost wraps (lift + badges).
	const { selected, introFinished } = selectFirst(droppedGhosts, n);
	await introFinished;

	// Phase 2: dropped ghosts fall (badges fall with them — they're
	// children of the wrap).
	const fallTasks = selected.map((sel, i) =>
		animate(
			sel.node,
			{ opacity: [1, 0.5, 0], y: [-SELECT_LIFT_PX, -SELECT_LIFT_PX, FALL_PX] },
			{ duration: 0.55, ease: [0.5, 0, 0.7, 1], delay: i * 0.04 }
		).finished
	);
	await Promise.all(fallTasks);

	// Phase 3: survivors slide from their natural ghost positions to
	// the live target positions.
	const settleTasks: Promise<unknown>[] = [];
	for (let i = 0; i < survivorGhosts.length; i++) {
		const w = survivorGhosts[i];
		const oldRect = survivorOldRects[i];
		const target = survivorTargetRects[i];
		const dx = target.left - oldRect.left;
		const dy = target.top - oldRect.top;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
		settleTasks.push(
			animate(
				w,
				{ x: dx, y: dy },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);
}
