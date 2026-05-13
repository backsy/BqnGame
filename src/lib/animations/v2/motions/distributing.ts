import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

// Distributing motion family. One cell spreads to many — visually the inverse
// of merging (merging collapses many to one, distributing emits many from one).
//
//   - Range (↕N): a single number becomes a vector of N consecutive integers
//     [0, 1, …, N-1]. The scalar pulses, a counter overlay ticks 1, 2, …, N
//     above the row as bars emerge one-by-one from the scalar's position and
//     settle at their post-commit slots.
//
//   - Enclose (<x): the simplest one-to-one case. A scalar is wrapped in a
//     length-1 array — visually a single bar shifts into the wrapped slot
//     with a brief pulse. The same emit primitive used by range fires once.
//
// The counter overlay's purpose is to make the magnitude legible: K ticks for
// K emitted cells, in lock-step with the emissions.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const DISTRIBUTING_ACCENT = '#d86af7';
const DISTRIBUTING_GLOW = 'rgba(216, 106, 247, 0.6)';

// ── shared timings ────────────────────────────────────────────────────────

const SCALAR_PULSE_DURATION = 0.35;
const SCALAR_PULSE_HOLD_MS = 80;
const COUNTER_IN_DURATION = 0.25;
const COUNTER_TICK_DURATION = 0.28;
const EMIT_DURATION = 0.42;
const BETWEEN_EMITS_MS = 130;
const POST_EMITS_HOLD_MS = 240;
const COUNTER_OUT_DURATION = 0.3;
const SCALAR_FADE_DURATION = 0.28;

const COUNTER_SIZE = 36;       // px
const COUNTER_OFFSET = 50;     // px above the row

// ── counter overlay ───────────────────────────────────────────────────────
// Small fixed-position pill that floats above the stage and ticks once per
// emitted cell. Styling template mirrors rotate's counter in lateral.ts so the
// visual vocabulary stays consistent — counter overlays mean "magnitude being
// counted out for you" wherever they appear.

function createCounter(centerX: number, topY: number): HTMLElement {
	const counter = document.createElement('div');
	Object.assign(counter.style, {
		position: 'fixed',
		top: `${topY}px`,
		left: `${centerX - COUNTER_SIZE / 2}px`,
		width: `${COUNTER_SIZE}px`,
		height: `${COUNTER_SIZE}px`,
		display: 'grid',
		placeItems: 'center',
		background: DISTRIBUTING_ACCENT,
		color: '#0a0a0a',
		borderRadius: '50%',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: '1rem',
		fontWeight: '700',
		opacity: '0',
		transform: 'scale(0)',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: `0 0 16px ${DISTRIBUTING_GLOW}`,
	});
	return counter;
}

// ── rangeMonadic ──────────────────────────────────────────────────────────
// ↕N: scalar N → vector [0, 1, …, N-1]. The visual is "I am counting out N
// indices and arranging them in a row."
//
// Phases:
//   0. Pulse the input scalar bar to draw the eye to it.
//   1. Scale-in the counter overlay above the target row's horizontal centre.
//   2. For i = 0, 1, …, N-1:
//      - Tick the counter to (i + 1).
//      - Reveal afterCells[i] with an emit animation: starts at the scalar's
//        viewport centre, scaled down, and tweens to its measured post-commit
//        rect (translate = 0, scale = 1). End state is pixel-exact because
//        the cell ALREADY occupies its final layout slot; we're just removing
//        an entry transform. (Rule D — no recomputed layout.)
//      - The scalar bar dims slightly per emission, reaching ~0 by the last.
//   3. Hold briefly, fade the counter out, finalise the scalar fade.
//
// Falls through to blackBox for: dyadic call, non-numeric input, non-integer
// or negative N, and N = 0 (the empty-array case has no cells to emit — let
// blackBox handle the transition cleanly).

export const rangeMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const n = step.x.value;
	if (!Number.isInteger(n) || n < 0) return blackBox(step, beforeRoot, afterRoot);
	if (n === 0) return blackBox(step, beforeRoot, afterRoot);

	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (afterCells.length !== n) return blackBox(step, beforeRoot, afterRoot);

	// The scalar bar IS beforeRoot itself when rendered as a number (see the
	// harness's renderBqnValue: a 'number' produces a single bar div, not a
	// row wrapper). Treat the scalar source position as beforeRoot's centre.
	const scalarRect = beforeRoot.getBoundingClientRect();
	const scalarCx = scalarRect.left + scalarRect.width / 2;
	const scalarCy = scalarRect.top + scalarRect.height / 2;

	const afterRowRect = afterRoot.getBoundingClientRect();
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	// Stage afterRoot visible at its committed position; individual after-cells
	// stay hidden until their emit moment. The afterRoot's natural opacity
	// drives the row container's appearance (gaps, padding); cell visibility
	// gates per-cell reveal.
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	// Phase 0 — pulse the scalar.
	beforeRoot.style.position = beforeRoot.style.position || 'relative';
	beforeRoot.style.zIndex = '5';
	await animate(
		beforeRoot,
		{ scale: [1, 1.15, 1] },
		{ duration: scaled(SCALAR_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;
	await _delayMs(scaledMs(SCALAR_PULSE_HOLD_MS));

	// Phase 1 — counter scale-in, positioned above the target row's centre
	// (where the emitted cells will land) so the counter and the row read as
	// one unit.
	const counterCx = afterRowRect.left + afterRowRect.width / 2;
	const counterTopY = afterRowRect.top - COUNTER_OFFSET;
	const counter = createCounter(counterCx, counterTopY);
	counter.textContent = '0';
	document.body.appendChild(counter);

	await animate(
		counter,
		{ opacity: [0, 1], transform: ['scale(0)', 'scale(1)'] },
		{ duration: scaled(COUNTER_IN_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;

	// Phase 2 — emit N cells one-by-one. Each emission ticks the counter to
	// (i + 1) and reveals afterCells[i] with an "arrive from scalar" tween.
	// Counter ticks exactly N times, matching the cell count (Rule E).
	for (let i = 0; i < n; i++) {
		counter.textContent = String(i + 1);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.28)', 'scale(1)'] },
			{ duration: scaled(COUNTER_TICK_DURATION) },
		);

		const cell = afterCells[i];
		const cellRect = afterRects[i];
		const cellCx = cellRect.left + cellRect.width / 2;
		const cellCy = cellRect.top + cellRect.height / 2;

		// Emit translation: cell currently sits at its final position; we
		// PRE-OFFSET to the scalar's centre, then animate the offset back to
		// zero. End state is no transform — pixel-exact final position.
		const startDx = scalarCx - cellCx;
		const startDy = scalarCy - cellCy;

		cell.style.visibility = '';
		// Concurrent fade of the scalar: drop opacity proportionally so the
		// last cell emerges as the scalar reaches ~0. Visual reads as the
		// scalar "spending itself" into the row.
		const scalarTargetOpacity = 1 - (i + 1) / n;
		animate(
			beforeRoot,
			{ opacity: scalarTargetOpacity },
			{ duration: scaled(EMIT_DURATION), ease: 'linear' },
		);

		await animate(
			cell,
			{
				x: [startDx, 0],
				y: [startDy, 0],
				scale: [0.35, 1.08, 1],
				opacity: [0, 1, 1],
			},
			{ duration: scaled(EMIT_DURATION), ease: [0.34, 1.56, 0.64, 1] },
		).finished;

		if (i < n - 1) await _delayMs(scaledMs(BETWEEN_EMITS_MS));
	}

	await _delayMs(scaledMs(POST_EMITS_HOLD_MS));

	// Phase 3 — counter fade-out and final scalar fade. Run in parallel; the
	// row stays on-screen at its committed positions.
	await Promise.all([
		animate(
			counter,
			{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
			{ duration: scaled(COUNTER_OUT_DURATION), ease: 'easeIn' },
		).finished,
		animate(
			beforeRoot,
			{ opacity: 0 },
			{ duration: scaled(SCALAR_FADE_DURATION), ease: 'easeIn' },
		).finished,
	]);
	counter.remove();

	afterRoot.style.pointerEvents = '';
};

// ── encloseMonadic ────────────────────────────────────────────────────────
// <x: wrap a scalar in a length-1 array. One bar becomes one wrapped cell —
// the degenerate distributing case (N=1, no counting needed). Visual: the
// scalar pulses once, the single after-cell emits from the scalar's position
// with the same trajectory as a range emission, and the scalar fades.
//
// Only handles the scalar → length-1 array path. Anything else (array input
// nesting it deeper, etc.) falls through to blackBox.

export const encloseMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (afterCells.length !== 1) return blackBox(step, beforeRoot, afterRoot);

	const scalarRect = beforeRoot.getBoundingClientRect();
	const scalarCx = scalarRect.left + scalarRect.width / 2;
	const scalarCy = scalarRect.top + scalarRect.height / 2;

	const cell = afterCells[0];
	const cellRect = cell.getBoundingClientRect();
	const cellCx = cellRect.left + cellRect.width / 2;
	const cellCy = cellRect.top + cellRect.height / 2;

	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	cell.style.visibility = 'hidden';

	beforeRoot.style.position = beforeRoot.style.position || 'relative';
	beforeRoot.style.zIndex = '5';

	// Phase 0 — pulse.
	await animate(
		beforeRoot,
		{ scale: [1, 1.15, 1] },
		{ duration: scaled(SCALAR_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;
	await _delayMs(scaledMs(SCALAR_PULSE_HOLD_MS));

	// Phase 1 — single emission. No counter for N=1; the emit alone is enough.
	const startDx = scalarCx - cellCx;
	const startDy = scalarCy - cellCy;
	cell.style.visibility = '';
	animate(
		beforeRoot,
		{ opacity: 0 },
		{ duration: scaled(EMIT_DURATION), ease: 'linear' },
	);
	await animate(
		cell,
		{
			x: [startDx, 0],
			y: [startDy, 0],
			scale: [0.35, 1.08, 1],
			opacity: [0, 1, 1],
		},
		{ duration: scaled(EMIT_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;

	await _delayMs(scaledMs(POST_EMITS_HOLD_MS));

	afterRoot.style.pointerEvents = '';
};
