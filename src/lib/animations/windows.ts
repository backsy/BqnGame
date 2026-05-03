// N↕ windows: a 1D row x of length M produces a 2D grid of overlapping
// length-N windows. A green frame slides over the source from window 0
// to window M-N, holding briefly at each. Each landing drops N source-
// bar clones into the corresponding grid row.
//
// Pure function: takes the ghost source wraps + source values + N,
// plus the live grid container so we can read target positions.

import { animate } from 'motion';

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type WindowsInput = {
	ghostWraps: HTMLElement[];
	xs: (number | string)[];
	N: number;
	liveGrid: HTMLElement;
};

const BAR_WIDTH = 30;
const COL_GAP = 4;

export async function windows({
	ghostWraps,
	xs,
	N,
	liveGrid
}: WindowsInput): Promise<void> {
	const M = ghostWraps.length;
	if (M < N || N < 1) return;
	const numWindows = M - N + 1;

	// Read target rects from the live grid; reveal viz briefly to
	// measure since it's hidden behind ghost.
	const liveCells = Array.from(liveGrid.children) as HTMLElement[];
	if (liveCells.length !== numWindows * N) return;
	const liveViz = liveGrid.parentElement as HTMLElement | null;
	const restoreVisibility = liveViz?.style.visibility;
	if (liveViz) liveViz.style.visibility = '';
	const targetRects = liveCells.map((el) => el.getBoundingClientRect());
	if (liveViz) liveViz.style.visibility = restoreVisibility ?? '';

	const STEP = BAR_WIDTH + COL_GAP;

	// Frame above the source row.
	const firstGhostRect = ghostWraps[0].getBoundingClientRect();
	const ghostRowEl = ghostWraps[0].parentElement;
	if (!ghostRowEl) return;
	const ghostRowRect = ghostRowEl.getBoundingClientRect();

	const FRAME_PAD = 4;
	const frameW = N * STEP - COL_GAP + FRAME_PAD * 2;
	const frameH = ghostRowRect.height + FRAME_PAD * 2;
	const frame = document.createElement('div');
	Object.assign(frame.style, {
		position: 'fixed',
		left: `${firstGhostRect.left - FRAME_PAD}px`,
		top: `${ghostRowRect.top - FRAME_PAD}px`,
		width: `${frameW}px`,
		height: `${frameH}px`,
		border: '2px solid #5fcc5f',
		borderRadius: '0.4rem',
		boxShadow: '0 0 14px rgba(95, 204, 95, 0.55)',
		opacity: '0',
		zIndex: '21',
		pointerEvents: 'none',
		boxSizing: 'border-box'
	});
	document.body.appendChild(frame);

	await animate(
		frame,
		{ opacity: [0, 1], scale: [0.85, 1] },
		{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }
	).finished;
	await delay(140);

	const cloneBars: HTMLElement[] = [];

	for (let i = 0; i < numWindows; i++) {
		// Slide frame to window i.
		if (i > 0) {
			await animate(
				frame,
				{ x: i * STEP },
				{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }
			).finished;
			await delay(110);
		}

		// Pulse the highlighted ghost bars.
		await Promise.all(
			Array.from({ length: N }, (_, j) =>
				animate(
					ghostWraps[i + j],
					{ scale: [1, 1.12, 1] },
					{ duration: 0.28, delay: j * 0.04, ease: [0.34, 1.56, 0.64, 1] }
				).finished
			)
		);

		// Clone each highlighted ghost bar and fly to its grid (i, j) target.
		for (let j = 0; j < N; j++) {
			const k = i + j;
			const v = xs[k];
			const isNum = typeof v === 'number';
			const sourceEl = ghostWraps[k].querySelector(
				isNum ? '.bar' : '.char'
			) as HTMLElement | null;
			if (!sourceEl) continue;
			const sRect = sourceEl.getBoundingClientRect();

			const c = sourceEl.cloneNode(true) as HTMLElement;
			Object.assign(c.style, {
				position: 'fixed',
				left: `${sRect.left}px`,
				top: `${sRect.top}px`,
				width: `${sRect.width}px`,
				height: `${sRect.height}px`,
				margin: '0',
				zIndex: '22',
				pointerEvents: 'none'
			});
			if (isNum) {
				const num = c.querySelector('.num') as HTMLElement | null;
				if (num) num.textContent = formatNum(v as number);
			}
			document.body.appendChild(c);
			cloneBars.push(c);

			const target = targetRects[i * N + j];
			const dx = target.left - sRect.left;
			const dy = target.top - sRect.top;
			animate(
				c,
				{ x: dx, y: dy },
				{ duration: 0.5, delay: j * 0.04, ease: [0.22, 1, 0.36, 1] }
			);
		}
		await delay(420);
	}

	// All windows captured. Fade frame and source ghost row.
	await Promise.all([
		animate(frame, { opacity: 0 }, { duration: 0.3 }).finished,
		...ghostWraps.map((w) =>
			animate(w, { opacity: 0 }, { duration: 0.32, ease: 'easeOut' }).finished
		)
	]);

	for (const c of cloneBars) c.remove();
	frame.remove();
}
