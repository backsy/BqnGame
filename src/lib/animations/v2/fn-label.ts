import type { FnExpr } from './fn-expr.js';
import type { BqnValue } from './value.js';
import { assertNever } from './value.js';

// BqnValue.kind values — used to discriminate FnExpr | BqnValue unions.
const BQN_VALUE_KINDS = new Set<string>(['number', 'char', 'fn', 'array', 'namespace']);

function isBqnValue(v: FnExpr | BqnValue): v is BqnValue {
	return BQN_VALUE_KINDS.has(v.kind);
}

function tineLabel(v: FnExpr | BqnValue): string {
	if (isBqnValue(v)) {
		if (v.kind === 'fn') return fnExprLabel(v.def);
		return valueLabel(v);
	}
	return fnExprLabel(v);
}

// Short readable rendering of a BqnValue for use inside an FnExpr label.
// Numbers print as the number; small arrays as BQN strand form ⟨a‿b‿c⟩;
// other variants collapse to ·.
function valueLabel(v: BqnValue): string {
	if (v.kind === 'number') return String(v.value);
	if (v.kind === 'array' && v.shape.length === 1 && v.data.length <= 5) {
		const parts = v.data.map(d => (d.kind === 'number' ? String(d.value) : '·'));
		return '⟨' + parts.join('‿') + '⟩';
	}
	return '·';
}

// BQN glyph map for base primitives. The glyph for each kind is the glyph
// that produces that operation in real BQN — sourced from
// `docs/bqn-reference.md`. NEVER invent or guess a glyph; if a kind has no
// real BQN primitive (e.g. a synthetic "last"), don't add it as an FnExpr
// kind in the first place. The animator renders BQN, not our own dialect.
const PRIM_GLYPH: Record<string, string> = {
	add:                  '+',
	sub:                  '-',
	mul:                  '×',
	div:                  '÷',
	pow:                  '⋆',
	root:                 '√',
	mod:                  '|',
	min:                  '⌊',
	max:                  '⌈',
	floor:                '⌊',
	ceil:                 '⌈',
	abs:                  '|',
	neg:                  '-',
	eq:                   '=',
	ne:                   '≠',
	lt:                   '<',
	le:                   '≤',
	gt:                   '>',
	ge:                   '≥',
	match:                '≡',
	'not-match':          '≢',
	and:                  '∧',
	or:                   '∨',
	not:                  '¬',
	span:                 '¬',
	reverse:              '⌽',
	rotate:               '⌽',
	reshape:              '⥊',
	deshape:              '⥊',
	transpose:            '⍉',
	length:               '≠',
	shape:                '≢',
	'rank-of':            '=',
	take:                 '↑',
	drop:                 '↓',
	replicate:            '/',
	pick:                 '⊑',
	first:                '⊑',
	enclose:              '<',
	merge:                '>',
	'join-to':            '∾',
	pair:                 '⋈',
	solo:                 '≍',
	range:                '↕',
	'sort-up':            '∧',
	'sort-down':          '∨',
	'grade-up':           '⍋',
	'grade-down':         '⍒',
	group:                '⊔',
	'index-of':           '⊐',
	'progressive-index-of': '⊒',
	unique:               '⍷',
	'mark-firsts':        '∊',
	find:                 '⍷',
	member:               '∊',
	'left-id':            '⊣',
	'right-id':           '⊢',
};

const MOD1_GLYPH: Record<string, string> = {
	fold:      '´',
	'fold-from': '˝',
	scan:      '`',
	each:      '¨',
	cells:     '˘',
	table:     '⌜',
	self:      '˜',
	const:     '˙',
};

const MOD2_GLYPH: Record<string, string> = {
	compose:   '∘',
	over:      '○',
	'bind-left':  '⊸',
	'bind-right': '⟜',
	before:    '⊸',
	after:     '⟜',
	under:     '⌾',
	choose:    '◶',
	rank:      '⎉',
	depth:     '⚇',
	repeat:    '⍟',
	valences:  '⊘',
	catch:     '⎊',
	atop:      '',
	fork:      '',
};

export function fnExprLabel(fn: FnExpr): string {
	switch (fn.kind) {
		// ── Base primitives ───────────────────────────────────────────────────
		case 'add':                  return PRIM_GLYPH['add'];
		case 'sub':                  return PRIM_GLYPH['sub'];
		case 'mul':                  return PRIM_GLYPH['mul'];
		case 'div':                  return PRIM_GLYPH['div'];
		case 'pow':                  return PRIM_GLYPH['pow'];
		case 'root':                 return PRIM_GLYPH['root'];
		case 'mod':                  return PRIM_GLYPH['mod'];
		case 'min':                  return PRIM_GLYPH['min'];
		case 'max':                  return PRIM_GLYPH['max'];
		case 'floor':                return PRIM_GLYPH['floor'];
		case 'ceil':                 return PRIM_GLYPH['ceil'];
		case 'abs':                  return PRIM_GLYPH['abs'];
		case 'neg':                  return PRIM_GLYPH['neg'];
		case 'eq':                   return PRIM_GLYPH['eq'];
		case 'ne':                   return PRIM_GLYPH['ne'];
		case 'lt':                   return PRIM_GLYPH['lt'];
		case 'le':                   return PRIM_GLYPH['le'];
		case 'gt':                   return PRIM_GLYPH['gt'];
		case 'ge':                   return PRIM_GLYPH['ge'];
		case 'match':                return PRIM_GLYPH['match'];
		case 'not-match':            return PRIM_GLYPH['not-match'];
		case 'and':                  return PRIM_GLYPH['and'];
		case 'or':                   return PRIM_GLYPH['or'];
		case 'not':                  return PRIM_GLYPH['not'];
		case 'span':                 return PRIM_GLYPH['span'];
		case 'reverse':              return PRIM_GLYPH['reverse'];
		case 'rotate':               return PRIM_GLYPH['rotate'];
		case 'reshape':              return PRIM_GLYPH['reshape'];
		case 'deshape':              return PRIM_GLYPH['deshape'];
		case 'transpose':            return PRIM_GLYPH['transpose'];
		case 'length':               return PRIM_GLYPH['length'];
		case 'shape':                return PRIM_GLYPH['shape'];
		case 'rank-of':              return PRIM_GLYPH['rank-of'];
		case 'take':                 return PRIM_GLYPH['take'];
		case 'drop':                 return PRIM_GLYPH['drop'];
		case 'replicate':            return PRIM_GLYPH['replicate'];
		case 'pick':                 return PRIM_GLYPH['pick'];
		case 'first':                return PRIM_GLYPH['first'];
		case 'enclose':              return PRIM_GLYPH['enclose'];
		case 'merge':                return PRIM_GLYPH['merge'];
		case 'join-to':              return PRIM_GLYPH['join-to'];
		case 'pair':                 return PRIM_GLYPH['pair'];
		case 'solo':                 return PRIM_GLYPH['solo'];
		case 'range':                return PRIM_GLYPH['range'];
		case 'sort-up':              return PRIM_GLYPH['sort-up'];
		case 'sort-down':            return PRIM_GLYPH['sort-down'];
		case 'grade-up':             return PRIM_GLYPH['grade-up'];
		case 'grade-down':           return PRIM_GLYPH['grade-down'];
		case 'group':                return PRIM_GLYPH['group'];
		case 'index-of':             return PRIM_GLYPH['index-of'];
		case 'progressive-index-of': return PRIM_GLYPH['progressive-index-of'];
		case 'unique':               return PRIM_GLYPH['unique'];
		case 'mark-firsts':          return PRIM_GLYPH['mark-firsts'];
		case 'find':                 return PRIM_GLYPH['find'];
		case 'member':               return PRIM_GLYPH['member'];
		case 'left-id':              return PRIM_GLYPH['left-id'];
		case 'right-id':             return PRIM_GLYPH['right-id'];

		// ── 1-modifier applications: F´ F` F¨ etc. ───────────────────────────
		case 'fold':      return fnExprLabel(fn.over) + MOD1_GLYPH['fold'];
		case 'fold-from': return fnExprLabel(fn.over) + MOD1_GLYPH['fold-from'];
		case 'scan':      return fnExprLabel(fn.over) + MOD1_GLYPH['scan'];
		case 'each':      return fnExprLabel(fn.of)   + MOD1_GLYPH['each'];
		case 'cells':     return fnExprLabel(fn.of)   + MOD1_GLYPH['cells'];
		case 'table':     return fnExprLabel(fn.of)   + MOD1_GLYPH['table'];
		case 'self':      return fnExprLabel(fn.of)   + MOD1_GLYPH['self'];
		case 'const':     return tineLabel(fn.value) + MOD1_GLYPH['const'];

		// ── 2-modifier applications: F∘G F○G etc. ────────────────────────────
		case 'compose':   return fnExprLabel(fn.f) + MOD2_GLYPH['compose'] + fnExprLabel(fn.g);
		case 'over':      return fnExprLabel(fn.f) + MOD2_GLYPH['over']    + fnExprLabel(fn.g);
		case 'bind-left': return valueLabel(fn.left) + MOD2_GLYPH['bind-left'] + fnExprLabel(fn.of);
		case 'bind-right': return fnExprLabel(fn.of) + MOD2_GLYPH['bind-right'] + valueLabel(fn.right);
		case 'before':    return fnExprLabel(fn.f) + MOD2_GLYPH['before'] + fnExprLabel(fn.g);
		case 'after':     return fnExprLabel(fn.f) + MOD2_GLYPH['after']  + fnExprLabel(fn.g);
		case 'under':     return fnExprLabel(fn.f) + MOD2_GLYPH['under']  + fnExprLabel(fn.g);
		case 'choose':    return fnExprLabel(fn.f) + MOD2_GLYPH['choose'] + fnExprLabel(fn.g);
		case 'rank':      return fnExprLabel(fn.of) + MOD2_GLYPH['rank'];
		case 'depth':     return fnExprLabel(fn.of) + MOD2_GLYPH['depth'];
		case 'repeat':    return fnExprLabel(fn.of) + MOD2_GLYPH['repeat'];
		case 'valences':  return fnExprLabel(fn.f) + MOD2_GLYPH['valences'] + fnExprLabel(fn.g);
		case 'catch':     return fnExprLabel(fn.f) + MOD2_GLYPH['catch']   + fnExprLabel(fn.g);

		// ── Trains ────────────────────────────────────────────────────────────
		case 'atop': return fnExprLabel(fn.f) + ' ' + fnExprLabel(fn.g);
		case 'fork':
			return tineLabel(fn.f) + ' ' + fnExprLabel(fn.g) + ' ' + fnExprLabel(fn.h);

		// ── Lambda ────────────────────────────────────────────────────────────
		case 'lambda': return '{…}';

		// ── Opaque (resolved user-defined name) ───────────────────────────────
		case 'opaque': return fn.name;

		default: return assertNever(fn);
	}
}
