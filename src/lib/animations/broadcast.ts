// Element-wise broadcasts (+1, -2, ×3, ÷2, =3, <5, >2, 2|, +˜, ×˜,
// ⋆2, 2⋆, 3√, √): the operation glyph floats above every bar, holds
// a beat so the player reads it, then each bar animates from its old
// height to its new height while the badges fade. Reads as 'apply
// this op to every cell at once'.
//
// Dynamic vizMax may rescale all bars in lock-step, so individual
// heights can stay near-constant for ops like ÷2 — the badge carries
// the story in those cases. Numbers inside the bars update via Svelte
// re-render and don't transition.
//
// Two paths share this animation:
//   - Row input: cells is the rank-1 row; AnimatedRow renders a
//     .wrap per cell with a .bar inside, and we animate per-cell.
//   - Scalar input: cells is empty (the cell tracker only populates
//     for rank-1 simple rows). ValueViz renders one .bar directly
//     inside .cell.now .viz; we DOM-query it and animate that one.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const PRE_HOLD_MS = 180;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const BADGE_STYLE: Record<string, string> = {
	position: 'absolute',
	padding: '0.18rem 0.5rem',
	background: '#5fcc5f',
	color: '#0a0a0a',
	borderRadius: '12px',
	fontFamily: "'BQN386', ui-monospace, monospace",
	fontSize: '0.85rem',
	fontWeight: '700',
	lineHeight: '1',
	opacity: '0',
	zIndex: '5',
	pointerEvents: 'none',
	boxShadow: '0 0 12px rgba(95, 204, 95, 0.55)',
	whiteSpace: 'nowrap'
};

async function broadcastScalar(label: string, commit: () => Promise<unknown>) {
	const viz = document.querySelector('.cell.now .viz') as HTMLElement | null;
	const bar = viz?.querySelector(':scope > .bar') as HTMLElement | null;
	if (!viz || !bar) {
		await commit();
		return;
	}

	const oldH = parseFloat(bar.style.height);
	const prevPos = viz.style.position;
	viz.style.position = 'relative';

	// Anchor the badge above the bar in viz-relative coords.
	const vizRect = viz.getBoundingClientRect();
	const barRect = bar.getBoundingClientRect();
	const badgeLeft = barRect.left + barRect.width / 2 - vizRect.left;
	const badgeTop = barRect.top - vizRect.top - 30;

	const badge = document.createElement('div');
	badge.textContent = label;
	Object.assign(badge.style, BADGE_STYLE, {
		left: `${badgeLeft}px`,
		top: `${badgeTop}px`,
		transform: 'translate(-50%, 0) scale(0)'
	});
	viz.appendChild(badge);

	await animate(
		badge,
		{
			opacity: [0, 1],
			transform: [
				'translate(-50%, 0) scale(0)',
				'translate(-50%, 0) scale(1.2)',
				'translate(-50%, 0) scale(1)'
			]
		},
		{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }
	).finished;
	await delay(PRE_HOLD_MS);

	await commit();

	// Post-commit value might still be a scalar (the typical case)
	// or it might have changed shape (e.g. via a different rune).
	// Re-query and bail gracefully if the bar's gone.
	const newBar = viz.querySelector(':scope > .bar') as HTMLElement | null;
	if (!newBar || isNaN(oldH)) {
		await animate(badge, { opacity: 0 }, { duration: 0.3 }).finished;
		badge.remove();
		viz.style.position = prevPos;
		return;
	}
	const newH = parseFloat(newBar.style.height);

	// Phase 2a: badge plunges.
	const plunge = animate(
		badge,
		{
			transform: [
				'translate(-50%, 0) scale(1)',
				'translate(-50%, 32px) scale(0)'
			],
			opacity: [1, 0]
		},
		{ duration: 0.32, ease: [0.4, 0, 0.7, 1] }
	).finished;

	// Phase 2b: bar height tween. Reset to oldH first so Motion
	// has a clean from-state.
	if (!isNaN(newH) && newH !== oldH) {
		newBar.style.height = `${oldH}px`;
		void newBar.offsetHeight;
		await Promise.all([
			plunge,
			animate(
				newBar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }
			).finished
		]);
	} else {
		await plunge;
	}

	badge.remove();
	viz.style.position = prevPos;
}

export function broadcast(label: string): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		if (cells.length === 0) {
			// Scalar input — animate the single bar that ValueViz
			// renders directly inside .cell.now .viz.
			await broadcastScalar(label, commit);
			return;
		}

		const badges: HTMLElement[] = [];
		const oldHeights = new Map<number, number>();

		for (const cell of cells) {
			const wrap = getNode(cell.id);
			if (!wrap) continue;
			const bar = wrap.querySelector('.bar') as HTMLElement | null;
			if (bar && bar.style.height) {
				const h = parseFloat(bar.style.height);
				if (!isNaN(h)) oldHeights.set(cell.id, h);
			}

			wrap.style.position = 'relative';
			const badge = document.createElement('div');
			badge.textContent = label;
			Object.assign(badge.style, BADGE_STYLE, {
				top: '-30px',
				left: '50%',
				transform: 'translate(-50%, 0) scale(0)'
			});
			wrap.appendChild(badge);
			badges.push(badge);
		}

		// Phase 1: stagger the badges in.
		const ins = badges.map((b, i) =>
			animate(
				b,
				{
					opacity: [0, 1],
					transform: [
						'translate(-50%, 0) scale(0)',
						'translate(-50%, 0) scale(1.2)',
						'translate(-50%, 0) scale(1)'
					]
				},
				{ duration: 0.4, delay: i * 0.04, ease: [0.34, 1.56, 0.64, 1] }
			).finished
		);
		await Promise.all(ins);
		await new Promise((r) => setTimeout(r, PRE_HOLD_MS));

		// Commit: Svelte renders each bar with its new inline height.
		await commit();

		// Capture new heights, reset bars back to old heights so we
		// can animate from there. Single forced reflow so the old
		// state paints before phase 2a starts.
		const barSpecs: { bar: HTMLElement; oldH: number; newH: number }[] = [];
		for (const cell of cells) {
			const wrap = getNode(cell.id);
			if (!wrap) continue;
			const bar = wrap.querySelector('.bar') as HTMLElement | null;
			if (!bar) continue;
			const oldH = oldHeights.get(cell.id);
			const newH = parseFloat(bar.style.height);
			if (oldH == null || isNaN(newH)) continue;
			bar.style.height = `${oldH}px`;
			barSpecs.push({ bar, oldH, newH });
		}
		void document.body.offsetHeight;

		// Phase 2a: all badges plunge in parallel and fully complete.
		await Promise.all(
			badges.map(
				(b) =>
					animate(
						b,
						{
							transform: [
								'translate(-50%, 0) scale(1)',
								'translate(-50%, 32px) scale(0)'
							],
							opacity: [1, 0]
						},
						// Mild ease-in so the fall accelerates without
						// looking stuck at the start.
						{ duration: 0.32, ease: [0.4, 0, 0.7, 1] }
					).finished
			)
		);

		// Phase 2b: only now do the bars pump up to their new heights.
		await Promise.all(
			barSpecs.map(({ bar, oldH, newH }) =>
				animate(
					bar,
					{ height: [`${oldH}px`, `${newH}px`] },
					{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }
				).finished
			)
		);

		for (const b of badges) b.remove();
		for (const cell of cells) {
			const wrap = getNode(cell.id);
			if (wrap) wrap.style.position = '';
		}
	};
}
