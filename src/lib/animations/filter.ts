// (P⊸/) filter: each bar gets a predicate badge ('<5', '=1', etc.),
// the badges flip left-to-right into a per-bar verdict (✓ / ✗),
// failing bars drop with their badges, and the passing bars FLIP-
// shift left to fill the gaps.
//
// Pure function: takes per-cell items split into "pass" (FLIP from
// oldRect to newRect) and "fail" (animate ghost wraps falling).

import { animate } from 'motion';

const PRE_HOLD_MS = 240;
const VERDICT_HOLD_MS = 280;
const DROP_PX = 38;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type FilterItem = {
	/** The wrap to animate. For passers this is the LIVE wrap (still
	 *  in the DOM post-commit); for failers it's the GHOST wrap (a
	 *  clone, since the live one is gone). */
	wrap: HTMLElement;
	passes: boolean;
	/** For passers: oldRect / newRect for the FLIP shift. */
	oldRect?: DOMRect;
	newRect?: DOMRect;
};

export async function filter(
	items: FilterItem[],
	predicate: string
): Promise<void> {
	if (items.length === 0) return;

	const restorePos: Array<{ el: HTMLElement; prev: string }> = [];

	// Phase 1: predicate badge over every wrap.
	const badges: HTMLElement[] = [];
	for (const it of items) {
		const wrap = it.wrap;
		restorePos.push({ el: wrap, prev: wrap.style.position });
		if (!wrap.style.position) wrap.style.position = 'relative';

		const badge = document.createElement('div');
		badge.textContent = predicate;
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
		)
	);
	await delay(PRE_HOLD_MS);

	// Phase 2: each badge pulses, flips to its verdict mark.
	await Promise.all(
		badges.map(async (b, i) => {
			const passes = items[i].passes;
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

	// Phase 3: failing wraps drop (badges go with them since they're
	// children of the wrap).
	const dropTasks: Promise<unknown>[] = [];
	for (const it of items) {
		if (it.passes) continue;
		dropTasks.push(
			animate(
				it.wrap,
				{ opacity: [1, 0.4, 0], y: [0, 0, DROP_PX] },
				{ duration: 0.6, ease: [0.4, 0, 0.6, 1] }
			).finished
		);
	}
	await Promise.all(dropTasks);

	// Phase 4: passing wraps FLIP from old positions to new
	// (re-centered in the live row).
	const flipTasks: Promise<unknown>[] = [];
	for (const it of items) {
		if (!it.passes || !it.oldRect || !it.newRect) continue;
		const dx = it.oldRect.left - it.newRect.left;
		if (Math.abs(dx) < 0.5) continue;
		flipTasks.push(
			animate(
				it.wrap,
				{ x: [dx, 0] },
				{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(flipTasks);

	// Phase 5: fade remaining (passing) badges.
	const survivingBadges: HTMLElement[] = [];
	for (let i = 0; i < items.length; i++) {
		if (items[i].passes) survivingBadges.push(badges[i]);
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

	for (const b of badges) b.remove();
	for (const { el, prev } of restorePos) el.style.position = prev;
}
