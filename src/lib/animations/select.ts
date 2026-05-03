// Shared "count off the first N cells" intro used by ↑ (take) and ↓
// (drop). Lifts each selected wrap ~10px and pops a numbered badge
// above it, staggered so the count reads as a sequence, not a flash.
//
// Pure function: takes the wraps directly. Caller decides what they
// represent.

import { animate } from 'motion';

export const SELECT_LIFT_PX = 10;

export type Selection = {
	selected: { node: HTMLElement; badge: HTMLElement }[];
	introFinished: Promise<void>;
};

export function selectFirst(wraps: HTMLElement[], n: number): Selection {
	const selected: Selection['selected'] = [];
	const tasks: Promise<unknown>[] = [];

	const count = Math.min(n, wraps.length);
	for (let i = 0; i < count; i++) {
		const node = wraps[i];

		const lift = animate(
			node,
			{ y: -SELECT_LIFT_PX },
			{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }
		);
		tasks.push(lift.finished);

		if (!node.style.position) node.style.position = 'relative';
		const badge = createBadge(i + 1);
		node.appendChild(badge);

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
		tasks.push(badgeAnim.finished);

		selected.push({ node, badge });
	}

	return {
		selected,
		introFinished: Promise.all(tasks).then(() => undefined)
	};
}

export async function fadeBadges(badges: HTMLElement[]): Promise<void> {
	await Promise.all(
		badges.map(
			(b) =>
				animate(
					b,
					{ opacity: 0, transform: 'translate(-50%, -8px) scale(0.9)' },
					{ duration: 0.28, ease: 'easeIn' }
				).finished
		)
	);
	for (const b of badges) b.remove();
}

export function clearWrapStyles(nodes: HTMLElement[]): void {
	for (const node of nodes) node.style.position = '';
}

function createBadge(num: number): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = String(num);
	badge.className = 'select-badge';
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
	return badge;
}
