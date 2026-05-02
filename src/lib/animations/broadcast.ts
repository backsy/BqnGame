// Element-wise broadcasts (+1, -2, ×3, ÷2, =3, <5, >2, 2|, +˜, ×˜):
// the operation glyph floats above every bar, holds a beat so the
// player reads it, then each bar animates from its old height to its
// new height while the badges fade. Reads as 'apply this op to every
// cell at once'.
//
// Dynamic vizMax may rescale all bars in lock-step, so individual
// heights can stay near-constant for ops like ÷2 — the badge carries
// the story in those cases. Numbers inside the bars update via Svelte
// re-render and don't transition.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const PRE_HOLD_MS = 180;

export function broadcast(label: string): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		if (cells.length === 0) {
			await commit();
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
			Object.assign(badge.style, {
				position: 'absolute',
				top: '-30px',
				left: '50%',
				transform: 'translate(-50%, 0) scale(0)',
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

		// Phase 2 (sequenced): each badge plunges into its bar first;
		// the bar's growth kicks in as the badge accelerates downward,
		// so the read is cause-and-effect (badge → bar grows).
		const merge: Promise<unknown>[] = [];
		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];
			const wrap = getNode(cell.id);
			if (!wrap) continue;
			const bar = wrap.querySelector('.bar') as HTMLElement | null;
			if (!bar) continue;
			const oldH = oldHeights.get(cell.id);
			const newH = parseFloat(bar.style.height);
			if (oldH == null || isNaN(newH)) continue;
			bar.style.height = `${oldH}px`;
			void bar.offsetHeight;

			const badge = badges[i];
			if (badge) {
				const badgeAnim = animate(
					badge,
					{
						transform: [
							'translate(-50%, 0) scale(1)',
							'translate(-50%, 32px) scale(0)'
						],
						opacity: [1, 0]
					},
					// Ease-in: slow start, fast finish — reads like falling.
					{ duration: 0.32, ease: [0.5, 0, 0.75, 0] }
				);
				merge.push(badgeAnim.finished);
			}

			const barAnim = animate(
				bar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }
			);
			merge.push(barAnim.finished);
		}
		await Promise.all(merge);

		for (const b of badges) b.remove();
		for (const cell of cells) {
			const wrap = getNode(cell.id);
			if (wrap) wrap.style.position = '';
		}
	};
}
