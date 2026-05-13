import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import type { BqnValue } from '../value.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

// Sizing motion family. Per-element arithmetic: each bar grows or shrinks in
// place, in unison. Layout stays put — N cells before, N cells after, same
// positions. What changes is each bar's height (and label, and possibly
// colour when the value crosses zero).
//
// Phase 1: a badge with the operator label floats in above each cell.
// Phase 2: badges plunge into the bars; bars tween to the measured afterRoot
// heights; numeric labels cross-fade to the new value; bar colour flips if
// the value's sign changes (positive #7c6af7 → negative #f76a6a).
// Phase 3: badges fade; afterRoot's cells take over from the before-cells.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const SIZING_ACCENT = '#f7a86a';
const SIZING_ACCENT_GLOW = 'rgba(247, 168, 106, 0.55)';

const POSITIVE_BAR = '#7c6af7';
const NEGATIVE_BAR = '#f76a6a';

const BADGE_IN_DURATION = 0.4;
const BADGE_IN_STAGGER = 0.04;
const PRE_HOLD_MS = 200;
const BADGE_PLUNGE_DURATION = 0.32;
const SIZE_DURATION = 0.5;
const LABEL_FADE_DURATION = 0.32;

function badgeStyle(): Record<string, string> {
	return {
		position: 'absolute',
		top: '-30px',
		left: '50%',
		transform: 'translate(-50%, 0) scale(0)',
		padding: '0.18rem 0.5rem',
		background: SIZING_ACCENT,
		color: '#0a0a0a',
		borderRadius: '12px',
		fontFamily: "'BQN386', ui-monospace, monospace",
		fontSize: '0.85rem',
		fontWeight: '700',
		lineHeight: '1',
		opacity: '0',
		zIndex: '5',
		pointerEvents: 'none',
		boxShadow: `0 0 12px ${SIZING_ACCENT_GLOW}`,
		whiteSpace: 'nowrap',
	};
}

function createSizingBadge(label: string): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = label;
	Object.assign(badge.style, badgeStyle());
	return badge;
}

// Extract per-cell numeric values from a BqnValue. Returns null when any
// element isn't a plain number — the caller falls back to blackBox.
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

// Find the numeric-label span inside a bar element. Bars are rendered as a
// div containing a single span (see harness makeBar); when the bar wraps
// something else (placeholder, nested grid) we get null and the caller
// gracefully skips the label tween.
function labelSpan(bar: HTMLElement): HTMLSpanElement | null {
	const span = bar.querySelector(':scope > span');
	return span instanceof HTMLSpanElement ? span : null;
}

async function runSizingMotion(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	label: string,
): Promise<void> {
	const beforeValue: BqnValue =
		step.kind === 'monadic' ? step.x
		: step.kind === 'dyadic' ? step.x
		: { kind: 'number', value: 0 };
	if (step.kind !== 'monadic' && step.kind !== 'dyadic') {
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

	// Measure the after-cell heights so each bar tweens to a pixel-exact
	// final height (memory: feedback_animations_pixel_exact). Don't recompute
	// from values — the harness owns the layout function.
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	for (const cell of beforeCells) {
		if (!cell.style.position) cell.style.position = 'relative';
	}

	// Phase 1: stagger badges in above each before-cell.
	const badges: HTMLElement[] = [];
	for (const cell of beforeCells) {
		const badge = createSizingBadge(label);
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

	// Phase 2a: badges plunge.
	const plunge = Promise.all(
		badges.map(b =>
			animate(
				b,
				{
					transform: [
						'translate(-50%, 0) scale(1)',
						'translate(-50%, 32px) scale(0)',
					],
					opacity: [1, 0],
				},
				{ duration: scaled(BADGE_PLUNGE_DURATION), ease: [0.4, 0, 0.7, 1] },
			).finished,
		),
	);
	await plunge;

	// Phase 2b: bars resize in place to the measured after-cell heights, the
	// numeric labels cross-fade to the new value, and colour flips when the
	// sign changes. All run in parallel so the row reads as one synchronous
	// transformation, not a sequence.
	const sizeTasks: Promise<unknown>[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		const bar = beforeCells[i];
		const oldH = bar.getBoundingClientRect().height;
		const newH = afterRects[i].height;
		const oldVal = beforeNums[i];
		const newVal = afterNums[i];

		// Height tween — pixel-exact, lands on the measured afterRoot height.
		sizeTasks.push(
			animate(
				bar,
				{ height: [`${oldH}px`, `${newH}px`] },
				{ duration: scaled(SIZE_DURATION), ease: [0.22, 1, 0.36, 1] },
			).finished,
		);

		// Sign-change colour flip — the pedagogically-loaded case for +/-.
		// Without it, a bar going from +3 to -1 silently swaps purple→red
		// only at handoff and the user misses the moment.
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

		// Number label cross-fade — fade out the old text at half, swap
		// textContent, fade the new text in. The afterRoot cell will reveal
		// at handoff anyway, so a clean visibility flip is what closes it;
		// this cross-fade is purely the in-flight feedback.
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

	// Cleanup: drop badges then hand off to the after-cells.
	for (const b of badges) b.remove();

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
}

// Factory: returns an AnimateStep that draws the given label as the
// operator badge above every cell. For dyadic-with-scalar-W ops the harness
// composes the label like `+2` / `-2`; for monadic ops it's just the glyph
// (`-`, `|`, `⌊`, `⌈`).
export function dyadicSizing(opLabel: string): AnimateStep {
	return (step, beforeRoot, afterRoot) =>
		runSizingMotion(step, beforeRoot, afterRoot, opLabel);
}

export function monadicSizing(opLabel: string): AnimateStep {
	return (step, beforeRoot, afterRoot) =>
		runSizingMotion(step, beforeRoot, afterRoot, opLabel);
}

// Dyadic per-cell arithmetic exports. Each captures its operator glyph; the
// scalar value comes from step.w at render time and is composed into the
// badge label by the dispatcher in animate.ts.
function dyadicWithW(glyph: string): AnimateStep {
	return (step, beforeRoot, afterRoot) => {
		if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
		const w = step.w;
		// Compose the label using the actual scalar W. Array+array would
		// need a different motion (per-cell parallel labels), so fall through.
		if (w.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);
		return runSizingMotion(step, beforeRoot, afterRoot, `${glyph}${w.value}`);
	};
}

export const addDyadic: AnimateStep = dyadicWithW('+');
export const subDyadic: AnimateStep = dyadicWithW('-');
export const mulDyadic: AnimateStep = dyadicWithW('×');
export const divDyadic: AnimateStep = dyadicWithW('÷');
export const powDyadic: AnimateStep = dyadicWithW('⋆');
export const modDyadic: AnimateStep = dyadicWithW('|');
export const minDyadic: AnimateStep = dyadicWithW('⌊');
export const maxDyadic: AnimateStep = dyadicWithW('⌈');

// Monadic per-cell — the operator glyph alone (no scalar).
export const negMonadic: AnimateStep = monadicSizing('-');
export const absMonadic: AnimateStep = monadicSizing('|');
export const floorMonadic: AnimateStep = monadicSizing('⌊');
export const ceilMonadic: AnimateStep = monadicSizing('⌈');
