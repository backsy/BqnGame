// ⊑ first / N⊸⊑ pick: highlight one (ghost) bar, drop the others,
// slide the kept bar to where the post-commit scalar will render
// (.viz center).
//
// Pure function: takes the ghost wraps + the index of the kept one,
// plus the post-commit viz so we can compute where to slide the kept
// bar to.

import { animate } from 'motion';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type PickInput = {
	/** Ghost wraps for every pre-commit cell (clones, in body). */
	ghostWraps: HTMLElement[];
	/** Index of the kept wrap. */
	keptIndex: number;
	/** Viewport-x of the post-commit scalar bar's center. */
	scalarCenterX: number;
};

export async function pick({ ghostWraps, keptIndex, scalarCenterX }: PickInput): Promise<void> {
	if (ghostWraps.length === 0 || keptIndex < 0 || keptIndex >= ghostWraps.length) return;

	const keptWrap = ghostWraps[keptIndex];
	const keptRect = keptWrap.getBoundingClientRect();
	const keptCenterX = keptRect.left + keptRect.width / 2;
	const dx = scalarCenterX - keptCenterX;

	// Phase 1: pulse the kept ghost.
	await animate(
		keptWrap,
		{ scale: [1, 1.2, 1.05] },
		{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }
	).finished;
	await delay(140);

	// Phase 2: others fade and drop while kept slides to scalar position.
	const tasks: Promise<unknown>[] = [];
	for (let i = 0; i < ghostWraps.length; i++) {
		const w = ghostWraps[i];
		if (i === keptIndex) {
			tasks.push(
				animate(
					w,
					{ x: dx, scale: 1 },
					{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		} else {
			const stagger = Math.abs(i - keptIndex) * 0.04;
			tasks.push(
				animate(
					w,
					{ opacity: [1, 0], y: [0, 32] },
					{ duration: 0.42, delay: stagger, ease: [0.4, 0, 0.6, 1] }
				).finished
			);
		}
	}
	await Promise.all(tasks);
	await delay(120);
}
