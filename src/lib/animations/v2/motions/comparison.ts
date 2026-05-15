import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import type { BqnValue } from '../value.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

// Comparison motion family. Per-cell dyadic comparison against a
// scalar — `W = X`, `W < X`, … broadcast over the array side. The
// output is a 0/1 array, so each bar resizes to the height of a
// 0-or-1 bar and its label cross-fades to "0" or "1".
//
// Phase 1: one predicate badge appears above the row's centre,
//          showing the operation being performed (e.g. "2<" or
//          "<2"). It's a single overlay — not per-cell — so the
//          row's silhouette stays clean and the badge can't form a
//          sawtooth above unequal-height bars.
// Phase 2: every cell transitions in parallel: a verdict-coloured
//          background pulse (green for pass, red for fail), the bar
//          height tweens to the result height, and the numeric
//          label cross-fades to "0" or "1". No per-cell ✓/✗ swap —
//          the colour pulse carries the truth value, the new label
//          carries the result.
// Phase 3: the badge fades and the afterRoot cells are revealed.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const COMPARISON_ACCENT = '#f76a8a';
const COMPARISON_ACCENT_GLOW = 'rgba(247, 106, 138, 0.55)';

const VERDICT_PASS_BG = '#5fcc5f';
const VERDICT_PASS_GLOW = 'rgba(95, 204, 95, 0.55)';
const VERDICT_FAIL_BG = '#e25555';
const VERDICT_FAIL_GLOW = 'rgba(226, 85, 85, 0.55)';

const POSITIVE_BAR = '#7c6af7';
const NEGATIVE_BAR = '#f76a6a';

const BADGE_IN_DURATION = 0.32;
const BADGE_OFFSET_PX = 44;        // px above the row for the badge
const PRE_HOLD_MS = 220;
const SIZE_DURATION = 0.5;
const VERDICT_PULSE_DURATION = 0.42;
const LABEL_FADE_DURATION = 0.32;
const POST_HOLD_MS = 180;
const BADGE_FADE_DURATION = 0.28;

function createComparisonBadge(label: string, cx: number, top: number): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = label;
	Object.assign(badge.style, {
		position: 'fixed',
		top: `${top}px`,
		left: `${cx}px`,
		transform: 'translate(-50%, 0) scale(0)',
		padding: '0.22rem 0.6rem',
		background: COMPARISON_ACCENT,
		color: '#0a0a0a',
		borderRadius: '14px',
		fontFamily: "'BQN386', ui-monospace, monospace",
		fontSize: '0.95rem',
		fontWeight: '700',
		lineHeight: '1',
		opacity: '0',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: `0 0 14px ${COMPARISON_ACCENT_GLOW}`,
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

	// Measure post-commit heights for pixel-exact resize endpoints, and
	// the row's viewport rect so the central badge can be placed above
	// it in fixed coords.
	const afterRects = afterCells.map(c => c.getBoundingClientRect());
	const rowRect = beforeRoot.getBoundingClientRect();

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	// Phase 1: a single predicate badge appears above the row's centre.
	const badge = createComparisonBadge(
		badgeLabel,
		rowRect.left + rowRect.width / 2,
		rowRect.top - BADGE_OFFSET_PX,
	);
	document.body.appendChild(badge);
	await animate(
		badge,
		{
			opacity: [0, 1],
			transform: [
				'translate(-50%, 0) scale(0)',
				'translate(-50%, 0) scale(1.15)',
				'translate(-50%, 0) scale(1)',
			],
		},
		{ duration: scaled(BADGE_IN_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;
	await _delayMs(scaledMs(PRE_HOLD_MS));

	// Phase 2: every cell transitions in parallel. The bar's background
	// pulses to the verdict colour and settles back; height tweens to
	// the result height; numeric label cross-fades to "0" or "1".
	// Verdict colour carries the truth value (green for pass, red for
	// fail), matching filter's convention — so the user's mental model
	// stays consistent across motions.
	const tasks: Promise<unknown>[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		const bar = beforeCells[i];
		const oldH = bar.getBoundingClientRect().height;
		const newH = afterRects[i].height;
		const oldVal = beforeNums[i];
		const newVal = afterNums[i];
		const passes = newVal === 1;
		const baseColor = oldVal < 0 ? NEGATIVE_BAR : POSITIVE_BAR;
		const verdictColor = passes ? VERDICT_PASS_BG : VERDICT_FAIL_BG;

		// Verdict pulse: base → verdict → base (smooth round-trip).
		tasks.push(
			animate(
				bar,
				{ background: [baseColor, verdictColor, baseColor] },
				{ duration: scaled(VERDICT_PULSE_DURATION), ease: 'easeInOut' },
			).finished,
		);

		// Height resize to result.
		tasks.push(
			animate(
				bar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: scaled(SIZE_DURATION), ease: [0.22, 1, 0.36, 1] },
			).finished,
		);

		// Label cross-fade: opacity 1 → 0 (swap text while invisible) → 1.
		const span = labelSpan(bar);
		if (span && oldVal !== newVal) {
			tasks.push((async () => {
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
	await Promise.all(tasks);
	await _delayMs(scaledMs(POST_HOLD_MS));

	// Phase 3: badge fades out and the afterRoot cells reveal.
	await animate(
		badge,
		{ opacity: 0, transform: 'translate(-50%, -10px) scale(0.9)' },
		{ duration: scaled(BADGE_FADE_DURATION), ease: 'easeIn' },
	).finished;
	badge.remove();

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
	void VERDICT_PASS_GLOW;
	void VERDICT_FAIL_GLOW;
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
