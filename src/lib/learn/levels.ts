// Game level data. Each level has a starting value, a target value, and
// the runes the player can apply. Both values are stored as BQN source
// expressions; the engine evaluates them via the synchronous main-thread
// interpreter and visualises the result via ValueViz.
//
// Runes are unary: `result = (rune.expr) (current)`.
//
// The level list is organised as ten themed blocks of ten. Within each
// block we introduce a new concept with a 1-tap puzzle, then practice it
// across 4–6 multi-tap puzzles, and end with a 3–5 tap capstone that
// combines the block's runes. Earlier blocks stay reachable as later
// puzzles lean on them.

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
	deshape: { glyph: '⥊', expr: '⥊' }
};

export const levels: Level[] = [
	// ============================================================
	// Block 1 — Numbers: scalar arithmetic
	// ============================================================
	{ id: 1, start: '3', target: '4', runes: [R.add1] },
	{ id: 2, start: '3', target: '7', runes: [R.add1, R.add2] },
	{ id: 3, start: '3', target: '10', runes: [R.add1, R.add2, R.mul2, R.mul3] },
	{ id: 4, start: '10', target: '6', runes: [R.sub3, R.sub1, R.add1] },
	{ id: 5, start: '10', target: '1', runes: [R.sub3, R.sub2, R.sub4] },
	{ id: 6, start: '8', target: '4', runes: [R.div2, R.add2] },
	{ id: 7, start: '8', target: '5', runes: [R.div2, R.add1, R.sub1] },
	{ id: 8, start: '4', target: '16', runes: [R.square, R.mul2] },
	{ id: 9, start: '2', target: '11', runes: [R.add5, R.mul3, R.add1] },
	{ id: 10, start: '1', target: '17', runes: [R.add1, R.mul2] },

	// ============================================================
	// Block 2 — Rows: from scalars to lists, basic shape ops
	// ============================================================
	{ id: 11, start: '1‿2‿3', target: '3‿2‿1', runes: [R.rev] },
	{ id: 12, start: '5', target: '↕5', runes: [R.range] },
	{ id: 13, start: '5', target: '4‿3‿2‿1‿0', runes: [R.range, R.rev] },
	{ id: 14, start: '5‿4‿3‿2‿1', target: '1‿2‿3', runes: [R.rev, R.take3, R.drop2] },
	{ id: 15, start: '1‿2‿3‿4‿5', target: '5‿4', runes: [R.rev, R.take2, R.drop3] },
	{ id: 16, start: '1‿2‿3‿4‿5', target: '5‿4‿3', runes: [R.take3, R.rev] },
	{ id: 17, start: '1‿2‿3', target: '5‿6‿7', runes: [R.add1, R.add3] },
	{ id: 18, start: '1‿2‿3', target: '4‿8‿12', runes: [R.mul2, R.add1] },
	{ id: 19, start: '1‿2‿3', target: '4‿6‿8', runes: [R.add1, R.mul2] },
	{ id: 20, start: '5', target: '1‿2‿3‿4‿5', runes: [R.range, R.add1] },

	// ============================================================
	// Block 3 — Folds: collapsing a row to a scalar
	// ============================================================
	{ id: 21, start: '1‿2‿3', target: '6', runes: [R.sumf] },
	{ id: 22, start: '1‿2‿3‿4', target: '24', runes: [R.prodf, R.sumf] },
	{ id: 23, start: '5‿1‿4‿2‿3', target: '6', runes: [R.maxf, R.minf, R.add1] },
	{ id: 24, start: '5‿1‿4‿2‿3', target: '1', runes: [R.minf, R.prodf, R.maxf] },
	{ id: 25, start: '1‿2‿3‿4‿5', target: '30', runes: [R.sumf, R.mul2, R.add5] },
	{ id: 26, start: '1‿2‿3', target: '12', runes: [R.mul2, R.sumf] },
	{ id: 27, start: '5', target: '10', runes: [R.range, R.sumf] },
	{ id: 28, start: '4', target: '24', runes: [R.range, R.add1, R.prodf] },
	{ id: 29, start: '5', target: '20', runes: [R.range, R.mul2, R.sumf] },
	{ id: 30, start: '6', target: '30', runes: [R.range, R.sumf, R.mul2] },

	// ============================================================
	// Block 4 — Order: sort, reverse, length
	// ============================================================
	{ id: 31, start: '3‿1‿2', target: '1‿2‿3', runes: [R.sortup, R.rev] },
	{ id: 32, start: '1‿3‿2', target: '3‿2‿1', runes: [R.sortup, R.rev] },
	{ id: 33, start: '3‿1‿4‿1‿5', target: '5‿4‿3‿1‿1', runes: [R.sortup, R.rev] },
	{ id: 34, start: '5‿6‿7‿8', target: '8‿7‿6‿5', runes: [R.sortdn, R.rev, R.sortup] },
	{ id: 35, start: '3‿1‿4‿1‿5‿9', target: '9‿5‿4', runes: [R.sortdn, R.take3, R.rev] },
	{ id: 36, start: '3‿1‿4‿1‿5‿9', target: '1‿1‿3', runes: [R.sortup, R.take3] },
	{ id: 37, start: '3‿1‿4‿1‿5', target: '3‿4‿5', runes: [R.sortup, R.drop2] },
	{ id: 38, start: '5‿2‿8‿1‿9‿3', target: '9', runes: [R.sortdn, R.first] },
	{ id: 39, start: '3‿1‿4‿1‿5', target: '1‿4‿1‿3', runes: [R.drop1, R.rev, R.sortup] },
	{ id: 40, start: '5‿2‿8‿1', target: '8', runes: [R.sortdn, R.first, R.rev] },

	// ============================================================
	// Block 5 — Scans: running computations
	// ============================================================
	{ id: 41, start: '1‿2‿3‿4', target: '1‿3‿6‿10', runes: [R.sums] },
	{ id: 42, start: '1‿2‿3‿4', target: '24‿6‿2‿1', runes: [R.prods, R.rev] },
	{ id: 43, start: '1‿2‿3‿4', target: '10‿9‿7‿4', runes: [R.sums, R.rev] },
	{
		id: 44,
		start: '3‿1‿4‿1‿5',
		target: '3‿3‿4‿4‿5',
		runes: [R.maxs, R.mins, R.sortup]
	},
	{ id: 45, start: '5‿1‿4‿2‿3', target: '5‿1‿1‿1‿1', runes: [R.mins, R.maxs] },
	{ id: 46, start: '1‿2‿3', target: '6‿3‿1', runes: [R.sums, R.rev, R.prods] },
	{ id: 47, start: '5', target: '1‿3‿6‿10‿15', runes: [R.range, R.add1, R.sums] },
	{
		id: 48,
		start: '4',
		target: '24‿6‿2‿1',
		runes: [R.range, R.add1, R.prods, R.rev]
	},
	{
		id: 49,
		start: '1‿2‿3‿4',
		target: '4‿7‿9‿10',
		runes: [R.sums, R.rev]
	},
	{
		id: 50,
		start: '1‿2‿3‿4‿5',
		target: '15‿10‿6‿3‿1',
		runes: [R.sums, R.rev, R.sumf]
	},

	// ============================================================
	// Block 6 — Shape: reshape and transpose
	// ============================================================
	{ id: 51, start: '7', target: '7‿7‿7', runes: [R.rep3, R.rep4] },
	{ id: 52, start: '7', target: '49‿49‿49', runes: [R.rep3, R.rep4, R.square] },
	{ id: 53, start: '1‿2‿3‿4‿5‿6', target: '2‿3⥊1‿2‿3‿4‿5‿6', runes: [R.rs23, R.rs32] },
	{
		id: 54,
		start: '1‿2‿3‿4‿5‿6',
		target: '⍉ 2‿3⥊1‿2‿3‿4‿5‿6',
		runes: [R.rs23, R.transp]
	},
	{
		id: 55,
		start: '2‿2⥊1‿2‿3‿4',
		target: '2‿2⥊4‿3‿2‿1',
		runes: [R.rev, R.transp, R.deshape]
	},
	{
		id: 56,
		start: '2‿2⥊1‿2‿3‿4',
		target: '4‿3‿2‿1',
		runes: [R.deshape, R.rev, R.transp]
	},
	{ id: 57, start: '6', target: '2‿3⥊↕6', runes: [R.range, R.rs23] },
	{ id: 58, start: '6', target: '⍉ 2‿3⥊↕6', runes: [R.range, R.rs23, R.transp] },
	{
		id: 59,
		start: '6',
		target: '2‿3⥊1‿2‿3‿4‿5‿6',
		runes: [R.range, R.add1, R.rs23]
	},
	{
		id: 60,
		start: '4',
		target: '2‿2⥊4‿3‿2‿1',
		runes: [R.range, R.add1, R.rev, R.rs22]
	},

	// ============================================================
	// Block 7 — Strings: characters work the same way
	// ============================================================
	{ id: 61, start: '"abc"', target: '"cba"', runes: [R.rev] },
	{ id: 62, start: '"cab"', target: '"cba"', runes: [R.sortup, R.rev] },
	{ id: 63, start: '"hello"', target: '"oll"', runes: [R.rev, R.take3, R.drop2] },
	{ id: 64, start: '"hello"', target: '"leh"', runes: [R.rev, R.drop2, R.take3] },
	{ id: 65, start: '"banana"', target: '"banan"', runes: [R.drop1, R.rev, R.take3] },
	{ id: 66, start: '"banana"', target: '"ananab"', runes: [R.rot1] },
	{ id: 67, start: '"hello"', target: '25', runes: [R.len, R.square] },
	{ id: 68, start: '"hello"', target: '"olle"', runes: [R.rev, R.drop1, R.take3] },
	{ id: 69, start: '"banana"', target: '"nnbaaa"', runes: [R.sortup, R.rev] },
	{
		id: 70,
		start: '"world"',
		target: '"row"',
		runes: [R.rev, R.take3, R.drop2]
	},

	// ============================================================
	// Block 8 — Indexing: pick a single element
	// ============================================================
	{ id: 71, start: '5‿7‿9', target: '5', runes: [R.first] },
	{ id: 72, start: '5‿7‿9', target: '9', runes: [R.first, R.rev] },
	{ id: 73, start: '5‿7‿9', target: '7', runes: [R.pick1, R.first] },
	{ id: 74, start: '3‿1‿4‿1‿5', target: '4', runes: [R.pick2, R.first, R.rev] },
	{ id: 75, start: '3‿1‿4‿1‿5', target: '5', runes: [R.first, R.rev, R.drop1] },
	{ id: 76, start: '"hello"', target: '"o"', runes: [R.rev, R.take2, R.drop1] },
	{ id: 77, start: '"world"', target: '"r"', runes: [R.drop1, R.take3, R.rev] },
	{
		id: 78,
		start: '⟨5,3,8,1,4⟩',
		target: '8',
		runes: [R.sortdn, R.first]
	},
	{
		id: 79,
		start: '⟨5,3,8,1,4⟩',
		target: '1',
		runes: [R.sortup, R.first]
	},
	{
		id: 80,
		start: '5‿2‿8‿1‿9‿3',
		target: '9',
		runes: [R.sortdn, R.pick2, R.first]
	},

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
	}
];
