// N↕ windows: a 1D row x of length M produces a 2D grid of overlapping
// length-N windows. Result shape is (M-N+1, N) where row i is
// x[i..i+N-1]. Window 0 is the leftmost (and ends up as the TOP grid
// row); window M-N is rightmost (BOTTOM grid row).
//
// Story: a green frame slides over the source from window 0 to
// window M-N, holding briefly at each position. Each time it lands
// on a window, a clone of those N elements lifts up and parks at
// that window's grid row. Source row fades when all windows are
// captured. Commit hands off to ValueViz.
//
// The post-commit .viz is narrower (N columns vs M) so the .viz
// itself shifts horizontally. Clones are position: fixed in viewport
// coords to insulate from that shift — they're anchored to the
// stable grid center (= source row's horizontal center).

import { animate } from 'motion';
import type { AnimationFn } from './types';

const BAR_WIDTH = 30;
const COL_GAP = 4;
const ROW_GAP = 4;
const PAD_Y = 3.2; // .bar's padding-top in px (0.2rem)

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function windows(N: number): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		const M = cells.length;
		if (M < N || N < 1) {
			await commit();
			return;
		}
		const numWindows = M - N + 1;
		const xs = cells.map((c) => c.value);

		const wraps = cells.map((c) => getNode(c.id));
		const firstWrap = wraps.find((w): w is HTMLElement => !!w);
		if (!firstWrap) {
			await commit();
			return;
		}
		const row = firstWrap.parentElement;
		const viz = row?.parentElement;
		if (!row || !viz) {
			await commit();
			return;
		}

		// Per-cell rendered height: numbers via valToH, chars fixed.
		const numericVals = xs.filter((v): v is number => typeof v === 'number');
		const visualMax = Math.max(...numericVals.map(Math.abs), 4);
		const valToH = (v: number) =>
			Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;
		const cellH = (v: unknown) =>
			typeof v === 'number' ? valToH(v) + PAD_Y : 30 + PAD_Y;

		// Per-row max height & cumulative bottoms — same formulae as
		// reshape. row i contains xs[i..i+N-1].
		const rowMaxes: number[] = [];
		for (let i = 0; i < numWindows; i++) {
			let m = 18 + PAD_Y;
			for (let j = 0; j < N; j++) {
				const h = cellH(xs[i + j]);
				if (h > m) m = h;
			}
			rowMaxes.push(m);
		}
		const rowBottoms: number[] = [];
		let acc = 0;
		for (let i = 0; i < numWindows; i++) {
			acc += rowMaxes[i];
			rowBottoms.push(acc + i * ROW_GAP);
		}
		const gridH = rowBottoms[numWindows - 1];

		// Viewport-anchored coordinates. .viz is the rendering parent
		// for both source row and the post-commit grid; both are
		// horizontally centered there. Use the source row's center as
		// the stable center the post-grid will inherit.
		const vizRect = viz.getBoundingClientRect();
		const rowRect = row.getBoundingClientRect();
		const sourceCenterX = rowRect.left + rowRect.width / 2;
		const STEP = BAR_WIDTH + COL_GAP;
		// Grid's left edge in viewport: center - half its own width.
		const gridLeftX = sourceCenterX - (N * STEP - COL_GAP) / 2;
		// .viz bottom in viewport. Grid row r's bottom (in viewport) is
		// vizBottomY - (gridH - rowBottoms[r]) (assuming .viz height ==
		// gridH, which holds when --target-h is set tight by
		// +page.svelte for 2D targets).
		const vizBottomY = vizRect.bottom;

		// Frame box highlighting the current window over the source.
		// Anchored to the first source bar's rect; we translate-x to
		// move it across windows.
		const firstRect = wraps[0]!.getBoundingClientRect();
		const FRAME_PAD = 4;
		const frameW = N * STEP - COL_GAP + FRAME_PAD * 2;
		const frameH = rowRect.height + FRAME_PAD * 2;
		const frame = document.createElement('div');
		Object.assign(frame.style, {
			position: 'fixed',
			left: `${firstRect.left - FRAME_PAD}px`,
			top: `${rowRect.top - FRAME_PAD}px`,
			width: `${frameW}px`,
			height: `${frameH}px`,
			border: '2px solid #5fcc5f',
			borderRadius: '0.4rem',
			boxShadow: '0 0 14px rgba(95, 204, 95, 0.55)',
			opacity: '0',
			zIndex: '15',
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

			// Pulse each highlighted bar so the capture reads as a beat.
			const pulseTasks: Promise<unknown>[] = [];
			for (let j = 0; j < N; j++) {
				const w = wraps[i + j];
				if (!w) continue;
				pulseTasks.push(
					animate(
						w,
						{ scale: [1, 1.12, 1] },
						{ duration: 0.28, delay: j * 0.04, ease: [0.34, 1.56, 0.64, 1] }
					).finished
				);
			}
			await Promise.all(pulseTasks);

			// Clone the N highlighted source bars (so the clones inherit
			// the bar's exact rendered look — height, padding, num text)
			// and animate from source rect to grid row i's slot.
			const rowDestBottom = vizBottomY - (gridH - rowBottoms[i]);
			for (let j = 0; j < N; j++) {
				const k = i + j;
				const w = wraps[k];
				if (!w) continue;
				const v = xs[k];
				const isNum = typeof v === 'number';
				const sourceEl = w.querySelector(
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
					zIndex: '20',
					pointerEvents: 'none'
				});
				if (isNum) {
					// Make sure the cloned bar's .num text reflects the
					// source value (cloneNode took it, but be explicit
					// for chars/edge cases).
					const num = c.querySelector('.num') as HTMLElement | null;
					if (num) num.textContent = formatNum(v as number);
				}
				document.body.appendChild(c);
				cloneBars.push(c);

				const dstX = gridLeftX + j * STEP;
				const dstTop = rowDestBottom - sRect.height;
				const dx = dstX - sRect.left;
				const dy = dstTop - sRect.top;
				animate(
					c,
					{ x: dx, y: dy },
					{
						duration: 0.5,
						delay: j * 0.04,
						ease: [0.22, 1, 0.36, 1]
					}
				);
			}
			await delay(420);
		}

		// All windows captured — fade frame and source row.
		await Promise.all([
			animate(frame, { opacity: 0 }, { duration: 0.3 }).finished,
			...wraps.map((w) =>
				w
					? animate(
							w,
							{ opacity: 0 },
							{ duration: 0.32, ease: 'easeOut' }
						).finished
					: Promise.resolve()
			)
		]);

		await commit();

		// ValueViz now renders the grid where our clones already sit;
		// remove the clones in the same tick to avoid a flash.
		for (const c of cloneBars) c.remove();
		frame.remove();
	};
}
