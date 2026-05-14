import type { FnExpr } from './fn-expr.js';
import type { BqnValue } from './value.js';
import { animateMonadic, animateDyadic } from './animate.js';
import { blackBox } from './motions/black-box.js';

// Runtime mirror of FnExpr['kind']. The `satisfies` clause type-checks
// completeness AGAINST the union — adding a new kind to FnExpr without
// adding it here is a build error.
export const ALL_FN_KINDS = [
	'add', 'sub', 'mul', 'div', 'pow', 'root', 'mod', 'min', 'max',
	'floor', 'ceil', 'abs', 'neg',
	'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'match', 'not-match',
	'and', 'or', 'not', 'span',
	'reverse', 'rotate', 'reshape', 'deshape', 'transpose',
	'length', 'shape', 'rank-of',
	'take', 'drop', 'replicate', 'pick', 'first',
	'enclose', 'merge', 'join-to', 'pair', 'solo',
	'range', 'sort-up', 'sort-down', 'grade-up', 'grade-down', 'group',
	'index-of', 'progressive-index-of', 'unique', 'mark-firsts', 'find', 'member',
	'left-id', 'right-id',
	'fold', 'fold-from', 'scan', 'each', 'cells', 'table', 'self', 'const',
	'compose', 'over', 'bind-left', 'bind-right', 'before', 'after', 'under', 'choose',
	'rank', 'depth', 'repeat', 'valences', 'catch',
	'atop', 'fork',
	'lambda', 'opaque',
] as const satisfies ReadonlyArray<FnExpr['kind']>;

// Completeness assertion — fails to compile if any FnExpr kind is missing.
type _Missing = Exclude<FnExpr['kind'], (typeof ALL_FN_KINDS)[number]>;
const _completeness: [_Missing] extends [never] ? true : never = true;
void _completeness;

const DUMMY_VAL: BqnValue = { kind: 'number', value: 0 };
const DUMMY_FN: FnExpr = { kind: 'add' };

// Build a minimal valid FnExpr for each kind so the dispatcher can be probed
// without crashing on missing fields. For arms that animate conditionally
// (`before` only filters when g='replicate'), pick the stub that exercises
// the animated path — coverage answers "does this kind have any hand-tuned
// motion," not "is every shape of it animated."
function stubFn(kind: FnExpr['kind']): FnExpr {
	switch (kind) {
		case 'fold': return { kind: 'fold', over: DUMMY_FN };
		case 'fold-from': return { kind: 'fold-from', over: DUMMY_FN, seed: DUMMY_VAL };
		case 'scan': return { kind: 'scan', over: DUMMY_FN };
		case 'each':
		case 'cells':
		case 'table':
		case 'self': return { kind, of: DUMMY_FN };
		case 'const': return { kind: 'const', value: DUMMY_VAL };
		case 'compose':
		case 'over':
		case 'after':
		case 'under':
		case 'choose':
		case 'valences':
		case 'catch':
		case 'atop': return { kind, f: DUMMY_FN, g: DUMMY_FN };
		case 'before': return { kind: 'before', f: DUMMY_FN, g: { kind: 'replicate' } };
		case 'fork': return { kind: 'fork', f: DUMMY_FN, g: DUMMY_FN, h: DUMMY_FN };
		case 'bind-left': return { kind: 'bind-left', left: DUMMY_VAL, of: DUMMY_FN };
		case 'bind-right': return { kind: 'bind-right', right: DUMMY_VAL, of: DUMMY_FN };
		case 'rank':
		case 'depth':
		case 'repeat': return { kind, of: DUMMY_FN, spec: DUMMY_VAL };
		case 'lambda': return { kind: 'lambda', role: 'fn', body: { source: '' } };
		case 'opaque': return { kind: 'opaque', name: '_', resolved: DUMMY_FN };
		default: return { kind } as FnExpr;
	}
}

export type Coverage = {
	animated: number;
	total: number;
	percent: number;
};

// A FnExpr kind counts as "animated" if at least one of its arities has a
// hand-tuned motion (i.e. the dispatcher returns something other than the
// universal blackBox). Many kinds have meaningful animation in only one
// arity — counting kinds rather than (kind × arity) pairs avoids
// padding the denominator with arms that have no meaningful animation
// (monadic `+` is identity, monadic `mod` is undefined, etc.).
export function motionCoverage(): Coverage {
	let animated = 0;
	for (const k of ALL_FN_KINDS) {
		const fn = stubFn(k);
		if (animateMonadic(fn) !== blackBox || animateDyadic(fn) !== blackBox) {
			animated++;
		}
	}
	return {
		animated,
		total: ALL_FN_KINDS.length,
		percent: Math.round((100 * animated) / ALL_FN_KINDS.length),
	};
}
