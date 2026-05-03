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
import { filter } from './filter';
import { reshape } from './reshape';
import { pick } from './pick';
import { join } from './join';
import { length } from './length';
import { transpose } from './transpose';
import { deshape } from './deshape';
import { tables } from './tables';
import { windows } from './windows';

export type { AnimationCtx, AnimationFn, Cell } from './types';

const exact: Record<string, AnimationFn> = {
	'⌽': reverse,
	'↕': range,
	'∧': sort,
	'∨': sort,
	'⊑': pick(0),
	'∾˜': join('self'),
	'≠': length,
	'⍉': transpose,
	'⥊': deshape
};

const TAKE_RE = /^(\d+)⊸↑$/;
const DROP_RE = /^(\d+)⊸↓$/;
// op⟜N: +1, -2, ×3, ÷4, =3, <5, >2, ⋆2 — operation bound to a constant
// on the right.
const BCAST_DYAD_RE = /^([+\-×÷=<>⋆])⟜(\d+)$/;
// N⊸|: 2|, 3|, 10| — modulus with the divisor bound on the left.
const BCAST_MOD_RE = /^(\d+)⊸\|$/;
// N⊸⋆ / N⊸√: 2⋆, 3⋆ (powers of N) and 3√ (cube root). Same broadcast
// shape as N⊸|, just a different op glyph.
const BCAST_LEFT_POW_RE = /^(\d+)⊸([⋆√])$/;
// √: monadic square root applied element-wise to a row.
const BCAST_SQRT_RE = /^√$/;
// op˜: +˜ (double), ×˜ (square) — self-application.
const BCAST_SELF_RE = /^([+\-×])˜$/;
// F´: +´, ×´, ⌈´, ⌊´ — fold a row into a scalar.
const FOLD_RE = /^([+\-×÷⌈⌊])´$/;
// F`: +`, ×`, ⌈`, ⌊` — scan: running fold, same-length result.
const SCAN_RE = /^([+\-×÷⌈⌊])`$/;
// (P⊸/): keep-where filter, e.g. (<⟜5)⊸/, (=⟜1)⊸/.
const FILTER_RE = /^\(([=<>])⟜(\d+)\)⊸\/$/;
// R‿C⊸⥊: reshape a flat row into an R×C grid.
const RESHAPE_RE = /^(\d+)‿(\d+)⊸⥊$/;
// N⊸⊑: pick the Nth element (0-indexed in BQN).
const PICK_RE = /^(\d+)⊸⊑$/;
// F⌜˜: self-table — pair every element of x with every other element
// under F. Uses the table modifier `⌜` and the swap modifier `˜`.
const TABLE_SELF_RE = /^([+\-×÷⌈⌊=<>])⌜˜$/;
// N⊸↕: sliding length-N windows over a row.
const WINDOWS_RE = /^(\d+)⊸↕$/;

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

	const leftPowMatch = BCAST_LEFT_POW_RE.exec(expr);
	if (leftPowMatch) return broadcast(`${leftPowMatch[1]}${leftPowMatch[2]}`);

	if (BCAST_SQRT_RE.test(expr)) return broadcast('√');

	const selfMatch = BCAST_SELF_RE.exec(expr);
	if (selfMatch) return broadcast(`${selfMatch[1]}˜`);

	const foldMatch = FOLD_RE.exec(expr);
	if (foldMatch) return fold(foldMatch[1]);

	const scanMatch = SCAN_RE.exec(expr);
	if (scanMatch) return scan(scanMatch[1]);

	const filterMatch = FILTER_RE.exec(expr);
	if (filterMatch) return filter(filterMatch[1], parseInt(filterMatch[2], 10));

	const reshapeMatch = RESHAPE_RE.exec(expr);
	if (reshapeMatch)
		return reshape(parseInt(reshapeMatch[1], 10), parseInt(reshapeMatch[2], 10));

	const pickMatch = PICK_RE.exec(expr);
	if (pickMatch) return pick(parseInt(pickMatch[1], 10));

	const tableMatch = TABLE_SELF_RE.exec(expr);
	if (tableMatch) return tables(tableMatch[1]);

	const winsMatch = WINDOWS_RE.exec(expr);
	if (winsMatch) return windows(parseInt(winsMatch[1], 10));

	// Join: ∾⟜<value> appends, <value>⊸∾ prepends. Match by start /
	// end so any value (number, list, string) is captured uniformly.
	if (expr.startsWith('∾⟜')) return join('append');
	if (expr.endsWith('⊸∾')) return join('prepend');

	return null;
}
