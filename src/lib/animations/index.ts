// Registry mapping rune.expr (the BQN source the player taps) to its
// animation function. Adding a new animated glyph is one new file in
// this directory plus one entry below — for parametric ones (like N↑),
// add a regex case to getAnimation.

import type { AnimationFn } from './types';
import { reverse } from './reverse';
import { take } from './take';

export type { AnimationCtx, AnimationFn, Cell } from './types';

const exact: Record<string, AnimationFn> = {
	'⌽': reverse
};

const TAKE_RE = /^(\d+)⊸↑$/;

export function getAnimation(expr: string): AnimationFn | null {
	const direct = exact[expr];
	if (direct) return direct;
	const takeMatch = TAKE_RE.exec(expr);
	if (takeMatch) return take(parseInt(takeMatch[1], 10));
	return null;
}
