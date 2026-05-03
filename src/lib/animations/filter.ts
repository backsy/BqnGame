// (P⊸/) filter: each bar gets a predicate badge ('<5', '=1', etc.),
// the badges flip left-to-right into a per-bar verdict (green ✓ for
// pass, red ✗ for fail), failing bars drop with their badges, and
// the passing bars FLIP-shift left to fill the gaps.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const PRED_FN: Record<string, (a: number, n: number) => boolean> = {
	'<': (a, n) => a < n,
	'>': (a, n) => a > n,
	'=': (a, n) => a === n
};

const PRE_HOLD_MS = 240;
const VERDICT_HOLD_MS = 280;
const DROP_PX = 38;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function filter(operator: string, n: number): AnimationFn {
	return async ({ cells, oldRects, getNode, commit }) => {
		const pred = PRED_FN[operator];
		if (
			!pred ||
			cells.length === 0 ||
			cells.some((c) => typeof c.value !== 'number')
		) {
			await commit();
			return;
		}

		const verdicts = cells.map((c) => pred(c.value as number, n));
		const passing = cells.filter((_, i) => verdicts[i]);

		// Phase 1: predicate badge over every bar.
		const badges: (HTMLElement | null)[] = [];
		for (const cell of cells) {
			const wrap = getNode(cell.id);
			if (!wrap) {
				badges.push(null);
				continue;
			}
			wrap.style.position = 'relative';

			const badge = document.createElement('div');
			badge.textContent = `${operator}${n}`;
			Object.assign(badge.style, {
				position: 'absolute',
				top: '-30px',
				left: '50%',
				transform: 'translate(-50%, 0) scale(0)',
				opacity: '0',
				padding: '0.18rem 0.5rem',
				background: '#5fcc5f',
				color: '#0a0a0a',
				borderRadius: '12px',
				fontFamily: "'BQN386', ui-monospace, monospace",
				fontSize: '0.85rem',
				fontWeight: '700',
				lineHeight: '1',
				zIndex: '5',
				pointerEvents: 'none',
				boxShadow: '0 0 10px rgba(95, 204, 95, 0.55)',
				whiteSpace: 'nowrap'
			});
			wrap.appendChild(badge);
			badges.push(badge);
		}

		await Promise.all(
			badges.map((b, i) =>
				b
					? animate(
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
					: Promise.resolve()
			)
		);
		await delay(PRE_HOLD_MS);

		// Phase 2: each badge pulses, then flips to its verdict mark.
		// Stagger reads as a left-to-right scan of judgments.
		await Promise.all(
			badges.map(async (b, i) => {
				if (!b) return;
				const passes = verdicts[i];
				await animate(
					b,
					{ scale: [1, 1.35, 1] },
					{ duration: 0.3, delay: i * 0.06, ease: [0.34, 1.56, 0.64, 1] }
				).finished;
				b.textContent = passes ? '✓' : '✗';
				if (!passes) {
					b.style.background = '#e25555';
					b.style.boxShadow = '0 0 12px rgba(226, 85, 85, 0.55)';
				}
			})
		);
		await delay(VERDICT_HOLD_MS);

		// Phase 3: failing bars dim, drop, and fade — badges go with
		// them since they're DOM children of the wrap that's about to
		// unmount.
		const dropTasks: Promise<unknown>[] = [];
		for (let i = 0; i < cells.length; i++) {
			if (verdicts[i]) continue;
			const wrap = getNode(cells[i].id);
			if (!wrap) continue;
			dropTasks.push(
				animate(
					wrap,
					{ opacity: [1, 0.4, 0], y: [0, 0, DROP_PX] },
					{ duration: 0.6, ease: [0.4, 0, 0.6, 1] }
				).finished
			);
		}
		await Promise.all(dropTasks);

		// Commit: failing cells unmount, passing stay (cell tracker
		// preserves their ids).
		await commit();

		// Phase 4: passing bars FLIP from old positions to new
		// (re-centered) positions.
		const flipTasks: Promise<unknown>[] = [];
		for (const cell of passing) {
			const wrap = getNode(cell.id);
			const oldRect = oldRects.get(cell.id);
			if (!wrap || !oldRect) continue;
			const newRect = wrap.getBoundingClientRect();
			const dx = oldRect.left - newRect.left;
			if (Math.abs(dx) < 0.5) continue;
			flipTasks.push(
				animate(
					wrap,
					{ x: [dx, 0] },
					{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}
		await Promise.all(flipTasks);

		// Phase 5: fade remaining (passing) badges.
		const survivingBadges: HTMLElement[] = [];
		for (let i = 0; i < cells.length; i++) {
			if (!verdicts[i]) continue;
			const b = badges[i];
			if (b) survivingBadges.push(b);
		}
		await Promise.all(
			survivingBadges.map(
				(b) =>
					animate(
						b,
						{
							opacity: 0,
							transform: 'translate(-50%, -8px) scale(0.9)'
						},
						{ duration: 0.28, ease: 'easeIn' }
					).finished
			)
		);

		for (const b of badges) {
			if (b) b.remove();
		}
		for (const cell of passing) {
			const wrap = getNode(cell.id);
			if (wrap) wrap.style.position = '';
		}
	};
}
