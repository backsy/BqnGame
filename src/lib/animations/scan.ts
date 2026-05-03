// F` scan (+`, ×`, ⌈`, ⌊`): the row spreads apart to make room for
// operator badges between every pair, then a left-to-right sweep
// pulses each operator and animates the corresponding bar from its
// old value to its running accumulator. Bars un-spread before the
// final state.
//
// Pure function: takes per-cell items with old/new values and a
// pre-built valToH function (so the caller's vizMax matches Svelte's).

import { animate } from 'motion';

const BAR_WIDTH = 30;
const ORIG_GAP = 4;
const SPREAD_GAP = 28;
const BADGE_SIZE = 22;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ScanItem = {
	wrap: HTMLElement;
	bar: HTMLElement;
	num: HTMLElement | null;
	/** Pre-commit value (the input). */
	oldValue: number;
	/** Post-commit value (the running accumulator). */
	newValue: number;
};

export async function scan(
	items: ScanItem[],
	operator: string,
	valToH: (v: number) => number
): Promise<void> {
	if (items.length < 2) return;

	const row = items[0].wrap.parentElement;
	if (!row) return;
	const restoreRowPos = row.style.position;
	row.style.position = 'relative';

	// Pin every bar to its OLD value's height so the per-step tween
	// starts where we expect (Svelte already updated to newValue's
	// height on commit).
	for (const item of items) {
		item.bar.style.height = `${valToH(item.oldValue)}px`;
		if (item.num) item.num.textContent = formatNum(item.oldValue);
	}
	void items[0].bar.offsetHeight;

	const wraps = items.map((it) => it.wrap);

	// Phase 1a: spread the bars apart.
	const wrapDelta = wraps.map((_, i) => i * SPREAD_GAP);
	await Promise.all(
		wraps.map((w, i) =>
			animate(
				w,
				{ x: wrapDelta[i] },
				{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }
			).finished
		)
	);

	// Phase 1b: drop operator badges between consecutive bars.
	const rowRect = row.getBoundingClientRect();
	const opBadges: HTMLElement[] = [];
	for (let i = 0; i < wraps.length - 1; i++) {
		const aRect = wraps[i].getBoundingClientRect();
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
			animate(
				b,
				{ opacity: [0, 1], scale: [0, 1.2, 1] },
				{ duration: 0.35, delay: i * 0.04, ease: [0.34, 1.56, 0.64, 1] }
			).finished
		)
	);
	await delay(280);

	// Phase 2: sweep left-to-right. Each step pulses the operator
	// between bar[i-1] and bar[i], then bar[i] grows / shrinks to its
	// running accumulator value.
	for (let i = 1; i < items.length; i++) {
		const item = items[i];
		const opBadge = opBadges[i - 1];
		const oldH = valToH(item.oldValue);
		const newH = valToH(item.newValue);
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
			if (item.num) item.num.textContent = formatNum(item.newValue);
		}, 220);
		tasks.push(
			animate(
				item.bar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: 0.42, delay: 0.16, ease: [0.22, 1, 0.36, 1] }
			).finished
		);

		await Promise.all(tasks);
		await delay(70);
	}
	await delay(180);

	// Phase 3: bars slide back together.
	await Promise.all(
		wraps.map((w) =>
			animate(w, { x: 0 }, { duration: 0.3, ease: [0.22, 1, 0.36, 1] }).finished
		)
	);

	for (const b of opBadges) b.remove();
	row.style.position = restoreRowPos;
}
