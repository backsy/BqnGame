// Animations are pure functions. Each one takes structured DOM /
// rect / value inputs and returns a Promise<void>. They never read
// game state, never mutate history, never call commit. The
// controller (in +page.svelte) is the only place that knows both
// the state layer and the animation layer.
//
// Snapshot below is what the controller assembles for each tap:
// pre-commit cells/rects/DOM clone + post-commit cells/DOM. The
// per-animation dispatch (in animations/index.ts) consumes a
// Snapshot and feeds the right slice of it into a pure animation
// function.
//
// Pixel-clean handoff invariant still holds: every animation must
// land at the exact post-commit positions ValueViz / AnimatedRow
// will render. The .viz CSS reserves --target-h for 2D targets so
// the live grid lands where the animation drove its ghost.

export type Cell = { id: number; value: number | string };

export type Snapshot = {
	/** Cells right before the rune was tapped. */
	oldCells: Cell[];
	/** Cells after the synchronous commit (what Svelte just rendered). */
	cells: Cell[];
	/** Pre-commit bounding rects keyed by old cell id. Only populated
	 *  for rank-1 (AnimatedRow) source values — cellNodes is not
	 *  populated for ValueViz-rendered scalars / grids. */
	oldRects: Map<number, DOMRect>;
	/** Live (post-commit) wrap lookup by cell id. Only useful for
	 *  rank-1 post-commit values. */
	getLiveNode: (id: number) => HTMLElement | null;
	/** A clone of `.cell.now .viz` from before the commit, parked
	 *  position: fixed at the original's viewport coords with z-index 20.
	 *  Animations can mine it, animate it, or remove it; the
	 *  controller disposes it in `finally` if anything's left. */
	ghost: HTMLElement;
	/** Map old cell id → its clone wrap inside `ghost`, for rank-1
	 *  source values. */
	getGhostNode: (id: number) => HTMLElement | null;
	/** The post-commit `.cell.now .viz` (currently hidden, sitting
	 *  behind the ghost). Animations should reveal it via revealLive
	 *  before they want the user to see post-commit content. */
	liveViz: HTMLElement;
	/** Make liveViz visible. Idempotent. The controller calls this
	 *  in `finally` if the animation forgot. */
	revealLive: () => void;
};
