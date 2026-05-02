// Architectural template for per-glyph animations. Each animation is
// an async function that:
//
//   1. Reads `oldRects` — cell positions captured *before* state mutation.
//   2. Reads new positions via `getNode(id).getBoundingClientRect()`.
//   3. Drives the motion via Motion's animate() returning per-element
//      Animation objects, and awaits Promise.all of their .finished.
//
// Svelte still owns rendering and reactive cell state; this layer
// only choreographs the visual transition between two committed states.
// The same function can be replayed in an intro card by passing a
// canned set of cells / nodes / rects.

export type Cell = { id: number; value: number | string };

export type AnimationCtx = {
	cells: Cell[];
	getNode: (id: number) => HTMLElement | null;
	oldRects: Map<number, DOMRect>;
	// Commit the pending state mutation. Animations that need access to
	// the OLD DOM (cells about to unmount, like ↑) must run that work
	// before calling commit; FLIP-only animations (like ⌽) can call it
	// immediately and then animate from old → new positions. Returns
	// the post-commit cells so animations that birth new ones (like ↕)
	// can iterate them.
	commit: () => Promise<Cell[]>;
};

export type AnimationFn = (ctx: AnimationCtx) => Promise<void>;
