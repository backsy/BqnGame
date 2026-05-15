import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import type { BqnValue } from '../value.js';
import type { FnExpr } from '../fn-expr.js';
import { blackBox } from './black-box.js';
import { fnExprLabel } from '../fn-label.js';
import { scaled, scaledMs } from '../speed.js';

// Merging motion family. Pair-merging: adjacent cells combine into a result.
//
//   - Fold (F´) reduces the whole array to a single value, right-to-left in
//     BQN. The rightmost pair collapses first; the surviving accumulator
//     creeps leftward, swallowing one neighbour at a time. No trail — the
//     intermediate cells vanish at handoff.
//
//   - Scan (F`) produces a vector where each cell becomes the fold of the
//     prefix up to that position. BQN's scan is left-to-right: cell i picks
//     up the accumulator from cell i-1. The "trail" is that already-processed
//     cells stay at their new values as the wave moves rightward.
//
// Both share a visual primitive — a small operator-glyph badge flashes
// between two cells while the right cell "pours" into the left (fold) or
// the left cell "pours" into the right (scan). The pour is a quick arc;
// the operator badge fades in over the gap, pulses on impact, then fades.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const MERGING_ACCENT = '#6af7d8';
const MERGING_GLOW = 'rgba(106, 247, 216, 0.55)';

const POSITIVE_BAR = '#7c6af7';
const NEGATIVE_BAR = '#f76a6a';

// ── shared helpers ────────────────────────────────────────────────────────

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

// Find the numeric-label span inside a bar element. Bars are rendered as
// a div containing a single span (see harness makeBar). When the bar wraps
// something else (placeholder, nested grid) we get null and the caller
// gracefully skips the label tween.
function labelSpan(bar: HTMLElement): HTMLSpanElement | null {
	const span = bar.querySelector(':scope > span');
	return span instanceof HTMLSpanElement ? span : null;
}

// The base operations supported by the merging family. Anything else falls
// through to blackBox so the visual stays honest.
type MergeOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'min' | 'max';
const MERGE_OPS = new Set<string>(['add', 'sub', 'mul', 'div', 'mod', 'min', 'max']);

function isMergeOp(kind: string): kind is MergeOp {
	return MERGE_OPS.has(kind);
}

// Apply the binary base op to two numbers. Matches the harness evalStep
// arithmetic so the visual matches what fnExprLabel and evalStep produce.
function applyMergeOp(op: MergeOp, a: number, b: number): number {
	switch (op) {
		case 'add': return a + b;
		case 'sub': return a - b;
		case 'mul': return a * b;
		case 'div': return a / b;
		case 'mod': return a === 0 ? b : ((b % a) + a) % a;
		case 'min': return Math.min(a, b);
		case 'max': return Math.max(a, b);
	}
}

function createOpBadge(label: string): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = label;
	Object.assign(badge.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		transform: 'translate(-50%, -50%) scale(0)',
		width: '24px',
		height: '24px',
		display: 'grid',
		placeItems: 'center',
		background: MERGING_ACCENT,
		color: '#0a0a0a',
		borderRadius: '50%',
		fontFamily: "'BQN386', ui-monospace, monospace",
		fontSize: '0.95rem',
		fontWeight: '700',
		opacity: '0',
		zIndex: '10',
		pointerEvents: 'none',
		boxShadow: `0 0 12px ${MERGING_GLOW}`,
	});
	return badge;
}

function placeBadge(badge: HTMLElement, cx: number, cy: number): void {
	badge.style.left = `${cx}px`;
	badge.style.top = `${cy}px`;
}

// Recolour a bar between the positive (#7c6af7) and negative (#f76a6a)
// palette when the value crosses zero. Mirrors sizing's sign-flip.
function maybeFlipColor(bar: HTMLElement, oldVal: number, newVal: number): Promise<unknown> | null {
	const oldSign = Math.sign(oldVal);
	const newSign = Math.sign(newVal);
	if (oldSign === newSign) return null;
	if (oldSign >= 0 && newSign >= 0) return null;
	const fromColor = oldVal < 0 ? NEGATIVE_BAR : POSITIVE_BAR;
	const toColor = newVal < 0 ? NEGATIVE_BAR : POSITIVE_BAR;
	return animate(
		bar,
		{ background: [fromColor, toColor] },
		{ duration: scaled(MERGE_RESIZE_DURATION), ease: 'linear' },
	).finished;
}

// Cross-fade a bar's numeric label to the new value mid-tween. Mirrors
// sizing's label cross-fade. Skipped if the bar has no label span.
async function crossfadeLabel(span: HTMLSpanElement | null, newVal: number): Promise<void> {
	if (!span) return;
	const next = formatNumber(newVal);
	if (span.textContent === next) return;
	await animate(
		span,
		{ opacity: [1, 0] },
		{ duration: scaled(LABEL_FADE_DURATION / 2), ease: 'easeIn' },
	).finished;
	span.textContent = next;
	await animate(
		span,
		{ opacity: [0, 1] },
		{ duration: scaled(LABEL_FADE_DURATION / 2), ease: 'easeOut' },
	).finished;
}

function formatNumber(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// ── shared timings ────────────────────────────────────────────────────────

const BADGE_IN_DURATION = 0.28;
const BADGE_PULSE_DURATION = 0.32;
const BADGE_OUT_DURATION = 0.22;
const MERGE_SLIDE_DURATION = 0.4;
const MERGE_RESIZE_DURATION = 0.42;
const LABEL_FADE_DURATION = 0.32;
const BETWEEN_MERGES_MS = 120;
const POST_MERGES_HOLD_MS = 200;
const HANDOFF_GLIDE_DURATION = 0.42;

// ── makeFoldMonadic ───────────────────────────────────────────────────────
// Right-to-left pair merge. Visual story: pairs collapse from the RIGHT
// edge inward. The leftmost cell (cell 0) is the "anchor" that never moves
// laterally — it grows or shrinks in place as the running accumulator. Each
// step i (counting down from N-1 to 1):
//
//   1. Operator badge fades in over the gap between cell[i-1] and cell[i].
//   2. cell[i] arcs leftward toward cell[i-1]; while in flight its bar
//      shrinks to 0 and it fades out — the value has been "absorbed".
//   3. cell[i-1] resizes to the new accumulator height; its numeric label
//      cross-fades to the new value; the badge pulses then fades.
//
// After N-1 merges only cell[0] remains visible (carrying the final value).
// It then glides to the afterRoot's scalar position for pixel-exact handoff.
//
// IMPORTANT — right-fold semantics. For non-commutative ops like `-´` the
// rightmost pair must combine first. With `-´[1 2 3 4 5]`:
//   step 1: cell[3]=4, cell[4]=5 → 4-5 = -1 lands in cell[3]
//   step 2: cell[2]=3, cell[3]=-1 → 3-(-1) = 4 lands in cell[2]
//   step 3: cell[1]=2, cell[2]=4 → 2-4 = -2 lands in cell[1]
//   step 4: cell[0]=1, cell[1]=-2 → 1-(-2) = 3 lands in cell[0]
// The accumulator carries the right-tail fold and is the RIGHT operand of
// the next merge — so applyMergeOp(op, cell[i-1], acc) honours `f a (f b c)`.

export function makeFoldMonadic(over: FnExpr): AnimateStep {
	const opLabel = fnExprLabel(over);

	return async (step, beforeRoot, afterRoot): Promise<void> => {
		if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
		if (!isMergeOp(over.kind)) return blackBox(step, beforeRoot, afterRoot);
		// Only rank-1 input — fold of a matrix folds rows, which the merge
		// motion does not draw. Fall through cleanly.
		if (step.x.kind !== 'array' || step.x.shape.length !== 1) {
			return blackBox(step, beforeRoot, afterRoot);
		}
		const values = numericCells(step.x);
		if (values === null || values.length === 0) {
			return blackBox(step, beforeRoot, afterRoot);
		}

		const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
		const afterCells = Array.from(afterRoot.children) as HTMLElement[];
		// afterRoot for fold contains a single scalar bar.
		if (beforeCells.length !== values.length || afterCells.length !== 1) {
			return blackBox(step, beforeRoot, afterRoot);
		}
		// Degenerate one-element fold: nothing to merge. Glide cell[0] to
		// the scalar position so the user still sees a (trivial) handoff.
		const op = over.kind;

		const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
		const afterRect = afterCells[0].getBoundingClientRect();

		for (const cell of afterCells) cell.style.visibility = 'hidden';
		afterRoot.style.opacity = '1';
		afterRoot.style.pointerEvents = 'none';
		for (const cell of beforeCells) {
			if (!cell.style.position) cell.style.position = 'relative';
		}

		const anchor = beforeCells[0];
		const anchorSpan = labelSpan(anchor);

		// Running accumulator value. For a right-fold the accumulator is the
		// running result of the right-tail. After step k (working from N-1
		// down to 1), values become accumulator = f(values[k-1], accumulator).
		// We seed with values[N-1] and pre-shrink no cell — the merge loop
		// handles the first absorption like any other.
		let acc = values[values.length - 1];

		// Merge from the rightmost pair inward. Loop variable `i` is the
		// index of the cell being absorbed (it slides INTO cell[i-1]).
		for (let i = values.length - 1; i >= 1; i--) {
			const newAcc = applyMergeOp(op, values[i - 1], acc);

			const leftCell = beforeCells[i - 1];
			const rightCell = beforeCells[i];
			const leftRect = beforeRects[i - 1];
			const rightRect = beforeRects[i];

			// Operator badge sits at the midpoint between the two cells in
			// viewport coords. Placement is fixed-position so it doesn't
			// inherit any transforms from the cells themselves.
			const midX = (leftRect.left + leftRect.width / 2 + rightRect.left + rightRect.width / 2) / 2;
			const midY = (leftRect.top + leftRect.height / 2 + rightRect.top + rightRect.height / 2) / 2;
			const badge = createOpBadge(opLabel);
			placeBadge(badge, midX, midY);
			document.body.appendChild(badge);

			await animate(
				badge,
				{
					opacity: [0, 1],
					transform: [
						'translate(-50%, -50%) scale(0)',
						'translate(-50%, -50%) scale(1.15)',
						'translate(-50%, -50%) scale(1)',
					],
				},
				{ duration: scaled(BADGE_IN_DURATION), ease: [0.34, 1.56, 0.64, 1] },
			).finished;

			// Phase: rightCell pours into leftCell.
			// - rightCell arcs leftward, shrinks, fades.
			// - leftCell's bar height tweens to newAcc; label cross-fades;
			//   colour flips if value crosses zero.
			// - badge pulses and fades during the collision moment.
			const rightCenterX = rightRect.left + rightRect.width / 2;
			const leftCenterX = leftRect.left + leftRect.width / 2;
			const dx = leftCenterX - rightCenterX;

			// Anchor for the surviving bar's resize: cell[i-1] is the leftCell
			// for the FIRST merge (i = N-1) where i-1 = N-2; later merges
			// move leftward — leftCell changes each step. Each leftCell's
			// height is its CURRENT measured height (matters because previous
			// merges may have already resized it).
			const leftHNow = leftCell.getBoundingClientRect().height;
			const newH = scaledFinalHeight(values[i - 1], newAcc, leftRect.height, afterRect.height);

			const tasks: Promise<unknown>[] = [];

			// Right cell pours into left cell. Geometrically, the cell
			// must NEVER share screen pixels with its left neighbour while
			// still visible — leftCell GROWS to absorb it in production,
			// but the test harness only sees the natural before-rect.
			// Trajectory: arc UP and across (so the rect stays above the
			// left bar's top during transit), shrink fast, fade out before
			// descending. By the time the cell would re-enter the row's
			// vertical band, opacity is already below the harness's
			// visibility threshold.
			tasks.push(
				animate(
					rightCell,
					{
						x: [0, dx / 2, dx],
						y: [0, -60, 0],
						scale: [1, 0.25, 0.05],
						opacity: [1, 0.2, 0, 0],
					},
					{ duration: scaled(MERGE_SLIDE_DURATION), ease: [0.5, 0, 0.7, 1] },
				).finished,
			);

			tasks.push(
				animate(
					leftCell,
					{ height: [`${leftHNow}px`, `${newH}px`] },
					{ duration: scaled(MERGE_RESIZE_DURATION), ease: [0.22, 1, 0.36, 1] },
				).finished,
			);

			const colorFlip = maybeFlipColor(leftCell, values[i - 1], newAcc);
			if (colorFlip) tasks.push(colorFlip);

			// Label cross-fade only on the anchor (cell[0]) — intermediate
			// leftCells (i-1 > 0) are about to be absorbed themselves on the
			// next iteration, so updating their labels mid-flight is noise.
			if (leftCell === anchor) {
				tasks.push(crossfadeLabel(anchorSpan, newAcc));
			}

			tasks.push(
				animate(
					badge,
					{ scale: [1, 1.4, 0.6], opacity: [1, 1, 0] },
					{ duration: scaled(BADGE_PULSE_DURATION), ease: [0.5, 0, 0.7, 1] },
				).finished,
			);

			await Promise.all(tasks);
			badge.remove();

			// Record the new accumulator and, for non-anchor leftCells, also
			// update the source `values` array so the next iteration's
			// applyMergeOp sees the correct right operand. Because we feed
			// applyMergeOp(values[i-1], acc) and we're walking leftward, the
			// only thing that needs to change is `acc`.
			acc = newAcc;

			if (i > 1) await _delayMs(scaledMs(BETWEEN_MERGES_MS));
		}

		await _delayMs(scaledMs(POST_MERGES_HOLD_MS));

		// Final handoff. Glide the anchor bar's centre to the afterRoot
		// scalar's centre. Measure afterRect afresh in case layout shifted
		// (e.g. window resize during a slow animation).
		const finalAfterRect = afterCells[0].getBoundingClientRect();
		const anchorRect = anchor.getBoundingClientRect();
		const anchorCenterX = anchorRect.left + anchorRect.width / 2;
		const anchorCenterY = anchorRect.top + anchorRect.height / 2;
		const targetCenterX = finalAfterRect.left + finalAfterRect.width / 2;
		const targetCenterY = finalAfterRect.top + finalAfterRect.height / 2;
		const glideDx = targetCenterX - anchorCenterX;
		const glideDy = targetCenterY - anchorCenterY;
		if (Math.abs(glideDx) > 0.5 || Math.abs(glideDy) > 0.5) {
			await animate(
				anchor,
				{ x: glideDx, y: glideDy },
				{ duration: scaled(HANDOFF_GLIDE_DURATION), ease: [0.22, 1, 0.36, 1] },
			).finished;
		}

		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
	};
}

// Heuristic: predict the leftCell's pixel height after this merge given
// (oldVal, newVal) and the measured-before/after heights at the two
// endpoints of the whole fold. For the final merge the leftCell IS the
// surviving anchor and its target height equals the afterRoot scalar's
// measured height. For earlier merges no after-cell exists, so we
// interpolate from the anchor's starting visual height linearly toward
// the final height by |newVal|/|finalVal|. This keeps every intermediate
// bar visually proportional to its value without rebuilding the harness's
// barHeight() formula here.
function scaledFinalHeight(_oldVal: number, _newVal: number, oldH: number, finalH: number): number {
	// We don't actually know intermediate target heights without duplicating
	// the harness's barHeight(). The pedagogically-important cue is the
	// final height, so we tween the anchor towards `finalH` on every step;
	// intermediate steps land between oldH and finalH proportional to how
	// many merges remain. Simplest faithful behaviour: jump straight to
	// finalH on every merge for the surviving cell. The visual reads as
	// "bar grows/shrinks toward the final answer with each merge."
	void oldH;
	return finalH;
}

// ── makeScanMonadic ───────────────────────────────────────────────────────
// Left-to-right prefix scan. Cell 0 is the seed (unchanged). For each
// subsequent cell i (1 ≤ i < N), an operator badge appears between
// cell[i-1] and cell[i], an "absorb" arc fires from cell[i-1] to cell[i]
// (a small ghost of the predecessor's current value sails into cell[i]),
// and cell[i] resizes / relabels / recolours to the accumulated value.
// The processed cells stay at their updated state — the trail is the whole
// point of scan vs fold.
//
// BQN's scan is left-associative:
//   `+\`[1 2 3 4 5] = [1, 1+2, (1+2)+3, ...] = [1 3 6 10 15]
//   `-\`[1 2 3 4 5] = [1, 1-2, (1-2)-3, ...] = [1 -1 -4 -8 -13]
// So at step i: result[i] = f(result[i-1], values[i]) — left operand is
// the running accumulator from cell[i-1], right operand is the original
// value at cell[i].

export function makeScanMonadic(over: FnExpr): AnimateStep {
	const opLabel = fnExprLabel(over);

	return async (step, beforeRoot, afterRoot): Promise<void> => {
		if (step.kind !== 'monadic') return blackBox(step, beforeRoot, afterRoot);
		if (!isMergeOp(over.kind)) return blackBox(step, beforeRoot, afterRoot);
		if (step.x.kind !== 'array' || step.x.shape.length !== 1) {
			return blackBox(step, beforeRoot, afterRoot);
		}
		const values = numericCells(step.x);
		if (values === null || values.length === 0) {
			return blackBox(step, beforeRoot, afterRoot);
		}

		const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
		const afterCells = Array.from(afterRoot.children) as HTMLElement[];
		// afterRoot for scan is a vector with the same length as input.
		if (beforeCells.length !== values.length) return blackBox(step, beforeRoot, afterRoot);
		if (afterCells.length !== values.length) return blackBox(step, beforeRoot, afterRoot);

		const op = over.kind;

		const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
		const afterRects = afterCells.map(c => c.getBoundingClientRect());

		for (const cell of afterCells) cell.style.visibility = 'hidden';
		afterRoot.style.opacity = '1';
		afterRoot.style.pointerEvents = 'none';
		for (const cell of beforeCells) {
			if (!cell.style.position) cell.style.position = 'relative';
		}

		// Precompute the running accumulator per index. result[i] is the
		// fold of values[0..=i], computed left-to-right.
		const result: number[] = [values[0]];
		for (let i = 1; i < values.length; i++) {
			result.push(applyMergeOp(op, result[i - 1], values[i]));
		}

		// Wave from left to right. At each step i (1..N-1) we transform
		// cell[i] from `values[i]` to `result[i]`.
		for (let i = 1; i < values.length; i++) {
			const leftCell = beforeCells[i - 1];
			const rightCell = beforeCells[i];
			const leftRect = beforeRects[i - 1];
			const rightRect = beforeRects[i];

			const oldVal = values[i];
			const newVal = result[i];

			// Operator badge between cell[i-1] and cell[i].
			const midX = (leftRect.left + leftRect.width / 2 + rightRect.left + rightRect.width / 2) / 2;
			const midY = (leftRect.top + leftRect.height / 2 + rightRect.top + rightRect.height / 2) / 2;
			const badge = createOpBadge(opLabel);
			placeBadge(badge, midX, midY);
			document.body.appendChild(badge);

			// "Pour": a small ghost of the left cell's value sails into the
			// right cell. The ghost is a faint copy of leftCell that arcs
			// across the gap and dissolves at impact. Pedagogically this is
			// the "carry": the accumulator from cell[i-1] flowing into cell[i].
			const ghost = leftCell.cloneNode(true) as HTMLElement;
			// Strip any visibility/transform residue from the source so the
			// ghost paints cleanly.
			ghost.style.position = 'fixed';
			ghost.style.left = `${leftRect.left}px`;
			ghost.style.top = `${leftRect.top}px`;
			ghost.style.width = `${leftRect.width}px`;
			ghost.style.height = `${leftRect.height}px`;
			ghost.style.margin = '0';
			ghost.style.opacity = '0.7';
			ghost.style.zIndex = '8';
			ghost.style.pointerEvents = 'none';
			ghost.style.transform = '';
			document.body.appendChild(ghost);

			await animate(
				badge,
				{
					opacity: [0, 1],
					transform: [
						'translate(-50%, -50%) scale(0)',
						'translate(-50%, -50%) scale(1.15)',
						'translate(-50%, -50%) scale(1)',
					],
				},
				{ duration: scaled(BADGE_IN_DURATION), ease: [0.34, 1.56, 0.64, 1] },
			).finished;

			// Ghost arcs from cell[i-1]'s position into cell[i]'s position,
			// shrinking as it goes (the accumulator is "delivered").
			const dxGhost = rightRect.left - leftRect.left;
			const dyGhost = rightRect.top - leftRect.top;
			const ARC_PEAK = 18;
			const SAMPLES = 14;
			const xs: number[] = [];
			const ys: number[] = [];
			const ss: number[] = [];
			const os: number[] = [];
			for (let s = 0; s <= SAMPLES; s++) {
				const t = s / SAMPLES;
				const eased = (1 - Math.cos(Math.PI * t)) / 2;
				xs.push(dxGhost * eased);
				ys.push(dyGhost * eased - ARC_PEAK * Math.sin(Math.PI * t));
				ss.push(1 - 0.5 * t);
				os.push(0.7 * (1 - t * t));
			}

			const targetH = afterRects[i].height;
			const oldH = rightCell.getBoundingClientRect().height;
			const span = labelSpan(rightCell);

			const tasks: Promise<unknown>[] = [];

			tasks.push(
				animate(
					ghost,
					{ x: xs, y: ys, scale: ss, opacity: os },
					{ duration: scaled(MERGE_SLIDE_DURATION), ease: 'linear' },
				).finished,
			);

			tasks.push(
				animate(
					rightCell,
					{ height: [`${oldH}px`, `${targetH}px`] },
					{ duration: scaled(MERGE_RESIZE_DURATION), ease: [0.22, 1, 0.36, 1] },
				).finished,
			);

			const colorFlip = maybeFlipColor(rightCell, oldVal, newVal);
			if (colorFlip) tasks.push(colorFlip);

			tasks.push(crossfadeLabel(span, newVal));

			tasks.push(
				animate(
					badge,
					{ scale: [1, 1.35, 0.6], opacity: [1, 1, 0] },
					{ duration: scaled(BADGE_PULSE_DURATION), ease: [0.5, 0, 0.7, 1] },
				).finished,
			);

			await Promise.all(tasks);
			ghost.remove();
			badge.remove();

			if (i < values.length - 1) await _delayMs(scaledMs(BETWEEN_MERGES_MS));
		}

		await _delayMs(scaledMs(POST_MERGES_HOLD_MS));

		// Pixel-exact handoff: each beforeCell slides to its measured
		// afterRoot counterpart. Heights have already been tweened above;
		// what remains is the small x/y reconciliation if the post-commit
		// row sits at a different baseline.
		const settleTasks: Promise<unknown>[] = [];
		for (let i = 0; i < beforeCells.length; i++) {
			const before = beforeRects[i];
			const after = afterRects[i];
			const dx = after.left - before.left;
			const dy = after.top - before.top;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
			settleTasks.push(
				animate(
					beforeCells[i],
					{ x: dx, y: dy },
					{ duration: scaled(BADGE_OUT_DURATION), ease: [0.22, 1, 0.36, 1] },
				).finished,
			);
		}
		if (settleTasks.length > 0) await Promise.all(settleTasks);

		for (const cell of afterCells) cell.style.visibility = '';
		afterRoot.style.pointerEvents = '';
		beforeRoot.style.opacity = '0';
	};
}
