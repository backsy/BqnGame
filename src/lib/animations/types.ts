// Animations are pure functions. Each one takes structured DOM /
// rect / value inputs and returns a Promise<void>. They never read
// game state, never mutate history, never call commit. The
// withSnapshot module (src/lib/animations/withSnapshot.ts) is the
// only place that owns the DOM choreography around a state commit.
//
// Lifecycle types flow: Prepared → Committed → Snapshot.
// Animation bodies receive only Snapshot — the earlier phases are
// not reachable from animation code by construction (they aren't
// in the Snapshot type).
//
// Pixel-clean handoff invariant still holds: every animation must
// land at the exact post-commit positions ValueViz / AnimatedRow
// will render. The .viz CSS reserves --target-h for 2D targets so
// the live grid lands where the animation drove its ghost.

export type Cell = { readonly id: CellId; readonly value: number | string };

// Branded so a raw number can't slip in where a CellId is expected.
export type CellId = number & { readonly __brand: 'CellId' };

// Phase 1 — pre-commit DOM info captured.
export type Prepared = {
	readonly vizRoot: HTMLElement;
	readonly oldCells: ReadonlyArray<Cell>;
	readonly oldRects: ReadonlyMap<CellId, DOMRect>;
	readonly ghost: HTMLElement;
	// Empty when source isn't rank-1 (no data-cell-id nodes in vizRoot).
	readonly ghostNodes: ReadonlyMap<CellId, HTMLElement>;
};

// Phase 2 — state has been committed; new cells in hand.
export type Committed = {
	readonly prepared: Prepared;
	readonly newCells: ReadonlyArray<Cell>;
};

// Phase 3 — ready for animation; the only thing animations ever see.
export type Snapshot = {
	readonly oldCells: ReadonlyArray<Cell>;
	readonly cells: ReadonlyArray<Cell>;
	readonly oldRects: ReadonlyMap<CellId, DOMRect>;
	readonly getLiveNode: (id: CellId) => HTMLElement | null;
	readonly ghost: HTMLElement;
	readonly getGhostNode: (id: CellId) => HTMLElement | null;
	readonly liveViz: HTMLElement;
	// Idempotent: reveals liveViz. withSnapshot calls this in finally.
	readonly reveal: () => void;
	// Retained for backward compat with dispatchAnimation callers.
	readonly revealLive: () => void;
};

// Input spec the caller (route) passes to withSnapshot.
// commit() is invoked by withSnapshot between prepare and assemble.
// It may return a Promise (e.g. Svelte callers await tick() inside it)
// so that DOM is settled before withSnapshot evaluates newCells().
// Non-Svelte callers may return void; Promise.resolve() handles both.
export type SnapshotSpec = {
	readonly vizRoot: HTMLElement;
	readonly oldCells: ReadonlyArray<Cell>;
	// Called once by withSnapshot between prepare and assemble.
	// May be async (return a Promise) to allow tick/DOM-settle.
	readonly commit: () => void | Promise<void>;
	// Thunk: withSnapshot calls this after commit resolves.
	readonly newCells: () => ReadonlyArray<Cell>;
};
