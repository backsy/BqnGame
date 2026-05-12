import type { BqnValue } from './value.js';
import type { FnExpr } from './fn-expr.js';
import type { Step } from './step.js';
import { valuesEqual } from './value.js';

// ── Opaque brand ─────────────────────────────────────────────────────────────
// Real runtime Symbol — NOT `declare const`, which would compile to a
// ReferenceError when used as a computed property key. The symbol is
// module-private (not exported), so callers cannot reproduce the brand
// and therefore cannot construct a Trajectory literal.
const trajectoryBrand: unique symbol = Symbol('Trajectory');

// Trajectory carries the chain anchor alongside the steps so that append
// can apply the next StepInput without replaying history. This is the only
// internally-correct way to track the assign-passthrough rule (Rule C):
// assign does NOT advance the anchor, so we cannot derive the current anchor
// by just looking at the last step.
export type Trajectory = {
	readonly [trajectoryBrand]: true;
	readonly steps: ReadonlyArray<Step>;
	// anchor is the value that the NEXT step's input must chain from.
	// For assign steps, anchor is unchanged from before the assign.
	readonly anchor: BqnValue;
};

// Only internal function that can produce a Trajectory value
function makeTrajectory(steps: ReadonlyArray<Step>, anchor: BqnValue): Trajectory {
	return { [trajectoryBrand]: true, steps, anchor } as Trajectory;
}

// ── StepInput — structurally narrower than Step (Rule D) ──────────────────
// monadic: x is threaded from the chain anchor; caller does not supply it
// access:  target is threaded from the chain anchor; caller does not supply it
// dyadic:  both w and x are caller-supplied; at least one must match anchor
// assign:  pure naming step; no chaining constraint, no fields threaded
export type StepInput =
	| { kind: 'monadic'; fn: FnExpr; result: BqnValue }
	| { kind: 'dyadic'; fn: FnExpr; w: BqnValue; x: BqnValue; result: BqnValue }
	| { kind: 'assign'; name: string; value: BqnValue }
	| { kind: 'access'; field: string; result: BqnValue };

// ── Errors as values (Rule H) ─────────────────────────────────────────────
export type TrajectoryError =
	| { kind: 'chain-break'; stepIndex: number; anchor: BqnValue; got: { w?: BqnValue; x?: BqnValue; target?: BqnValue } }
	| { kind: 'empty-input' };

// ── Chaining helper ───────────────────────────────────────────────────────
// Validates/threads one StepInput against the current anchor.
// Returns the completed Step and the NEW anchor for the following step,
// or a TrajectoryError if the chain is broken.
function chainStep(
	anchor: BqnValue,
	input: StepInput,
	stepIndex: number
): { step: Step; nextAnchor: BqnValue } | TrajectoryError {
	switch (input.kind) {
		case 'monadic': {
			// x is threaded from anchor; caller cannot supply it (Rule D)
			const step: Step = { kind: 'monadic', fn: input.fn, x: anchor, result: input.result };
			return { step, nextAnchor: input.result };
		}
		case 'dyadic': {
			// Both w and x are caller-supplied; at least one must match anchor (Rule C)
			const wMatch = valuesEqual(input.w, anchor);
			const xMatch = valuesEqual(input.x, anchor);
			if (!wMatch && !xMatch) {
				return {
					kind: 'chain-break',
					stepIndex,
					anchor,
					got: { w: input.w, x: input.x }
				};
			}
			const step: Step = { kind: 'dyadic', fn: input.fn, w: input.w, x: input.x, result: input.result };
			return { step, nextAnchor: input.result };
		}
		case 'assign': {
			// No chaining constraint on input. Anchor does NOT change (Rule C — assign is passthrough).
			const step: Step = { kind: 'assign', name: input.name, value: input.value };
			return { step, nextAnchor: anchor };
		}
		case 'access': {
			// target is threaded from anchor; caller cannot supply it (Rule D)
			const step: Step = { kind: 'access', target: anchor, field: input.field, result: input.result };
			return { step, nextAnchor: input.result };
		}
	}
}

// ── Smart constructors ────────────────────────────────────────────────────

export function trajectoryFrom(
	start: BqnValue,
	steps: ReadonlyArray<StepInput>
): Trajectory | TrajectoryError {
	if (steps.length === 0) return { kind: 'empty-input' };

	const built: Step[] = [];
	let anchor = start;

	for (let i = 0; i < steps.length; i++) {
		const result = chainStep(anchor, steps[i], i);
		if ('kind' in result && (result.kind === 'chain-break' || result.kind === 'empty-input')) {
			return result as TrajectoryError;
		}
		const ok = result as { step: Step; nextAnchor: BqnValue };
		built.push(ok.step);
		anchor = ok.nextAnchor;
	}

	return makeTrajectory(built, anchor);
}

export function append(t: Trajectory, input: StepInput): Trajectory | TrajectoryError {
	// t.anchor is always the correct chain anchor after all previous steps,
	// including correct passthrough for any trailing assign steps (Rule C).
	const result = chainStep(t.anchor, input, t.steps.length);
	if ('kind' in result && (result.kind === 'chain-break' || result.kind === 'empty-input')) {
		return result as TrajectoryError;
	}
	const ok = result as { step: Step; nextAnchor: BqnValue };
	return makeTrajectory([...t.steps, ok.step], ok.nextAnchor);
}
