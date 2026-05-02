// N↑ take: count off the first N cells with a number badge ("1", "2", …)
// and a small upward lift that reads as "selected"; the rest dim, slide
// down, and fade out. Only after they're gone does the state commit;
// the kept cells then settle from their old positions to the re-centered
// row, and the badges fade away.
//
// We need the OLD DOM mounted during the drop phase, so this animation
// runs everything pre-commit and only calls ctx.commit() once the
// dropped cells are off-screen.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const LIFT_PX = 10;
const DROP_PX = 38;

export function take(n: number): AnimationFn {
	return async ({ cells, oldRects, getNode, commit }) => {
		const kept = cells.slice(0, n);
		const dropped = cells.slice(n);

		const badges: HTMLElement[] = [];

		// Phase 1 (parallel): kept cells lift, badges scale in with stagger.
		const phase1: Promise<unknown>[] = [];
		kept.forEach((cell, i) => {
			const node = getNode(cell.id);
			if (!node) return;

			const lift = animate(
				node,
				{ y: -LIFT_PX },
				{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }
			);
			phase1.push(lift.finished);

			node.style.position = 'relative';
			const badge = document.createElement('div');
			badge.textContent = String(i + 1);
			badge.className = 'take-badge';
			Object.assign(badge.style, {
				position: 'absolute',
				top: '-26px',
				left: '50%',
				transform: 'translate(-50%, 0) scale(0)',
				width: '22px',
				height: '22px',
				display: 'grid',
				placeItems: 'center',
				background: '#5fcc5f',
				color: '#0a0a0a',
				borderRadius: '50%',
				fontFamily: 'system-ui, -apple-system, sans-serif',
				fontSize: '0.85rem',
				fontWeight: '700',
				opacity: '0',
				zIndex: '5',
				pointerEvents: 'none',
				boxShadow: '0 0 12px rgba(95, 204, 95, 0.55)'
			});
			node.appendChild(badge);
			badges.push(badge);

			const badgeAnim = animate(
				badge,
				{
					transform: [
						'translate(-50%, 0) scale(0)',
						'translate(-50%, 0) scale(1.2)',
						'translate(-50%, 0) scale(1)'
					],
					opacity: [0, 1, 1]
				},
				{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1], delay: 0.12 + i * 0.06 }
			);
			phase1.push(badgeAnim.finished);
		});

		// Phase 2 (overlapping): dropped cells dim, then slide down and fade.
		const phase2: Promise<unknown>[] = [];
		dropped.forEach((cell, i) => {
			const node = getNode(cell.id);
			if (!node) return;
			const dimDrop = animate(
				node,
				{ opacity: [1, 0.35, 0], y: [0, 0, DROP_PX] },
				{ duration: 0.7, ease: [0.4, 0, 0.6, 1], delay: 0.18 + i * 0.04 }
			);
			phase2.push(dimDrop.finished);
		});

		await Promise.all([...phase1, ...phase2]);

		// Commit: dropped cells unmount, kept cells stay in place (their ids
		// are preserved by the cell tracker effect's take case).
		await commit();

		// Phase 4 (FLIP): kept cells settle from old positions (with the
		// lift) to new re-centered positions (no lift).
		const phase4: Promise<unknown>[] = [];
		for (const cell of kept) {
			const node = getNode(cell.id);
			const oldRect = oldRects.get(cell.id);
			if (!node || !oldRect) continue;
			const newRect = node.getBoundingClientRect();
			const dx = oldRect.left - newRect.left;
			const settle = animate(
				node,
				{ x: [dx, 0], y: [-LIFT_PX, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			);
			phase4.push(settle.finished);
		}
		await Promise.all(phase4);

		// Phase 5: badges fade and lift away, then we tear them down.
		const phase5 = badges.map(
			(b) =>
				animate(
					b,
					{ opacity: 0, transform: 'translate(-50%, -8px) scale(0.9)' },
					{ duration: 0.28, ease: 'easeIn' }
				).finished
		);
		await Promise.all(phase5);

		for (const b of badges) b.remove();
		for (const cell of kept) {
			const node = getNode(cell.id);
			if (node) node.style.position = '';
		}
	};
}
