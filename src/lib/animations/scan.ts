// F` scan (+`, ×`, ⌈`, ⌊`): like fold, but each bar stays put and
// updates to its partial-result value instead of being absorbed into
// the accumulator. The row spreads apart, operator badges drop in
// between every pair, then a left-to-right sweep pulses each
// operator and animates the corresponding bar from its old value to
// its running accumulator. Bars un-spread at the end before commit.

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

const BAR_WIDTH = 30;
const ORIG_GAP = 4;
const SPREAD_GAP = 28;
const BADGE_SIZE = 22;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function scan(operator: string): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		const op = OP_FN[operator];
		if (
			!op ||
			cells.length < 2 ||
			cells.some((c) => typeof c.value !== 'number')
		) {
			await commit();
			return;
		}

		const values = cells.map((c) => c.value as number);

		const acc: number[] = [values[0]];
		for (let i = 1; i < values.length; i++) {
			acc.push(op(acc[i - 1], values[i]));
		}

		const wraps = cells.map((c) => getNode(c.id));
		const bars = wraps.map(
			(w) => w?.querySelector('.bar') as HTMLElement | null
		);
		const nums = bars.map(
			(b) => b?.querySelector('.num') as HTMLElement | null
		);

		const firstWrap = wraps[0];
		const firstBar = bars[0];
		if (!firstWrap || !firstBar) {
			await commit();
			return;
		}

		// Derive the existing visual scale from any rendered bar so
		// intermediate heights match the row, then widen for the largest
		// accumulator value the scan will hit.
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
		const visualMax = Math.max(derivedMax, ...acc.map(Math.abs), 4);
		const valToH = (v: number) =>
			Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

		const row = firstWrap.parentElement;
		if (!row) {
			await commit();
			return;
		}
		row.style.position = 'relative';

		// Pin every bar to its current value's derived height so the
		// later sweep animations interpolate from a known starting point.
		for (let i = 0; i < bars.length; i++) {
			const b = bars[i];
			if (b) b.style.height = `${valToH(values[i])}px`;
		}
		void firstBar.offsetHeight;

		// Phase 1a: spread the bars apart to make room for the badges.
		const wrapDelta = wraps.map((_, i) => i * SPREAD_GAP);
		await Promise.all(
			wraps.map((w, i) =>
				w
					? animate(
							w,
							{ x: wrapDelta[i] },
							{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }
						).finished
					: Promise.resolve()
			)
		);

		// Phase 1b: drop in operator badges between consecutive bars.
		const rowRect = row.getBoundingClientRect();
		const opBadges: (HTMLElement | null)[] = [];
		for (let i = 0; i < wraps.length - 1; i++) {
			const wA = wraps[i];
			if (!wA) {
				opBadges.push(null);
				continue;
			}
			const aRect = wA.getBoundingClientRect();
			const midX = aRect.right + (ORIG_GAP + SPREAD_GAP) / 2 - rowRect.left;
			const midY = aRect.top + aRect.height / 2 - rowRect.top;

			const badge = document.createElement('div');
			badge.textContent = operator;
			Object.assign(badge.style, {
				position: 'absolute',
				left: `${midX - BADGE_SIZE / 2}px`,
				top: `${midY - BADGE_SIZE / 2}px`,
				transform: 'scale(0)',
				opacity: '0',
				width: `${BADGE_SIZE}px`,
				height: `${BADGE_SIZE}px`,
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
			opBadges.map((b, i) =>
				b
					? animate(
							b,
							{ opacity: [0, 1], scale: [0, 1.2, 1] },
							{ duration: 0.35, delay: i * 0.04, ease: [0.34, 1.56, 0.64, 1] }
						).finished
					: Promise.resolve()
			)
		);
		await delay(280);

		// Phase 2: sweep left-to-right. Each step pulses the operator
		// between bar[i-1] and bar[i], then bar[i] grows / shrinks to its
		// running accumulator value.
		for (let i = 1; i < cells.length; i++) {
			const opBadge = opBadges[i - 1];
			const bar = bars[i];
			const num = nums[i];
			if (!bar) {
				await delay(80);
				continue;
			}

			const oldH = valToH(values[i]);
			const newH = valToH(acc[i]);
			const tasks: Promise<unknown>[] = [];

			if (opBadge) {
				tasks.push(
					animate(
						opBadge,
						{ scale: [1, 1.4, 0.6], opacity: [1, 1, 0] },
						{ duration: 0.5, ease: [0.5, 0, 0.7, 1] }
					).finished
				);
			}

			setTimeout(() => {
				if (num) num.textContent = formatNum(acc[i]);
			}, 220);
			tasks.push(
				animate(
					bar,
					{ height: [`${oldH}px`, `${newH}px`] },
					{ duration: 0.42, delay: 0.16, ease: [0.22, 1, 0.36, 1] }
				).finished
			);

			await Promise.all(tasks);
			await delay(70);
		}

		await delay(180);

		// Phase 3: bars slide back together before commit.
		await Promise.all(
			wraps.map((w) =>
				w
					? animate(
							w,
							{ x: 0 },
							{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }
						).finished
					: Promise.resolve()
			)
		);

		await commit();

		for (const b of opBadges) {
			if (b) b.remove();
		}
	};
}
