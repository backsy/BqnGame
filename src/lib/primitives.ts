// Primitive data for the glyph palette. Source of truth for meanings is
// docs/bqn-reference.md. When editing, keep both in sync.

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

export interface Primitive {
	glyph: string;
	kind: PrimKind;
	category: Category;
	/** short label, what a learner would call it */
	label: string;
}

const fns: Primitive[] = [
	{ glyph: '+', kind: 'fn', category: 'arithmetic', label: 'Add / Conjugate' },
	{ glyph: '-', kind: 'fn', category: 'arithmetic', label: 'Subtract / Negate' },
	{ glyph: '×', kind: 'fn', category: 'arithmetic', label: 'Multiply / Sign' },
	{ glyph: '÷', kind: 'fn', category: 'arithmetic', label: 'Divide / Reciprocal' },
	{ glyph: '⋆', kind: 'fn', category: 'arithmetic', label: 'Power / Exponential' },
	{ glyph: '√', kind: 'fn', category: 'arithmetic', label: 'Root / Square Root' },
	{ glyph: '⌊', kind: 'fn', category: 'arithmetic', label: 'Minimum / Floor' },
	{ glyph: '⌈', kind: 'fn', category: 'arithmetic', label: 'Maximum / Ceiling' },
	{ glyph: '|', kind: 'fn', category: 'arithmetic', label: 'Modulus / Absolute' },

	{ glyph: '∧', kind: 'fn', category: 'logic', label: 'And / Sort Up' },
	{ glyph: '∨', kind: 'fn', category: 'logic', label: 'Or / Sort Down' },
	{ glyph: '¬', kind: 'fn', category: 'logic', label: 'Span / Not' },

	{ glyph: '<', kind: 'fn', category: 'comparison', label: 'Less Than / Enclose' },
	{ glyph: '>', kind: 'fn', category: 'comparison', label: 'Greater Than / Merge' },
	{ glyph: '≤', kind: 'fn', category: 'comparison', label: 'Less Than or Equal' },
	{ glyph: '≥', kind: 'fn', category: 'comparison', label: 'Greater Than or Equal' },
	{ glyph: '=', kind: 'fn', category: 'comparison', label: 'Equals / Rank' },
	{ glyph: '≠', kind: 'fn', category: 'comparison', label: 'Not Equals / Length' },
	{ glyph: '≡', kind: 'fn', category: 'comparison', label: 'Match / Depth' },
	{ glyph: '≢', kind: 'fn', category: 'comparison', label: 'Not Match / Shape' },

	{ glyph: '⊣', kind: 'fn', category: 'structural', label: 'Left / Identity' },
	{ glyph: '⊢', kind: 'fn', category: 'structural', label: 'Right / Identity' },
	{ glyph: '⥊', kind: 'fn', category: 'structural', label: 'Reshape / Deshape' },
	{ glyph: '∾', kind: 'fn', category: 'structural', label: 'Join to / Join' },
	{ glyph: '≍', kind: 'fn', category: 'structural', label: 'Couple / Solo' },
	{ glyph: '⋈', kind: 'fn', category: 'structural', label: 'Pair / Enlist' },
	{ glyph: '↑', kind: 'fn', category: 'structural', label: 'Take / Prefixes' },
	{ glyph: '↓', kind: 'fn', category: 'structural', label: 'Drop / Suffixes' },
	{ glyph: '↕', kind: 'fn', category: 'structural', label: 'Windows / Range' },
	{ glyph: '»', kind: 'fn', category: 'structural', label: 'Shift Before / Nudge' },
	{ glyph: '«', kind: 'fn', category: 'structural', label: 'Shift After / Nudge Back' },
	{ glyph: '⌽', kind: 'fn', category: 'structural', label: 'Rotate / Reverse' },
	{ glyph: '⍉', kind: 'fn', category: 'structural', label: 'Reorder Axes / Transpose' },
	{ glyph: '/', kind: 'fn', category: 'structural', label: 'Replicate / Indices' },

	{ glyph: '⍋', kind: 'fn', category: 'search', label: 'Bins Up / Grade Up' },
	{ glyph: '⍒', kind: 'fn', category: 'search', label: 'Bins Down / Grade Down' },
	{ glyph: '⊏', kind: 'fn', category: 'search', label: 'Select / First Cell' },
	{ glyph: '⊑', kind: 'fn', category: 'search', label: 'Pick / First' },
	{ glyph: '⊐', kind: 'fn', category: 'search', label: 'Index of / Classify' },
	{ glyph: '⊒', kind: 'fn', category: 'search', label: 'Progressive Index of / Occurrence Count' },
	{ glyph: '∊', kind: 'fn', category: 'search', label: 'Member of / Mark Firsts' },
	{ glyph: '⍷', kind: 'fn', category: 'search', label: 'Find / Deduplicate' },
	{ glyph: '⊔', kind: 'fn', category: 'search', label: 'Group / Group Indices' },

	{ glyph: '!', kind: 'fn', category: 'other', label: 'Assert' }
];

const mods1: Primitive[] = [
	{ glyph: '˙', kind: 'mod1', category: 'combinator', label: 'Constant' },
	{ glyph: '˜', kind: 'mod1', category: 'combinator', label: 'Self / Swap' },
	{ glyph: '˘', kind: 'mod1', category: 'iteration', label: 'Cells' },
	{ glyph: '¨', kind: 'mod1', category: 'iteration', label: 'Each' },
	{ glyph: '⌜', kind: 'mod1', category: 'iteration', label: 'Table' },
	{ glyph: '⁼', kind: 'mod1', category: 'iteration', label: 'Undo' },
	{ glyph: '´', kind: 'mod1', category: 'iteration', label: 'Fold' },
	{ glyph: '˝', kind: 'mod1', category: 'iteration', label: 'Insert' },
	{ glyph: '`', kind: 'mod1', category: 'iteration', label: 'Scan' }
];

const mods2: Primitive[] = [
	{ glyph: '∘', kind: 'mod2', category: 'combinator', label: 'Atop' },
	{ glyph: '○', kind: 'mod2', category: 'combinator', label: 'Over' },
	{ glyph: '⊸', kind: 'mod2', category: 'combinator', label: 'Before / Bind' },
	{ glyph: '⟜', kind: 'mod2', category: 'combinator', label: 'After / Bind' },
	{ glyph: '⊘', kind: 'mod2', category: 'combinator', label: 'Valences' },
	{ glyph: '◶', kind: 'mod2', category: 'combinator', label: 'Choose' },
	{ glyph: '⌾', kind: 'mod2', category: 'combinator', label: 'Under' },
	{ glyph: '⎊', kind: 'mod2', category: 'combinator', label: 'Catch' },
	{ glyph: '⎉', kind: 'mod2', category: 'iteration', label: 'Rank' },
	{ glyph: '⚇', kind: 'mod2', category: 'iteration', label: 'Depth' },
	{ glyph: '⍟', kind: 'mod2', category: 'iteration', label: 'Repeat' }
];

// Syntax characters not on any OS keyboard. These are not primitives in the
// BQN sense — they're punctuation, literals, and the argument/operand
// glyphs used inside function bodies. Bundled here so the palette can
// surface them on one tab.
const syms: Primitive[] = [
	{ glyph: '¯', kind: 'sym', category: 'syntax', label: 'Negative sign (for literals)' },
	{ glyph: 'π', kind: 'sym', category: 'syntax', label: 'Pi' },
	{ glyph: '∞', kind: 'sym', category: 'syntax', label: 'Infinity' },
	{ glyph: '‿', kind: 'sym', category: 'syntax', label: 'Ligature — build a list' },
	{ glyph: '⟨', kind: 'sym', category: 'syntax', label: 'Open list' },
	{ glyph: '⟩', kind: 'sym', category: 'syntax', label: 'Close list' },
	{ glyph: '←', kind: 'sym', category: 'syntax', label: 'Define' },
	{ glyph: '↩', kind: 'sym', category: 'syntax', label: 'Modify / reassign' },
	{ glyph: '⋄', kind: 'sym', category: 'syntax', label: 'Statement separator' },
	{ glyph: '@', kind: 'sym', category: 'syntax', label: 'Null character' },
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

export const kindLabels: Record<PrimKind, string> = {
	fn: 'fn',
	mod1: '_m',
	mod2: '_m_',
	sym: 'sym'
};
