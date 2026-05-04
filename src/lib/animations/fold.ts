// F´ fold (+´, ×´, ⌈´, ⌊´): the row spreads to make room for
// operator glyphs between every pair, the player reads
// '1 + 2 + 3 + 4', then a left-to-right wave collapses the leftmost
// trio (bar, op, bar) into one bar carrying the partial result, and
// everything to the right slides left by one column. After the last
// merge, the accumulator slides to .viz center where the post-commit
// scalar will live.
//
// Pure function: takes the ghost wraps (clones of pre-commit cells),
// per-step accumulator values, and the target viewport-x (.viz
// center) so the accumulator handoff lands pixel-clean.

import { animate } from 'motion';

const BAR_WIDTH = 30;
const ORIG_GAP = 4;
const SPREAD_GAP = 28;
const COL_UNIT = BAR_WIDTH + ORIG_GAP + SPREAD_GAP;
const BADGE_SIZE = 22;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type FoldInput = {
	/** Ghost wraps for every pre-commit cell (clones, in body). */
	ghostWraps: HTMLElement[];
	/** Pre-commit values per cell. */
	values: number[];
	operator: string;
	/** Visualisation scale: max abs value across all intermediates. */
	visualMax: number;
	/** Viewport coords of the post-commit scalar bar's center. The
	 *  accumulator slides to here so the ghost→live handoff is
	 *  pixel-clean on both axes. */
	scalarCenterX: number;
	scalarCenterY: number;
};

const OP_FN: Record<string, (a: number, b: number) => number> = {
	'+': (a, b) => a + b,
	'-': (a, b) => a - b,
	'×': (a, b) => a * b,
	'÷': (a, b) => a / b,
	'⌈': (a, b) => Math.max(a, b),
	'⌊': (a, b) => Math.min(a, b)
};

export async function fold({
	ghostWraps,
	values,
	operator,
	visualMax,
	scalarCenterX,
	scalarCenterY
}: FoldInput): Promise<void> {
	const op = OP_FN[operator];
	if (!op || ghostWraps.length < 2 || values.length !== ghostWraps.length) return;

	const valToH = (v: number) =>
		Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

	const acc0Wrap = ghostWraps[0];
	const acc0Bar = acc0Wrap.querySelector('.bar') as HTMLElement | null;
	const acc0Num = acc0Bar?.querySelector('.num') as HTMLElement | null;
	if (!acc0Bar || !acc0Num) return;

	const row = acc0Wrap.parentElement;
	if (!row) return;
	const restoreRowPos = row.style.position;
	row.style.position = 'relative';

	// Phase 1a: spread the bars apart.
	const wrapDelta = ghostWraps.map((_, i) => i * SPREAD_GAP);
	await Promise.all(
		ghostWraps.map((w, i) =>
			animate(
				w,
				{ x: wrapDelta[i] },
				{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }
			).finished
		)
	);

	// Phase 1b: drop operator badges into the new gaps.
	const rowRect = row.getBoundingClientRect();
	const opBadges: HTMLElement[] = [];
	const opDelta: number[] = [];
	for (let i = 0; i < ghostWraps.length - 1; i++) {
		const wA = ghostWraps[i];
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
			animate(
				b,
				{ opacity: [0, 1], scale: [0, 1.2, 1] },
				{ duration: 0.35, delay: i * 0.04, ease: [0.34, 1.56, 0.64, 1] }
			).finished
		)
	);
	await delay(280);

	// Phase 2: collapse leftmost trio, shift the rest left, repeat.
	let acc = values[0];
	for (let step = 0; step < ghostWraps.length - 1; step++) {
		const mergeIdx = step + 1;
		const newAcc = op(acc, values[mergeIdx]);
		const oldH = valToH(acc);
		const newH = valToH(newAcc);

		acc0Bar.style.height = `${oldH}px`;
		void acc0Bar.offsetHeight;

		const tasks: Promise<unknown>[] = [];

		// Leftmost operator pulses then fades.
		const opBadge = opBadges[step];
		tasks.push(
			animate(
				opBadge,
				{ scale: [1, 1.4, 0.6], opacity: [1, 1, 0] },
				{ duration: 0.42, ease: [0.5, 0, 0.7, 1] }
			).finished
		);

		// Right bar slides into bar 0 (negate its CSS-flow offset).
		const mergeWrap = ghostWraps[mergeIdx];
		const mergeTargetX = -mergeIdx * (BAR_WIDTH + ORIG_GAP);
		tasks.push(
			animate(
				mergeWrap,
				{ x: mergeTargetX, opacity: 0, scale: 0.5 },
				{ duration: 0.42, ease: [0.5, 0, 0.7, 1] }
			).finished
		);
		wrapDelta[mergeIdx] = mergeTargetX;

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
		for (let k = mergeIdx + 1; k < ghostWraps.length; k++) {
			wrapDelta[k] -= COL_UNIT;
			tasks.push(
				animate(
					ghostWraps[k],
					{ x: wrapDelta[k] },
					{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}
		for (let k = step + 1; k < opBadges.length; k++) {
			opDelta[k] -= COL_UNIT;
			tasks.push(
				animate(
					opBadges[k],
					{ x: opDelta[k] },
					{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}

		await Promise.all(tasks);
		acc = newAcc;
		await delay(80);
	}

	await delay(220);

	// Slide the accumulator (acc0Wrap) to where the post-commit scalar
	// will be centered — both axes. The source row was bottom-aligned
	// in .viz; the post-commit scalar is centered in .viz, so we need
	// the dy too or we'd hand off with a vertical jump.
	const accRect = acc0Wrap.getBoundingClientRect();
	const dx = scalarCenterX - (accRect.left + accRect.width / 2);
	const dy = scalarCenterY - (accRect.top + accRect.height / 2);
	if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
		await animate(
			acc0Wrap,
			{ x: dx, y: dy },
			{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }
		).finished;
	}

	for (const b of opBadges) b.remove();
	row.style.position = restoreRowPos;
}
