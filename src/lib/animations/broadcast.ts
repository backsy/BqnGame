// Element-wise broadcasts (+1, -2, ×3, ÷2, =3, <5, >2, 2|, +˜, ×˜,
// ⋆2, 2⋆, 3√, √): the operation glyph floats above every bar, holds
// a beat so the player reads it, then each bar animates from its old
// height to its new height while the badges fade. Reads as 'apply
// this op to every cell at once'.
//
// Pure function. Takes an explicit list of bars to animate and the
// label to show. The controller decides whether this is the row case
// (one badge per cell, anchored to its wrap) or the scalar case (one
// bar in .viz, anchor on the viz itself).

import { animate } from 'motion';

const PRE_HOLD_MS = 180;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PILL_STYLE: Record<string, string> = {
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

export type BroadcastItem = {
	/** Where the badge will be appended (wrap for row, viz for scalar). */
	anchor: HTMLElement;
	/** The bar whose height we'll tween. */
	bar: HTMLElement;
	oldH: number;
	newH: number;
	/** Optional pixel offset for the badge's left from anchor's left.
	 *  Used for scalar where the badge centers over the bar inside .viz. */
	badgeLeftPx?: number;
	/** Optional pixel offset for the badge's top from anchor's top. */
	badgeTopPx?: number;
};

export async function broadcast(
	items: BroadcastItem[],
	label: string
): Promise<void> {
	if (items.length === 0) return;

	const badges: HTMLElement[] = [];
	const restoreAnchorPos: Array<{ el: HTMLElement; prev: string }> = [];

	for (const item of items) {
		const anchor = item.anchor;
		restoreAnchorPos.push({ el: anchor, prev: anchor.style.position });
		if (!anchor.style.position) anchor.style.position = 'relative';

		const badge = document.createElement('div');
		badge.textContent = label;
		Object.assign(badge.style, PILL_STYLE);
		if (item.badgeLeftPx != null && item.badgeTopPx != null) {
			badge.style.left = `${item.badgeLeftPx}px`;
			badge.style.top = `${item.badgeTopPx}px`;
			badge.style.transform = 'translate(-50%, 0) scale(0)';
		} else {
			badge.style.top = '-30px';
			badge.style.left = '50%';
			badge.style.transform = 'translate(-50%, 0) scale(0)';
		}
		anchor.appendChild(badge);
		badges.push(badge);

		// Reset bar to its OLD height so the tween has a start state.
		// Svelte already set it to newH on commit; we override.
		item.bar.style.height = `${item.oldH}px`;
	}
	void document.body.offsetHeight;

	// Phase 1: stagger the badges in.
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

	// Phase 2a: badges plunge.
	const plunge = Promise.all(
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
					{ duration: 0.32, ease: [0.4, 0, 0.7, 1] }
				).finished
		)
	);
	await plunge;

	// Phase 2b: bars pump up to their new heights.
	await Promise.all(
		items.map(({ bar, oldH, newH }) =>
			animate(
				bar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }
			).finished
		)
	);

	// Cleanup.
	for (const b of badges) b.remove();
	for (const { el, prev } of restoreAnchorPos) el.style.position = prev;
}
