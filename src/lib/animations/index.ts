// Registry mapping rune.expr (the BQN source the player taps) to its
// animation function. Adding a new animated glyph is one new file in
// this directory plus one entry below — for parametric ones (like N↑,
// +⟜N, etc.), add a regex case to getAnimation.

import type { AnimationFn } from './types';
import { reverse } from './reverse';
import { take } from './take';
import { drop } from './drop';
import { range } from './range';
import { sort } from './sort';
import { broadcast } from './broadcast';
import { fold } from './fold';
import { scan } from './scan';

export type { AnimationCtx, AnimationFn, Cell } from './types';

const exact: Record<string, AnimationFn> = {
	'⌽': reverse,
	'↕': range,
	'∧': sort,
	'∨': sort
};

const TAKE_RE = /^(\d+)⊸↑$/;
const DROP_RE = /^(\d+)⊸↓$/;
// op⟜N: +1, -2, ×3, ÷4, =3, <5, >2 — operation bound to a constant on
// the right.
const BCAST_DYAD_RE = /^([+\-×÷=<>])⟜(\d+)$/;
// N⊸|: 2|, 3|, 10| — modulus with the divisor bound on the left.
const BCAST_MOD_RE = /^(\d+)⊸\|$/;
// op˜: +˜ (double), ×˜ (square) — self-application.
const BCAST_SELF_RE = /^([+\-×])˜$/;
// F´: +´, ×´, ⌈´, ⌊´ — fold a row into a scalar.
const FOLD_RE = /^([+\-×÷⌈⌊])´$/;
// F`: +`, ×`, ⌈`, ⌊` — scan: running fold, same-length result.
const SCAN_RE = /^([+\-×÷⌈⌊])`$/;

export function getAnimation(expr: string): AnimationFn | null {
	const direct = exact[expr];
	if (direct) return direct;

	const takeMatch = TAKE_RE.exec(expr);
	if (takeMatch) return take(parseInt(takeMatch[1], 10));

	const dropMatch = DROP_RE.exec(expr);
	if (dropMatch) return drop(parseInt(dropMatch[1], 10));

	const dyadMatch = BCAST_DYAD_RE.exec(expr);
	if (dyadMatch) return broadcast(`${dyadMatch[1]}${dyadMatch[2]}`);

	const modMatch = BCAST_MOD_RE.exec(expr);
	if (modMatch) return broadcast(`${modMatch[1]}|`);

	const selfMatch = BCAST_SELF_RE.exec(expr);
	if (selfMatch) return broadcast(`${selfMatch[1]}˜`);

	const foldMatch = FOLD_RE.exec(expr);
	if (foldMatch) return fold(foldMatch[1]);

	const scanMatch = SCAN_RE.exec(expr);
	if (scanMatch) return scan(scanMatch[1]);

	return null;
}
