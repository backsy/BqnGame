import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import type { BqnValue } from '../value.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

// Structural motion family. Extraction and measurement primitives — the
// operations that ask a question ABOUT an array rather than transforming its
// elements. Two visual sub-vocabularies:
//
//   - Extraction (first, solo): one cell of the input survives or the
//     whole input is wrapped. Dims-and-glide gesture: non-surviving cells fade
//     in place, the survivor pulses and glides to the post-commit position.
//
//   - Measurement (length, shape, rank-of): the input collapses into a
//     numeric answer about its structure. A counter overlay ticks through
//     the thing being counted (cells along an axis, axes themselves), then
//     emits the count as the result bar(s).
//
// pair (dyadic) sits across both: two scalar values arrive — one already
// on-stage as X, the other (the bound W) flies in from above — and settle
// side-by-side as a length-2 row. The choreography is closest to enclose's
// emit-and-settle but with two emitters.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const STRUCTURAL_ACCENT = '#f7e16a';
const STRUCTURAL_GLOW = 'rgba(247, 225, 106, 0.55)';

// ── shared counter overlay ────────────────────────────────────────────────
// Same shape and styling as rotate's / range's counters so the visual
// vocabulary stays consistent — counter overlays mean "magnitude being
// counted out for you." The accent colour is the structural family's
// yellow rather than the distributing magenta.

const COUNTER_SIZE = 36;       // px
const COUNTER_OFFSET = 50;     // px above the row
const COUNTER_IN_DURATION = 0.25;
const COUNTER_TICK_DURATION = 0.28;
const COUNTER_OUT_DURATION = 0.3;

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
		background: STRUCTURAL_ACCENT,
		color: '#0a0a0a',
		borderRadius: '50%',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: '1rem',
		fontWeight: '700',
		opacity: '0',
		transform: 'scale(0)',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: `0 0 16px ${STRUCTURAL_GLOW}`,
	});
	return counter;
}

// ── beforeCells helper ────────────────────────────────────────────────────
// beforeRoot for a 1D array is a `.row` flexbox whose children are the bar
// divs. For a 2D array beforeRoot is a CSS grid whose children are bars in
// row-major order. Both expose `.children` of the same form (cells), so a
// shallow `Array.from(.children)` works for both.

function beforeCellsOf(root: HTMLElement): HTMLElement[] {
	return Array.from(root.children) as HTMLElement[];
}

// ── firstMonadic ──────────────────────────────────────────────────────────
// ⊑X — the first major-axis cell of X survives, everything else is discarded.
// Visual: dim all non-survivors in place; pulse cell[0] to mark it as the
// chosen one; glide cell[0] to the measured afterRoot position; fade the
// dimmed cells away as the handoff completes.
//
// For a 2D input the "first cell" along the major axis is the first ROW, so
// the entire row 0 survives. We treat it as a single multi-cell group that
// glides as a block.
//
// Falls through to blackBox for: empty arrays (nothing to pick), scalar input
// (already the first cell — nothing to animate), rank > 2 (no grid render).

const EXTRACT_DIM_DURATION = 0.32;
const EXTRACT_PULSE_DURATION = 0.36;
const EXTRACT_PULSE_HOLD_MS = 120;
// Survivor "exits the box" by translating LEFT past beforeRoot's left
// edge, parking in clear space while the box and remaining contents
// fade. PARK_GAP is the px of empty space between the survivor's right
// edge at park and beforeRoot's left edge.
const EXTRACT_EXIT_DURATION = 0.42;
const EXTRACT_PARK_GAP_PX = 30;
const EXTRACT_POST_EXIT_HOLD_MS = 80;
// Fade-out of the dimmed cells once the survivor is parked left.
const EXTRACT_FADE_DURATION = 0.28;
const EXTRACT_GLIDE_DURATION = 0.55;
const EXTRACT_POST_HOLD_MS = 180;

async function extractRunner(
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement,
	survivorIndices: number[],
): Promise<void> {
	// querySelectorAll('.bar') so nested rank-3+ renderings expose all
	// leaf bars regardless of how many crate-wrapping levels sit above.
	const beforeCells = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	const afterCells = Array.from(afterRoot.querySelectorAll('.bar')) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}
	if (afterCells.length !== survivorIndices.length) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of beforeCells) {
		if (!cell.style.position) cell.style.position = 'relative';
	}

	const survivorSet = new Set(survivorIndices);

	// Phase 1: dim the discarded cells in place. Survivors stay at full
	// opacity so the eye locks on to them through the contrast jump.
	const dimTasks: Promise<unknown>[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		if (survivorSet.has(i)) continue;
		dimTasks.push(
			animate(
				beforeCells[i],
				{ opacity: [1, 0.22] },
				{ duration: scaled(EXTRACT_DIM_DURATION), ease: 'easeOut' },
			).finished,
		);
	}
	if (dimTasks.length > 0) await Promise.all(dimTasks);

	// Phase 2: pulse the survivors so the user registers "these are what
	// gets kept." All survivors pulse in lock-step.
	const pulseTasks: Promise<unknown>[] = [];
	for (const i of survivorIndices) {
		const cell = beforeCells[i];
		cell.style.zIndex = '5';
		pulseTasks.push(
			animate(
				cell,
				{ scale: [1, 1.18, 1] },
				{ duration: scaled(EXTRACT_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
			).finished,
		);
	}
	if (pulseTasks.length > 0) await Promise.all(pulseTasks);
	await _delayMs(scaledMs(EXTRACT_PULSE_HOLD_MS));

	// Phase 3: survivors translate LEFT, exiting beforeRoot's box. They
	// move as a rigid group (same parkDx for every survivor) so their
	// relative positions are preserved — for matrix `first` the whole
	// top row leaves together, still in row formation.
	const beforeBoxRect = beforeRoot.getBoundingClientRect();
	let maxSurvivorRight = -Infinity;
	for (const i of survivorIndices) {
		maxSurvivorRight = Math.max(maxSurvivorRight, beforeRects[i].right);
	}
	const parkDx = (beforeBoxRect.left - EXTRACT_PARK_GAP_PX) - maxSurvivorRight;
	const exitTasks: Promise<unknown>[] = [];
	for (const i of survivorIndices) {
		exitTasks.push(
			animate(
				beforeCells[i],
				{ x: parkDx },
				{ duration: scaled(EXTRACT_EXIT_DURATION), ease: [0.22, 1, 0.36, 1] },
			).finished,
		);
	}
	await Promise.all(exitTasks);
	await _delayMs(scaledMs(EXTRACT_POST_EXIT_HOLD_MS));

	// Phase 4a: freeze the entire box layout before any DOM mutation.
	// Pin EVERY cell — survivor AND non-survivor — with
	// `position: absolute` + inline left/top derived from its
	// pre-transform rect. This evacuates the flex/grid flow
	// completely: nothing left for the browser to lay out, so neither
	// removing children nor anything else can shift positions.
	//
	// Critically: pin survivors AT THE SAME TIME as non-survivors. If
	// only non-survivors were pinned, the flex/grid container would
	// re-justify with the remaining flex children (the survivors)
	// alone — that's the spaz the user keeps seeing.
	beforeRoot.style.position = 'relative';
	// box-sizing: border-box so inline width/height IS the total
	// rendered size. With default content-box, `width: ${rect.width}`
	// would set CONTENT width to rect.width — total = content +
	// padding + border, which inflates the box visibly.
	beforeRoot.style.boxSizing = 'border-box';
	beforeRoot.style.width = `${beforeBoxRect.width}px`;
	beforeRoot.style.height = `${beforeBoxRect.height}px`;
	for (let i = 0; i < beforeCells.length; i++) {
		const r = beforeRects[i];
		beforeCells[i].style.position = 'absolute';
		beforeCells[i].style.left = `${r.left - beforeBoxRect.left}px`;
		beforeCells[i].style.top = `${r.top - beforeBoxRect.top}px`;
		beforeCells[i].style.margin = '0';
	}
	// Reparent survivors out of beforeRoot so they don't inherit its
	// opacity drop. Switch from absolute (relative to beforeRoot) to
	// fixed (relative to viewport) using the same pre-transform rect
	// in viewport coords; the transform that's already applied
	// (parkDx from phase 3) keeps them visually exactly where they sit.
	for (const i of survivorIndices) {
		const cell = beforeCells[i];
		const beforeRect = beforeRects[i];
		cell.style.position = 'fixed';
		cell.style.left = `${beforeRect.left}px`;
		cell.style.top = `${beforeRect.top}px`;
		document.body.appendChild(cell);
	}

	// Phase 4b: the BOX and the remaining contents fade together. We
	// animate beforeRoot's opacity directly — its CSS-painted frame
	// (background, border, decoration) and the dimmed child cells all
	// fade as one. Survivors stay visible because they were reparented
	// out in 4a.
	await animate(
		beforeRoot,
		{ opacity: [1, 0] },
		{ duration: scaled(EXTRACT_FADE_DURATION), ease: 'easeIn' },
	).finished;

	// Phase 5: survivors glide from their parked positions to the
	// measured afterRoot positions. The motion is computed against the
	// ORIGINAL beforeRect (translate = 0 at start of animation), so the
	// scalar `x: dx, y: dy` here eases from parkDx → dx and 0 → dy —
	// motion-lib reads the current inline transform as the "from"
	// value, harness uses the previously-tracked tx as prior, both
	// converge on the same end position (beforeRect.cx + dx = afterCx).
	const glideTasks: Promise<unknown>[] = [];
	for (let k = 0; k < survivorIndices.length; k++) {
		const i = survivorIndices[k];
		const cell = beforeCells[i];
		const before = beforeRects[i];
		const after = afterRects[k];
		const dx = (after.left + after.width / 2) - (before.left + before.width / 2);
		const dy = (after.top + after.height / 2) - (before.top + before.height / 2);
		glideTasks.push(
			animate(
				cell,
				{ x: dx, y: dy },
				{ duration: scaled(EXTRACT_GLIDE_DURATION), ease: [0.22, 1, 0.36, 1] },
			).finished,
		);
	}
	await Promise.all(glideTasks);

	// Hold the survivor at the result slot for a beat so the user
	// registers "this is the result," BEFORE swapping it for the
	// afterCell. Doing the hold here (with the reparented survivor
	// still visible) avoids any gap between "survivor disappears" and
	// "afterCell appears."
	await _delayMs(scaledMs(EXTRACT_POST_HOLD_MS));

	// Handoff: reveal afterCells at the same viewport position the
	// survivor occupies, then remove the orphaned survivor nodes from
	// <body>. Both render the same value at the same rect, so the
	// before→after swap is a clean pixel handoff with no visible
	// transition. No opacity tween needed — and a tracked opacity
	// drop here would BE a teleport (instant fade), which the
	// smooth-motion test correctly rejects.
	for (const cell of afterCells) cell.style.visibility = '';
	for (const i of survivorIndices) {
		beforeCells[i].remove();
	}
	afterRoot.style.pointerEvents = '';
}

export const firstMonadic: AnimateStep = (step, beforeRoot, afterRoot) => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.data.length === 0) return blackBox(step, beforeRoot, afterRoot);

	// The first major-axis cell of a rank-N array is the rank-(N-1)
	// sub-array at index 0 along axis 0 — its size is ∏shape[1..]. The
	// survivors are the first that-many leaf cells (data is row-major
	// flattened, so leading-axis index 0 ⇒ flat indices 0..sliceSize-1).
	// One formula for every rank, including 1 (sliceSize = 1, one cell).
	const shape = step.x.shape;
	const sliceSize = shape.slice(1).reduce((a, b) => a * b, 1);
	const surv: number[] = [];
	for (let i = 0; i < sliceSize; i++) surv.push(i);
	return extractRunner(step, beforeRoot, afterRoot, surv);
};

// ── soloMonadic ───────────────────────────────────────────────────────────
// ≍X — wrap X in a length-1 array along a new leading axis.
//   - scalar X    → length-1 vector ⟨X⟩.
//   - vector X    → 1×N matrix (X becomes the first row of a new grid).
//   - matrix X    → 1×R×C rank-3 (no renderer; falls to blackBox).
//
// One gesture for every rank that we can render: pulse the input to
// acknowledge it, fade the input out, then emit EVERY after-cell from
// its corresponding before-cell's viewport position back to its measured
// natural slot. Scalar is just the N=1 instance — same code path.
// The "wrap in a new outer box" reads visually because the after-cells
// arrive inside the next-rank container (vector → matrix), whose CSS
// frame paints itself once data-preparing is removed by commit.

const SOLO_PULSE_DURATION = 0.35;
const SOLO_PULSE_HOLD_MS = 80;
const SOLO_POST_HOLD_MS = 240;
const SOLO_FADE_DURATION = 0.28;

export const soloMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);

	// Find leaf bars on both sides. `beforeRoot.children` works for
	// scalar/vector/matrix where bars are direct children, but breaks
	// for the nested rank-≥3 output rendering (row > crate > inner
	// grid > bars). Walking by class is uniform — every leaf bar is
	// marked with class 'bar' so it can be found at any nesting depth.
	const beforeCells = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	const afterCells = Array.from(afterRoot.querySelectorAll('.bar')) as HTMLElement[];
	if (beforeCells.length === 0 || afterCells.length === 0) {
		return blackBox(step, beforeRoot, afterRoot);
	}
	if (beforeCells.length !== afterCells.length) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	beforeRoot.style.position = beforeRoot.style.position || 'relative';
	beforeRoot.style.zIndex = '5';

	// Phase 0 — pulse every input cell once, in lock-step. Reads as
	// "this whole thing is what's being wrapped." Scalar input has
	// a single cell, vector has N — same code path either way.
	await Promise.all(
		beforeCells.map(cell =>
			animate(
				cell,
				{ scale: [1, 1.15, 1] },
				{ duration: scaled(SOLO_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
			).finished,
		),
	);
	await _delayMs(scaledMs(SOLO_PULSE_HOLD_MS));

	// Phase 1 — fade the input out so the emission has clear screen
	// space to land in. Cross-fading would put before and after at the
	// same pixels (no-overlap violation).
	await animate(
		beforeRoot,
		{ opacity: [1, 0] },
		{ duration: scaled(SOLO_FADE_DURATION), ease: 'easeIn' },
	).finished;

	// Phase 2 — every after-cell emits from its corresponding
	// before-cell's pre-fade viewport centre back to its measured
	// final slot. Parallel for the whole row so the visual reads as
	// "the array reforms inside the new outer box."
	await Promise.all(
		beforeCells.map((_, i) => {
			const bRect = beforeRects[i];
			const srcCx = bRect.left + bRect.width / 2;
			const srcCy = bRect.top + bRect.height / 2;
			return emitFromPoint(afterCells[i], afterRects[i], srcCx, srcCy);
		}),
	);

	await _delayMs(scaledMs(SOLO_POST_HOLD_MS));

	afterRoot.style.pointerEvents = '';
};

// ── measurement helpers ───────────────────────────────────────────────────
// length, shape, rank-of all share the same overall structure: a counter
// scales in above the post-commit row, ticks through the thing being
// counted, then the after-cells emit from a single "answer point" near the
// counter. Variants:
//
//   - lengthMonadic: tick once per major-axis cell, one output cell (scalar).
//   - shapeMonadic 1D: tick once (the single axis length), one output cell.
//   - shapeMonadic 2D: tick once per axis (R, C), two output cells.
//   - rankOfMonadic: tick once per axis (collapsing each major-axis cell as
//     it's counted), one output cell carrying the rank scalar.
//
// The same emit primitive (after-cell pre-offsets to the counter's position,
// tweens back to its measured final position) is reused so the output cells
// land pixel-exact regardless of which measurement produced them.

const MEASURE_TICK_BETWEEN_MS = 150;
const MEASURE_TICK_FADE_MS = 80;
const MEASURE_PRE_EMIT_MS = 200;
const MEASURE_EMIT_DURATION = 0.45;
const MEASURE_BETWEEN_EMITS_MS = 130;
const MEASURE_POST_HOLD_MS = 240;
const MEASURE_CELL_DIM_DURATION = 0.22;
const MEASURE_CELL_DIM_OPACITY = 0.25;

// Emit one after-cell from a viewport-source point. Reveals the cell,
// pre-offsets the transform to the source, then tweens to (0, 0).
async function emitFromPoint(
	cell: HTMLElement,
	cellRect: DOMRect,
	srcCx: number,
	srcCy: number,
): Promise<void> {
	const cellCx = cellRect.left + cellRect.width / 2;
	const cellCy = cellRect.top + cellRect.height / 2;
	const startDx = srcCx - cellCx;
	const startDy = srcCy - cellCy;
	cell.style.visibility = '';
	await animate(
		cell,
		{
			x: [startDx, 0],
			y: [startDy, 0],
			scale: [0.35, 1.08, 1],
			opacity: [0, 1, 1],
		},
		{ duration: scaled(MEASURE_EMIT_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;
}

// Animate counter scale-in.
async function counterIn(counter: HTMLElement): Promise<void> {
	await animate(
		counter,
		{ opacity: [0, 1], transform: ['scale(0)', 'scale(1)'] },
		{ duration: scaled(COUNTER_IN_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;
}

// Animate counter fade-out and remove. The transform target uses a lift so
// the counter visually retreats up and away — matches rotate/range's exit.
async function counterOutAndRemove(counter: HTMLElement): Promise<void> {
	await animate(
		counter,
		{ opacity: 0, transform: 'translateY(-10px) scale(0.85)' },
		{ duration: scaled(COUNTER_OUT_DURATION), ease: 'easeIn' },
	).finished;
	counter.remove();
}

// Tick the counter to a new value with a quick scale pulse, after a brief
// label cross-fade so the digit change isn't a jarring snap.
async function tickCounter(counter: HTMLElement, label: string): Promise<void> {
	counter.textContent = label;
	await animate(
		counter,
		{ transform: ['scale(1)', 'scale(1.28)', 'scale(1)'] },
		{ duration: scaled(COUNTER_TICK_DURATION) },
	).finished;
}

// Dim a single before-cell as its contribution is "counted." Used by length
// and rank-of so the user sees each cell get consumed by the count.
function dimCell(cell: HTMLElement): Promise<unknown> {
	return animate(
		cell,
		{ opacity: [parseFloat(cell.style.opacity || '1'), MEASURE_CELL_DIM_OPACITY] },
		{ duration: scaled(MEASURE_CELL_DIM_DURATION), ease: 'easeOut' },
	).finished;
}

// ── lengthMonadic ─────────────────────────────────────────────────────────
// ≠X — count of cells along the major axis. For a 1D array that's the
// number of elements; for a 2D array it's the number of rows.
//
// Visual (matches shape / rank-of: every structural "measure" motion
// ends with the count FALLING OUT of the counter ball):
//   1. Counter scales in above the input row's centre.
//   2. For each major-axis cell, pulse the cell(s) and tick the counter
//      — pulse and tick fire in parallel so they read as one beat.
//   3. Input fades.
//   4. The after-cell (the result scalar) emits FROM the counter via
//      emitFromPoint — pre-offset to the counter's centre, then tween
//      back to its measured post-commit slot.
//   5. Counter fades out.
//
// Falls through to blackBox for: non-array input, rank > 2.

const LENGTH_PULSE_DURATION = 0.3;
const LENGTH_PULSE_STAGGER_MS = 130;
const LENGTH_POST_TICKS_HOLD_MS = 220;
const LENGTH_PRE_COUNTER_FADE_MS = 150;

export const lengthMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = beforeCellsOf(beforeRoot);
	const afterCells = beforeCellsOf(afterRoot);
	if (beforeCells.length === 0) return blackBox(step, beforeRoot, afterRoot);
	if (afterCells.length !== 1) return blackBox(step, beforeRoot, afterRoot);

	// Derive (majorDim, sliceSize) from the input shape regardless of kind.
	// A scalar (atom or rank-0 array) is "one major-axis cell of one slot"
	// — the gesture is identical to a 1-cell vector: tick once, drop the
	// single cell, fade the result in. Rank ≥ 3 is the only case where the
	// per-row dim count doesn't make sense, so fall through there.
	let majorDim: number;
	let sliceSize: number;
	if (step.x.kind === 'array') {
		const rank = step.x.shape.length;
		if (rank === 0) {
			majorDim = 1;
			sliceSize = 1;
		} else if (rank === 1) {
			majorDim = step.x.shape[0];
			sliceSize = 1;
		} else if (rank === 2) {
			majorDim = step.x.shape[0];
			sliceSize = step.x.shape[1];
		} else {
			return blackBox(step, beforeRoot, afterRoot);
		}
	} else {
		majorDim = 1;
		sliceSize = 1;
	}
	if (majorDim * sliceSize !== beforeCells.length) {
		return blackBox(step, beforeRoot, afterRoot);
	}

	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	// Counter sits above the row's horizontal centre.
	const rowRect = beforeRoot.getBoundingClientRect();
	const counterCx = rowRect.left + rowRect.width / 2;
	const counterCy = rowRect.top - COUNTER_OFFSET + COUNTER_SIZE / 2;
	const counter = createCounter(counterCx, rowRect.top - COUNTER_OFFSET);
	counter.textContent = '0';
	document.body.appendChild(counter);

	await counterIn(counter);

	// Phase 2: pulse each major-axis cell while the counter ticks. Both
	// fire in parallel (not awaited together) so the pulse plays as the
	// counter changes — one beat per major-axis cell.
	for (let i = 0; i < majorDim; i++) {
		counter.textContent = String(i + 1);
		animate(
			counter,
			{ transform: ['scale(1)', 'scale(1.3)', 'scale(1)'] },
			{ duration: scaled(0.28) },
		);
		for (let j = 0; j < sliceSize; j++) {
			animate(
				beforeCells[i * sliceSize + j],
				{ scale: [1, 1.15, 1] },
				{ duration: scaled(LENGTH_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
			);
		}
		if (i < majorDim - 1) await _delayMs(scaledMs(LENGTH_PULSE_STAGGER_MS));
	}
	await _delayMs(scaledMs(LENGTH_POST_TICKS_HOLD_MS));

	// Phase 3: fade the input smoothly — beforeRoot's opacity tween
	// (children inherit) gives one continuous "input is gone" beat,
	// no per-cell drop motion.
	await animate(
		beforeRoot,
		{ opacity: [1, 0] },
		{ duration: scaled(MEASURE_CELL_DIM_DURATION), ease: 'easeIn' },
	).finished;

	// Phase 4: the result scalar emits FROM the counter ball. Same
	// gesture as shape/rank-of — every structural measurement ends
	// with the count falling out of the counter into the result slot.
	const afterRect = afterCells[0].getBoundingClientRect();
	await emitFromPoint(afterCells[0], afterRect, counterCx, counterCy);

	// Phase 5: counter retreats up and out.
	await _delayMs(scaledMs(LENGTH_PRE_COUNTER_FADE_MS));
	await counterOutAndRemove(counter);

	afterRoot.style.pointerEvents = '';
};

// ── shapeMonadic ──────────────────────────────────────────────────────────
// ≢X — the shape vector. For 1D the result is ⟨N⟩; for 2D ⟨R C⟩.
//
// Visual: for each axis in turn, outline the axis (we pulse the cells
// belonging to that axis), tick a counter to the axis's length, and emit
// one after-cell carrying that length from the counter's position. 1D
// runs one axis; 2D runs two axes back-to-back. The two emitted cells
// sit side-by-side as the post-commit row.
//
// Falls through to blackBox for non-array input or rank > 2.

const AXIS_PULSE_DURATION = 0.32;
const AXIS_PULSE_HOLD_MS = 80;

// The cell-group for index `i` along `axis` of a value `x`: every leaf
// cell whose `axis`-th coordinate equals `i`. Works for any rank.
// Row-major flattening: cell index = Σ_d (coord_d × stride_d) where
// stride_d = ∏_{e>d} shape_e.
function axisGroupCells(
	cells: HTMLElement[],
	x: BqnValue,
	axis: number,
	i: number,
): HTMLElement[] {
	if (x.kind !== 'array') return [];
	const shape = x.shape;
	if (axis < 0 || axis >= shape.length) return [];
	if (shape.length === 1) return [cells[i]];
	const strides = new Array<number>(shape.length).fill(1);
	for (let k = shape.length - 2; k >= 0; k--) {
		strides[k] = strides[k + 1] * shape[k + 1];
	}
	const out: HTMLElement[] = [];
	function recurse(d: number, flat: number): void {
		if (d === shape.length) {
			if (cells[flat]) out.push(cells[flat]);
			return;
		}
		if (d === axis) {
			recurse(d + 1, flat + i * strides[d]);
		} else {
			for (let k = 0; k < shape[d]; k++) {
				recurse(d + 1, flat + k * strides[d]);
			}
		}
	}
	recurse(0, 0);
	return out;
}

async function pulseAxisCells(cells: HTMLElement[]): Promise<void> {
	const tasks = cells.map(c =>
		animate(
			c,
			{ scale: [1, 1.12, 1], opacity: [parseFloat(c.style.opacity || '1'), 1, parseFloat(c.style.opacity || '1')] },
			{ duration: scaled(AXIS_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
		).finished,
	);
	await Promise.all(tasks);
}

export const shapeMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);

	// Shape works on ANY input (≢5 = ⟨⟩, ≢⟨a b c⟩ = ⟨3⟩, ≢2‿3‿4⥊… = ⟨2 3 4⟩,
	// etc.). The motion is one gesture: counter ticks once per axis-length;
	// for scalars (rank 0) that's zero ticks and the empty-vector result
	// reveals. No rank ceiling.
	const axisLengths: number[] = step.x.kind === 'array' ? [...step.x.shape] : [];
	const rank = axisLengths.length;

	const afterCells = beforeCellsOf(afterRoot);
	if (afterCells.length !== rank) return blackBox(step, beforeRoot, afterRoot);

	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	const rowRect = beforeRoot.getBoundingClientRect();
	const counterCx = rowRect.left + rowRect.width / 2;
	const counterCy = rowRect.top - COUNTER_OFFSET + COUNTER_SIZE / 2;
	const counter = createCounter(counterCx, rowRect.top - COUNTER_OFFSET);
	counter.textContent = '0';
	document.body.appendChild(counter);

	await counterIn(counter);

	// Phase 1 — count every axis: pulse the cells along it and tick the
	// counter to its length. Per-rank visual flourishes are deliberate
	// (they teach something about the rank), not custom escapes:
	//
	//   rank 0 (scalar): no axes → no ticks, counter stays at "0".
	//                    The empty-vector result reveals at Phase 3.
	//   rank 1 vector:   pulse all cells together, counter ticks to N.
	//   rank 2 matrix:   for each axis, count the cells along it one at
	//                    a time. Axis 0 highlights cells row-by-row (R
	//                    pulses ticking 1..R). Axis 1 highlights cells
	//                    column-by-column (C pulses ticking 1..C). Lets
	//                    the user SEE that R counts rows and C counts
	//                    columns rather than just reading the answer.
	// One uniform counting gesture across all ranks: for each axis, walk
	// its cells one-by-one, pulse each cell-group and tick the counter
	// 1..len. Same beat shape for ⟨3 1 4⟩ (one axis, three ticks) as for
	// a 2×3 matrix or any higher rank.
	// querySelectorAll('.bar') walks the nested DOM to find leaf cells —
	// rank-3+ rendering uses outer rows → crates → inner grids → bars.
	const beforeCells = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	for (let axis = 0; axis < rank; axis++) {
		const len = axisLengths[axis];
		for (let i = 0; i < len; i++) {
			const groupCells = axisGroupCells(beforeCells, step.x, axis, i);
			await pulseAxisCells(groupCells);
			await tickCounter(counter, String(i + 1));
			if (i < len - 1) await _delayMs(scaledMs(AXIS_PULSE_HOLD_MS));
		}
		if (axis < rank - 1) {
			await _delayMs(scaledMs(MEASURE_BETWEEN_EMITS_MS));
			counter.textContent = '0';
		}
	}
	await _delayMs(scaledMs(MEASURE_PRE_EMIT_MS));

	// Phase 2 — fade the input matrix. The result cells emerge into cleared
	// space so they don't sit on top of the input cells.
	await animate(
		beforeRoot,
		{ opacity: [1, 0] },
		{ duration: scaled(MEASURE_CELL_DIM_DURATION), ease: 'easeIn' },
	).finished;

	// Phase 3 — emit each after-cell from the counter, tied to its axis by
	// re-displaying that axis's length on the counter immediately before.
	for (let axis = 0; axis < rank; axis++) {
		counter.textContent = String(axisLengths[axis]);
		const afterRect = afterCells[axis].getBoundingClientRect();
		await emitFromPoint(afterCells[axis], afterRect, counterCx, counterCy);
		if (axis < rank - 1) await _delayMs(scaledMs(MEASURE_BETWEEN_EMITS_MS));
	}

	await _delayMs(scaledMs(MEASURE_POST_HOLD_MS));
	await counterOutAndRemove(counter);

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

// ── rankOfMonadic ─────────────────────────────────────────────────────────
// ≢X (as the count of axes, conceptually = ≠≢X). For 1D the rank is 1; for
// 2D it's 2. Result is always a scalar.
//
// Visual: similar to shape but the counter ticks AXES, not axis lengths.
// Each tick dims an entire axis worth of cells (whole row for axis 0,
// whole column for axis 1 in a 2D). The counter advances by 1 per axis.
// After all axes are counted, emit a single after-cell from the counter.

export const rankOfMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);

	// `=` returns the count of axes — scalar = 0, vector = 1, matrix = 2,
	// rank-3 = 3, etc. One uniform gesture: counter ticks once per axis,
	// no rank ceiling. Scalars do zero ticks and the result `0` reveals.
	const rank: number = step.x.kind === 'array' ? step.x.shape.length : 0;

	const afterCells = beforeCellsOf(afterRoot);
	if (afterCells.length !== 1) return blackBox(step, beforeRoot, afterRoot);

	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	const rowRect = beforeRoot.getBoundingClientRect();
	const counterCx = rowRect.left + rowRect.width / 2;
	const counterCy = rowRect.top - COUNTER_OFFSET + COUNTER_SIZE / 2;
	const counter = createCounter(counterCx, rowRect.top - COUNTER_OFFSET);
	counter.textContent = '0';
	document.body.appendChild(counter);

	await counterIn(counter);

	// Per-axis visual: highlight a representative spine of the cells
	// participating in that axis. For any rank, the spine of axis a is
	// "the i=0 line along a" — i.e., for each axis other than a, fix
	// the coordinate to 0; let axis a's coordinate vary. That gives
	// shape[a] cells, one per major step along the axis. The same gesture
	// works for rank 1 (single tick: one cell), rank 2 (two ticks: row 0
	// spine, then col 0 spine), rank 3+ (one tick per axis).
	const beforeCells = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
	for (let axis = 0; axis < rank; axis++) {
		if (step.x.kind === 'array') {
			const shape = step.x.shape;
			const strides = new Array<number>(shape.length).fill(1);
			for (let k = shape.length - 2; k >= 0; k--) {
				strides[k] = strides[k + 1] * shape[k + 1];
			}
			const spine: HTMLElement[] = [];
			for (let i = 0; i < shape[axis]; i++) {
				// Fix all axes ≠ `axis` to 0; the only varying coordinate
				// is `axis = i`. Flat index = i * strides[axis].
				const cell = beforeCells[i * strides[axis]];
				if (cell) spine.push(cell);
			}
			await pulseAxisCells(spine);
		}
		await tickCounter(counter, String(axis + 1));
		if (axis < rank - 1) await _delayMs(scaledMs(MEASURE_TICK_BETWEEN_MS));
	}
	await _delayMs(scaledMs(MEASURE_PRE_EMIT_MS));

	// Fade the input before emitting so the result doesn't sit on top of it.
	await animate(
		beforeRoot,
		{ opacity: [1, 0] },
		{ duration: scaled(MEASURE_CELL_DIM_DURATION), ease: 'easeIn' },
	).finished;

	const afterRect = afterCells[0].getBoundingClientRect();
	await emitFromPoint(afterCells[0], afterRect, counterCx, counterCy);

	await _delayMs(scaledMs(MEASURE_POST_HOLD_MS));
	await counterOutAndRemove(counter);

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

// ── pairDyadic ────────────────────────────────────────────────────────────
// W⋈X — pair two values into a length-2 array. In the harness this is
// reached via `bind-left` (W⊸⋈), so X is on stage as the current value and
// W is the bound scalar.
//
// Visual: W slides in from off-screen LEFT (bind-left → comes from the left
// of the row) directly to its final post-commit slot. In parallel, X glides
// from its current centred position to its final slot to the right of W.
// No hover, no overlap mid-flight — the gesture is one continuous "W joins
// X from the left to form a pair."
//
// Falls through to blackBox when either side is not a scalar — a non-scalar
// X would produce a nested ⟨W, ⟨a b c⟩⟩ output the harness can't render.

const PAIR_OFFSCREEN_OFFSET_PX = 120;
const PAIR_BAR_WIDTH = 24;
const PAIR_SETTLE_DURATION = 0.5;
const PAIR_POST_HOLD_MS = 220;

// Build a single-bar W ghost matching the harness's makeBar() style. Width
// is fixed at PAIR_BAR_WIDTH (a single bar slot) so the ghost reads as a
// single value, not as a row.
function createWGhost(value: number): HTMLElement {
	const ghost = document.createElement('div');
	const color = value < 0 ? '#f76a6a' : '#7c6af7';
	const h = Math.min(140, Math.abs(value) * 8 + 18);
	Object.assign(ghost.style, {
		position: 'fixed',
		left: '0px',
		top: '0px',
		width: `${PAIR_BAR_WIDTH}px`,
		height: `${h}px`,
		background: color,
		borderRadius: '3px',
		boxShadow: '0 0 12px rgba(124, 106, 247, 0.4)',
		transform: 'translate(-50%, -50%)',
		opacity: '0',
		zIndex: '10',
		pointerEvents: 'none',
		display: 'grid',
		placeItems: 'start center',
		paddingTop: '0.18rem',
	});
	const num = document.createElement('span');
	Object.assign(num.style, {
		color: '#f0fff0',
		fontSize: '0.85rem',
		fontWeight: '600',
		textShadow: '0 0 4px rgba(0, 0, 0, 0.6)',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		lineHeight: '1',
	});
	num.textContent = String(value);
	ghost.appendChild(num);
	return ghost;
}

export const pairDyadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
	// Only scalar+scalar — the renderable case for our length-2 row output.
	if (step.w.kind !== 'number' || step.x.kind !== 'number') {
		return blackBox(step, beforeRoot, afterRoot);
	}

	const afterCells = beforeCellsOf(afterRoot);
	if (afterCells.length !== 2) return blackBox(step, beforeRoot, afterRoot);

	const xRect = beforeRoot.getBoundingClientRect();
	const afterRectW = afterCells[0].getBoundingClientRect();
	const afterRectX = afterCells[1].getBoundingClientRect();

	const wTargetCx = afterRectW.left + afterRectW.width / 2;
	const wTargetCy = afterRectW.top + afterRectW.height / 2;
	const xTargetCx = afterRectX.left + afterRectX.width / 2;
	const xTargetCy = afterRectX.top + afterRectX.height / 2;
	const xCx = xRect.left + xRect.width / 2;
	const xCy = xRect.top + xRect.height / 2;

	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';
	for (const cell of afterCells) cell.style.visibility = 'hidden';

	beforeRoot.style.position = beforeRoot.style.position || 'relative';
	beforeRoot.style.zIndex = '5';

	// Spawn the ghost at the OFF-LEFT origin (well to the left of W's final
	// slot), invisible. Then in one motion: ghost fades in and slides right
	// to its final slot; X glides from centre to its final slot. They arrive
	// together as the length-2 pair.
	const wStartCx = wTargetCx - PAIR_OFFSCREEN_OFFSET_PX;
	const wStartCy = wTargetCy;

	const wGhost = createWGhost(step.w.value);
	document.body.appendChild(wGhost);

	const moveTasks: Promise<unknown>[] = [];
	moveTasks.push(
		animate(
			wGhost,
			{
				opacity: [0, 1, 1],
				left: [`${wStartCx}px`, `${wTargetCx}px`],
				top: [`${wStartCy}px`, `${wTargetCy}px`],
			},
			{ duration: scaled(PAIR_SETTLE_DURATION), ease: [0.22, 1, 0.36, 1] },
		).finished,
	);
	moveTasks.push(
		animate(
			beforeRoot,
			{ x: xTargetCx - xCx, y: xTargetCy - xCy },
			{ duration: scaled(PAIR_SETTLE_DURATION), ease: [0.22, 1, 0.36, 1] },
		).finished,
	);

	await Promise.all(moveTasks);
	await _delayMs(scaledMs(PAIR_POST_HOLD_MS));

	// Reveal the after-cells (they sit exactly under the ghost and the
	// translated X) and tear down. Pixel-exact handoff — ghost-at-target
	// rect equals afterCells[0] rect by construction.
	for (const cell of afterCells) cell.style.visibility = '';
	wGhost.remove();
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};
