import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import { blackBox } from './black-box.js';
import { scaled, scaledMs } from '../speed.js';

// Vertical motion family. The visual semantic is "up = keep, down = discard":
// cells that survive the operation rise (count-off badge / verdict tick) and
// settle into the post-commit row; cells that don't survive fall away.

const _delayMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Count-off intro ───────────────────────────────────────────────────────
// Shared "select the first N cells" intro used by take and drop. Lifts each
// chosen cell ~10px and pops a numbered badge above it; the per-cell delay
// makes the count read as a sequence, not a flash. Sequential staggering is
// the entire point of this intro — it's how the magnitude of N is conveyed.

const SELECT_LIFT_PX = 10;
const COUNTOFF_LIFT_DURATION = 0.32;
const COUNTOFF_LIFT_STAGGER = 0.04;
const COUNTOFF_BADGE_DURATION = 0.45;
const COUNTOFF_BADGE_DELAY_BASE = 0.12;
const COUNTOFF_BADGE_STAGGER = 0.06;

function createCountBadge(num: number): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = String(num);
	Object.assign(badge.style, {
		position: 'absolute',
		top: '-26px',
		left: '50%',
		transform: 'translate(-50%, 0) scale(0)',
		width: '22px',
		height: '22px',
		display: 'grid',
		placeItems: 'center',
		background: '#5fcc5f',
		color: '#0a0a0a',
		borderRadius: '50%',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		fontSize: '0.85rem',
		fontWeight: '700',
		opacity: '0',
		zIndex: '5',
		pointerEvents: 'none',
		boxShadow: '0 0 12px rgba(95, 204, 95, 0.55)',
	});
	return badge;
}

type CountOff = {
	badges: HTMLElement[];
	finished: Promise<void>;
};

function countOff(cells: HTMLElement[]): CountOff {
	const badges: HTMLElement[] = [];
	const tasks: Promise<unknown>[] = [];

	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];
		if (!cell.style.position) cell.style.position = 'relative';

		tasks.push(
			animate(
				cell,
				{ y: -SELECT_LIFT_PX },
				{
					duration: scaled(COUNTOFF_LIFT_DURATION),
					ease: [0.22, 1, 0.36, 1],
					delay: scaled(i * COUNTOFF_LIFT_STAGGER),
				}
			).finished
		);

		const badge = createCountBadge(i + 1);
		cell.appendChild(badge);
		badges.push(badge);

		tasks.push(
			animate(
				badge,
				{
					transform: [
						'translate(-50%, 0) scale(0)',
						'translate(-50%, 0) scale(1.2)',
						'translate(-50%, 0) scale(1)',
					],
					opacity: [0, 1, 1],
				},
				{
					duration: scaled(COUNTOFF_BADGE_DURATION),
					ease: [0.34, 1.56, 0.64, 1],
					delay: scaled(COUNTOFF_BADGE_DELAY_BASE + i * COUNTOFF_BADGE_STAGGER),
				}
			).finished
		);
	}

	return {
		badges,
		finished: Promise.all(tasks).then(() => undefined),
	};
}

const BADGE_FADE_DURATION = 0.28;

async function fadeBadges(badges: HTMLElement[]): Promise<void> {
	await Promise.all(
		badges.map(b =>
			animate(
				b,
				{ opacity: 0, transform: 'translate(-50%, -8px) scale(0.9)' },
				{ duration: scaled(BADGE_FADE_DURATION), ease: 'easeIn' }
			).finished
		)
	);
	for (const b of badges) b.remove();
}

// ── takeDyadic ────────────────────────────────────────────────────────────
// N↑X: the first N cells of X are the "kept" ones; the rest fall away. The
// count-off badge above each kept cell makes N legible. After the rest have
// dropped, the kept cells settle from their lifted position to the post-
// commit destinations (measured on afterRoot's children — pixel-exact).
//
// Pre-conditions:
//   - step is dyadic with step.w a non-negative integer.
//   - beforeRoot has step.w + (afterRoot - step.w) cells; the first N are
//     the keepers, the rest are dropped.
//   - afterRoot has N kept-cell renderings at the post-commit positions.
//
// Anything that doesn't match the expected shape falls through to blackBox.

const TAKE_DROP_DURATION = 0.7;
const TAKE_DROP_DELAY_BASE = 0.18;
const TAKE_DROP_STAGGER = 0.04;
const TAKE_DROP_PX = 38;
const TAKE_SETTLE_DURATION = 0.42;

export const takeDyadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array' || step.x.shape.length !== 1) return blackBox(step, beforeRoot, afterRoot);
	if (step.w.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const n = step.w.value;
	if (!Number.isInteger(n) || n < 0) return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (n > beforeCells.length) return blackBox(step, beforeRoot, afterRoot);
	if (afterCells.length !== n) return blackBox(step, beforeRoot, afterRoot);
	if (beforeCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	const keptCells = beforeCells.slice(0, n);
	const droppedCells = beforeCells.slice(n);

	for (const cell of beforeCells) cell.style.position = 'relative';

	// Phase 1: count-off the kept cells and drop the rest in parallel.
	const { badges, finished: introFinished } = countOff(keptCells);

	const dropTasks = droppedCells.map((cell, i) =>
		animate(
			cell,
			{ opacity: [1, 0.35, 0], y: [0, 0, TAKE_DROP_PX] },
			{
				duration: scaled(TAKE_DROP_DURATION),
				ease: [0.4, 0, 0.6, 1],
				delay: scaled(TAKE_DROP_DELAY_BASE + i * TAKE_DROP_STAGGER),
			}
		).finished
	);

	await Promise.all([introFinished, ...dropTasks]);

	// Phase 2: kept cells settle from (0, -LIFT) to the measured afterRoot
	// child position. Motion tweens from the cell's current transform so
	// the lift unwinds in the same gesture as the slide-to-destination.
	const settleTasks: Promise<unknown>[] = [];
	for (let i = 0; i < n; i++) {
		const cell = keptCells[i];
		const before = beforeRects[i];
		const after = afterRects[i];
		const dx = after.left - before.left;
		const dy = after.top - before.top;
		settleTasks.push(
			animate(
				cell,
				{ x: dx, y: dy },
				{ duration: scaled(TAKE_SETTLE_DURATION), ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);

	await fadeBadges(badges);

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

// ── dropDyadic ────────────────────────────────────────────────────────────
// N↓X: the first N cells are the "dropped" ones; the survivors slide left
// to fill the gap. Mirror of take: the count-off badges land on the cells
// that are about to vanish, then those cells fall with their badges still
// attached. Survivors then settle to the measured post-commit destinations.

const DROP_FALL_DURATION = 0.55;
const DROP_FALL_STAGGER = 0.04;
const DROP_FALL_PX = 60;
const DROP_SETTLE_DURATION = 0.42;

export const dropDyadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array' || step.x.shape.length !== 1) return blackBox(step, beforeRoot, afterRoot);
	if (step.w.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);

	const n = step.w.value;
	if (!Number.isInteger(n) || n < 0) return blackBox(step, beforeRoot, afterRoot);

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (n > beforeCells.length) return blackBox(step, beforeRoot, afterRoot);
	const survivorCount = beforeCells.length - n;
	if (afterCells.length !== survivorCount) return blackBox(step, beforeRoot, afterRoot);
	if (beforeCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	const droppedCells = beforeCells.slice(0, n);
	const survivorCells = beforeCells.slice(n);

	for (const cell of beforeCells) cell.style.position = 'relative';

	// Phase 1: count-off the dropped cells (lift + numbered badges).
	const { finished: introFinished } = countOff(droppedCells);
	await introFinished;

	// Phase 2: dropped cells fall. They're currently at y = -SELECT_LIFT_PX
	// (the count-off lift), so the keyframes hold there briefly, then plunge.
	const fallTasks = droppedCells.map((cell, i) =>
		animate(
			cell,
			{ opacity: [1, 0.5, 0], y: [-SELECT_LIFT_PX, -SELECT_LIFT_PX, DROP_FALL_PX] },
			{
				duration: scaled(DROP_FALL_DURATION),
				ease: [0.5, 0, 0.7, 1],
				delay: scaled(i * DROP_FALL_STAGGER),
			}
		).finished
	);
	await Promise.all(fallTasks);

	// Phase 3: survivors slide from their natural positions to the measured
	// afterRoot child positions.
	const settleTasks: Promise<unknown>[] = [];
	for (let i = 0; i < survivorCells.length; i++) {
		const cell = survivorCells[i];
		const before = beforeRects[n + i];
		const after = afterRects[i];
		const dx = after.left - before.left;
		const dy = after.top - before.top;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
		settleTasks.push(
			animate(
				cell,
				{ x: dx, y: dy },
				{ duration: scaled(DROP_SETTLE_DURATION), ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};

// ── filterDyadic ──────────────────────────────────────────────────────────
// M/X: each cell of X gets a predicate badge ("M=1" / "M=0") matching its
// mask entry, the badges flip into a verdict mark (✓ for pass, ✗ for fail),
// fails drop with their badges, and passes slide to the measured post-commit
// destinations.
//
// TODO: clarify — wired against the 'select' FnExpr kind because there is
// no 'replicate' kind in the current model; "filter" in BQN is M/X which is
// not the same operation as ⊏ (select / pick-by-index). The naming is muddy
// at the FnExpr level; that is tracked separately.

const FILTER_BADGE_DURATION = 0.4;
const FILTER_BADGE_STAGGER = 0.04;
const FILTER_PRE_HOLD_MS = 240;
const FILTER_FLIP_DURATION = 0.3;
const FILTER_FLIP_STAGGER = 0.06;
const FILTER_VERDICT_HOLD_MS = 280;
const FILTER_DROP_DURATION = 0.6;
const FILTER_DROP_PX = 38;
const FILTER_SETTLE_DURATION = 0.42;

function createFilterBadge(text: string): HTMLElement {
	const badge = document.createElement('div');
	badge.textContent = text;
	Object.assign(badge.style, {
		position: 'absolute',
		top: '-30px',
		left: '50%',
		transform: 'translate(-50%, 0) scale(0)',
		opacity: '0',
		padding: '0.18rem 0.5rem',
		background: '#5fcc5f',
		color: '#0a0a0a',
		borderRadius: '12px',
		fontFamily: "'BQN386', ui-monospace, monospace",
		fontSize: '0.85rem',
		fontWeight: '700',
		lineHeight: '1',
		zIndex: '5',
		pointerEvents: 'none',
		boxShadow: '0 0 10px rgba(95, 204, 95, 0.55)',
		whiteSpace: 'nowrap',
	});
	return badge;
}

export const filterDyadic: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	if (step.kind !== 'dyadic') return blackBox(step, beforeRoot, afterRoot);
	if (step.x.kind !== 'array' || step.x.shape.length !== 1) return blackBox(step, beforeRoot, afterRoot);
	if (step.w.kind !== 'array' || step.w.shape.length !== 1) return blackBox(step, beforeRoot, afterRoot);
	if (step.w.data.length !== step.x.data.length) return blackBox(step, beforeRoot, afterRoot);

	const mask: number[] = [];
	for (const m of step.w.data) {
		if (m.kind !== 'number') return blackBox(step, beforeRoot, afterRoot);
		if (m.value !== 0 && m.value !== 1) return blackBox(step, beforeRoot, afterRoot);
		mask.push(m.value);
	}

	const beforeCells = Array.from(beforeRoot.children) as HTMLElement[];
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	if (beforeCells.length !== mask.length) return blackBox(step, beforeRoot, afterRoot);

	const passCount = mask.reduce((a, b) => a + b, 0);
	if (afterCells.length !== passCount) return blackBox(step, beforeRoot, afterRoot);

	if (beforeCells.length === 0) {
		afterRoot.style.opacity = '';
		return;
	}

	const beforeRects = beforeCells.map(c => c.getBoundingClientRect());
	const afterRects = afterCells.map(c => c.getBoundingClientRect());

	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';
	afterRoot.style.pointerEvents = 'none';

	for (const cell of beforeCells) cell.style.position = 'relative';

	// Phase 1: a predicate badge ("M=1" / "M=0") above every cell, scaled in
	// with a staggered delay so the row reads as a sequence.
	const badges: HTMLElement[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		const text = mask[i] === 1 ? 'M=1' : 'M=0';
		const badge = createFilterBadge(text);
		beforeCells[i].appendChild(badge);
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
					duration: scaled(FILTER_BADGE_DURATION),
					ease: [0.34, 1.56, 0.64, 1],
					delay: scaled(i * FILTER_BADGE_STAGGER),
				}
			).finished
		)
	);
	await _delayMs(scaledMs(FILTER_PRE_HOLD_MS));

	// Phase 2: each badge pulses and flips to its verdict (✓ pass / ✗ fail).
	// Failers recolour red — the colour carries the verdict for users who
	// can't easily distinguish the two glyphs at small sizes.
	await Promise.all(
		badges.map(async (b, i) => {
			const passes = mask[i] === 1;
			await animate(
				b,
				{ scale: [1, 1.35, 1] },
				{
					duration: scaled(FILTER_FLIP_DURATION),
					ease: [0.34, 1.56, 0.64, 1],
					delay: scaled(i * FILTER_FLIP_STAGGER),
				}
			).finished;
			b.textContent = passes ? '✓' : '✗';
			if (!passes) {
				b.style.background = '#e25555';
				b.style.boxShadow = '0 0 12px rgba(226, 85, 85, 0.55)';
			}
		})
	);
	await _delayMs(scaledMs(FILTER_VERDICT_HOLD_MS));

	// Phase 3: failing cells fall. Badges fall with them — they're children.
	const dropTasks: Promise<unknown>[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		if (mask[i] === 1) continue;
		dropTasks.push(
			animate(
				beforeCells[i],
				{ opacity: [1, 0.4, 0], y: [0, 0, FILTER_DROP_PX] },
				{ duration: scaled(FILTER_DROP_DURATION), ease: [0.4, 0, 0.6, 1] }
			).finished
		);
	}
	await Promise.all(dropTasks);

	// Phase 4: passing cells slide from their natural positions to the
	// measured afterRoot child positions. Pass-index k counts only passers
	// so afterRects[k] is the destination for the k-th pass.
	const settleTasks: Promise<unknown>[] = [];
	let k = 0;
	for (let i = 0; i < beforeCells.length; i++) {
		if (mask[i] !== 1) continue;
		const before = beforeRects[i];
		const after = afterRects[k];
		k++;
		const dx = after.left - before.left;
		const dy = after.top - before.top;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
		settleTasks.push(
			animate(
				beforeCells[i],
				{ x: dx, y: dy },
				{ duration: scaled(FILTER_SETTLE_DURATION), ease: [0.22, 1, 0.36, 1] }
			).finished
		);
	}
	await Promise.all(settleTasks);

	// Phase 5: fade the surviving badges (the failers' badges fell with
	// them and are about to be removed with beforeRoot).
	const survivingBadges: HTMLElement[] = [];
	for (let i = 0; i < beforeCells.length; i++) {
		if (mask[i] === 1) survivingBadges.push(badges[i]);
	}
	await fadeBadges(survivingBadges);

	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.pointerEvents = '';
	beforeRoot.style.opacity = '0';
};
