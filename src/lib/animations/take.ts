// N↑ take: count off the first N cells (the kept ones), then drop
// the rest. After the dropped cells are off-screen, the kept cells
// settle into the re-centered row.
//
// Pure function: takes ALL pre-commit ghost wraps in order, the
// split point N, and the post-commit target rects for the kept
// wraps. Everything visible runs on the ghost — the controller
// reveals the live viz once the animation lands.

import { animate } from 'motion';
import { selectFirst, fadeBadges, SELECT_LIFT_PX } from './select';

const DROP_PX = 38;

export type TakeInput = {
	/** All pre-commit ghost wraps in order. First N are kept; the rest are dropped. */
	ghostWraps: HTMLElement[];
	n: number;
	/** Pre-commit (pre-lift) viewport rects for the kept ghost wraps,
	 *  in order. Used to compute the settle delta from natural ghost
	 *  position to the post-commit target. */
	keptOldRects: DOMRect[];
	/** Post-commit (live) viewport rects for the kept wraps, in order.
	 *  This is where the ghost kept wraps land before the controller
	 *  swaps them out for the live wraps. */
	keptTargetRects: DOMRect[];
};

export async function take({
	ghostWraps,
	n,
	keptOldRects,
	keptTargetRects
}: TakeInput): Promise<void> {
	const keptGhosts = ghostWraps.slice(0, n);
	const droppedGhosts = ghostWraps.slice(n);

	// Phase 1: count-off intro on the kept ghost wraps (lift + badges).
	const { selected, introFinished } = selectFirst(keptGhosts, n);

	// Phase 1b in parallel: dropped ghosts dim and fall.
	const dropTasks = droppedGhosts.map((w, i) =>
		animate(
			w,
			{ opacity: [1, 0.35, 0], y: [0, 0, DROP_PX] },
			{ duration: 0.7, ease: [0.4, 0, 0.6, 1], delay: 0.18 + i * 0.04 }
		).finished
	);

	await Promise.all([introFinished, ...dropTasks]);

	// Phase 2: kept ghosts settle from their lifted natural position
	// to the live target — un-lifting and re-centering in one motion.
	// Transform target is computed from the OLD (pre-lift) rect so
	// the math doesn't have to undo the lift offset.
	const settleTasks: Promise<unknown>[] = [];
	for (let i = 0; i < n; i++) {
		const w = keptGhosts[i];
		const oldRect = keptOldRects[i];
		const target = keptTargetRects[i];
		const dx = target.left - oldRect.left;
		const dy = target.top - oldRect.top;
		// Motion tweens from the current transform (x: 0, y: -LIFT)
		// to the target (x: dx, y: dy). At the end the wrap visually
		// sits at target — same place ValueViz / AnimatedRow will
		// render the live wrap once the controller reveals it.
		settleTasks.push(
			animate(
				w,
				{ x: dx, y: dy },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);

	await fadeBadges(selected.map((s) => s.badge));
}
