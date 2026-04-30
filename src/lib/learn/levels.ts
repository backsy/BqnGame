// Game level data. Each level has a starting value, a target value, and
// the runes the player can apply. Both values are stored as BQN source
// expressions; the engine evaluates them via the synchronous main-thread
// interpreter and visualises the result via ValueViz.
//
// Runes are unary: `result = (rune.expr) (current)`.
//
// The level list is organised as themed blocks of ten. We open with the
// most visually immediate primitives (⌽ reverse, ↕ range) so the first
// minute feels like rearranging shapes, not arithmetic. Scalar arithmetic
// shows up earlier as broadcast-over-rows ("sneak it in") and only gets its
// own block much later, reframed as fine control over a single value.
// Predicates and filter (Block 11) unlock the count-occurrences /
// keep-where idioms that make APL feel like APL.

export interface Rune {
	glyph: string;
	expr: string;
}

export interface Level {
	id: number;
	start: string;
	target: string;
	runes: Rune[];
}

// Rune library — picked once and reused across levels for consistency.
//
// `expr` is the real BQN we hand to the interpreter. `glyph` is what
// goes on the rune button: same as expr for the unmodified primitives,
// but with the bind glyphs `⊸` / `⟜` stripped so the player sees the
// operation and its bound argument (e.g. "2↑", "+1") rather than our
// dyadic-to-unary plumbing. Bind is how *the app* hooks a dyadic
// function up to a single-argument button — it's not part of the
// action the player is learning. All other modifiers (˜ ´ ` ⌜ ˘) are
// language-level and stay on the label.
const r = (glyph: string, expr: string): Rune => ({ glyph, expr });
const same = (s: string): Rune => ({ glyph: s, expr: s });
const R = {
	add1: r('+1', '+⟜1'),
	add2: r('+2', '+⟜2'),
	add3: r('+3', '+⟜3'),
	add4: r('+4', '+⟜4'),
	add5: r('+5', '+⟜5'),
	sub1: r('-1', '-⟜1'),
	sub2: r('-2', '-⟜2'),
	sub3: r('-3', '-⟜3'),
	sub4: r('-4', '-⟜4'),
	mul2: r('×2', '×⟜2'),
	mul3: r('×3', '×⟜3'),
	mul4: r('×4', '×⟜4'),
	div2: r('÷2', '÷⟜2'),
	div3: r('÷3', '÷⟜3'),
	div4: r('÷4', '÷⟜4'),
	square: same('×˜'),
	double: same('+˜'),
	rev: same('⌽'),
	range: same('↕'),
	take2: r('2↑', '2⊸↑'),
	take3: r('3↑', '3⊸↑'),
	take4: r('4↑', '4⊸↑'),
	drop1: r('1↓', '1⊸↓'),
	drop2: r('2↓', '2⊸↓'),
	drop3: r('3↓', '3⊸↓'),
	rot1: r('1⌽', '1⊸⌽'),
	sumf: same('+´'),
	prodf: same('×´'),
	maxf: same('⌈´'),
	minf: same('⌊´'),
	sums: same('+`'),
	prods: same('×`'),
	maxs: same('⌈`'),
	mins: same('⌊`'),
	sortup: same('∧'),
	sortdn: same('∨'),
	len: same('≠'),
	first: same('⊑'),
	pick1: r('1⊑', '1⊸⊑'),
	pick2: r('2⊑', '2⊸⊑'),
	rs23: r('2‿3⥊', '2‿3⊸⥊'),
	rs32: r('3‿2⥊', '3‿2⊸⥊'),
	rs22: r('2‿2⥊', '2‿2⊸⥊'),
	rep3: r('3⥊', '3⊸⥊'),
	rep4: r('4⥊', '4⊸⥊'),
	transp: same('⍉'),
	deshape: same('⥊'),
	eq3: r('=3', '=⟜3'),
	eq1: r('=1', '=⟜1'),
	lt3: r('<3', '<⟜3'),
	lt5: r('<5', '<⟜5'),
	gt2: r('>2', '>⟜2'),
	keepLt5: r('/<5', '(<⟜5)⊸/'),
	keepLt6: r('/<6', '(<⟜6)⊸/'),
	keepEq1: r('/=1', '(=⟜1)⊸/'),
	app34: r('∾3‿4', '∾⟜3‿4'),
	app45: r('∾4‿5', '∾⟜4‿5'),
	app345: r('∾3‿4‿5', '∾⟜3‿4‿5'),
	app4: r('∾⟨4⟩', '∾⟜⟨4⟩'),
	app5: r('∾⟨5⟩', '∾⟜⟨5⟩'),
	prep12: r('1‿2∾', '1‿2⊸∾'),
	selfcat: same('∾˜'),
	appDef: r('∾"def"', '∾⟜"def"'),
	prepHello: r('"hi "∾', '"hi "⊸∾'),
	appBang: r('∾"!"', '∾⟜"!"'),
	addtab: same('+⌜˜'),
	multtab: same('×⌜˜'),
	idtab: same('=⌜˜'),
	lttab: same('<⌜˜'),
	gttab: same('>⌜˜'),
	wins2: r('2↕', '2⊸↕'),
	wins3: r('3↕', '3⊸↕'),
	wins4: r('4↕', '4⊸↕'),
	rowsum: same('+´˘'),
	rowmax: same('⌈´˘'),
	rowmin: same('⌊´˘'),
	mod2: r('2|', '2⊸|'),
	mod3: r('3|', '3⊸|'),
	mod10: r('10|', '10⊸|')
};

export const levels: Level[] = [
	// ============================================================
	// Block 1 — Rows: ⌽ ↕ ↑ ↓ rearranging a list
	// Open on the most visual primitives. Arithmetic sneaks in at the
	// end as something that broadcasts over a row.
	// ============================================================
	{ id: 1, start: '1‿2‿3‿4', target: '4‿3', runes: [R.rev, R.take2] },
	{ id: 2, start: '4', target: '1‿2‿3', runes: [R.range, R.add1, R.take3] },
	{ id: 3, start: '5', target: '4‿3‿2‿1‿0', runes: [R.range, R.rev] },
	{ id: 4, start: '5‿4‿3‿2‿1', target: '1‿2‿3', runes: [R.rev, R.take3, R.drop2] },
	{ id: 5, start: '1‿2‿3‿4‿5', target: '5‿4', runes: [R.rev, R.take2, R.drop3] },
	{ id: 6, start: '1‿2‿3‿4‿5', target: '5‿4‿3', runes: [R.take3, R.rev] },
	{ id: 7, start: '1‿2‿3', target: '5‿6‿7', runes: [R.add1, R.add3] },
	{ id: 8, start: '1‿2‿3', target: '4‿8‿12', runes: [R.mul2, R.add1] },
	{ id: 9, start: '1‿2‿3', target: '4‿6‿8', runes: [R.add1, R.mul2] },
	{ id: 10, start: '5', target: '1‿2‿3‿4‿5', runes: [R.range, R.add1] },

	// ============================================================
	// Block 2 — Order: ∧ ∨ sort, the satisfying-rearrange one
	// ============================================================
	{ id: 11, start: '3‿1‿2‿3', target: '3‿3‿2‿1', runes: [R.sortup, R.rev] },
	{ id: 12, start: '1‿3‿2', target: '3‿2‿1', runes: [R.sortup, R.rev] },
	{ id: 13, start: '3‿1‿4‿1‿5', target: '5‿4‿3‿1‿1', runes: [R.sortup, R.rev] },
	{ id: 14, start: '5‿6‿7‿8', target: '8‿7', runes: [R.sortdn, R.take2, R.sortup] },
	{ id: 15, start: '3‿1‿4‿1‿5‿9', target: '9‿5‿4', runes: [R.sortdn, R.take3, R.rev] },
	{ id: 16, start: '3‿1‿4‿1‿5‿9', target: '1‿1‿3', runes: [R.sortup, R.take3] },
	{ id: 17, start: '3‿1‿4‿1‿5', target: '3‿4‿5', runes: [R.sortup, R.drop2] },
	{ id: 18, start: '5‿2‿8‿1‿9‿3', target: '9', runes: [R.sortdn, R.first] },
	{ id: 19, start: '3‿1‿4‿1‿5', target: '1‿4‿1‿3', runes: [R.drop1, R.rev, R.sortup] },
	{ id: 20, start: '5‿2‿8‿1', target: '8', runes: [R.sortdn, R.first, R.rev] },

	// ============================================================
	// Block 3 — Shape: ⥊ ⍉ lines become grids
	// ============================================================
	{ id: 21, start: '4', target: '16‿16‿16', runes: [R.rep3, R.rep4, R.square] },
	{ id: 22, start: '7', target: '49‿49‿49', runes: [R.rep3, R.rep4, R.square] },
	{ id: 23, start: '1‿2‿3‿4‿5‿6', target: '2‿3⥊6‿5‿4‿3‿2‿1', runes: [R.rs23, R.rs32, R.rev] },
	{
		id: 24,
		start: '1‿2‿3‿4‿5‿6',
		target: '⍉ 2‿3⥊1‿2‿3‿4‿5‿6',
		runes: [R.rs23, R.transp]
	},
	{
		id: 25,
		start: '2‿2⥊1‿2‿3‿4',
		target: '2‿2⥊4‿3‿2‿1',
		runes: [R.rev, R.transp, R.deshape]
	},
	{
		id: 26,
		start: '2‿2⥊1‿2‿3‿4',
		target: '4‿3‿2‿1',
		runes: [R.deshape, R.rev, R.transp]
	},
	{ id: 27, start: '6', target: '2‿3⥊↕6', runes: [R.range, R.rs23] },
	{ id: 28, start: '6', target: '⍉ 2‿3⥊↕6', runes: [R.range, R.rs23, R.transp] },
	{
		id: 29,
		start: '6',
		target: '2‿3⥊1‿2‿3‿4‿5‿6',
		runes: [R.range, R.add1, R.rs23]
	},
	{
		id: 30,
		start: '4',
		target: '2‿2⥊4‿3‿2‿1',
		runes: [R.range, R.add1, R.rev, R.rs22]
	},

	// ============================================================
	// Block 4 — Strings: characters work the same way
	// ============================================================
	{ id: 31, start: '"abc"', target: '"cb"', runes: [R.rev, R.take2] },
	{ id: 32, start: '"cab"', target: '"cba"', runes: [R.sortup, R.rev] },
	{ id: 33, start: '"hello"', target: '"oll"', runes: [R.rev, R.take3, R.drop2] },
	{ id: 34, start: '"hello"', target: '"leh"', runes: [R.rev, R.drop2, R.take3] },
	{ id: 35, start: '"banana"', target: '"banan"', runes: [R.drop1, R.rev, R.take3] },
	{ id: 36, start: '"banana"', target: '"nanab"', runes: [R.rot1, R.drop1] },
	{ id: 37, start: '"hello"', target: '25', runes: [R.len, R.square] },
	{ id: 38, start: '"hello"', target: '"olle"', runes: [R.rev, R.drop1, R.take3] },
	{ id: 39, start: '"banana"', target: '"nnbaaa"', runes: [R.sortup, R.rev] },
	{
		id: 40,
		start: '"world"',
		target: '"row"',
		runes: [R.rev, R.take3, R.drop2]
	},

	// ============================================================
	// Block 5 — Indexing: ⊑ pick a single element
	// ============================================================
	{ id: 41, start: '5‿7‿9‿11', target: '11', runes: [R.first, R.rev] },
	{ id: 42, start: '5‿7‿9', target: '9', runes: [R.first, R.rev] },
	{ id: 43, start: '5‿7‿9', target: '49', runes: [R.pick1, R.first, R.square] },
	{ id: 44, start: '3‿1‿4‿1‿5', target: '16', runes: [R.pick2, R.first, R.square] },
	{ id: 45, start: '3‿1‿4‿1‿5', target: '5', runes: [R.first, R.rev, R.drop1] },
	{ id: 46, start: '"hello"', target: '"o"', runes: [R.rev, R.take2, R.drop1] },
	{ id: 47, start: '"world"', target: '"r"', runes: [R.drop1, R.take3, R.rev] },
	{
		id: 48,
		start: '⟨5,3,8,1,4⟩',
		target: '8',
		runes: [R.sortdn, R.first]
	},
	{
		id: 49,
		start: '⟨5,3,8,1,4⟩',
		target: '1',
		runes: [R.sortup, R.first]
	},
	{
		id: 50,
		start: '5‿2‿8‿1‿9‿3',
		target: '9',
		runes: [R.sortdn, R.pick2, R.first]
	},

	// ============================================================
	// Block 6 — Scans: +` ⌈` running computations you can watch
	// ============================================================
	{ id: 51, start: '1‿2‿3‿4', target: '10‿6‿3‿1', runes: [R.sums, R.rev] },
	{ id: 52, start: '1‿2‿3‿4', target: '24‿6‿2‿1', runes: [R.prods, R.rev] },
	{ id: 53, start: '1‿2‿3‿4', target: '10‿9‿7‿4', runes: [R.sums, R.rev] },
	{
		id: 54,
		start: '1‿3‿4‿2‿5',
		target: '5‿4‿4‿3‿1',
		runes: [R.maxs, R.rev, R.sortup]
	},
	{ id: 55, start: '5‿1‿4‿2‿3', target: '1‿1‿1‿1‿5', runes: [R.mins, R.rev] },
	{ id: 56, start: '1‿2‿3', target: '6‿3‿1', runes: [R.sums, R.rev, R.prods] },
	{ id: 57, start: '5', target: '1‿3‿6‿10‿15', runes: [R.range, R.add1, R.sums] },
	{
		id: 58,
		start: '4',
		target: '24‿6‿2‿1',
		runes: [R.range, R.add1, R.prods, R.rev]
	},
	{
		id: 59,
		start: '1‿2‿3‿4',
		target: '4‿7‿9‿10',
		runes: [R.sums, R.rev]
	},
	{
		id: 60,
		start: '1‿2‿3‿4‿5',
		target: '15‿10‿6‿3‿1',
		runes: [R.sums, R.rev, R.sumf]
	},

	// ============================================================
	// Block 7 — Folds: +´ ×´ collapsing a row to a scalar
	// ============================================================
	{ id: 61, start: '1‿2‿3', target: '7', runes: [R.sumf, R.add1] },
	{ id: 62, start: '0‿1‿2‿3', target: '24', runes: [R.prodf, R.sumf, R.add1] },
	{ id: 63, start: '5‿1‿4‿2‿3', target: '6', runes: [R.maxf, R.minf, R.add1] },
	{ id: 64, start: '5‿1‿4‿2‿3', target: '2', runes: [R.minf, R.prodf, R.add1] },
	{ id: 65, start: '1‿2‿3‿4‿5', target: '30', runes: [R.sumf, R.mul2, R.add5] },
	{ id: 66, start: '1‿2‿3', target: '12', runes: [R.mul2, R.sumf] },
	{ id: 67, start: '5', target: '10', runes: [R.range, R.sumf] },
	{ id: 68, start: '4', target: '24', runes: [R.range, R.add1, R.prodf] },
	{ id: 69, start: '5', target: '20', runes: [R.range, R.mul2, R.sumf] },
	{ id: 70, start: '6', target: '30', runes: [R.range, R.sumf, R.mul2] },

	// ============================================================
	// Block 8 — Numbers: scalar arithmetic, reframed as fine control
	// over a single value. By now the player has already used +1, ×2
	// etc. broadcast over rows, so this is a precision exercise — not
	// a math intro.
	// ============================================================
	{ id: 71, start: '8', target: '2', runes: [R.div2, R.add1] },
	{ id: 72, start: '2', target: '16', runes: [R.square, R.mul2] },
	{ id: 73, start: '10', target: '1', runes: [R.sub3, R.sub2, R.sub4] },
	{ id: 74, start: '10', target: '6', runes: [R.sub3, R.sub1, R.add1] },
	{ id: 75, start: '8', target: '6', runes: [R.div2, R.add2] },
	{ id: 76, start: '8', target: '5', runes: [R.div2, R.add1, R.sub1] },
	{ id: 77, start: '3', target: '18', runes: [R.square, R.mul2] },
	{ id: 78, start: '2', target: '11', runes: [R.add5, R.mul3, R.add1] },
	{ id: 79, start: '1', target: '17', runes: [R.add1, R.mul2] },
	{ id: 80, start: '3', target: '10', runes: [R.add1, R.add2, R.mul2, R.mul3] },

	// ============================================================
	// Block 9 — Element-wise: broadcasting and squaring lists
	// ============================================================
	{ id: 81, start: '0‿1‿2', target: '1‿4‿9', runes: [R.square, R.add1] },
	{ id: 82, start: '1‿2‿3', target: '4‿16‿36', runes: [R.square, R.double] },
	{ id: 83, start: '0‿1‿2‿3', target: '1‿4‿9‿16', runes: [R.square, R.add1] },
	{ id: 84, start: '4‿8‿12', target: '1‿2‿3', runes: [R.div2, R.div3] },
	{ id: 85, start: '10‿8‿6', target: '4‿3‿2', runes: [R.div2, R.sub1] },
	{ id: 86, start: '1‿2‿3‿4', target: '4‿9‿16‿25', runes: [R.add1, R.square] },
	{ id: 87, start: '1‿2‿3', target: '14', runes: [R.square, R.sumf] },
	{ id: 88, start: '1‿2‿3‿4', target: '30', runes: [R.square, R.sumf] },
	{ id: 89, start: '4', target: '30', runes: [R.range, R.add1, R.square, R.sumf] },
	{ id: 90, start: '3', target: '14', runes: [R.range, R.add1, R.square, R.sumf] },

	// ============================================================
	// Block 10 — Capstones: 3–5 tap chains using the whole vocabulary
	// ============================================================
	{
		id: 91,
		start: '5',
		target: '15',
		runes: [R.range, R.add1, R.sumf, R.prodf]
	},
	{
		id: 92,
		start: '6',
		target: '21',
		runes: [R.range, R.add1, R.sumf, R.maxf]
	},
	{
		id: 93,
		start: '5',
		target: '120',
		runes: [R.range, R.add1, R.prodf]
	},
	{
		id: 94,
		start: '6',
		target: '720',
		runes: [R.range, R.add1, R.prodf]
	},
	{
		id: 95,
		start: '4',
		target: '1‿4‿9‿16',
		runes: [R.range, R.add1, R.square, R.rev]
	},
	{
		id: 96,
		start: '5',
		target: '15‿14‿12‿9‿5',
		runes: [R.range, R.add1, R.sums, R.rev]
	},
	{
		id: 97,
		start: '4',
		target: '4‿3‿2‿1',
		runes: [R.range, R.add1, R.rev]
	},
	{
		id: 98,
		start: '"banana"',
		target: '36',
		runes: [R.len, R.square, R.rev]
	},
	{
		id: 99,
		start: '5',
		target: '5‿9‿12‿14‿15',
		runes: [R.range, R.add1, R.rev, R.sums]
	},
	{
		id: 100,
		start: '4',
		target: '24',
		runes: [R.range, R.add1, R.prodf, R.sumf]
	},

	// ============================================================
	// Block 11 — Predicates & filter: =, <, > and (P⊸/) keep-where
	// L103 (count occurrences via +´∘=⟜N) is the moment APL clicks.
	// ============================================================
	{ id: 101, start: '0‿1‿2', target: '0‿0‿1', runes: [R.eq3, R.add1] },
	{ id: 102, start: '4‿1‿7‿0‿8', target: '0‿1‿0‿1‿0', runes: [R.lt5, R.add1] },
	{ id: 103, start: '1‿3‿3‿2‿3', target: '3', runes: [R.eq3, R.sumf] },
	{ id: 104, start: '1‿6‿2‿8‿3', target: '2‿3‿4', runes: [R.keepLt5, R.add1] },
	{ id: 105, start: '1‿8‿2‿7‿3', target: '6', runes: [R.keepLt5, R.sumf] },
	{ id: 106, start: '0‿2‿0‿1‿0‿3', target: '1‿1‿1', runes: [R.keepEq1, R.add1] },
	{ id: 107, start: '5‿2‿8‿1‿9‿3', target: '2', runes: [R.lt3, R.sumf] },
	{ id: 108, start: '2‿7‿3‿9‿4‿1', target: '4', runes: [R.keepLt5, R.len] },
	{ id: 109, start: '5‿2‿8‿1‿9‿3', target: '5', runes: [R.keepLt6, R.maxf] },
	{
		id: 110,
		start: '5',
		target: '30',
		runes: [R.range, R.add1, R.keepLt5, R.square, R.sumf]
	},

	// ============================================================
	// Block 12 — Review: mix runes from earlier blocks so older
	// concepts don't fade. Also pulls in the rarer glyphs (+˜, 1⌽,
	// 1⊑, 4↑, 3↓, 4⥊, ×3, =1) that the main path under-uses.
	// ============================================================
	{ id: 111, start: '1‿4‿8‿1‿5', target: '5', runes: [R.sortdn, R.pick1, R.first] },
	{ id: 112, start: '1‿2‿3', target: '4‿8‿12', runes: [R.double, R.mul2] },
	{ id: 113, start: '1‿2‿3‿4', target: '3‿4‿1‿2', runes: [R.rot1, R.rev] },
	{ id: 114, start: '8', target: '0‿1‿2‿3', runes: [R.range, R.take4, R.drop3] },
	{ id: 115, start: '5', target: '25‿25‿25‿25', runes: [R.rep4, R.square] },
	{ id: 116, start: '6', target: '3‿4‿5', runes: [R.range, R.drop3, R.rev] },
	{ id: 117, start: '1‿2‿1‿3‿1', target: '3', runes: [R.eq1, R.sumf] },
	{ id: 118, start: '5‿2‿8‿1‿9‿3', target: '9‿8‿5‿3', runes: [R.sortdn, R.take4] },
	{ id: 119, start: '1‿2‿3', target: '18', runes: [R.mul3, R.sumf] },
	{
		id: 120,
		start: '3',
		target: '6‿4‿2',
		runes: [R.range, R.add1, R.mul2, R.rev]
	},

	// ============================================================
	// Block 13 — Joining: ∾ glues two lists end-to-end. Bound forms
	// like (1‿2)⊸∾ prepend, ∾⟜(4‿5) append. ∾˜ joins x to itself.
	// ============================================================
	{ id: 121, start: '3‿4', target: '1‿2‿3‿4', runes: [R.prep12, R.app34] },
	{
		id: 122,
		start: '1‿2',
		target: '1‿2‿3‿4‿5',
		runes: [R.app34, R.app5, R.app45]
	},
	{ id: 123, start: '1‿2', target: '1‿2‿1‿2', runes: [R.selfcat] },
	{
		id: 124,
		start: '1‿2‿3',
		target: '1‿2‿3‿1‿2‿3‿4‿5',
		runes: [R.selfcat, R.app45]
	},
	{
		id: 125,
		start: '1‿2',
		target: '5‿4‿3‿2‿1',
		runes: [R.app345, R.rev, R.sortdn]
	},
	{ id: 126, start: '"abc"', target: '"abcdef"', runes: [R.appDef, R.rev] },
	{
		id: 127,
		start: '"world"',
		target: '"hi world"',
		runes: [R.prepHello, R.appBang]
	},
	{
		id: 128,
		start: '"world"',
		target: '"hi world!"',
		runes: [R.prepHello, R.appBang]
	},
	{
		id: 129,
		start: '4',
		target: '0‿1‿2‿3‿4',
		runes: [R.range, R.app4, R.add1]
	},
	{
		id: 130,
		start: '3',
		target: '5‿4‿3‿2‿1',
		runes: [R.range, R.add1, R.app45, R.rev]
	},

	// ============================================================
	// Block 14 — Tables: F⌜ takes a dyadic verb and runs it across
	// every (i,j) pair. F⌜˜ pairs x against itself, producing a grid.
	// ↕5 paired with =⌜˜ is the 5×5 identity matrix; with <⌜˜ /
	// >⌜˜ you get strict upper / lower triangles.
	// ============================================================
	{ id: 131, start: '1‿2‿3', target: '1‿2‿3 +⌜ 1‿2‿3', runes: [R.addtab] },
	{
		id: 132,
		start: '1‿2‿3‿4',
		target: '1‿2‿3‿4 ×⌜ 1‿2‿3‿4',
		runes: [R.multtab]
	},
	{
		id: 133,
		start: '4',
		target: '(↕4) +⌜ (↕4)',
		runes: [R.range, R.addtab]
	},
	{
		id: 134,
		start: '4',
		target: '1‿2‿3‿4 +⌜ 1‿2‿3‿4',
		runes: [R.range, R.add1, R.addtab]
	},
	{
		id: 135,
		start: '4',
		target: '(↕4) =⌜ (↕4)',
		runes: [R.range, R.idtab]
	},
	{
		id: 136,
		start: '4',
		target: '(↕4) <⌜ (↕4)',
		runes: [R.range, R.lttab]
	},
	{
		id: 137,
		start: '5',
		target: '(↕5) >⌜ (↕5)',
		runes: [R.range, R.gttab]
	},
	{
		id: 138,
		start: '1‿2‿3',
		target: '(1‿2‿3∾1‿2‿3) +⌜ (1‿2‿3∾1‿2‿3)',
		runes: [R.selfcat, R.addtab]
	},
	{
		id: 139,
		start: '4',
		target: '100',
		runes: [R.range, R.add1, R.multtab, R.deshape, R.sumf]
	},
	{
		id: 140,
		start: '5',
		target: '25',
		runes: [R.range, R.idtab, R.deshape, R.len]
	},

	// ============================================================
	// Block 15 — Windows: n↕x slides a length-n frame across x and
	// stacks the windows as rows. Pair it with +´˘ / ⌈´˘ / ⌊´˘ —
	// the ˘ "cells" modifier runs the fold once per row — and you
	// get sliding sums, sliding max, sliding min.
	// ============================================================
	{ id: 141, start: '1‿2‿3‿4', target: '2↕1‿2‿3‿4', runes: [R.wins2] },
	{ id: 142, start: '"hello"', target: '3↕"hello"', runes: [R.wins3] },
	{ id: 143, start: '5', target: '2↕↕5', runes: [R.range, R.wins2] },
	{
		id: 144,
		start: '5',
		target: '3↕1+↕5',
		runes: [R.range, R.add1, R.wins3]
	},
	{
		id: 145,
		start: '1‿2‿3‿4',
		target: '3‿5‿7',
		runes: [R.wins2, R.rowsum]
	},
	{
		id: 146,
		start: '5‿1‿4‿2‿3',
		target: '5‿4‿4‿3',
		runes: [R.wins2, R.rowmax]
	},
	{
		id: 147,
		start: '5‿1‿4‿2‿3',
		target: '1‿1‿2‿2',
		runes: [R.wins2, R.rowmin]
	},
	{
		id: 148,
		start: '1‿2‿3‿4‿5',
		target: '6‿9‿12',
		runes: [R.wins3, R.rowsum]
	},
	{
		id: 149,
		start: '5',
		target: '6‿9‿12',
		runes: [R.range, R.add1, R.wins3, R.rowsum]
	},
	{
		id: 150,
		start: '5‿1‿4‿2‿3',
		target: '3‿4‿4‿5',
		runes: [R.wins2, R.rowmax, R.rev]
	},

	// ============================================================
	// Block 16 — Modulus: w|x is x mod w (BQN reads "divide w into x").
	// 2⊸| gives the parity (1 = odd, 0 = even); 3⊸| cycles 0,1,2;
	// 10⊸| pulls the last digit. Combined with +´ you can count odds
	// or sum cycle-residues.
	// ============================================================
	{ id: 151, start: '1‿2‿3‿4', target: '1‿0‿1‿0', runes: [R.mod2] },
	{ id: 152, start: '1‿2‿3‿4‿5‿6', target: '1‿2‿0‿1‿2‿0', runes: [R.mod3] },
	{ id: 153, start: '13‿27‿35', target: '3‿7‿5', runes: [R.mod10] },
	{ id: 154, start: '5', target: '0‿1‿0‿1‿0', runes: [R.range, R.mod2] },
	{
		id: 155,
		start: '6',
		target: '1‿2‿0‿1‿2‿0',
		runes: [R.range, R.add1, R.mod3]
	},
	{ id: 156, start: '1‿2‿3‿4‿5', target: '3', runes: [R.mod2, R.sumf] },
	{
		id: 157,
		start: '6',
		target: '3',
		runes: [R.range, R.mod2, R.sumf]
	},
	{ id: 158, start: '24‿15‿8‿3', target: '0‿1‿0‿1', runes: [R.mod2] },
	{
		id: 159,
		start: '5',
		target: '4',
		runes: [R.range, R.mod3, R.sumf]
	},
	{
		id: 160,
		start: '1‿2‿3‿4‿5‿6',
		target: '24',
		runes: [R.mod3, R.sumf, R.mul2]
	}
];
