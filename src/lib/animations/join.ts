// ∾ join: existing bars FLIP-shift to make room (the row's center
// stays put, so they slide outward by half the added width), and new
// bars cascade in from the appropriate side.
//
// Three forms share this animation:
//   - ∾⟜list: append at the right.
//   - list⊸∾: prepend at the left.
//   - ∾˜:     self-cat — append a copy of the row.
//
// Pre-commit existing bar rects → post-commit existing bar rects via
// FLIP (cells preserve ids; cell tracker handles append/prepend
// cases). New bars get their initial transform set synchronously
// after commit so they don't flash visible before the cascade starts.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const SLIDE_DIST = 120;

export function join(direction: 'append' | 'prepend' | 'self'): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		// Capture old positions of the bars that already exist.
		const oldRects = cells.map((c) => {
			const w = getNode(c.id);
			return w?.getBoundingClientRect() ?? null;
		});

		const newCells = await commit();

		if (newCells.length <= cells.length) return;

		const addedCount = newCells.length - cells.length;
		const isPrepend = direction === 'prepend';
		const newRange = isPrepend
			? { from: 0, to: addedCount }
			: { from: cells.length, to: newCells.length };
		const slideFromX = isPrepend ? -SLIDE_DIST : SLIDE_DIST;

		// Hide new bars synchronously so the browser doesn't paint them
		// at full opacity before we kick off the cascade.
		for (let i = newRange.from; i < newRange.to; i++) {
			const w = getNode(newCells[i].id);
			if (w) {
				w.style.opacity = '0';
				w.style.transform = `translateX(${slideFromX}px)`;
			}
		}

		const tasks: Promise<unknown>[] = [];

		// FLIP existing bars from their old positions back to current.
		for (let i = 0; i < cells.length; i++) {
			const oldRect = oldRects[i];
			if (!oldRect) continue;
			const cell = cells[i];
			const newWrap = getNode(cell.id);
			if (!newWrap) continue;
			const newRect = newWrap.getBoundingClientRect();
			const dx = oldRect.left - newRect.left;
			if (Math.abs(dx) < 0.5) continue;
			tasks.push(
				animate(
					newWrap,
					{ x: [dx, 0] },
					{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}

		// Cascade the added bars in from the appropriate side.
		let cascadeIdx = 0;
		for (let i = newRange.from; i < newRange.to; i++) {
			const w = getNode(newCells[i].id);
			if (!w) {
				cascadeIdx++;
				continue;
			}
			tasks.push(
				animate(
					w,
					{ opacity: [0, 1], x: [slideFromX, 0] },
					{ duration: 0.5, delay: cascadeIdx * 0.07, ease: [0.34, 1.2, 0.64, 1] }
				).finished
			);
			cascadeIdx++;
		}

		await Promise.all(tasks);

		// Clear the inline styles we set so subsequent state changes
		// don't carry leftover transforms.
		for (let i = newRange.from; i < newRange.to; i++) {
			const w = getNode(newCells[i].id);
			if (w) {
				w.style.opacity = '';
				w.style.transform = '';
			}
		}
	};
}
