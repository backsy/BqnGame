// Registry mapping rune.expr (the BQN source the player taps) to its
// animation function. Adding a new animated glyph is one new file in
// this directory plus one entry below.

import type { AnimationFn } from './types';
import { reverse } from './reverse';

export type { AnimationCtx, AnimationFn, Cell } from './types';

export const animations: Record<string, AnimationFn> = {
	'⌽': reverse
};
