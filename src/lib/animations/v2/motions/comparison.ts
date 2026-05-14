import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import type { BqnValue } from '../value.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

// Comparison motion family. Per-cell dyadic comparison against a scalar —
// `W = X`, `W < X`, … broadcast over the array side. The output is a 0/1
// array, so each bar resizes to the height of a 0-or-1 bar and its label
// cross-fades to "0" or "1".
//
// Phase 1: a predicate badge (e.g. ">2") appears above each cell. The
//          cell value is already on the bar below — the badge shows what
//          each cell is being compared against, not the cell value itself.
// Phase 2: each badge flips per-cell to "✓" (green, true) or "✗" (red,
//          false). Stagger conveys the per-cell decision sequence.
// Phase 3: bars resize to the 0/1 height, labels cross-fade to "0"/"1".
// Phase 4: badges fade and afterRoot's cells are revealed.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const COMPARISON_ACCENT = '#f76a8a';
const COMPARISON_ACCENT_GLOW = 'rgba(247, 106, 138, 0.55)';

const VERDICT_PASS_BG = '#5fcc5f';
const VERDICT_PASS_GLOW = 'rgba(95, 204, 95, 0.55)';
const VERDICT_FAIL_BG = '#e25555';
const VERDICT_FAIL_GLOW = 'rgba(226, 85, 85, 0.55)';

const POSITIVE_BAR = '#7c6af7';
const NEGATIVE_BAR = '#f76a6a';

const BADGE_IN_DURATION = 0.4;
const BADGE_IN_STAGGER = 0.04;
const PRE_HOLD_MS = 200;
const FLIP_DURATION = 0.3;
const FLIP_STAGGER = 0.06;
const VERDICT_HOLD_MS = 280;
const SIZE_DURATION = 0.5;
const LABEL_FADE_DURATION = 0.32;
const BADGE_FADE_DURATION = 0.28;

function createComparisonBadge(label: string): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = label;
	Object.assign(badge.style, {
		position: 'absolute',
		top: '-30px',
		left: '50%',
		transform: 'translate(-50%, 0) scale(0)',
		padding: '0.18rem 0.5rem',
		background: COMPARISON_ACCENT,
		color: '#0a0a0a',
		borderRadius: '12px',
		fontFamily: "'BQN386', ui-monospace, monospace",
		fontSize: '0.85rem',
		fontWeight: '700',
		lineHeight: '1',
		opacity: '0',
		zIndex: '5',
		pointerEvents: 'none',
		boxShadow: `0 0 12px ${COMPARISON_ACCENT_GLOW}`,
		whiteSpace: 'nowrap',
	});
	return badge;
}

function numericCells(v: BqnValue): number[] | null {
	if (v.kind === 'number') return [v.value];
	if (v.kind !== 'array') return null;
	const out: number[] = [];
	for (const d of v.data) {
		if (d.kind !== 'number') return null;
		out.push(d.value);
	}
	return out;
}

function labelSpan(bar: HTMLElement): HTMLSpanElement | null {
	const span = bar.querySelector(':scope > span');
	return span instanceof HTMLSpanElement ? span : null;
}

async function runComparisonMotion(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	glyph: string,
): Promise<void> {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);

	// Need exactly one scalar side and one array side. The array side is what
	// the cells render — its index is what the badge is placed above.
	let badgeLabel: string;
	let beforeValue: BqnValue;
	if (step.w.kind === 'number' && step.x.kind === 'array') {
		// W scalar before glyph: badge reads e.g. "2>".
		badgeLabel = `${step.w.value}${glyph}`;
		beforeValue = step.x;
	} else if (step.w.kind === 'array' && step.x.kind === 'number') {
		// W array, X scalar (bind-right form): badge reads e.g. ">2".
		badgeLabel = `${glyph}${step.x.value}`;
		beforeValue = step.w;
	} else {
		return blackBox(step, beforeRoot, afterRoot);
	}

	if (beforeValue.kind !== 'array' || beforeValue.shape.length !== 1) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const beforeNums = numericCells(beforeValue);
	const afterNums = numericCells(step.result);
	if (beforeNums === null || afterNums === null) return blackBox(step, beforeRoot, afterRoot);
	if (beforeNums.length !== afterNums.length) return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}
	if (beforeCells.length !== afterCells.length) return blackBox(step, beforeRoot, afterRoot);
	if (beforeCells.length !== beforeNums.length) return blackBox(step, beforeRoot, afterRoot);

	// Measure post-commit heights for pixel-exact resize endpoints.
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	for (const cell of beforeCells) {
		if (!cell.style.position) cell.style.position = 'relative';
	}

	// Phase 1: stagger predicate badges in above each cell. Every cell gets
	// the same predicate label — the verdict comes in Phase 2.
	const badges: HTMLElement[] = [];
	for (const cell of beforeCells) {
		const badge = createComparisonBadge(badgeLabel);
		cell.appendChild(badge);
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
						'translate(-50%, 0) scale(1)',
					],
				},
				{
					duration: scaled(BADGE_IN_DURATION),
					ease: [0.34, 1.56, 0.64, 1],
					delay: scaled(i * BADGE_IN_STAGGER),
				},
			).finished,
		),
	);
	await _delayMs(scaledMs(PRE_HOLD_MS));

	// Phase 2: each badge pulses and flips to its verdict (✓ pass / ✗ fail).
	// Colour carries the truth value — green for true (=1), red for false
	// (=0) — matching filter's convention so the user's mental model is
	// consistent across motions.
	await Promise.all(
		badges.map(async (b, i) => {
			const passes = afterNums[i] === 1;
			await animate(
				b,
				{ scale: [1, 1.35, 1] },
				{
					duration: scaled(FLIP_DURATION),
					ease: [0.34, 1.56, 0.64, 1],
					delay: scaled(i * FLIP_STAGGER),
				},
			).finished;
			b.textContent = passes ? '✓' : '✗';
			if (passes) {
				b.style.background = VERDICT_PASS_BG;
				b.style.boxShadow = `0 0 12px ${VERDICT_PASS_GLOW}`;
			} else {
				b.style.background = VERDICT_FAIL_BG;
				b.style.boxShadow = `0 0 12px ${VERDICT_FAIL_GLOW}`;
			}
		}),
	);
	await _delayMs(scaledMs(VERDICT_HOLD_MS));

	// Phase 3: bars resize in place to the measured after-cell heights, the
	// numeric labels cross-fade to the new value, and colour flips when the
	// sign changes (will not normally happen for 0/1 results but kept so the
	// math stays correct if a starter ever contains negative inputs).
	const sizeTasks: Promise<unknown>[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		const bar = beforeCells[i];
		const oldH = bar.getBoundingClientRect().height;
		const newH = afterRects[i].height;
		const oldVal = beforeNums[i];
		const newVal = afterNums[i];

		sizeTasks.push(
			animate(
				bar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: scaled(SIZE_DURATION), ease: [0.22, 1, 0.36, 1] },
			).finished,
		);

		const oldSign = Math.sign(oldVal);
		const newSign = Math.sign(newVal);
		if (oldSign !== newSign && (oldSign < 0 || newSign < 0)) {
			const fromColor = oldVal < 0 ? NEGATIVE_BAR : POSITIVE_BAR;
			const toColor = newVal < 0 ? NEGATIVE_BAR : POSITIVE_BAR;
			sizeTasks.push(
				animate(
					bar,
					{ background: [fromColor, toColor] },
					{ duration: scaled(SIZE_DURATION), ease: 'linear' },
				).finished,
			);
		}

		const span = labelSpan(bar);
		if (span && oldVal !== newVal) {
			sizeTasks.push((async () => {
				await animate(
					span,
					{ opacity: [1, 0] },
					{ duration: scaled(LABEL_FADE_DURATION / 2), ease: 'easeIn' },
				).finished;
				span.textContent = String(newVal);
				await animate(
					span,
					{ opacity: [0, 1] },
					{ duration: scaled(LABEL_FADE_DURATION / 2), ease: 'easeOut' },
				).finished;
			})());
		}
	}
	await Promise.all(sizeTasks);

	// Phase 4: fade the verdict badges, then hand off to the after-cells.
	await Promise.all(
		badges.map(b =>
			animate(
				b,
				{ opacity: 0, transform: 'translate(-50%, -8px) scale(0.9)' },
				{ duration: scaled(BADGE_FADE_DURATION), ease: 'easeIn' },
			).finished,
		),
	);
	for (const b of badges) b.remove();

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
}

function comparisonDyadic(glyph: string): AnimateStep {
	return (step, beforeRoot, afterRoot) =>
		runComparisonMotion(step, beforeRoot, afterRoot, glyph);
}

export const eqDyadic: AnimateStep = comparisonDyadic('=');
export const neDyadic: AnimateStep = comparisonDyadic('≠');
export const ltDyadic: AnimateStep = comparisonDyadic('<');
export const leDyadic: AnimateStep = comparisonDyadic('≤');
export const gtDyadic: AnimateStep = comparisonDyadic('>');
export const geDyadic: AnimateStep = comparisonDyadic('≥');
