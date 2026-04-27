// Game level data. Each level has a starting value, a target value, and
// the runes the player can apply. Both values are stored as BQN source
// expressions; the engine evaluates them via the synchronous main-thread
// interpreter and visualises the result via ValueViz.
//
// Runes are unary: `result = (rune.expr) (current)`.

export interface Rune {
	/** what's drawn on the rune button */
	glyph: string;
	/** BQN function expression applied to the current state */
	expr: string;
}

export interface Level {
	id: number;
	start: string;
	target: string;
	runes: Rune[];
}

export const levels: Level[] = [
	{
		id: 1,
		start: '3',
		target: '7',
		runes: [
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '+2', expr: '+⟜2' }
		]
	},
	{
		id: 2,
		start: '3',
		target: '12',
		runes: [
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '+2', expr: '+⟜2' },
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '×3', expr: '×⟜3' }
		]
	},
	{
		id: 3,
		start: '1‿2‿3',
		target: '3‿2‿1',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	// Level 4 — adding a scalar to a list (broadcast). One tap.
	{
		id: 4,
		start: '1‿2‿3',
		target: '5‿6‿7',
		runes: [
			{ glyph: '+4', expr: '+⟜4' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	// Level 5 — multiplying a list by a scalar. One tap.
	{
		id: 5,
		start: '1‿2‿3',
		target: '2‿4‿6',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	// Level 6 — order matters? Two paths to the same place. Two taps.
	{
		id: 6,
		start: '1‿2‿3',
		target: '5‿4‿3',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '+2', expr: '+⟜2' }
		]
	},
	// Level 7 — range. One tap, brand-new shape (scalar → row).
	{
		id: 7,
		start: '5',
		target: '↕5',
		runes: [{ glyph: '↕', expr: '↕' }]
	},
	// Level 8 — fold. Collapsing a row to a scalar.
	{
		id: 8,
		start: '1‿2‿3‿4',
		target: '10',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '×´', expr: '×´' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 9 — chain ↕ and +´ to compute a sum-from-scalar.
	{
		id: 9,
		start: '5',
		target: '10',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	// Level 10 — take. Crop the head of a row.
	{
		id: 10,
		start: '1‿2‿3‿4‿5',
		target: '1‿2‿3',
		runes: [
			{ glyph: '3↑', expr: '3⊸↑' },
			{ glyph: '2↓', expr: '2⊸↓' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 11 — drop. Crop the tail of a row.
	{
		id: 11,
		start: '1‿2‿3‿4‿5',
		target: '3‿4‿5',
		runes: [
			{ glyph: '2↓', expr: '2⊸↓' },
			{ glyph: '3↑', expr: '3⊸↑' }
		]
	},
	// Level 12 — chained drops. Two taps.
	{
		id: 12,
		start: '1‿2‿3‿4‿5',
		target: '4‿5',
		runes: [
			{ glyph: '2↓', expr: '2⊸↓' },
			{ glyph: '1↓', expr: '1⊸↓' }
		]
	},
	// Level 13 — combine take + fold to compute "sum of first N".
	{
		id: 13,
		start: '1‿2‿3‿4‿5',
		target: '6',
		runes: [
			{ glyph: '3↑', expr: '3⊸↑' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	// Level 14 — max via fold.
	{
		id: 14,
		start: '5‿1‿4‿2‿3',
		target: '5',
		runes: [
			{ glyph: '⌈´', expr: '⌈´' },
			{ glyph: '⌊´', expr: '⌊´' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 15 — min via fold (same shape, different rune).
	{
		id: 15,
		start: '5‿1‿4‿2‿3',
		target: '1',
		runes: [
			{ glyph: '⌈´', expr: '⌈´' },
			{ glyph: '⌊´', expr: '⌊´' }
		]
	},
	// Level 16 — sort ascending.
	{
		id: 16,
		start: '3‿1‿2',
		target: '1‿2‿3',
		runes: [
			{ glyph: '∧', expr: '∧' },
			{ glyph: '∨', expr: '∨' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 17 — sort descending. Two paths: ∨ alone, or ∧ then ⌽.
	{
		id: 17,
		start: '3‿1‿2',
		target: '3‿2‿1',
		runes: [
			{ glyph: '∧', expr: '∧' },
			{ glyph: '∨', expr: '∨' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 18 — length of a row. Start values deliberately don't
	// include the answer so the user can't read "the biggest one is
	// the answer" off the picture; only the count matches.
	{
		id: 18,
		start: '5‿6‿7‿8',
		target: '4',
		runes: [
			{ glyph: '≠', expr: '≠' },
			{ glyph: '+´', expr: '+´' },
			{ glyph: '⌈´', expr: '⌈´' }
		]
	},
	// Level 19 — square each. self-multiply broadcasts elementwise.
	{
		id: 19,
		start: '1‿2‿3',
		target: '1‿4‿9',
		runes: [
			{ glyph: '×˜', expr: '×˜' },
			{ glyph: '+˜', expr: '+˜' }
		]
	},
	// Level 20 — reshape: scalar fans into a row of N copies.
	{
		id: 20,
		start: '7',
		target: '7‿7‿7',
		runes: [
			{ glyph: '3⥊', expr: '3⊸⥊' },
			{ glyph: '↕', expr: '↕' }
		]
	},
	// Level 21 — reshape a flat row into a 2D grid.
	{
		id: 21,
		start: '↕6',
		target: '2‿3⥊↕6',
		runes: [
			{ glyph: '2,3⥊', expr: '2‿3⊸⥊' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 22 — transpose a grid.
	{
		id: 22,
		start: '2‿3⥊↕6',
		target: '⍉ 2‿3⥊↕6',
		runes: [
			{ glyph: '⍉', expr: '⍉' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 23 — scalar all the way to a grid: range, then reshape.
	{
		id: 23,
		start: '6',
		target: '2‿3⥊↕6',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '2,3⥊', expr: '2‿3⊸⥊' }
		]
	},
	// Level 24 — scan: running sums.
	{
		id: 24,
		start: '1‿2‿3‿4',
		target: '1‿3‿6‿10',
		runes: [
			{ glyph: '+`', expr: '+`' },
			{ glyph: '+´', expr: '+´' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 25 — characters too: reverse a string.
	{
		id: 25,
		start: '"hello"',
		target: '"olleh"',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '∧', expr: '∧' }
		]
	},
	// Level 26 — sum of doubles. Two taps in either order.
	{
		id: 26,
		start: '1‿2‿3',
		target: '12',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '+´', expr: '+´' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	// Level 27 — reversed doubles. Two paths (commutative-ish chain).
	{
		id: 27,
		start: '1‿2‿3',
		target: '6‿4‿2',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 28 — pick first element.
	{
		id: 28,
		start: '5‿7‿9',
		target: '5',
		runes: [
			{ glyph: '⊑', expr: '⊑' },
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	// Level 29 — pick element at index 1.
	{
		id: 29,
		start: '5‿7‿9',
		target: '7',
		runes: [
			{ glyph: '1⊑', expr: '1⊸⊑' },
			{ glyph: '⊑', expr: '⊑' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 30 — full chain. Sum of 1..5 from a scalar 5.
	{
		id: 30,
		start: '5',
		target: '15',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '+´', expr: '+´' }
		]
	}
];
