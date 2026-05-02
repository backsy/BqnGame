// F´ fold (+´, ×´, ⌈´, ⌊´): the row spreads to make room for operator
// glyphs between every pair, the player reads '1 + 2 + 3 + 4', then a
// left-to-right wave collapses the leftmost trio (bar, op, bar) into
// one bar carrying the partial result, and everything to the right
// slides left by one column. Repeat until only the accumulator
// remains.

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

// Layout constants matching AnimatedRow's CSS (.bar width 30px,
// .row gap 0.25rem ≈ 4px). SPREAD_GAP is the extra space we add
// between bars to fit a badge.
const BAR_WIDTH = 30;
const ORIG_GAP = 4;
const SPREAD_GAP = 28;
const COL_UNIT = BAR_WIDTH + ORIG_GAP + SPREAD_GAP;
const BADGE_SIZE = 22;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function fold(operator: string): AnimationFn {
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
		const finalAcc = values.slice(1).reduce((a, b) => op(a, b), values[0]);

		const wraps = cells.map((c) => getNode(c.id));
		const bars = wraps.map(
			(w) => w?.querySelector('.bar') as HTMLElement | null
		);
		const nums = bars.map(
			(b) => b?.querySelector('.num') as HTMLElement | null
		);

		const acc0Wrap = wraps[0];
		const acc0Bar = bars[0];
		const acc0Num = nums[0];
		if (!acc0Wrap || !acc0Bar || !acc0Num) {
			await commit();
			return;
		}

		// Derive the existing visual scale from any rendered bar so
		// intermediate heights match the row, then widen for finalAcc.
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

		const row = acc0Wrap.parentElement;
		if (!row) {
			await commit();
			return;
		}
		row.style.position = 'relative';

		// Phase 1a: spread the bars apart so there's room for badges.
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

		// Phase 1b: drop operator badges into the new gaps.
		const rowRect = row.getBoundingClientRect();
		const opBadges: (HTMLElement | null)[] = [];
		const opDelta: number[] = [];
		for (let i = 0; i < wraps.length - 1; i++) {
			const wA = wraps[i];
			if (!wA) {
				opBadges.push(null);
				opDelta.push(0);
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
			opDelta.push(0);
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

		// Phase 2: collapse leftmost trio, shift the rest left, repeat.
		let acc = values[0];
		for (let step = 0; step < cells.length - 1; step++) {
			const mergeIdx = step + 1;
			const newAcc = op(acc, values[mergeIdx]);
			const oldH = valToH(acc);
			const newH = valToH(newAcc);

			acc0Bar.style.height = `${oldH}px`;
			void acc0Bar.offsetHeight;

			const tasks: Promise<unknown>[] = [];

			// Leftmost operator pulses then fades.
			const opBadge = opBadges[step];
			if (opBadge) {
				tasks.push(
					animate(
						opBadge,
						{ scale: [1, 1.4, 0.6], opacity: [1, 1, 0] },
						{ duration: 0.42, ease: [0.5, 0, 0.7, 1] }
					).finished
				);
			}

			// Right bar slides into bar 0 (negate its CSS-flow offset).
			const mergeWrap = wraps[mergeIdx];
			if (mergeWrap) {
				const mergeTargetX = -mergeIdx * (BAR_WIDTH + ORIG_GAP);
				tasks.push(
					animate(
						mergeWrap,
						{ x: mergeTargetX, opacity: 0, scale: 0.5 },
						{ duration: 0.42, ease: [0.5, 0, 0.7, 1] }
					).finished
				);
				wrapDelta[mergeIdx] = mergeTargetX;
			}

			// Bar 0's height grows/shrinks; number snaps mid-animation.
			setTimeout(() => {
				acc0Num.textContent = formatNum(newAcc);
			}, 240);
			tasks.push(
				animate(
					acc0Bar,
					{ height: [`${oldH}px`, `${newH}px`] },
					{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }
				).finished
			);

			// Everything to the right shifts left by one column.
			for (let k = mergeIdx + 1; k < wraps.length; k++) {
				wrapDelta[k] -= COL_UNIT;
				const w = wraps[k];
				if (w) {
					tasks.push(
						animate(
							w,
							{ x: wrapDelta[k] },
							{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
						).finished
					);
				}
			}
			for (let k = step + 1; k < opBadges.length; k++) {
				opDelta[k] -= COL_UNIT;
				const b = opBadges[k];
				if (b) {
					tasks.push(
						animate(
							b,
							{ x: opDelta[k] },
							{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
						).finished
					);
				}
			}

			await Promise.all(tasks);
			acc = newAcc;
			await delay(80);
		}

		await delay(220);
		await commit();

		for (const b of opBadges) {
			if (b) b.remove();
		}
	};
}
