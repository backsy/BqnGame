// ⊑ first / N⊸⊑ pick: highlight one bar, drop the others, slide the
// kept bar to where the post-commit scalar will render (the .viz
// center). Same animation for both — first is just pick(0).
//
// Pre-commit positions read from getBoundingClientRect; post-commit
// target is the parent .viz's center, where ValueViz will render the
// scalar bar (centered via .viz's flex align/justify center). Pixel-
// clean handoff per the animations invariant in types.ts.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function pick(index: number): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		if (cells.length === 0 || index < 0 || index >= cells.length) {
			await commit();
			return;
		}

		const wraps = cells.map((c) => getNode(c.id));
		const keptWrap = wraps[index];
		if (!keptWrap) {
			await commit();
			return;
		}

		// .wrap → .row → .viz
		const viz = keptWrap.parentElement?.parentElement;
		if (!viz) {
			await commit();
			return;
		}
		const vizRect = viz.getBoundingClientRect();
		const vizCenterX = vizRect.left + vizRect.width / 2;
		const keptRect = keptWrap.getBoundingClientRect();
		const keptCenterX = keptRect.left + keptRect.width / 2;
		const dx = vizCenterX - keptCenterX;

		// Phase 1: pulse the chosen bar so the player sees which one
		// survives.
		await animate(
			keptWrap,
			{ scale: [1, 1.2, 1.05] },
			{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }
		).finished;
		await delay(140);

		// Phase 2: the others fade and drop while the kept bar slides
		// to the .viz center (where the post-commit scalar lives).
		const tasks: Promise<unknown>[] = [];
		for (let i = 0; i < wraps.length; i++) {
			const w = wraps[i];
			if (!w) continue;
			if (i === index) {
				tasks.push(
					animate(
						w,
						{ x: dx, scale: 1 },
						{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }
					).finished
				);
			} else {
				const stagger = Math.abs(i - index) * 0.04;
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
		await commit();
	};
}
