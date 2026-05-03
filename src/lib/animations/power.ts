// ⋆⟜N power: per bar, N-1 "×x" multiplier badges fall in succession,
// and on each fall the bar leaps up one power level. For ⋆⟜2 (square)
// that's one fall and one leap; for ⋆⟜3 (cube) two falls, two leaps;
// for ⋆⟜4 three. The repetition is the point — it tells the player
// that "power" is multiplying-by-self over and over, not just a
// one-shot height change like the regular broadcasts.
//
// Works for both scalar (single bar in ValueViz) and row inputs (each
// bar in AnimatedRow leaps in sync with the others). Each item's
// badge shows "×<that bar's value>" so the multiplier is visible.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const STEP_DURATION = 0.55; // total per-step duration in seconds
const FINAL_HOLD_MS = 120;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

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

type Item = {
	bar: HTMLElement;
	num: HTMLElement | null;
	x: number;
	// Where to anchor the badge: wrap for row cells, viz for scalar.
	// The badge floats above the bar in this anchor's coord system.
	anchor: HTMLElement;
	// Per-anchor offset for the badge: viz needs absolute coords because
	// it's a flex container, wrap can use top:-30/left:50%.
	anchorMode: 'wrap' | 'viz';
};

export function power(exponent: number): AnimationFn {
	return async ({ cells, getNode, commit }) => {
		if (exponent < 2) {
			await commit();
			return;
		}

		const items: Item[] = [];
		const restorePos: { el: HTMLElement; prev: string }[] = [];

		const setRel = (el: HTMLElement) => {
			restorePos.push({ el, prev: el.style.position });
			el.style.position = 'relative';
		};

		if (cells.length > 0) {
			// Row case: each cell is a wrap > bar in AnimatedRow.
			for (const cell of cells) {
				if (typeof cell.value !== 'number') continue;
				const wrap = getNode(cell.id);
				if (!wrap) continue;
				const bar = wrap.querySelector('.bar') as HTMLElement | null;
				if (!bar) continue;
				const num = bar.querySelector('.num') as HTMLElement | null;
				setRel(wrap);
				items.push({ bar, num, x: cell.value, anchor: wrap, anchorMode: 'wrap' });
			}
		} else {
			// Scalar case: ValueViz renders the bar directly inside .viz.
			const viz = document.querySelector(
				'.cell.now .viz'
			) as HTMLElement | null;
			const bar = viz?.querySelector(':scope > .bar') as HTMLElement | null;
			if (!viz || !bar) {
				await commit();
				return;
			}
			const num = bar.querySelector('.num') as HTMLElement | null;
			const x = parseFloat(num?.textContent ?? '');
			if (isNaN(x)) {
				await commit();
				return;
			}
			setRel(viz);
			items.push({ bar, num, x, anchor: viz, anchorMode: 'viz' });
		}

		if (items.length === 0) {
			await commit();
			return;
		}

		// visualMax must hold every intermediate power so heights stay
		// in scale through every step (no clipping above 60 px). Mirror
		// +page.svelte's vizMax shape: max abs across all values, ≥ 4.
		const visualMax = Math.max(
			...items.flatMap((i) =>
				Array.from({ length: exponent }, (_, k) => Math.abs(i.x ** (k + 1)))
			),
			4
		);
		const valToH = (v: number) =>
			Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

		// Pin each bar to its current value's height under our visualMax,
		// so the per-step `from` height is consistent with what we'll
		// animate from. Without this, the first step might start from
		// whatever +page.svelte's vizMax produced (different scale).
		for (const item of items) {
			item.bar.style.height = `${valToH(item.x)}px`;
		}
		void document.body.offsetHeight;

		for (let step = 1; step < exponent; step++) {
			const tasks: Promise<unknown>[] = [];
			const stepBadges: HTMLElement[] = [];

			for (const item of items) {
				const fromH = valToH(item.x ** step);
				const toH = valToH(item.x ** (step + 1));

				const badge = document.createElement('div');
				badge.textContent = `×${formatNum(item.x)}`;

				if (item.anchorMode === 'wrap') {
					Object.assign(badge.style, BADGE_STYLE, {
						top: '-44px',
						left: '50%',
						transform: 'translate(-50%, 0) scale(0.5)'
					});
				} else {
					// viz anchor: position above the bar in viz coords.
					const vizRect = item.anchor.getBoundingClientRect();
					const barRect = item.bar.getBoundingClientRect();
					const cx = barRect.left + barRect.width / 2 - vizRect.left;
					const cy = barRect.top - vizRect.top - 44;
					Object.assign(badge.style, BADGE_STYLE, {
						left: `${cx}px`,
						top: `${cy}px`,
						transform: 'translate(-50%, 0) scale(0.5)'
					});
				}
				item.anchor.appendChild(badge);
				stepBadges.push(badge);

				// Badge falls down past the bar with a fade — 3 evenly-
				// spaced keyframes: small + invisible above → bigger +
				// solid landing on the bar → smaller + faded below.
				tasks.push(
					animate(
						badge,
						{
							opacity: [0, 1, 0],
							transform: [
								'translate(-50%, 0) scale(0.5)',
								'translate(-50%, 26px) scale(1.15)',
								'translate(-50%, 56px) scale(0.4)'
							]
						},
						{
							duration: STEP_DURATION,
							ease: [0.4, 0, 0.7, 1]
						}
					).finished
				);

				// Bar leap kicks in once the badge is past the top of
				// the bar — looks like the multiplier is "smashing" into
				// the bar and pumping it up.
				tasks.push(
					(async () => {
						await delay(STEP_DURATION * 1000 * 0.45);
						if (item.num) {
							item.num.textContent = formatNum(item.x ** (step + 1));
						}
						await animate(
							item.bar,
							{ height: [`${fromH}px`, `${toH}px`] },
							{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }
						).finished;
					})()
				);
			}

			await Promise.all(tasks);
			for (const b of stepBadges) b.remove();
			if (step < exponent - 1) await delay(60);
		}

		await delay(FINAL_HOLD_MS);
		await commit();

		for (const { el, prev } of restorePos) {
			el.style.position = prev;
		}
	};
}
