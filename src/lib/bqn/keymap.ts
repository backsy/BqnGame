// BQN slash-prefix mnemonic keymap, sourced from
// mlochbaum/BQN editors/inputrc (the canonical Readline keymap).
// `\X` inserted in the editor is rewritten to the corresponding glyph.
// To type a literal backslash, type `\\`.
//
// When updating, keep this in sync with upstream.

export const MNEMONICS: Map<string, string> = new Map([
	// backtick row
	['`', '˜'],
	['1', '˘'],
	['2', '¨'],
	['3', '⁼'],
	['4', '⌜'],
	['5', '´'],
	['6', '˝'],
	['8', '∞'],
	['9', '¯'],
	['0', '•'],
	['-', '÷'],
	['=', '×'],
	['~', '¬'],
	['!', '⎉'],
	['@', '⚇'],
	['#', '⍟'],
	['$', '◶'],
	['%', '⊘'],
	['^', '⎊'],
	['&', '⍎'],
	['*', '⍕'],
	['(', '⟨'],
	[')', '⟩'],
	['_', '√'],
	['+', '⋆'],
	// qwerty row
	['q', '⌽'],
	['w', '𝕨'],
	['e', '∊'],
	['r', '↑'],
	['t', '∧'],
	['u', '⊔'],
	['i', '⊏'],
	['o', '⊐'],
	['p', 'π'],
	['[', '←'],
	[']', '→'],
	['Q', '↙'],
	['W', '𝕎'],
	['E', '⍷'],
	['R', '𝕣'],
	['T', '⍋'],
	['I', '⊑'],
	['O', '⊒'],
	['P', '⍳'],
	['{', '⊣'],
	['}', '⊢'],
	// asdf row
	['a', '⍉'],
	['s', '𝕤'],
	['d', '↕'],
	['f', '𝕗'],
	['g', '𝕘'],
	['h', '⊸'],
	['j', '∘'],
	['k', '○'],
	['l', '⟜'],
	[';', '⋄'],
	["'", '↩'],
	['A', '↖'],
	['S', '𝕊'],
	['F', '𝔽'],
	['G', '𝔾'],
	['H', '«'],
	['K', '⌾'],
	['L', '»'],
	[':', '·'],
	['"', '˙'],
	// zxcv row
	['z', '⥊'],
	['x', '𝕩'],
	['c', '↓'],
	['v', '∨'],
	['b', '⌊'],
	['m', '≡'],
	[',', '∾'],
	['.', '≍'],
	['/', '≠'],
	['Z', '⋈'],
	['X', '𝕏'],
	['V', '⍒'],
	['B', '⌈'],
	['M', '≢'],
	['<', '≤'],
	['>', '≥'],
	['?', '⇐'],
	[' ', '‿'],
	// double-backslash escape
	['\\', '\\']
]);

// Reverse lookup: given a glyph, what `\X` produces it? Used by the help
// card so each primitive's tile shows the canonical shortcut next to its
// name. Skips the literal-backslash entry since `\\ → \` is documentation
// noise; keeps the first key for any glyph that has multiple sources.
export const GLYPH_TO_MNEMONIC: Map<string, string> = (() => {
	const m = new Map<string, string>();
	for (const [key, glyph] of MNEMONICS) {
		if (key === '\\' || glyph === '\\') continue;
		if (!m.has(glyph)) m.set(glyph, key);
	}
	return m;
})();
