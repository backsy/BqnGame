// Primitive animations — the three building blocks every higher-level
// motion is composed from. They are deliberately tiny and orthogonal:
//
//   shrink(bars, target)     bars' heights tween to `target` (typically
//                            the unit size). Container auto-shrinks.
//   stretch(bars, targets)   bars' heights tween to per-bar targets.
//                            Direct dual of shrink — running stretch
//                            after shrink with the right targets
//                            returns each bar to its original height.
//   rotate(box, bars, deg)   `box` rotates `deg` around the geometric
//                            centre of `bars`; each bar counter-rotates
//                            -`deg` around its own centre, so the bars
//                            stay upright while the container spins.
//                            Used as 180° to mirror a row of cells.
//
// All three are state-clean: caller is responsible for committing the
// animations between them (see motions/lateral.ts → commitAndClear).

import { animate } from 'motion';
import { scaled } from '../speed.js';
import type { AnimateStep } from '../stage.js';
import { UNIT_SIZE, SHRINK_DURATION, STRETCH_DURATION, ROTATE_DURATION } from './units.js';

function commit(elements: HTMLElement[]): void {
	for (const el of elements) {
		if (typeof el.getAnimations !== 'function') continue;
		for (const anim of el.getAnimations()) {
			try { anim.commitStyles(); } catch { /* disconnected */ }
			anim.cancel();
		}
	}
}

function setupHandoff(beforeRoot: HTMLElement, afterRoot: HTMLElement): HTMLElement[] {
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '0';
	afterRoot.style.pointerEvents = 'none';
	return afterCells;
}

function finishHandoff(beforeRoot: HTMLElement, afterRoot: HTMLElement, afterCells: HTMLElement[]): void {
	delete afterRoot.dataset.preparing;
	for (const cell of afterCells) cell.style.visibility = '';
	beforeRoot.style.opacity = '0';
	afterRoot.style.opacity = '';
	afterRoot.style.pointerEvents = '';
}

export async function shrink(
	bars: readonly HTMLElement[],
	targetSize: number,
	durationSec: number,
): Promise<void> {
	await Promise.all(bars.map(bar => {
		const h = bar.getBoundingClientRect().height;
		return animate(
			bar,
			{ height: [`${h}px`, `${targetSize}px`] },
			{ duration: scaled(durationSec), ease: [0.4, 0, 0.6, 1] },
		).finished;
	}));
}

export async function stretch(
	bars: readonly HTMLElement[],
	targetSizes: readonly number[],
	durationSec: number,
): Promise<void> {
	await Promise.all(bars.map((bar, i) => {
		const h = bar.getBoundingClientRect().height;
		return animate(
			bar,
			{ height: [`${h}px`, `${targetSizes[i]}px`] },
			{ duration: scaled(durationSec), ease: [0.4, 0, 0.6, 1] },
		).finished;
	}));
}

function parseDeg(s: string): number {
	const m = s.match(/(-?[\d.]+)deg/);
	return m ? parseFloat(m[1]) : 0;
}

export async function rotate(
	box: HTMLElement,
	bars: readonly HTMLElement[],
	deg: number,
	durationSec: number,
): Promise<void> {
	// Rotation centre = geometric centre of the bars (in box-local coords).
	// This keeps the middle bar rock-steady through the rotation regardless
	// of where the bars sit within the box's padding.
	const boxRect = box.getBoundingClientRect();
	const firstBarRect = bars[0].getBoundingClientRect();
	const lastBarRect = bars[bars.length - 1].getBoundingClientRect();
	const cx = (firstBarRect.left + lastBarRect.right) / 2 - boxRect.left;
	const cy = (firstBarRect.top + firstBarRect.bottom) / 2 - boxRect.top;
	box.style.transformOrigin = `${cx}px ${cy}px`;

	// Read each element's current rotation so successive calls accumulate
	// (rotate after rotate = sum of degrees, identity at multiples of 360°).
	const boxStart = parseDeg(box.style.rotate || '0deg');
	const boxEnd = boxStart + deg;
	const barRotations = bars.map(bar => {
		const start = parseDeg(bar.style.rotate || '0deg');
		return { start, end: start - deg };
	});

	await Promise.all([
		animate(box, { rotate: [boxStart, boxEnd] }, { duration: scaled(durationSec), ease: [0.4, 0, 0.6, 1] }).finished,
		...bars.map((bar, i) =>
			animate(bar, { rotate: [barRotations[i].start, barRotations[i].end] }, { duration: scaled(durationSec), ease: [0.4, 0, 0.6, 1] }).finished,
		),
	]);
}

// Motion wrappers — one per primitive, plugged into the dispatch table
// in animate.ts. Each just calls the corresponding primitive, commits,
// and hands off to afterRoot.

export const shrinkMonadic: AnimateStep = async (_step, beforeRoot, afterRoot): Promise<void> => {
	const bars = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	const afterCells = setupHandoff(beforeRoot, afterRoot);
	await shrink(bars, UNIT_SIZE, SHRINK_DURATION);
	commit(bars);
	// Edit afterRoot to match the post-animation state: all bars at unit size.
	const afterBars = Array.from(afterRoot.querySelectorAll('.bar')) as HTMLElement[];
	for (const bar of afterBars) bar.style.height = `${UNIT_SIZE}px`;
	finishHandoff(beforeRoot, afterRoot, afterCells);
};

export const stretchMonadic: AnimateStep = async (_step, beforeRoot, afterRoot): Promise<void> => {
	const bars = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	const afterCells = setupHandoff(beforeRoot, afterRoot);
	// Target heights come from afterRoot (which BQN rendered at natural sizes).
	const afterBars = Array.from(afterRoot.querySelectorAll('.bar')) as HTMLElement[];
	const targets = afterBars.map(b => b.getBoundingClientRect().height);
	await stretch(bars, targets, STRETCH_DURATION);
	commit(bars);
	finishHandoff(beforeRoot, afterRoot, afterCells);
};

export const rotateMonadic: AnimateStep = async (_step, beforeRoot, afterRoot): Promise<void> => {
	const bars = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	const afterCells = setupHandoff(beforeRoot, afterRoot);

	const boxStart = parseDeg(beforeRoot.style.rotate || '0deg');
	const boxEnd = boxStart + 180;
	const barEnds = bars.map(bar => parseDeg(bar.style.rotate || '0deg') - 180);

	await rotate(beforeRoot, bars, 180, ROTATE_DURATION);
	commit([beforeRoot, ...bars]);
	// Explicitly bake the rotation into `style.rotate` (the individual
	// CSS property) — the stage's commit wipes `transform` but leaves
	// `rotate` alone, so this is the only way to keep the rotation
	// visible after handoff regardless of where the animation library
	// happened to write.
	beforeRoot.style.rotate = `${boxEnd}deg`;
	for (let i = 0; i < bars.length; i++) bars[i].style.rotate = `${barEnds[i]}deg`;

	// Move the actual animated elements into afterRoot so the visible
	// DOM is literally the same elements with the same inline styles —
	// no precomputed substitute, no layout recalculation.
	while (afterRoot.firstChild) afterRoot.removeChild(afterRoot.firstChild);
	while (beforeRoot.firstChild) afterRoot.appendChild(beforeRoot.firstChild);
	afterRoot.style.rotate = beforeRoot.style.rotate;
	afterRoot.style.transformOrigin = beforeRoot.style.transformOrigin;

	finishHandoff(beforeRoot, afterRoot, afterCells);
};
