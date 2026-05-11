import { animate } from 'motion';
import type { AnimateStep } from '../stage.js';
import type { Step } from '../step.js';
import { fnExprLabel } from '../fn-label.js';
import { assertNever } from '../value.js';

// ── Motion vocabulary entry #1: blackBox ─────────────────────────────────
// Choreography:
//   1. Before cells fade + slide right, collapsing toward a labeled box.
//   2. Labeled box flashes in the centre.
//   3. After cells emerge from the box and slide into position.
//
// Used as the universal default for operations not yet hand-choreographed.
// Real animation — not a no-op (Rule F).

function stepLabel(step: Step): string {
	switch (step.kind) {
		case 'monadic': return fnExprLabel(step.fn);
		case 'dyadic':  return fnExprLabel(step.fn);
		case 'assign':  return step.name;
		case 'access':  return step.field;
		default:        return assertNever(step);
	}
}

const DURATION_SLIDE  = 0.3;  // seconds
const DURATION_FLASH  = 0.25;
const DURATION_EMERGE = 0.3;

export const blackBox: AnimateStep = async (step, beforeRoot, afterRoot): Promise<void> => {
	const label = stepLabel(step);

	// Build the label box element and insert it into beforeRoot's parent so it
	// appears in the same coordinate space as the stage container.
	const parent = beforeRoot.parentElement ?? document.body;

	const box = document.createElement('div');
	box.className = 'bb-label-box';
	box.textContent = label;
	box.style.cssText = [
		'position:absolute',
		'top:50%',
		'left:50%',
		'transform:translate(-50%,-50%) scale(0)',
		'background:#1a1a2e',
		'color:#e0e0ff',
		'font-family:monospace',
		'font-size:1.4rem',
		'padding:0.4em 0.8em',
		'border:2px solid #7c6af7',
		'border-radius:6px',
		'opacity:0',
		'pointer-events:none',
		'z-index:10',
		'white-space:nowrap',
	].join(';');

	// Stage the afterRoot off-screen while we animate (it is already prepared
	// but not yet committed, so it is not in the DOM — we temporarily append it
	// to measure nothing; the stage will commit it after we return).
	afterRoot.style.opacity = '0';

	parent.appendChild(box);

	// Phase 1 — slide before-cells right and fade out.
	await animate(
		beforeRoot,
		{ opacity: [1, 0], x: [0, 40] },
		{ duration: DURATION_SLIDE, ease: 'easeIn' }
	).finished;

	// Phase 2 — flash the label box.
	await animate(
		box,
		{
			opacity: [0, 1, 1, 0],
			scale: [0.6, 1.05, 1, 0.8],
		},
		{ duration: DURATION_FLASH * 2, ease: 'easeOut' }
	).finished;

	box.remove();

	// Phase 3 — emerge: after-cells slide in from the left.
	await animate(
		afterRoot,
		{ opacity: [0, 1], x: [-40, 0] },
		{ duration: DURATION_EMERGE, ease: 'easeOut' }
	).finished;

	// Restore afterRoot so stage.commit can rely on its natural state.
	afterRoot.style.opacity = '';
	afterRoot.style.transform = '';
};
