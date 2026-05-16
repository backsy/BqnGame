// v3 primitives registry.
//
// A primitive is a pure visual transformation:
//
//   (fromScene, params) → { snapshots: Scene[]; toScene: Scene }
//
// Contracts (enforced when the user spec's the first primitive's
// property tests):
//   - `snapshots[0]` deep-equals `fromScene`.
//   - `snapshots[snapshots.length - 1]` deep-equals `toScene`.
//   - `toScene` is deterministic from `(fromScene, params)`.
//   - Consecutive snapshots are structurally identical (same kind,
//     shape, cell ids, inner-null pattern) so the tween between any
//     adjacent pair is a strict same-structure `lerpScene`.
//
// The registry is empty by design until the user spec's the first
// primitive (its visual choreography, parameters, invariants). Each
// primitive lands in its own file under this directory and is imported
// here so the harness primitives panel can discover it.

import type { Scene } from '../scene';

export type PrimitiveResult = {
	snapshots: Scene[];
	toScene: Scene;
};

/** A primitive function. `P` is the parameter type for this primitive
 *  (its visual knobs — target height, rotation degrees, etc.). */
export type Primitive<P> = (fromScene: Scene, params: P) => PrimitiveResult;

/**
 * A registered primitive ready for the panel to list and invoke.
 *
 * Parameter types erase to `unknown` at the registry boundary; each
 * primitive's own file should re-export a typed wrapper for call sites
 * that compose primitives into steps.
 */
export type RegisteredPrimitive = {
	name: string;
	apply: (fromScene: Scene, params: unknown) => PrimitiveResult;
	defaultParams: unknown;
};

/** Global registry. Empty until the user spec's the first primitive. */
export const primitives: RegisteredPrimitive[] = [];
