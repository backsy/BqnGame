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
	}
];
