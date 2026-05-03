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

// Invariant: every animation here must start from the cells' actual
// rendered geometry and end at the exact positions Svelte will render
// post-commit. No "approximately right" — pixel-clean both ends.
//
// Practical implications:
//  - Read starting sizes/positions via getBoundingClientRect, not
//    inline style.height/width. The .bar has padding-top: 0.2rem
//    (~3.2px) that inline style doesn't reflect.
//  - For handoffs between AnimatedRow (rank-1) and ValueViz (other
//    ranks), reserve the post-commit container size before the
//    animation runs (e.g. --target-h on .viz) so the destination
//    geometry is stable when commit fires.
//  - For FLIP animations on the same DOM (reverse / sort / take /
//    drop / scan), measure newRect after commit() and animate from
//    the captured oldRect to that newRect.
//  - Account for centering: if a parent centers content, the natural
//    flex-flow positions are offset; add the centerOffset to dx.

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
