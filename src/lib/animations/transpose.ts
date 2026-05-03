// ⍉ transpose: a 2D grid swaps its axes — element at (r, c) moves to
// (c, r). Source and target are both ValueViz grids in different DOM
// trees (Svelte unmounts/remounts when the shape flips R×C → C×R), so
// there's no cell-id continuity. Clone the pre-grid cells as fixed-
// position viewport elements, hide both pre- and post- grids during
// the animation, then FLIP the clones to where the post-grid cells
// will land.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function readShape(grid: HTMLElement): { rows: number; cols: number } | null {
	const m = grid.style.gridTemplateColumns.match(/repeat\((\d+),/);
	if (!m) return null;
	const cols = parseInt(m[1], 10);
	const total = grid.children.length;
	if (cols < 1 || total === 0 || total % cols !== 0) return null;
	return { rows: total / cols, cols };
}

export const transpose: AnimationFn = async ({ commit }) => {
	const grid = document.querySelector(
		'.cell.now .viz .grid'
	) as HTMLElement | null;
	const shape = grid ? readShape(grid) : null;
	if (!grid || !shape) {
		await commit();
		return;
	}
	const { rows, cols } = shape;

	// Pre-grid children are flat row-major (.bar or .char, no wrapper).
	const sources = Array.from(grid.children) as HTMLElement[];
	const preRects = sources.map((el) => el.getBoundingClientRect());

	// Build absolutely-positioned viewport clones so the animation
	// survives the .viz width changing post-commit.
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

	// Hide originals so the only thing the player sees is the clones.
	grid.style.visibility = 'hidden';

	await commit();

	const newGrid = document.querySelector(
		'.cell.now .viz .grid'
	) as HTMLElement | null;
	if (!newGrid) {
		for (const c of clones) c.remove();
		return;
	}
	// Hide post-grid until the clones land on top of it.
	newGrid.style.visibility = 'hidden';

	const newSources = Array.from(newGrid.children) as HTMLElement[];
	const postRects = newSources.map((el) => el.getBoundingClientRect());

	// Pre flat index i → pre-(r, c) = (i/cols, i%cols).
	// Post grid is C × R; same element lands at post-(c, r), flat
	// index c*rows + r in row-major.
	const tasks: Promise<unknown>[] = [];
	for (let i = 0; i < clones.length; i++) {
		const r = Math.floor(i / cols);
		const c = i % cols;
		const newFlat = c * rows + r;
		const dst = postRects[newFlat];
		if (!dst) continue;
		const dx = dst.left - preRects[i].left;
		const dy = dst.top - preRects[i].top;
		// Stagger by anti-diagonal so the swap reads as 'each cell
		// crossing through the diagonal'. Cells on the diagonal (r == c)
		// don't move and fire first.
		tasks.push(
			animate(
				clones[i],
				{ x: dx, y: dy },
				{
					duration: 0.7,
					delay: Math.abs(r - c) * 0.05,
					ease: [0.34, 1.2, 0.64, 1]
				}
			).finished
		);
	}
	await Promise.all(tasks);
	await delay(140);

	newGrid.style.visibility = '';
	for (const c of clones) c.remove();
};
