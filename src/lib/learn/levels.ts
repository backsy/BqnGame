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
const R = {
	add1: { glyph: '+1', expr: '+⟜1' },
	add2: { glyph: '+2', expr: '+⟜2' },
	add3: { glyph: '+3', expr: '+⟜3' },
	add4: { glyph: '+4', expr: '+⟜4' },
	add5: { glyph: '+5', expr: '+⟜5' },
	sub1: { glyph: '-1', expr: '-⟜1' },
	sub2: { glyph: '-2', expr: '-⟜2' },
	sub3: { glyph: '-3', expr: '-⟜3' },
	sub4: { glyph: '-4', expr: '-⟜4' },
	mul2: { glyph: '×2', expr: '×⟜2' },
	mul3: { glyph: '×3', expr: '×⟜3' },
	mul4: { glyph: '×4', expr: '×⟜4' },
	div2: { glyph: '÷2', expr: '÷⟜2' },
	div3: { glyph: '÷3', expr: '÷⟜3' },
	div4: { glyph: '÷4', expr: '÷⟜4' },
	square: { glyph: '×˜', expr: '×˜' },
	double: { glyph: '+˜', expr: '+˜' },
	rev: { glyph: '⌽', expr: '⌽' },
	range: { glyph: '↕', expr: '↕' },
	take2: { glyph: '2↑', expr: '2⊸↑' },
	take3: { glyph: '3↑', expr: '3⊸↑' },
	take4: { glyph: '4↑', expr: '4⊸↑' },
	drop1: { glyph: '1↓', expr: '1⊸↓' },
	drop2: { glyph: '2↓', expr: '2⊸↓' },
	drop3: { glyph: '3↓', expr: '3⊸↓' },
	rot1: { glyph: '1⌽', expr: '1⊸⌽' },
	sumf: { glyph: '+´', expr: '+´' },
	prodf: { glyph: '×´', expr: '×´' },
	maxf: { glyph: '⌈´', expr: '⌈´' },
	minf: { glyph: '⌊´', expr: '⌊´' },
	sums: { glyph: '+`', expr: '+`' },
	prods: { glyph: '×`', expr: '×`' },
	maxs: { glyph: '⌈`', expr: '⌈`' },
	mins: { glyph: '⌊`', expr: '⌊`' },
	sortup: { glyph: '∧', expr: '∧' },
	sortdn: { glyph: '∨', expr: '∨' },
	len: { glyph: '≠', expr: '≠' },
	first: { glyph: '⊑', expr: '⊑' },
	pick1: { glyph: '1⊑', expr: '1⊸⊑' },
	pick2: { glyph: '2⊑', expr: '2⊸⊑' },
	rs23: { glyph: '2,3⥊', expr: '2‿3⊸⥊' },
	rs32: { glyph: '3,2⥊', expr: '3‿2⊸⥊' },
	rs22: { glyph: '2,2⥊', expr: '2‿2⊸⥊' },
	rep3: { glyph: '3⥊', expr: '3⊸⥊' },
	rep4: { glyph: '4⥊', expr: '4⊸⥊' },
	transp: { glyph: '⍉', expr: '⍉' },
	deshape: { glyph: '⥊', expr: '⥊' },
	eq3: { glyph: '=3', expr: '=⟜3' },
	eq1: { glyph: '=1', expr: '=⟜1' },
	lt3: { glyph: '<3', expr: '<⟜3' },
	lt5: { glyph: '<5', expr: '<⟜5' },
	gt2: { glyph: '>2', expr: '>⟜2' },
	keepLt5: { glyph: '/<5', expr: '(<⟜5)⊸/' },
	keepLt6: { glyph: '/<6', expr: '(<⟜6)⊸/' },
	keepEq1: { glyph: '/=1', expr: '(=⟜1)⊸/' }
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
	}
];
