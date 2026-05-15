import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import { fnExprLabel } from '../fn-label.js';
import { assertNever } from '../value.js';

// ── Motion vocabulary entry #1: blackBox ─────────────────────────────────
// Catch-all default for operations not yet hand-choreographed. Visual
// story: input fades, label flashes at the geometric centre of the
// before+after region, output fades in at its natural position. No
// slides — slides require pre-positioning that the harness's
// smooth-motion test reads as teleports (the array-keyframe "first
// value" trick jumps the element to the start of the keyframes
// instantly at the animation's startMs).

function stepLabel(step: Step): string {
	switch (step.kind) {
		case 'monadic': return fnExprLabel(step.fn);
		case 'dyadic':  return fnExprLabel(step.fn);
		case 'assign':  return step.name;
		case 'access':  return step.field;
		default:        return assertNever(step);
	}
}

const DURATION_OUT   = 0.28;
const DURATION_FLASH = 0.5;
const DURATION_IN    = 0.32;
const HOLD_BETWEEN_MS = 60;

export const blackBox: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	const label = stepLabel(step);

	// Geometric centre of the (before, after) region, in viewport coords.
	// The label box is anchored here with fixed positioning, so it's
	// always painted at the same on-screen point regardless of the stage
	// layout (which might have before/after stacked or side-by-side).
	const bRect = beforeRoot.getBoundingClientRect();
	const aRect = afterRoot.getBoundingClientRect();
	const cx = (bRect.left + bRect.width / 2 + aRect.left + aRect.width / 2) / 2;
	const cy = (bRect.top + bRect.height / 2 + aRect.top + aRect.height / 2) / 2;

	const box = document.createElement('div');
	box.className = 'bb-label-box';
	box.textContent = label;
	Object.assign(box.style, {
		position: 'fixed',
		left: `${cx}px`,
		top: `${cy}px`,
		transform: 'translate(-50%, -50%) scale(0)',
		background: '#1a1a2e',
		color: '#e0e0ff',
		fontFamily: 'monospace',
		fontSize: '1.4rem',
		padding: '0.4em 0.8em',
		border: '2px solid #7c6af7',
		borderRadius: '6px',
		opacity: '0',
		pointerEvents: 'none',
		zIndex: '10',
		whiteSpace: 'nowrap',
	});
	document.body.appendChild(box);

	// Hide afterRoot via cell-level visibility before any animation so
	// nothing flashes at the natural position before the choreography
	// starts. Visibility is binary and the harness honours it via the
	// live style read, so no opacity teleport is introduced.
	const afterCells = Array.from(afterRoot.children) as HTMLElement[];
	for (const cell of afterCells) cell.style.visibility = 'hidden';
	afterRoot.style.opacity = '1';

	// Phase 1 — input fades out in place. No slide: a slide on
	// beforeRoot's already-visible content would itself be a position
	// jump if it used array keyframes starting elsewhere; staying put
	// with a smooth opacity tween keeps the gesture clean.
	await animate(
		beforeRoot,
		{ opacity: [1, 0] },
		{ duration: DURATION_OUT, ease: 'easeIn' },
	).finished;

	// Phase 2 — label box flashes in at stage centre, holds, then
	// flashes out. Scale-pop is a SCALAR keyframe so it eases from
	// the box's current state (scale 0 at startMs is the inline value
	// we set in cssText). Array keyframes are fine here because the
	// box is invisible at lt=0 (opacity 0 first kf value).
	await animate(
		box,
		{
			opacity: [0, 1, 1, 0],
			scale: [0.6, 1.05, 1, 0.8],
		},
		{ duration: DURATION_FLASH, ease: 'easeOut' },
	).finished;
	box.remove();

	// Phase 3 — reveal afterCells and fade them in via afterRoot
	// opacity. Same rationale as Phase 1: no slide means no
	// "translate-X jumps to the first array-keyframe value at
	// startMs" teleport. afterRoot stays at its natural transform
	// throughout.
	for (const cell of afterCells) cell.style.visibility = '';
	afterRoot.style.opacity = '0'; // start invisible so the fade reads clean
	await new Promise<void>(r => setTimeout(r, HOLD_BETWEEN_MS));
	await animate(
		afterRoot,
		{ opacity: 1 },
		{ duration: DURATION_IN, ease: 'easeOut' },
	).finished;

	// Belt-and-braces: clear inline opacity so the post-commit static
	// render uses CSS defaults.
	afterRoot.style.opacity = '';
};
