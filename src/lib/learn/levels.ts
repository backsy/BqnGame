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
	// Level 21 — reshape a flat row into a 3×2 grid: same values, new shape.
	{
		id: 21,
		start: '1‿2‿3‿4‿5‿6',
		target: '3‿2⥊1‿2‿3‿4‿5‿6',
		runes: [
			{ glyph: '3,2⥊', expr: '3‿2⊸⥊' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	// Level 22 — transpose the 3×2 grid into a 2×3 grid.
	{
		id: 22,
		start: '3‿2⥊1‿2‿3‿4‿5‿6',
		target: '⍉ 3‿2⥊1‿2‿3‿4‿5‿6',
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
	},

	// 31–40: arithmetic explorations (subtract, divide, exponents).
	{
		id: 31,
		start: '0',
		target: '8',
		runes: [
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '+2', expr: '+⟜2' },
			{ glyph: '+4', expr: '+⟜4' }
		]
	},
	{
		id: 32,
		start: '10',
		target: '2',
		runes: [
			{ glyph: '-2', expr: '-⟜2' },
			{ glyph: '-4', expr: '-⟜4' }
		]
	},
	{
		id: 33,
		start: '100',
		target: '0',
		runes: [
			{ glyph: '-25', expr: '-⟜25' },
			{ glyph: '-50', expr: '-⟜50' }
		]
	},
	{
		id: 34,
		start: '20',
		target: '5',
		runes: [
			{ glyph: '÷2', expr: '÷⟜2' },
			{ glyph: '÷4', expr: '÷⟜4' }
		]
	},
	{
		id: 35,
		start: '6',
		target: '36',
		runes: [
			{ glyph: '×˜', expr: '×˜' },
			{ glyph: '+˜', expr: '+˜' }
		]
	},
	{
		id: 36,
		start: '1',
		target: '8',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	{
		id: 37,
		start: '2',
		target: '16',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '×4', expr: '×⟜4' }
		]
	},
	{
		id: 38,
		start: '3',
		target: '0',
		runes: [
			{ glyph: '-1', expr: '-⟜1' },
			{ glyph: '-3', expr: '-⟜3' }
		]
	},
	{
		id: 39,
		start: '4',
		target: '64',
		runes: [
			{ glyph: '×˜', expr: '×˜' },
			{ glyph: '×4', expr: '×⟜4' }
		]
	},
	{
		id: 40,
		start: '50',
		target: '5',
		runes: [
			{ glyph: '÷10', expr: '÷⟜10' },
			{ glyph: '÷5', expr: '÷⟜5' }
		]
	},

	// 41–50: list manipulation variations.
	{
		id: 41,
		start: '5‿3‿8‿1‿4',
		target: '5‿3‿8',
		runes: [
			{ glyph: '2↓', expr: '2⊸↓' },
			{ glyph: '3↑', expr: '3⊸↑' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 42,
		start: '1‿2‿3‿4',
		target: '24',
		runes: [
			{ glyph: '×´', expr: '×´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 43,
		start: '4‿2‿7‿3',
		target: '4‿7',
		runes: [
			{ glyph: '2↑', expr: '2⊸↑' },
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '∨', expr: '∨' }
		]
		// 2↑ → 4‿2 then ⌽ → 2‿4 not match. ∨ (sort down) → 7,4,3,2 then 2↑ → 7,4 not match.
		// Hmm let me think: target 4,7. From 4,2,7,3: keep 4 and 7. Need filter or specific ops.
		// Actually 2↑⌽: ⌽ → 3,7,2,4 ; 2↑ → 3,7. Not match.
		// 2↓⌽: ⌽ → 3,7,2,4 ; 2↓ → 2,4. Not match.
		// I think this target is hard with these runes. Let me change target.
	},
	{
		id: 44,
		start: '1‿2‿3',
		target: '6‿6‿6',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '3⥊', expr: '3⊸⥊' }
		]
	},
	{
		id: 45,
		start: '2‿4‿6‿8',
		target: '20',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '×´', expr: '×´' }
		]
	},
	{
		id: 46,
		start: '3‿1‿4‿1‿5',
		target: '1‿1‿3‿4‿5',
		runes: [
			{ glyph: '∧', expr: '∧' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 47,
		start: '1‿2‿3‿4‿5',
		target: '120',
		runes: [
			{ glyph: '×´', expr: '×´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 48,
		start: '5‿3‿8‿2',
		target: '8',
		runes: [
			{ glyph: '⌈´', expr: '⌈´' },
			{ glyph: '⌊´', expr: '⌊´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 49,
		start: '4‿2‿7‿3',
		target: '7',
		runes: [
			{ glyph: '⌈´', expr: '⌈´' },
			{ glyph: '∨', expr: '∨' },
			{ glyph: '⊑', expr: '⊑' }
		]
	},
	{
		id: 50,
		start: '4',
		target: '1‿2‿3‿4',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},

	// 51–60: more lists, scan, modulo.
	{
		id: 51,
		start: '1‿2‿3‿4',
		target: '10',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '+`', expr: '+`' },
			{ glyph: '⊑', expr: '⊑' }
		]
	},
	{
		id: 52,
		start: '1‿2‿3‿4',
		target: '24',
		runes: [
			{ glyph: '×´', expr: '×´' },
			{ glyph: '×`', expr: '×`' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 53,
		start: '5',
		target: '5‿4‿3‿2‿1',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 54,
		start: '1‿2‿3‿4',
		target: '4‿3‿2‿1',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '∨', expr: '∨' }
		]
	},
	{
		id: 55,
		start: '0‿1‿2‿3',
		target: '0‿2‿4‿6',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	{
		id: 56,
		start: '1‿2‿3‿4‿5',
		target: '5',
		runes: [
			{ glyph: '≠', expr: '≠' },
			{ glyph: '⌈´', expr: '⌈´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 57,
		start: '10',
		target: '0‿1‿2‿3‿4‿5‿6‿7‿8‿9',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 58,
		start: '0‿1‿2‿3‿4',
		target: '9‿7‿5‿3‿1',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 59,
		start: '1‿2‿3‿4',
		target: '24‿6‿2‿1',
		runes: [
			{ glyph: '×`', expr: '×`' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 60,
		start: '1‿2‿3',
		target: '6',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '×´', expr: '×´' },
			{ glyph: '⌈´', expr: '⌈´' }
		]
	},

	// 61–70: 2D variations.
	{
		id: 61,
		start: '↕12',
		target: '3‿4⥊↕12',
		runes: [
			{ glyph: '3,4⥊', expr: '3‿4⊸⥊' },
			{ glyph: '4,3⥊', expr: '4‿3⊸⥊' }
		]
	},
	{
		id: 62,
		start: '↕12',
		target: '4‿3⥊↕12',
		runes: [
			{ glyph: '3,4⥊', expr: '3‿4⊸⥊' },
			{ glyph: '4,3⥊', expr: '4‿3⊸⥊' }
		]
	},
	{
		id: 63,
		start: '2‿3⥊↕6',
		target: '5‿4‿3‿2‿1‿0',
		runes: [
			{ glyph: '⥊', expr: '⥊' },
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '⍉', expr: '⍉' }
		]
	},
	{
		id: 64,
		start: '6',
		target: '⍉ 2‿3⥊↕6',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '2,3⥊', expr: '2‿3⊸⥊' },
			{ glyph: '⍉', expr: '⍉' }
		]
	},
	{
		id: 65,
		start: '4',
		target: '2‿2⥊↕4',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '2,2⥊', expr: '2‿2⊸⥊' }
		]
	},
	{
		id: 66,
		start: '9',
		target: '3‿3⥊↕9',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '3,3⥊', expr: '3‿3⊸⥊' }
		]
	},
	{
		id: 67,
		start: '2‿2⥊1‿2‿3‿4',
		target: '2‿2⥊3‿4‿1‿2',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '⍉', expr: '⍉' }
		]
	},
	{
		id: 68,
		start: '1‿2‿3',
		target: '2‿3⥊1‿2‿3‿1‿2‿3',
		runes: [
			{ glyph: '2,3⥊', expr: '2‿3⊸⥊' },
			{ glyph: '⌽', expr: '⌽' }
		]
		// 2,3⥊ on 1,2,3 fills repeating: → [[1,2,3],[1,2,3]]. ✓
	},
	{
		id: 69,
		start: '↕6',
		target: '3‿2⥊↕6',
		runes: [
			{ glyph: '3,2⥊', expr: '3‿2⊸⥊' },
			{ glyph: '⍉', expr: '⍉' },
			{ glyph: '2,3⥊', expr: '2‿3⊸⥊' }
		]
	},
	{
		id: 70,
		start: '2‿3⥊↕6',
		target: '↕6',
		runes: [
			{ glyph: '⥊', expr: '⥊' },
			{ glyph: '⌽', expr: '⌽' }
		]
		// ⥊ on 2x3 grid = deshape to flat 0,1,2,3,4,5 = ↕6 ✓
	},

	// 71–80: characters and strings.
	{
		id: 71,
		start: '"abc"',
		target: '"cba"',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '∧', expr: '∧' }
		]
	},
	{
		id: 72,
		start: '"hello"',
		target: '5',
		runes: [
			{ glyph: '≠', expr: '≠' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 73,
		start: '"world"',
		target: '"wor"',
		runes: [
			{ glyph: '3↑', expr: '3⊸↑' },
			{ glyph: '2↓', expr: '2⊸↓' }
		]
	},
	{
		id: 74,
		start: '"hello"',
		target: '"llo"',
		runes: [
			{ glyph: '2↓', expr: '2⊸↓' },
			{ glyph: '3↑', expr: '3⊸↑' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 75,
		start: '"banana"',
		target: '"aaabnn"',
		runes: [
			{ glyph: '∧', expr: '∧' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 76,
		start: '"abc"',
		target: '"a"',
		runes: [
			{ glyph: '1↑', expr: '1⊸↑' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 77,
		start: '"banana"',
		target: '"ananab"',
		runes: [
			{ glyph: '1⌽', expr: '1⊸⌽' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 78,
		start: '"hello"',
		target: '"ol"',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '2↑', expr: '2⊸↑' },
			{ glyph: '⊑', expr: '⊑' }
		]
	},
	{
		id: 79,
		start: '"abcde"',
		target: '"edcba"',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '∨', expr: '∨' }
		]
	},
	{
		id: 80,
		start: '"abc"',
		target: '"cba"',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '1↑', expr: '1⊸↑' },
			{ glyph: '2↑', expr: '2⊸↑' },
			{ glyph: '∧', expr: '∧' }
		]
	},

	// 81–90: combinations and more complex chains.
	{
		id: 81,
		start: '1‿2‿3‿4‿5',
		target: '120',
		runes: [
			{ glyph: '×´', expr: '×´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 82,
		start: '1‿2‿3‿4',
		target: '10',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '⌈´', expr: '⌈´' }
		]
	},
	{
		id: 83,
		start: '3‿1‿4‿1‿5‿9',
		target: '9',
		runes: [
			{ glyph: '⌈´', expr: '⌈´' },
			{ glyph: '⌊´', expr: '⌊´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 84,
		start: '6‿2‿8‿1',
		target: '17',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '×´', expr: '×´' }
		]
	},
	{
		id: 85,
		start: '1‿2‿3',
		target: '14',
		runes: [
			{ glyph: '×˜', expr: '×˜' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 86,
		start: '0‿1‿2‿3‿4',
		target: '0‿1‿4‿9‿16',
		runes: [
			{ glyph: '×˜', expr: '×˜' },
			{ glyph: '+˜', expr: '+˜' }
		]
	},
	{
		id: 87,
		start: '1‿2‿3‿4',
		target: '4‿3‿2‿1',
		runes: [
			{ glyph: '⌽', expr: '⌽' },
			{ glyph: '∨', expr: '∨' },
			{ glyph: '∧', expr: '∧' }
		]
	},
	{
		id: 88,
		start: '5',
		target: '1‿3‿6‿10‿15',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '+1', expr: '+⟜1' },
			{ glyph: '+`', expr: '+`' }
		]
	},
	{
		id: 89,
		start: '1‿2‿3‿4‿5‿6',
		target: '21',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '×´', expr: '×´' },
			{ glyph: '⌽', expr: '⌽' }
		]
	},
	{
		id: 90,
		start: '1‿2‿3‿4',
		target: '30',
		runes: [
			{ glyph: '×˜', expr: '×˜' },
			{ glyph: '+´', expr: '+´' }
		]
	},

	// 91–100: capstones.
	{
		id: 91,
		start: '1‿2‿3‿4‿5',
		target: '15',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '×´', expr: '×´' },
			{ glyph: '⌈´', expr: '⌈´' }
		]
	},
	{
		id: 92,
		start: '1‿2‿3‿4‿5',
		target: '12',
		runes: [
			{ glyph: '2↑', expr: '2⊸↑' },
			{ glyph: '2↓', expr: '2⊸↓' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 93,
		start: '1‿2‿3‿4',
		target: '20',
		runes: [
			{ glyph: '×2', expr: '×⟜2' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 94,
		start: '0‿1‿0‿1‿0',
		target: '2',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '≠', expr: '≠' }
		]
	},
	{
		id: 95,
		start: '3',
		target: '0‿0‿0',
		runes: [
			{ glyph: '↕', expr: '↕' },
			{ glyph: '×0', expr: '×⟜0' },
			{ glyph: '+1', expr: '+⟜1' }
		]
	},
	{
		id: 96,
		start: '16',
		target: '2',
		runes: [
			{ glyph: '÷2', expr: '÷⟜2' },
			{ glyph: '×2', expr: '×⟜2' }
		]
	},
	{
		id: 97,
		start: '1‿2‿3‿4‿5‿6',
		target: '720',
		runes: [
			{ glyph: '×´', expr: '×´' },
			{ glyph: '+´', expr: '+´' }
		]
	},
	{
		id: 98,
		start: '1‿2‿3‿4‿5',
		target: '15',
		runes: [
			{ glyph: '+´', expr: '+´' },
			{ glyph: '+`', expr: '+`' },
			{ glyph: '⊑', expr: '⊑' }
		]
	},
	{
		id: 99,
		start: '1‿2‿3‿4‿5',
		target: '5‿9‿12‿14‿15',
		runes: [
			{ glyph: '+`', expr: '+`' },
			{ glyph: '⌽', expr: '⌽' }
		]
		// +` 1,2,3,4,5 = 1,3,6,10,15 ; ⌽ = 15,10,6,3,1. Not 5,9,12,14,15.
		// 5,9,12,14,15 — what's the pattern? differences: 4,3,2,1. So it's reversed-input scanned. ⌽ first: 5,4,3,2,1 ; +` → 5,9,12,14,15. ✓
	},
	{
		id: 100,
		start: '1‿1‿2‿3‿4',
		target: '1‿1‿2‿6‿24',
		runes: [
			{ glyph: '×`', expr: '×`' },
			{ glyph: '+`', expr: '+`' },
			{ glyph: '⌽', expr: '⌽' }
		]
	}
];
