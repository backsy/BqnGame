// ≠ length: a counting badge ticks 1..N over each ghost bar,
// pulsing each in turn, then all bars fade and drop. The post-commit
// scalar then fades in at the .viz center.
//
// Pure function: takes the ghost wraps + the live scalar bar (so we
// can fade it in at the end).

import { animate } from 'motion';

const STEP_MS = 130;
const HOLD_MS = 220;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type LengthInput = {
	/** Ghost wraps for every pre-commit cell (clones, in body). */
	ghostWraps: HTMLElement[];
	/** Live scalar bar that will appear at the end. May be null if
	 *  the post-commit value is missing. */
	liveScalarBar: HTMLElement | null;
};

export async function length({ ghostWraps, liveScalarBar }: LengthInput): Promise<void> {
	if (ghostWraps.length === 0) return;

	const firstWrap = ghostWraps[0];
	const parent = firstWrap.parentElement;
	if (!parent) return;
	const rowRect = parent.getBoundingClientRect();

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

	for (let i = 0; i < ghostWraps.length; i++) {
		counter.textContent = String(i + 1);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.3)', 'scale(1)'] },
			{ duration: 0.28 }
		);
		animate(
			ghostWraps[i],
			{ scale: [1, 1.15, 1] },
			{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }
		);
		if (i < ghostWraps.length - 1) await delay(STEP_MS);
	}
	await delay(HOLD_MS);

	// Bars fade and drop.
	await Promise.all(
		ghostWraps.map((w, i) =>
			animate(
				w,
				{ opacity: [1, 0], y: [0, 30] },
				{ duration: 0.4, delay: i * 0.04, ease: [0.4, 0, 0.6, 1] }
			).finished
		)
	);

	// Fade in the live scalar bar.
	if (liveScalarBar) {
		liveScalarBar.style.opacity = '0';
		void liveScalarBar.offsetHeight;
		await animate(
			liveScalarBar,
			{ opacity: [0, 1] },
			{ duration: 0.32, ease: 'easeOut' }
		).finished;
		liveScalarBar.style.opacity = '';
	}

	await delay(150);
	await animate(
		counter,
		{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
		{ duration: 0.3, ease: 'easeIn' }
	).finished;
	counter.remove();
}
