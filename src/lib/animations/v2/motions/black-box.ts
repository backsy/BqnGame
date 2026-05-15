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

	// Centre of beforeRoot in viewport coords. The label flashes at
	// the spot the user was just looking at (the input). Anchored
	// with position:fixed so it stays put regardless of stage layout.
	const bRect = beforeRoot.getBoundingClientRect();
	const cx = bRect.left + bRect.width / 2;
	const cy = bRect.top + bRect.height / 2;

	// Two-layer setup so motion-lib's transform keyframes (scale) can't
	// clobber the centring translate. The OUTER wrap sits at (cx, cy)
	// with translate(-50%, -50%) — that's what places the label's
	// centre on the input's centre. The INNER box is what motion
	// animates (scale + opacity); its transform replacements only
	// affect itself, not the wrap.
	const wrap = document.createElement('div');
	Object.assign(wrap.style, {
		position: 'fixed',
		left: `${cx}px`,
		top: `${cy}px`,
		transform: 'translate(-50%, -50%)',
		pointerEvents: 'none',
		zIndex: '10',
	});

	const box = document.createElement('div');
	box.className = 'bb-label-box';
	box.textContent = label;
	Object.assign(box.style, {
		transform: 'scale(0)',
		background: '#1a1a2e',
		color: '#e0e0ff',
		fontFamily: 'monospace',
		fontSize: '1.4rem',
		padding: '0.4em 0.8em',
		border: '2px solid #7c6af7',
		borderRadius: '6px',
		opacity: '0',
		whiteSpace: 'nowrap',
	});
	wrap.appendChild(box);
	document.body.appendChild(wrap);

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
	wrap.remove();

	// Phase 3 — reveal afterCells AND drop the data-preparing flag so
	// the CSS box decoration paints in along with them. Without
	// removing data-preparing, .bqn-vector / .bqn-matrix's frame
	// stays suppressed until stage.commit, and the user sees cells
	// fade in INSIDE EMPTY SPACE then a box pops on at the very end.
	for (const cell of afterCells) cell.style.visibility = '';
	delete afterRoot.dataset.preparing;
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
