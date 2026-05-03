// ≠ length: a counting badge ticks 1..N over the row, pulsing each
// bar in turn, then all bars fade and drop. Commit replaces the row
// with the scalar bar, which fades in at its rendered center
// position. Reads as 'I'm counting these — there are N.'

import { animate } from 'motion';
import type { AnimationFn } from './types';

const STEP_MS = 130;
const HOLD_MS = 220;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const length: AnimationFn = async ({ cells, getNode, commit }) => {
	if (cells.length === 0) {
		await commit();
		return;
	}

	const wraps = cells.map((c) => getNode(c.id));
	const firstWrap = wraps.find((w): w is HTMLElement => !!w);
	if (!firstWrap || !firstWrap.parentElement) {
		await commit();
		return;
	}

	const rowRect = firstWrap.parentElement.getBoundingClientRect();

	const counter = document.createElement('div');
	counter.textContent = '0';
	Object.assign(counter.style, {
		position: 'fixed',
		top: `${rowRect.top - 42}px`,
		left: `${rowRect.left + rowRect.width / 2 - 18}px`,
		width: '36px',
		height: '36px',
		display: 'grid',
		placeItems: 'center',
		background: '#5fcc5f',
		color: '#0a0a0a',
		borderRadius: '50%',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: '1rem',
		fontWeight: '700',
		opacity: '0',
		transform: 'scale(0)',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: '0 0 16px rgba(95, 204, 95, 0.6)'
	});
	document.body.appendChild(counter);

	await animate(
		counter,
		{ opacity: [0, 1], transform: ['scale(0)', 'scale(1)'] },
		{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }
	).finished;

	// Tick counter and pulse each bar in turn.
	for (let i = 0; i < cells.length; i++) {
		counter.textContent = String(i + 1);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.3)', 'scale(1)'] },
			{ duration: 0.28 }
		);

		const w = wraps[i];
		if (w) {
			animate(
				w,
				{ scale: [1, 1.15, 1] },
				{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }
			);
		}

		if (i < cells.length - 1) await delay(STEP_MS);
	}
	await delay(HOLD_MS);

	// All bars fade and drop in unison-with-stagger.
	const fadeTasks: Promise<unknown>[] = [];
	for (let i = 0; i < wraps.length; i++) {
		const w = wraps[i];
		if (!w) continue;
		fadeTasks.push(
			animate(
				w,
				{ opacity: [1, 0], y: [0, 30] },
				{ duration: 0.4, delay: i * 0.04, ease: [0.4, 0, 0.6, 1] }
			).finished
		);
	}
	await Promise.all(fadeTasks);

	// Commit hands off to ValueViz which will render the scalar bar at
	// the .viz center. Pin it invisible synchronously so it doesn't
	// flash before the fade-in.
	await commit();

	const scalarBar = document.querySelector(
		'.cell.now .viz .bar'
	) as HTMLElement | null;
	if (scalarBar) {
		scalarBar.style.opacity = '0';
		void scalarBar.offsetHeight;
		await animate(
			scalarBar,
			{ opacity: [0, 1] },
			{ duration: 0.32, ease: 'easeOut' }
		).finished;
		// Clear so subsequent state changes don't carry over.
		scalarBar.style.opacity = '';
	}

	await delay(150);
	await animate(
		counter,
		{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
		{ duration: 0.3, ease: 'easeIn' }
	).finished;
	counter.remove();
};
