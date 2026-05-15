import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
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
	const beforeCells = beforeCellsOf(beforeRoot);
	const afterCells = beforeCellsOf(afterRoot);
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

	// Phase 4: the box and remaining contents fade out. We fade the
	// dimmed (non-survivor) cells individually rather than beforeRoot
	// itself — the survivors are STILL children of beforeRoot at this
	// point, and a parent-level opacity tween would drag them along.
	// Each dimmed cell drops from 0.22 (its phase-1 dim) to 0.
	const fadeTasks: Promise<unknown>[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		if (survivorSet.has(i)) continue;
		fadeTasks.push(
			animate(
				beforeCells[i],
				{ opacity: [0.22, 0] },
				{ duration: scaled(EXTRACT_FADE_DURATION), ease: 'easeIn' },
			).finished,
		);
	}
	if (fadeTasks.length > 0) await Promise.all(fadeTasks);

	// Phase 5: survivors glide from their parked positions to the
	// measured afterRoot positions. The motion is computed against the
	// ORIGINAL beforeRect (translate = 0 at start of animation), so the
	// scalar `x: dx, y: dy` here eases from parkDx → dx and 0 → dy.
	// The dimmed cells' old positions are passed over during this glide
	// but are now opacity 0 — no visible rectangles share screen pixels.
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

	await _delayMs(scaledMs(EXTRACT_POST_HOLD_MS));

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
}

export const firstMonadic: AnimateStep = (step, beforeRoot, afterRoot) => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.data.length === 0) return blackBox(step, beforeRoot, afterRoot);

	const rank = step.x.shape.length;
	if (rank === 1) {
		// Single cell at index 0 survives.
		return extractRunner(step, beforeRoot, afterRoot, [0]);
	}
	if (rank === 2) {
		// First major-axis cell = entire first row. survivorIndices is
		// [0, 1, …, C-1] in row-major order.
		const C = step.x.shape[1];
		const surv: number[] = [];
		for (let c = 0; c < C; c++) surv.push(c);
		return extractRunner(step, beforeRoot, afterRoot, surv);
	}
	return blackBox(step, beforeRoot, afterRoot);
};

// ── soloMonadic ───────────────────────────────────────────────────────────
// ≍X — wrap X in a length-1 array along a new leading axis. For our render,
// solo of a scalar produces a length-1 1D row (one cell); solo of a 1D array
// produces a 1×N matrix.
//
// For the scalar case, the choreography is exactly enclose's: pulse the
// input bar, emit a single after-cell from its position. We inline the same
// gesture here instead of re-exporting enclose so the structural-family
// accent (yellow rather than magenta) and timings can diverge if we tune
// solo later — the visual stories happen to coincide today but the
// operations aren't the same primitive.
//
// For an array input solo produces a 1×N matrix. We fall through to blackBox
// rather than draw that — the grid-rendered output isn't a single emit, and
// the harness's existing distributing visuals don't generalise to "wrap
// whole row in a new outer axis."

const SOLO_PULSE_DURATION = 0.35;
const SOLO_PULSE_HOLD_MS = 80;
const SOLO_EMIT_DURATION = 0.42;
const SOLO_POST_HOLD_MS = 240;
const SOLO_FADE_DURATION = 0.28;

export const soloMonadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const afterCells = beforeCellsOf(afterRoot);
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

	// Phase 0 — pulse the scalar. Same neutral entry as enclose so the
	// "something is happening to this single value" cue is identical.
	await animate(
		beforeRoot,
		{ scale: [1, 1.15, 1] },
		{ duration: scaled(SOLO_PULSE_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;
	await _delayMs(scaledMs(SOLO_PULSE_HOLD_MS));

	// Phase 1 — single emission. The after-cell pre-offsets to the scalar's
	// viewport centre then animates back to its measured final position
	// (translate = 0). End state is no transform — pixel-exact final layout.
	const startDx = scalarCx - cellCx;
	const startDy = scalarCy - cellCy;
	cell.style.visibility = '';
	animate(
		beforeRoot,
		{ opacity: 0 },
		{ duration: scaled(SOLO_EMIT_DURATION), ease: 'linear' },
	);
	await animate(
		cell,
		{
			x: [startDx, 0],
			y: [startDy, 0],
			scale: [0.35, 1.08, 1],
			opacity: [0, 1, 1],
		},
		{ duration: scaled(SOLO_EMIT_DURATION), ease: [0.34, 1.56, 0.64, 1] },
	).finished;

	await _delayMs(scaledMs(SOLO_POST_HOLD_MS));

	// Belt-and-braces fade for the scalar — the parallel opacity animation
	// above is timed to land near 0 already; this guarantees a clean 0 at
	// the handoff moment.
	beforeRoot.style.opacity = '0';
	void SOLO_FADE_DURATION;

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
// Visual (matches the old engine's length animation):
//   1. Counter scales in above the input row's centre.
//   2. For each major-axis cell, pulse the cell(s) and tick the counter
//      — pulse and tick fire in parallel so they read as one beat.
//   3. After the last tick, all input cells fade and DROP (translate down,
//      opacity → 0). With the input gone, the area is clear.
//   4. The after-cell (the result scalar) fades in at its post-commit slot.
//      Rectangles strictly disjoint with the input throughout: the input
//      cells drop downward out of the area before the result appears.
//   5. Counter fades out.
//
// Falls through to blackBox for: non-array input, rank > 2.

const LENGTH_PULSE_DURATION = 0.3;
const LENGTH_PULSE_STAGGER_MS = 130;
const LENGTH_POST_TICKS_HOLD_MS = 220;
const LENGTH_DROP_DURATION = 0.4;
const LENGTH_DROP_DISTANCE = 30;
const LENGTH_RESULT_FADE_DURATION = 0.32;
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

	// Phase 3: all input cells fade and drop downward. Strictly disjoint
	// with the after-cell's slot — input moves AWAY from the centre, the
	// result will appear AT the centre after they're gone.
	await Promise.all(
		beforeCells.map((cell, i) =>
			animate(
				cell,
				{ opacity: [1, 0], y: [0, LENGTH_DROP_DISTANCE] },
				{
					duration: scaled(LENGTH_DROP_DURATION),
					delay: scaled(i * 0.04),
					ease: [0.4, 0, 0.6, 1],
				},
			).finished,
		),
	);
	beforeRoot.style.opacity = '0';

	// Phase 4: the result scalar fades in at its natural post-commit slot.
	// Empty space underneath, no overlap with anything.
	afterCells[0].style.visibility = '';
	await animate(
		afterCells[0],
		{ opacity: [0, 1] },
		{ duration: scaled(LENGTH_RESULT_FADE_DURATION), ease: 'easeOut' },
	).finished;

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

	// Shape works on ANY input (≢5 = ⟨⟩, ≢⟨a b c⟩ = ⟨3⟩, etc.). The motion
	// is one gesture: counter ticks once per axis; for scalars (rank 0)
	// that's zero ticks and the empty-vector result reveals.
	const axisLengths: number[] = step.x.kind === 'array' ? [...step.x.shape] : [];
	if (axisLengths.length > 2) return blackBox(step, beforeRoot, afterRoot);
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
	const beforeCells = beforeCellsOf(beforeRoot);
	for (let axis = 0; axis < rank; axis++) {
		const len = axisLengths[axis];
		if (rank === 1) {
			await pulseAxisCells(beforeCells);
			await tickCounter(counter, String(len));
			await _delayMs(scaledMs(AXIS_PULSE_HOLD_MS));
		} else if (rank === 2 && step.x.kind === 'array' && step.x.shape.length === 2) {
			const C = step.x.shape[1];
			const R = step.x.shape[0];
			for (let i = 0; i < len; i++) {
				const groupCells: HTMLElement[] = [];
				if (axis === 0) {
					for (let c = 0; c < C; c++) groupCells.push(beforeCells[i * C + c]);
				} else {
					for (let r = 0; r < R; r++) groupCells.push(beforeCells[r * C + i]);
				}
				await pulseAxisCells(groupCells);
				await tickCounter(counter, String(i + 1));
				if (i < len - 1) await _delayMs(scaledMs(AXIS_PULSE_HOLD_MS));
			}
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

	// `=` returns the count of axes — scalar = 0, vector = 1, matrix = 2.
	// One uniform gesture: counter ticks once per axis. Scalars do zero
	// ticks and the result `0` reveals. No per-rank custom branches.
	const rank: number = step.x.kind === 'array' ? step.x.shape.length : 0;
	if (rank > 2) return blackBox(step, beforeRoot, afterRoot);

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

	// Per-axis visual: highlight the cells participating in that axis as
	// the counter ticks. Deliberately per-rank — same input cells get
	// reached from different "indexing directions," which is what rank
	// measures.
	//
	//   rank 0 (scalar): 0 ticks, counter stays at "0".
	//   rank 1 vector:   one tick, pulse all cells.
	//   rank 2 matrix:   two ticks; first pulses the spine of axis 0
	//                    (one cell per row), second pulses the spine of
	//                    axis 1 (one cell per col).
	const beforeCells = beforeCellsOf(beforeRoot);
	for (let axis = 0; axis < rank; axis++) {
		if (rank === 1) {
			await pulseAxisCells(beforeCells);
		} else if (rank === 2 && step.x.kind === 'array' && step.x.shape.length === 2) {
			const R = step.x.shape[0];
			const C = step.x.shape[1];
			const spine: HTMLElement[] = [];
			if (axis === 0) {
				for (let r = 0; r < R; r++) spine.push(beforeCells[r * C]);
			} else {
				for (let c = 0; c < C; c++) spine.push(beforeCells[c]);
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
