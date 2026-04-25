// Primitive data for the glyph palette. Source of truth for meanings is
// docs/bqn-reference.md. When editing, keep both in sync.
//
// Every example on a Primitive must be verified via
// `node --experimental-strip-types scripts/verify-examples.mjs` before
// commit. Unverified BQN is what CLAUDE.md invariant #4 exists to prevent.

export type PrimKind = 'fn' | 'mod1' | 'mod2' | 'sym';

export type Category =
	| 'arithmetic'
	| 'logic'
	| 'comparison'
	| 'structural'
	| 'search'
	| 'other'
	| 'combinator'
	| 'iteration'
	| 'syntax';

export interface Example {
	source: string;
	result: string;
}

export interface Primitive {
	/** what's displayed on the tile */
	glyph: string;
	kind: PrimKind;
	category: Category;
	/** short label, what a learner would call it */
	label: string;
	/** verified source → result pairs. Run scripts/verify-examples.mjs after editing. */
	examples?: Example[];
}

const fns: Primitive[] = [
	{
		glyph: '+',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Add / Conjugate',
		examples: [
			{ source: '3 + 5', result: '8' },
			{ source: '+ 5', result: '5' }
		]
	},
	{
		glyph: '-',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Subtract / Negate',
		examples: [
			{ source: '7 - 3', result: '4' },
			{ source: '- 5', result: '¯5' }
		]
	},
	{
		glyph: '×',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Multiply / Sign',
		examples: [
			{ source: '3 × 4', result: '12' },
			{ source: '× ¯5', result: '¯1' }
		]
	},
	{
		glyph: '÷',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Divide / Reciprocal',
		examples: [
			{ source: '10 ÷ 2', result: '5' },
			{ source: '÷ 4', result: '0.25' }
		]
	},
	{
		glyph: '⋆',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Power / Exponential',
		examples: [
			{ source: '2 ⋆ 10', result: '1024' },
			{ source: '⋆ 0', result: '1' }
		]
	},
	{
		glyph: '√',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Root / Square Root',
		examples: [
			{ source: '√ 16', result: '4' },
			{ source: '3 √ 8', result: '2' }
		]
	},
	{
		glyph: '⌊',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Minimum / Floor',
		examples: [
			{ source: '⌊ 3.7', result: '3' },
			{ source: '3 ⌊ 5', result: '3' }
		]
	},
	{
		glyph: '⌈',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Maximum / Ceiling',
		examples: [
			{ source: '⌈ 3.2', result: '4' },
			{ source: '3 ⌈ 5', result: '5' }
		]
	},
	{
		glyph: '|',
		kind: 'fn',
		category: 'arithmetic',
		label: 'Modulus / Absolute',
		examples: [
			{ source: '| ¯5', result: '5' },
			{ source: '3 | 10', result: '1' }
		]
	},

	{
		glyph: '∧',
		kind: 'fn',
		category: 'logic',
		label: 'And / Sort Up',
		examples: [
			{ source: '1 ∧ 1', result: '1' },
			{ source: '∧ 3‿1‿2', result: '⟨ 1 2 3 ⟩' }
		]
	},
	{
		glyph: '∨',
		kind: 'fn',
		category: 'logic',
		label: 'Or / Sort Down',
		examples: [
			{ source: '1 ∨ 0', result: '1' },
			{ source: '∨ 1‿3‿2', result: '⟨ 3 2 1 ⟩' }
		]
	},
	{
		glyph: '¬',
		kind: 'fn',
		category: 'logic',
		label: 'Span / Not',
		examples: [
			{ source: '¬ 0', result: '1' },
			{ source: '5 ¬ 3', result: '3' }
		]
	},

	{
		glyph: '<',
		kind: 'fn',
		category: 'comparison',
		label: 'Less Than / Enclose',
		examples: [{ source: '3 < 5', result: '1' }]
	},
	{
		glyph: '>',
		kind: 'fn',
		category: 'comparison',
		label: 'Greater Than / Merge',
		examples: [{ source: '5 > 3', result: '1' }]
	},
	{
		glyph: '≤',
		kind: 'fn',
		category: 'comparison',
		label: 'Less Than or Equal',
		examples: [{ source: '3 ≤ 5', result: '1' }]
	},
	{
		glyph: '≥',
		kind: 'fn',
		category: 'comparison',
		label: 'Greater Than or Equal',
		examples: [{ source: '5 ≥ 3', result: '1' }]
	},
	{
		glyph: '=',
		kind: 'fn',
		category: 'comparison',
		label: 'Equals / Rank',
		examples: [
			{ source: '3 = 3', result: '1' },
			{ source: '= 1‿2‿3', result: '1' }
		]
	},
	{
		glyph: '≠',
		kind: 'fn',
		category: 'comparison',
		label: 'Not Equals / Length',
		examples: [
			{ source: '3 ≠ 5', result: '1' },
			{ source: '≠ "hello"', result: '5' }
		]
	},
	{
		glyph: '≡',
		kind: 'fn',
		category: 'comparison',
		label: 'Match / Depth',
		examples: [
			{ source: '3 ≡ 3', result: '1' },
			{ source: '≡ 1‿2‿3', result: '1' }
		]
	},
	{
		glyph: '≢',
		kind: 'fn',
		category: 'comparison',
		label: 'Not Match / Shape',
		examples: [
			{ source: '3 ≢ 5', result: '1' },
			{ source: '≢ 1‿2‿3', result: '⟨ 3 ⟩' }
		]
	},

	{
		glyph: '⊣',
		kind: 'fn',
		category: 'structural',
		label: 'Left / Identity',
		examples: [
			{ source: '3 ⊣ 5', result: '3' },
			{ source: '⊣ 5', result: '5' }
		]
	},
	{
		glyph: '⊢',
		kind: 'fn',
		category: 'structural',
		label: 'Right / Identity',
		examples: [
			{ source: '3 ⊢ 5', result: '5' },
			{ source: '⊢ 5', result: '5' }
		]
	},
	{
		glyph: '⥊',
		kind: 'fn',
		category: 'structural',
		label: 'Reshape / Deshape',
		examples: [{ source: '⥊ 2‿2⥊↕4', result: '⟨ 0 1 2 3 ⟩' }]
	},
	{
		glyph: '∾',
		kind: 'fn',
		category: 'structural',
		label: 'Join to / Join',
		examples: [
			{ source: '1‿2 ∾ 3‿4', result: '⟨ 1 2 3 4 ⟩' },
			{ source: '∾ ⟨1‿2, 3‿4⟩', result: '⟨ 1 2 3 4 ⟩' }
		]
	},
	{
		glyph: '≍',
		kind: 'fn',
		category: 'structural',
		label: 'Couple / Solo',
		examples: [{ source: '1 ≍ 2', result: '⟨ 1 2 ⟩' }]
	},
	{
		glyph: '⋈',
		kind: 'fn',
		category: 'structural',
		label: 'Pair / Enlist',
		examples: [
			{ source: '1 ⋈ 2', result: '⟨ 1 2 ⟩' },
			{ source: '⋈ 5', result: '⟨ 5 ⟩' }
		]
	},
	{
		glyph: '↑',
		kind: 'fn',
		category: 'structural',
		label: 'Take / Prefixes',
		examples: [{ source: '3 ↑ ⟨10,20,30,40⟩', result: '⟨ 10 20 30 ⟩' }]
	},
	{
		glyph: '↓',
		kind: 'fn',
		category: 'structural',
		label: 'Drop / Suffixes',
		examples: [{ source: '2 ↓ ⟨10,20,30,40⟩', result: '⟨ 30 40 ⟩' }]
	},
	{
		glyph: '↕',
		kind: 'fn',
		category: 'structural',
		label: 'Windows / Range',
		examples: [{ source: '↕ 5', result: '⟨ 0 1 2 3 4 ⟩' }]
	},
	{
		glyph: '»',
		kind: 'fn',
		category: 'structural',
		label: 'Shift Before / Nudge',
		examples: [{ source: '» 1‿2‿3‿4', result: '⟨ 0 1 2 3 ⟩' }]
	},
	{
		glyph: '«',
		kind: 'fn',
		category: 'structural',
		label: 'Shift After / Nudge Back',
		examples: [{ source: '« 1‿2‿3‿4', result: '⟨ 2 3 4 0 ⟩' }]
	},
	{
		glyph: '⌽',
		kind: 'fn',
		category: 'structural',
		label: 'Rotate / Reverse',
		examples: [
			{ source: '⌽ 1‿2‿3‿4', result: '⟨ 4 3 2 1 ⟩' },
			{ source: '1 ⌽ 1‿2‿3‿4', result: '⟨ 2 3 4 1 ⟩' }
		]
	},
	{
		glyph: '⍉',
		kind: 'fn',
		category: 'structural',
		label: 'Reorder Axes / Transpose',
		examples: [{ source: '≢ ⍉ 2‿3⥊↕6', result: '⟨ 3 2 ⟩' }]
	},
	{
		glyph: '/',
		kind: 'fn',
		category: 'structural',
		label: 'Replicate / Indices',
		examples: [
			{ source: '1‿0‿1 / "abc"', result: '"ac"' },
			{ source: '/ 1‿2‿0‿1', result: '⟨ 0 1 1 3 ⟩' }
		]
	},

	{
		glyph: '⍋',
		kind: 'fn',
		category: 'search',
		label: 'Bins Up / Grade Up',
		examples: [{ source: '⍋ 3‿1‿2', result: '⟨ 1 2 0 ⟩' }]
	},
	{
		glyph: '⍒',
		kind: 'fn',
		category: 'search',
		label: 'Bins Down / Grade Down',
		examples: [{ source: '⍒ 3‿1‿2', result: '⟨ 0 2 1 ⟩' }]
	},
	{
		glyph: '⊏',
		kind: 'fn',
		category: 'search',
		label: 'Select / First Cell',
		examples: [{ source: '0‿2 ⊏ ⟨10,20,30⟩', result: '⟨ 10 30 ⟩' }]
	},
	{
		glyph: '⊑',
		kind: 'fn',
		category: 'search',
		label: 'Pick / First',
		examples: [
			{ source: '⊑ ⟨10,20,30⟩', result: '10' },
			{ source: '1 ⊑ ⟨10,20,30⟩', result: '20' }
		]
	},
	{
		glyph: '⊐',
		kind: 'fn',
		category: 'search',
		label: 'Index of / Classify',
		examples: [
			{ source: '⊐ "hello"', result: '⟨ 0 1 2 2 3 ⟩' },
			{ source: '"abcd" ⊐ "cab"', result: '⟨ 2 0 1 ⟩' }
		]
	},
	{
		glyph: '⊒',
		kind: 'fn',
		category: 'search',
		label: 'Progressive Index of / Occurrence Count',
		examples: [{ source: '⊒ 1‿2‿1‿1‿2', result: '⟨ 0 0 1 2 1 ⟩' }]
	},
	{
		glyph: '∊',
		kind: 'fn',
		category: 'search',
		label: 'Member of / Mark Firsts',
		examples: [
			{ source: '∊ 1‿2‿1‿3', result: '⟨ 1 1 0 1 ⟩' },
			{ source: '1‿4‿2 ∊ ↕5', result: '⟨ 1 1 1 ⟩' }
		]
	},
	{
		glyph: '⍷',
		kind: 'fn',
		category: 'search',
		label: 'Find / Deduplicate',
		examples: [{ source: '⍷ "hello"', result: '"helo"' }]
	},
	{
		glyph: '⊔',
		kind: 'fn',
		category: 'search',
		label: 'Group / Group Indices',
		examples: [{ source: '1‿0‿1‿0 ⊔ "abcd"', result: '⟨ "bd" "ac" ⟩' }]
	},

	{
		glyph: '!',
		kind: 'fn',
		category: 'other',
		label: 'Assert',
		examples: [{ source: '! 1', result: '1' }]
	}
];

const mods1: Primitive[] = [
	{
		glyph: '˙',
		kind: 'mod1',
		category: 'combinator',
		label: 'Constant',
		examples: [{ source: '3˙ 99', result: '3' }]
	},
	{
		glyph: '˜',
		kind: 'mod1',
		category: 'combinator',
		label: 'Self / Swap',
		examples: [
			{ source: '+˜ 3', result: '6' },
			{ source: '3 -˜ 5', result: '2' }
		]
	},
	{
		glyph: '˘',
		kind: 'mod1',
		category: 'iteration',
		label: 'Cells',
		examples: [{ source: '+˝˘ 2‿3⥊↕6', result: '⟨ 3 12 ⟩' }]
	},
	{
		glyph: '¨',
		kind: 'mod1',
		category: 'iteration',
		label: 'Each',
		examples: [{ source: '-¨ 1‿2‿3', result: '⟨ ¯1 ¯2 ¯3 ⟩' }]
	},
	{ glyph: '⌜', kind: 'mod1', category: 'iteration', label: 'Table' },
	{
		glyph: '⁼',
		kind: 'mod1',
		category: 'iteration',
		label: 'Undo',
		examples: [{ source: '⌽⁼ 1‿2‿3', result: '⟨ 3 2 1 ⟩' }]
	},
	{
		glyph: '´',
		kind: 'mod1',
		category: 'iteration',
		label: 'Fold',
		examples: [
			{ source: '+´ 1‿2‿3‿4', result: '10' },
			{ source: '×´ 1‿2‿3‿4', result: '24' }
		]
	},
	{
		glyph: '˝',
		kind: 'mod1',
		category: 'iteration',
		label: 'Insert',
		examples: [{ source: '+˝ 2‿3⥊↕6', result: '⟨ 3 5 7 ⟩' }]
	},
	{
		glyph: '`',
		kind: 'mod1',
		category: 'iteration',
		label: 'Scan',
		examples: [{ source: '+` 1‿2‿3‿4', result: '⟨ 1 3 6 10 ⟩' }]
	}
];

const mods2: Primitive[] = [
	{
		glyph: '∘',
		kind: 'mod2',
		category: 'combinator',
		label: 'Atop',
		examples: [{ source: '-∘+ 3', result: '¯3' }]
	},
	{
		glyph: '○',
		kind: 'mod2',
		category: 'combinator',
		label: 'Over',
		examples: [{ source: '3 +○- 5', result: '¯8' }]
	},
	{
		glyph: '⊸',
		kind: 'mod2',
		category: 'combinator',
		label: 'Before / Bind',
		examples: [{ source: '2⊸× 5', result: '10' }]
	},
	{
		glyph: '⟜',
		kind: 'mod2',
		category: 'combinator',
		label: 'After / Bind',
		examples: [{ source: '-⟜1 5', result: '4' }]
	},
	{
		glyph: '⊘',
		kind: 'mod2',
		category: 'combinator',
		label: 'Valences',
		examples: [
			{ source: '(-⊘+) 5', result: '¯5' },
			{ source: '3 (-⊘+) 5', result: '8' }
		]
	},
	{
		glyph: '◶',
		kind: 'mod2',
		category: 'combinator',
		label: 'Choose',
		examples: [{ source: '1 (=◶-‿+) 1', result: '2' }]
	},
	{
		glyph: '⌾',
		kind: 'mod2',
		category: 'combinator',
		label: 'Under',
		examples: [{ source: '-⌾(2⊸×) 5', result: '¯5' }]
	},
	{
		glyph: '⎊',
		kind: 'mod2',
		category: 'combinator',
		label: 'Catch',
		examples: [{ source: '{!𝕩}⎊{99} 0', result: '99' }]
	},
	{
		glyph: '⎉',
		kind: 'mod2',
		category: 'iteration',
		label: 'Rank',
		examples: [{ source: '+˝⎉1 2‿3⥊↕6', result: '⟨ 3 12 ⟩' }]
	},
	{
		glyph: '⚇',
		kind: 'mod2',
		category: 'iteration',
		label: 'Depth',
		examples: [{ source: '-⚇0 ⟨1, ⟨2, 3⟩⟩', result: '⟨ ¯1 ⟨ ¯2 ¯3 ⟩ ⟩' }]
	},
	{
		glyph: '⍟',
		kind: 'mod2',
		category: 'iteration',
		label: 'Repeat',
		examples: [{ source: '+⟜1⍟3 0', result: '3' }]
	}
];

// The "sym" tab is the catch-all keyboard: digits, BQN-specific syntax
// characters, argument/operand glyphs used inside function bodies, and
// action tiles (backspace, newline, space). With this tab present the
// palette is a complete numeric-BQN input method — no OS keyboard needed.
const syms: Primitive[] = [
	// Digits + decimal
	{ glyph: '0', kind: 'sym', category: 'syntax', label: 'Digit 0' },
	{ glyph: '1', kind: 'sym', category: 'syntax', label: 'Digit 1' },
	{ glyph: '2', kind: 'sym', category: 'syntax', label: 'Digit 2' },
	{ glyph: '3', kind: 'sym', category: 'syntax', label: 'Digit 3' },
	{ glyph: '4', kind: 'sym', category: 'syntax', label: 'Digit 4' },
	{ glyph: '5', kind: 'sym', category: 'syntax', label: 'Digit 5' },
	{ glyph: '6', kind: 'sym', category: 'syntax', label: 'Digit 6' },
	{ glyph: '7', kind: 'sym', category: 'syntax', label: 'Digit 7' },
	{ glyph: '8', kind: 'sym', category: 'syntax', label: 'Digit 8' },
	{ glyph: '9', kind: 'sym', category: 'syntax', label: 'Digit 9' },
	{ glyph: '.', kind: 'sym', category: 'syntax', label: 'Decimal point' },
	// Literal modifiers and constants
	{ glyph: '¯', kind: 'sym', category: 'syntax', label: 'Negative sign (for literals)' },
	{
		glyph: 'π',
		kind: 'sym',
		category: 'syntax',
		label: 'Pi',
		examples: [{ source: 'π', result: '3.141592653589793' }]
	},
	{
		glyph: '∞',
		kind: 'sym',
		category: 'syntax',
		label: 'Infinity',
		examples: [{ source: '∞', result: '∞' }]
	},
	// Structural punctuation
	{
		glyph: '‿',
		kind: 'sym',
		category: 'syntax',
		label: 'Ligature — build a list',
		examples: [{ source: '1‿2‿3', result: '⟨ 1 2 3 ⟩' }]
	},
	{
		glyph: '⟨',
		kind: 'sym',
		category: 'syntax',
		label: 'Open list',
		examples: [{ source: '⟨1, 2, 3⟩', result: '⟨ 1 2 3 ⟩' }]
	},
	{
		glyph: '⟩',
		kind: 'sym',
		category: 'syntax',
		label: 'Close list',
		examples: [{ source: '⟨1, 2, 3⟩', result: '⟨ 1 2 3 ⟩' }]
	},
	{
		glyph: '(',
		kind: 'sym',
		category: 'syntax',
		label: 'Open parenthesis (grouping)',
		examples: [{ source: '(1 + 2) × 3', result: '9' }]
	},
	{
		glyph: ')',
		kind: 'sym',
		category: 'syntax',
		label: 'Close parenthesis',
		examples: [{ source: '(1 + 2) × 3', result: '9' }]
	},
	{
		glyph: '{',
		kind: 'sym',
		category: 'syntax',
		label: 'Open block (function body)',
		examples: [{ source: '{𝕩+1} 5', result: '6' }]
	},
	{
		glyph: '}',
		kind: 'sym',
		category: 'syntax',
		label: 'Close block',
		examples: [{ source: '{𝕩+1} 5', result: '6' }]
	},
	{
		glyph: '"',
		kind: 'sym',
		category: 'syntax',
		label: 'String delimiter',
		examples: [{ source: '"hi"', result: '"hi"' }]
	},
	{
		glyph: "'",
		kind: 'sym',
		category: 'syntax',
		label: 'Character delimiter',
		examples: [{ source: "'a'", result: "'a'" }]
	},
	{ glyph: '←', kind: 'sym', category: 'syntax', label: 'Define' },
	{ glyph: '↩', kind: 'sym', category: 'syntax', label: 'Modify / reassign' },
	{ glyph: '⋄', kind: 'sym', category: 'syntax', label: 'Statement separator' },
	{ glyph: ',', kind: 'sym', category: 'syntax', label: 'Separator (synonym for ⋄)' },
	{ glyph: ':', kind: 'sym', category: 'syntax', label: 'Block header separator' },
	{ glyph: ';', kind: 'sym', category: 'syntax', label: 'Case alternative in block' },
	{ glyph: '@', kind: 'sym', category: 'syntax', label: 'Null character' },
	{ glyph: '\\', kind: 'sym', category: 'syntax', label: 'Slash leader (then a letter inserts a glyph)' },
	// Argument / operand glyphs (bodies of blocks)
	{ glyph: '𝕨', kind: 'sym', category: 'syntax', label: 'Left argument' },
	{ glyph: '𝕩', kind: 'sym', category: 'syntax', label: 'Right argument' },
	{ glyph: '𝕗', kind: 'sym', category: 'syntax', label: 'Left operand (value)' },
	{ glyph: '𝕘', kind: 'sym', category: 'syntax', label: 'Right operand (value)' },
	{ glyph: '𝔽', kind: 'sym', category: 'syntax', label: 'Left operand (function)' },
	{ glyph: '𝔾', kind: 'sym', category: 'syntax', label: 'Right operand (function)' },
	{ glyph: '𝕤', kind: 'sym', category: 'syntax', label: 'Self (for recursion)' }
];

export const primitives: Record<PrimKind, Primitive[]> = {
	fn: fns,
	mod1: mods1,
	mod2: mods2,
	sym: syms
};

// Lookup by glyph for navigating between primitives — used by the help
// card to make every character of an example tappable.
export const primitiveByGlyph: Map<string, Primitive> = new Map();
for (const list of [fns, mods1, mods2, syms]) {
	for (const p of list) primitiveByGlyph.set(p.glyph, p);
}

// Flat catalog used by the palette grid: every primitive across all kinds,
// in current data order (which already groups by semantic category).
// Digits and the decimal point are excluded — they live on the OS
// keyboard and would only dilute a glyph-discovery surface.
export const allPrimitives: Primitive[] = [
	...fns,
	...mods1,
	...mods2,
	...syms.filter((p) => !/^[0-9.]$/.test(p.glyph))
];

// Sectioned view used by the palette: each section has a heading and a
// list of primitives that belong to it. Order top-to-bottom is the
// reading order in the palette grid.
const inSet = (glyphs: string[]) => (p: Primitive) => glyphs.includes(p.glyph);

export const paletteSections: { label: string; primitives: Primitive[] }[] = [
	{ label: 'Arithmetic', primitives: fns.filter((p) => p.category === 'arithmetic') },
	{ label: 'Logic', primitives: fns.filter((p) => p.category === 'logic') },
	{ label: 'Comparison', primitives: fns.filter((p) => p.category === 'comparison') },
	{ label: 'Structural', primitives: fns.filter((p) => p.category === 'structural') },
	{ label: 'Search', primitives: fns.filter((p) => p.category === 'search') },
	{ label: 'Other', primitives: fns.filter((p) => p.category === 'other') },
	{ label: '1-Modifier · combinator', primitives: mods1.filter((p) => p.category === 'combinator') },
	{ label: '1-Modifier · iteration', primitives: mods1.filter((p) => p.category === 'iteration') },
	{ label: '2-Modifier · combinator', primitives: mods2.filter((p) => p.category === 'combinator') },
	{ label: '2-Modifier · iteration', primitives: mods2.filter((p) => p.category === 'iteration') },
	{ label: 'Constants', primitives: syms.filter(inSet(['¯', 'π', '∞'])) },
	{ label: 'Lists', primitives: syms.filter(inSet(['‿', '⟨', '⟩'])) },
	{ label: 'Brackets', primitives: syms.filter(inSet(['(', ')', '{', '}', '"', "'"])) },
	{ label: 'Separators', primitives: syms.filter(inSet(['⋄', ',', ':', ';'])) },
	{ label: 'Assignment', primitives: syms.filter(inSet(['←', '↩'])) },
	{ label: 'Misc', primitives: syms.filter(inSet(['@', '\\'])) },
	{ label: 'Argument glyphs', primitives: syms.filter(inSet(['𝕨', '𝕩', '𝕗', '𝕘', '𝔽', '𝔾', '𝕤'])) }
];

// Tab layout for the palette. A tab can cover one or more primitive kinds —
// 1-modifiers and 2-modifiers share the `mod` tab so the palette doesn't
// jump in height between them; they're short lists and the distinction is
// readable from each glyph's label.
export type TabKey = 'fn' | 'mod' | 'sym';

export const tabs: { key: TabKey; label: string; kinds: PrimKind[] }[] = [
	{ key: 'fn', label: 'fn', kinds: ['fn'] },
	{ key: 'mod', label: '_m', kinds: ['mod1', 'mod2'] },
	{ key: 'sym', label: 'sym', kinds: ['sym'] }
];
