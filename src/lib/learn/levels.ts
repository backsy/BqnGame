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
	}
];
