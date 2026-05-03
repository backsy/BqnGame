// ⥊ deshape: a 2D grid flattens to a 1D row in row-major order. Pre-
// grid lives in ValueViz, post-row lives in AnimatedRow — different
// DOM trees, no cell-id continuity. Clone the pre-grid cells as
// fixed-position viewport elements, then FLIP each one to where the
// post-row's wrap will land.
//
// If the source isn't actually a 2D grid (e.g. ⥊ on a 1D row, which
// is identity), commit silently with no animation.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const deshape: AnimationFn = async ({ commit }) => {
	const grid = document.querySelector(
		'.cell.now .viz .grid'
	) as HTMLElement | null;
	if (!grid) {
		await commit();
		return;
	}
	const sources = Array.from(grid.children) as HTMLElement[];
	if (sources.length < 1) {
		await commit();
		return;
	}
	const preRects = sources.map((el) => el.getBoundingClientRect());

	const clones = sources.map((el, i) => {
		const c = el.cloneNode(true) as HTMLElement;
		const r = preRects[i];
		Object.assign(c.style, {
			position: 'fixed',
			left: `${r.left}px`,
			top: `${r.top}px`,
			width: `${r.width}px`,
			height: `${r.height}px`,
			margin: '0',
			zIndex: '20',
			pointerEvents: 'none'
		});
		document.body.appendChild(c);
		return c;
	});

	grid.style.visibility = 'hidden';

	await commit();

	// Post-row: AnimatedRow renders .row > .wrap > (.bar | .char).
	const newRow = document.querySelector(
		'.cell.now .viz .row'
	) as HTMLElement | null;
	const newWraps = newRow
		? Array.from(newRow.querySelectorAll<HTMLElement>(':scope > .wrap'))
		: [];
	if (!newRow || newWraps.length !== sources.length) {
		// Shape mismatch (e.g. ⥊ on something that didn't produce a
		// rank-1 list of simple cells). Bail without animating.
		for (const c of clones) c.remove();
		return;
	}

	newRow.style.visibility = 'hidden';
	const postRects = newWraps.map((w) => w.getBoundingClientRect());

	const tasks: Promise<unknown>[] = [];
	for (let i = 0; i < clones.length; i++) {
		const dst = postRects[i];
		const dx = dst.left - preRects[i].left;
		const dy = dst.top - preRects[i].top;
		tasks.push(
			animate(
				clones[i],
				{ x: dx, y: dy },
				{
					duration: 0.65,
					delay: i * 0.03,
					ease: [0.34, 1.2, 0.64, 1]
				}
			).finished
		);
	}
	await Promise.all(tasks);
	await delay(120);

	newRow.style.visibility = '';
	for (const c of clones) c.remove();
};
