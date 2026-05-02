// ↕ range: a single counting badge floats above the row and ticks
// 1, 2, …, N as bars cascade in left-to-right. Reads as "I'm making
// N indices, watch me count them out". After the last bar lands the
// counter holds a beat then fades.
//
// Works for monadic ↕ on a scalar (the common case in the levels).
// If the result isn't a simple row (e.g. ↕ of a list, which produces
// a multi-rank index array), the cell tracker leaves cells empty and
// the animation just commits silently.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const STEP_MS = 130;
const HOLD_MS = 280;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const range: AnimationFn = async ({ getNode, commit }) => {
	const newCells = await commit();
	if (newCells.length === 0) return;

	// Hide each new wrap synchronously so the browser doesn't paint
	// them at full size before the cascade starts.
	const wraps = newCells.map((c) => getNode(c.id));
	for (const node of wraps) {
		if (!node) continue;
		node.style.opacity = '0';
		node.style.transform = 'translateY(-10px) scale(0.4)';
	}

	const firstNode = wraps.find((n): n is HTMLElement => n != null);
	if (!firstNode || !firstNode.parentElement) return;
	const rowRect = firstNode.parentElement.getBoundingClientRect();

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

	for (let i = 0; i < newCells.length; i++) {
		counter.textContent = String(i + 1);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.3)', 'scale(1)'] },
			{ duration: 0.28 }
		);

		const node = wraps[i];
		if (node) {
			animate(
				node,
				{
					opacity: [0, 1],
					transform: [
						'translateY(-10px) scale(0.4)',
						'translateY(0) scale(1.15)',
						'translateY(0) scale(1)'
					]
				},
				{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }
			);
		}

		if (i < newCells.length - 1) await delay(STEP_MS);
	}

	await delay(HOLD_MS);
	await animate(
		counter,
		{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
		{ duration: 0.3, ease: 'easeIn' }
	).finished;
	counter.remove();

	for (const node of wraps) {
		if (!node) continue;
		node.style.opacity = '';
		node.style.transform = '';
	}
};
