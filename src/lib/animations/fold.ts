// F´ fold (+´, ×´, ⌈´, ⌊´): the operator glyph appears between every
// pair of bars, then a left-to-right sweep collapses pairs into a
// running accumulator. Each step pulses the operator, slides the
// right bar into bar 0, updates bar 0's height + number to the
// partial result, and fades the operator. The final accumulator is
// what remains when commit fires (the scalar result).

import { animate } from 'motion';
import type { AnimationFn } from './types';

const OP_FN: Record<string, (a: number, b: number) => number> = {
	'+': (a, b) => a + b,
	'-': (a, b) => a - b,
	'×': (a, b) => a * b,
	'÷': (a, b) => a / b,
	'⌈': (a, b) => Math.max(a, b),
	'⌊': (a, b) => Math.min(a, b)
};

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

export function fold(operator: string): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		const op = OP_FN[operator];
		if (!op || cells.length < 2 || cells.some((c) => typeof c.value !== 'number')) {
			await commit();
			return;
		}

		const values = cells.map((c) => c.value as number);
		const finalAcc = values.slice(1).reduce((a, b) => op(a, b), values[0]);

		const wraps = cells.map((c) => getNode(c.id));
		const bars = wraps.map((w) => w?.querySelector('.bar') as HTMLElement | null);
		const nums = bars.map((b) => b?.querySelector('.num') as HTMLElement | null);

		if (!wraps[0] || !bars[0] || !nums[0]) {
			await commit();
			return;
		}

		// Derive the bars' visual scale from any existing rendered bar
		// so our intermediate heights match the row.
		const derivedMax = (() => {
			for (let i = 0; i < bars.length; i++) {
				const b = bars[i];
				const v = values[i];
				if (!b || v === 0) continue;
				const h = parseFloat(b.style.height);
				if (!isNaN(h) && h > 18) return (v * 60) / (h - 18);
			}
			return Math.max(...values.map(Math.abs), 4);
		})();
		const visualMax = Math.max(derivedMax, Math.abs(finalAcc), 4);
		const valToH = (v: number) =>
			Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

		const row = wraps[0].parentElement;
		if (!row) {
			await commit();
			return;
		}
		row.style.position = 'relative';

		// Phase 1: insert operator badges between consecutive bars.
		const rowRect = row.getBoundingClientRect();
		const opBadges: HTMLElement[] = [];
		for (let i = 0; i < wraps.length - 1; i++) {
			const wA = wraps[i];
			const wB = wraps[i + 1];
			if (!wA || !wB) continue;
			const aRect = wA.getBoundingClientRect();
			const bRect = wB.getBoundingClientRect();
			const midX = (aRect.right + bRect.left) / 2 - rowRect.left;
			const midY = aRect.top + aRect.height / 2 - rowRect.top;

			const badge = document.createElement('div');
			badge.textContent = operator;
			Object.assign(badge.style, {
				position: 'absolute',
				left: `${midX}px`,
				top: `${midY}px`,
				transform: 'translate(-50%, -50%) scale(0)',
				opacity: '0',
				width: '22px',
				height: '22px',
				display: 'grid',
				placeItems: 'center',
				background: '#5fcc5f',
				color: '#0a0a0a',
				borderRadius: '50%',
				fontFamily: "'BQN386', ui-monospace, monospace",
				fontSize: '0.95rem',
				fontWeight: '700',
				lineHeight: '1',
				zIndex: '5',
				pointerEvents: 'none',
				boxShadow: '0 0 10px rgba(95, 204, 95, 0.55)'
			});
			row.appendChild(badge);
			opBadges.push(badge);
		}

		await Promise.all(
			opBadges.map(
				(b, i) =>
					animate(
						b,
						{
							opacity: [0, 1],
							transform: [
								'translate(-50%, -50%) scale(0)',
								'translate(-50%, -50%) scale(1.2)',
								'translate(-50%, -50%) scale(1)'
							]
						},
						{ duration: 0.35, delay: i * 0.04, ease: [0.34, 1.56, 0.64, 1] }
					).finished
			)
		);
		await new Promise((r) => setTimeout(r, 280));

		// Phase 2: sweep left to right.
		let acc = values[0];
		for (let i = 1; i < cells.length; i++) {
			const rightWrap = wraps[i];
			const rightBadge = opBadges[i - 1];
			if (!rightWrap) continue;

			const newAcc = op(acc, values[i]);
			const oldH = valToH(acc);
			const newH = valToH(newAcc);

			// Pin bar 0's height to the current acc before animating.
			bars[0]!.style.height = `${oldH}px`;
			void bars[0]!.offsetHeight;

			// Pulse the operator about to fire.
			if (rightBadge) {
				animate(
					rightBadge,
					{
						transform: [
							'translate(-50%, -50%) scale(1)',
							'translate(-50%, -50%) scale(1.4)',
							'translate(-50%, -50%) scale(1)'
						]
					},
					{ duration: 0.25 }
				);
			}

			// Compute the slide distance so right wrap lands on bar 0.
			const accRect = wraps[0]!.getBoundingClientRect();
			const rightRect = rightWrap.getBoundingClientRect();
			const dx =
				accRect.left + accRect.width / 2 - rightRect.left - rightRect.width / 2;

			const slide = animate(
				rightWrap,
				{ x: dx, opacity: [1, 0], scale: [1, 0.5] },
				{ duration: 0.42, ease: [0.5, 0, 0.7, 1] }
			).finished;

			// Snap the accumulator number partway through the slide.
			setTimeout(() => {
				if (nums[0]) nums[0].textContent = formatNum(newAcc);
			}, 240);

			const grow = animate(
				bars[0]!,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: 0.4, delay: 0.18, ease: [0.22, 1, 0.36, 1] }
			).finished;

			if (rightBadge) {
				animate(
					rightBadge,
					{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
					{ duration: 0.25, delay: 0.22 }
				);
			}

			await Promise.all([slide, grow]);
			acc = newAcc;

			await new Promise((r) => setTimeout(r, 90));
		}

		await new Promise((r) => setTimeout(r, 220));
		await commit();

		// Cleanup: remove operator badges (row may have unmounted).
		for (const b of opBadges) b.remove();
	};
}
