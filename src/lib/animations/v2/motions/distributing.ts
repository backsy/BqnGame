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
const EMIT_DURATION = 0.42;
const BETWEEN_EMITS_MS = 130;
const POST_EMITS_HOLD_MS = 240;
const COUNTER_OUT_DURATION = 0.3;

const COUNTER_SIZE = 36;       // px
const COUNTER_OFFSET = 50;     // px above the row

// ── rangeMonadic ──────────────────────────────────────────────────────────
// ↕N: scalar N → vector [0, 1, …, N-1]. Visual semantic: the input number
// IS the source of the count, so it physically becomes the counter ball —
// no two-things-on-screen overlap.
//
// Phases:
//   1. The input bar morphs into the counter ball. The bar disappears
//      in the same JS tick that the counter element is spawned at the
//      bar's exact position, so the user never sees both at once. The
//      counter then animates upward + rectangle→circle + bar colour →
//      counter accent. End state: counter is at the slot above the
//      result row, input bar is gone (only the empty row container
//      remains beneath, still decoration-suppressed).
//   2. The empty array box appears: data-preparing is cleared on
//      afterRoot, so the embossed-box decoration paints in (cells
//      remain visibility:hidden, so it's a visibly empty container).
//   3. Cells emit one at a time from the counter's position into their
//      measured post-commit slots. Counter decrements per emit
//      (N → N-1 → … → 0) — "remaining count" makes the magnitude
//      legible as work that gets spent.
//   4. Counter fades; handoff.
//
// Falls through to blackBox for: dyadic call, non-numeric input, non-
// integer or negative N, and N = 0 (no cells to emit).

const MORPH_DURATION = 0.5;
const BOX_REVEAL_HOLD_MS = 180;
const COUNTER_TICK_PULSE_DURATION = 0.22;

export const rangeMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const n = step.x.value;
	if (!Number.isInteger(n) || n < 0) return blackBox(step, beforeRoot, afterRoot);
	if (n === 0) return blackBox(step, beforeRoot, afterRoot);

	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (afterCells.length !== n) return blackBox(step, beforeRoot, afterRoot);

	// The scalar bar is the first child of beforeRoot (a row wrapper around
	// one bar — see the harness's renderBqnValue 'number' case).
	const inputBar = beforeRoot.firstElementChild as HTMLElement | null;
	if (!inputBar) return blackBox(step, beforeRoot, afterRoot);

	const barRect = inputBar.getBoundingClientRect();
	const afterRowRect = afterRoot.getBoundingClientRect();
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	const counterTargetLeft = afterRowRect.left + afterRowRect.width / 2 - COUNTER_SIZE / 2;
	const counterTargetTop = afterRowRect.top - COUNTER_OFFSET;
	const counterCx = afterRowRect.left + afterRowRect.width / 2;
	const counterCy = counterTargetTop + COUNTER_SIZE / 2;

	// Stage afterRoot ready: cells hidden, container in place. The embossed
	// box stays hidden until phase 2 because data-preparing is still set on
	// the afterRoot by stage.prepare().
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	// ── Phase 1: input bar → counter ball ─────────────────────────────────
	// Create counter element AT the bar's current geometry. In the same JS
	// tick, hide the bar via visibility:hidden so the swap is instant and
	// the morph reads as "the bar IS now the counter" rather than "bar
	// fades while counter appears."
	const inputBarColor = getComputedStyle(inputBar).backgroundColor;
	const counter = document.createElement('div');
	counter.textContent = String(n);
	Object.assign(counter.style, {
		position: 'fixed',
		left: `${barRect.left}px`,
		top: `${barRect.top}px`,
		width: `${barRect.width}px`,
		height: `${barRect.height}px`,
		background: inputBarColor,
		color: '#0a0a0a',
		borderRadius: '3px',
		display: 'grid',
		placeItems: 'center',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: '0.85rem',
		fontWeight: '700',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: '0 0 8px rgba(124, 106, 247, 0.22)',
	});
	document.body.appendChild(counter);
	inputBar.style.visibility = 'hidden';

	await animate(
		counter,
		{
			left: `${counterTargetLeft}px`,
			top: `${counterTargetTop}px`,
			width: `${COUNTER_SIZE}px`,
			height: `${COUNTER_SIZE}px`,
			borderRadius: '50%',
			background: DISTRIBUTING_ACCENT,
			fontSize: '1rem',
			boxShadow: `0 0 16px ${DISTRIBUTING_GLOW}`,
		},
		{ duration: scaled(MORPH_DURATION), ease: [0.22, 1, 0.36, 1] },
	).finished;

	// ── Phase 2: empty array box appears ───────────────────────────────────
	// Drop the data-preparing flag so the afterRoot's embossed box CSS
	// kicks in. Cells stay visibility:hidden — the container outline shows
	// with empty space inside, ready for the cells to fill.
	delete afterRoot.dataset.preparing;
	await _delayMs(scaledMs(BOX_REVEAL_HOLD_MS));

	// ── Phase 3: emit cells, counter ticks down ────────────────────────────
	// Each iteration: text change + scale pulse + cell flight fire in the
	// SAME tick so the counter ball reads as "this is the moment of the
	// emit." The pulse and the digit update are part of one beat — they
	// must not drift apart.
	for (let i = 0; i < n; i++) {
		const cell = afterCells[i];
		const cellRect = afterRects[i];
		const startDx = counterCx - (cellRect.left + cellRect.width / 2);
		const startDy = counterCy - (cellRect.top + cellRect.height / 2);

		counter.textContent = String(n - i - 1);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.25)', 'scale(1)'] },
			{ duration: scaled(COUNTER_TICK_PULSE_DURATION) },
		);

		cell.style.visibility = '';
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

	// ── Phase 4: counter fades, handoff ────────────────────────────────────
	await animate(
		counter,
		{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
		{ duration: scaled(COUNTER_OUT_DURATION), ease: 'easeIn' },
	).finished;
	counter.remove();

	// Mark beforeRoot fully gone for the handoff. The bar inside is already
	// invisible (visibility:hidden), but commit() removes the whole node.
	beforeRoot.style.opacity = '0';
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
