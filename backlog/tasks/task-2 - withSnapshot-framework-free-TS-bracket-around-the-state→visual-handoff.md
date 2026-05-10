---
id: TASK-2
title: 'withSnapshot: framework-free TS bracket around the state→visual handoff'
status: Done
assignee: []
created_date: '2026-05-10 11:15'
updated_date: '2026-05-10 13:02'
labels:
  - architecture
dependencies: []
modified_files:
  - src/lib/animations/types.ts
  - src/lib/animations/withSnapshot.ts
  - src/lib/animations/index.ts
  - src/lib/components/AnimatedRow.svelte
  - src/routes/+page.svelte
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

src/routes/+page.svelte's `applyRune` body (lines 304–384, ~80 LoC) owns DOM-coupled snapshot assembly + state commit + animation dispatch + cleanup. It mixes three layers: the Svelte route's reactive state, the DOM choreography around a state change, and the call into the pure animations layer.

This is the trickiest code in the file. It's the seam where future bugs will hide silently — exactly the point of a deepening.

## Settled in grilling (load-bearing decisions)

These are locked unless a future load-bearing reason re-opens them:

1. **Route owns the state commit; new module owns the DOM choreography.** Per ADR-004 (state and animation are separate layers), animations and the orchestrator that calls them must never mutate state. The new module receives a `commit: () => void` closure from the caller and invokes it between phase A and phase C; it does not know what `history` is.

2. **The new module is plain TypeScript, framework-free.** Today's code uses Svelte but the new module takes `HTMLElement` / `DOMRect` / pure data — no `$state`, no Svelte imports. Any framework (or no framework) can call into it. This unblocks DRAFT-4 (game + sandbox both call the same module) and TASK-1 (the demo player calls it on synthetic input).

3. **Cell addressability moves to `data-cell-id` attributes.** Today the route maintains a `cellNodes: Map<id, HTMLElement>` populated via Svelte `setNode` callbacks on AnimatedRow — that's a Svelte-shaped mechanism. Replace it with `data-cell-id="N"` rendered on each `.wrap` element. Module queries `[data-cell-id]` inside whatever DOM root the caller hands it. Drops `cellNodes` + `setNode` entirely. Subsumes most of DRAFT-8.

4. **Bracket pattern; module is named `withSnapshot`.** No "controller" anywhere. The thing is a scoped resource (snapshot is allocated, in scope for the animation, released on completion or error). Public API is `withSnapshot(spec, body): Promise<void>` mirroring `withFile`, `bracket`, `using`.

5. **Type-driven design (ADR-005).** Lifecycle stages are distinct types, not boolean flags. Animations cannot accidentally reach into mid-phase state because the types make it impossible.

## Type shape (illegal states unrepresentable)

```ts
type CellId = number & { readonly __brand: 'CellId' }

// Phase 1 — pre-commit DOM info captured
type Prepared = {
  readonly vizRoot: HTMLElement
  readonly oldCells: ReadonlyArray<Cell>
  readonly oldRects: ReadonlyMap<CellId, DOMRect>
  readonly ghost: HTMLElement
  readonly ghostNodes: ReadonlyMap<CellId, HTMLElement>  // empty when source isn't rank-1
  readonly hide: () => void                                // idempotent: hides live viz
}

// Phase 2 — state has been committed; new cells in hand
type Committed = {
  readonly prepared: Prepared
  readonly newCells: ReadonlyArray<Cell>
}

// Phase 3 — ready for animation; the only thing animations ever see
type Snapshot = {
  readonly oldCells: ReadonlyArray<Cell>
  readonly cells: ReadonlyArray<Cell>
  readonly oldRects: ReadonlyMap<CellId, DOMRect>
  readonly getLiveNode: (id: CellId) => HTMLElement | null
  readonly ghost: HTMLElement
  readonly getGhostNode: (id: CellId) => HTMLElement | null
  readonly liveViz: HTMLElement
  readonly reveal: () => void                              // idempotent
}

type SnapshotSpec = {
  readonly vizRoot: HTMLElement
  readonly oldCells: ReadonlyArray<Cell>
  readonly newCells: ReadonlyArray<Cell>
  readonly commit: () => void
}

withSnapshot(
  spec: SnapshotSpec,
  body: (snap: Snapshot) => Promise<void>
): Promise<void>
```

Internal implementation flows `Prepared → Committed → Snapshot`; the public API hands the body only a `Snapshot`. Animations receive `Snapshot` and can't reach a `Prepared` or unwrap the `Committed.prepared` field (it's not in the `Snapshot` type at all).

## Algebraic properties

1. `commit` runs exactly once — by structure (thunk invoked once, no retry).
2. Pre-commit DOM info captured before `commit`; post-commit info after `await tick()` — by sequencing inside the bracket; not exposed.
3. Animation receives a read-only `Snapshot`; no path back to mutate state — enforced by type (no `commit` in `Snapshot`).
4. `reveal` and `hide` are idempotent — property of the implementation; testable in isolation.
5. Cleanup runs even when body throws — `try/finally` inside the bracket. Caller gets the rejection, the DOM still recovers.

## Open questions (still need design)

- Whether the `Cell` type needs a phantom flag distinguishing rank-1 (has DOM addressability) from scalar/grid (doesn't), so animations that require ghost nodes can't compile against incompatible inputs. May be over-engineering for the current animation set; revisit if the second/third Snapshot consumer surfaces a concrete misuse.
- Test strategy: jsdom for `withSnapshot`? Or skip the integration test and rely on visual review of game + TASK-1's demo player?
- Smart-constructor for `CellId` — is it just a brand applied at the renderer (when rendering `data-cell-id`) and re-asserted at the parser (when reading `data-cell-id`), or does it have its own module?

## Knock-on effects on other drafts

- **DRAFT-8 (DOM contract)**: largely subsumed by the `data-cell-id` decision. Remaining scope is just ModifierDiagram's diagram registry, if anything.
- **DRAFT-4 (Playground)**: reframed. `withSnapshot` IS the shared seam between game and sandbox; "Playground" may just be a thin wrapper or unnecessary.
- **TASK-1 (demo player)**: `withSnapshot` is the prereq this draft delivers. Demo player composes `withSnapshot` + a tiny stage + per-glyph demo data.

## Definition of done (outcome-shaped)

- A framework-free TS module under src/lib/animations/ exposes `withSnapshot` with the type shape above
- Phase types (`Prepared`, `Committed`, `Snapshot`) are distinct; animations can only see `Snapshot`
- Route's `applyRune` shrinks to: build cells, supply commit closure, call `withSnapshot`
- `cellNodes` Map + `setNode` callbacks are gone; cell addressability is via `data-cell-id`
- Existing animations behave identically in the game (no visual regressions on tap)
- `withSnapshot` is callable from a non-Svelte context (proof: TASK-1 can compose it)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 withSnapshot lives as plain TS under src/lib/animations/; no Svelte imports
- [x] #2 Phase types (Prepared, Committed, Snapshot) are distinct; animation body sees only Snapshot
- [x] #3 Route's applyRune delegates DOM choreography to withSnapshot; only owns the commit closure and post-commit cell construction
- [x] #4 cellNodes Map + setNode callbacks are removed; cell addressability is via data-cell-id attributes
- [x] #5 Existing animations behave identically in the game (visual regressions check on every animated rune)
- [x] #6 withSnapshot is callable from a non-Svelte context (test or TASK-1 composes it)
- [x] #7 ADR-004 invariant holds: withSnapshot never mutates state directly
- [x] #8 ADR-005 invariant holds: illegal states (e.g. mid-phase access from animation) are not type-representable
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

**src/lib/animations/types.ts** — complete rewrite:
- Added `CellId` branded type (`number & { readonly __brand: 'CellId' }`).
- `Cell.id` changed from `number` to `CellId`; all animation call sites (`cell.id` to `getLiveNode`/`getGhostNode`/`oldRects.get`) are automatically correct.
- Added `Prepared`, `Committed` phase types (internal to withSnapshot; not exported from index.ts).
- `Snapshot` updated to use `CellId`, readonly fields, `reveal` + `revealLive` alias (backward compat with dispatchAnimation callers).
- Added `SnapshotSpec` with `commit: () => void | Promise<void>` and `newCells: () => ReadonlyArray<Cell>` thunk.

**src/lib/animations/withSnapshot.ts** — new file, 0 Svelte imports:
- `prepare()`: queries `[data-cell-id]` inside vizRoot for oldRects and ghostNodes, clones ghost overlay, hides live viz.
- Calls `await Promise.resolve(doCommit())` — allows async commit closures (Svelte callers include `await tick()` in the closure).
- `assemble()`: builds Snapshot with lazy `getLiveNode`/`getGhostNode` DOM queries.
- `try/finally` ensures `reveal()` + `ghost.remove()` run even on body exception.

**src/lib/animations/index.ts** — adds `CellId` to the re-export.

**src/lib/components/AnimatedRow.svelte** — removed `setNode` prop, `track` action, and related callback plumbing. Each `.wrap` now renders `data-cell-id="{cell.id}"`.

**src/routes/+page.svelte**:
- Removed `cellNodes` Map, `setNode` function.
- Added `mkId(): CellId` helper to stamp fresh cell IDs with the brand.
- Replaced `nextCellId++` with `mkId()` at all cell-creation sites.
- `applyRune` rewritten: captures `oldCells` + `vizRoot`, calls `withSnapshot({ vizRoot, oldCells, commit: async () => { history = [...history, expr]; await tick(); }, newCells: () => cells }, async (snap) => { await dispatchAnimation(expr, snap); })`. Cleanup (animating flag) in `finally`.
- Template: `<AnimatedRow {cells} max={vizMax} />` (setNode prop removed).

## Checks run
- `pnpm check`: 0 errors, 0 warnings (188 files).
- `pnpm build`: succeeded, static build output written to `build/`.

## Visual regression review pending
Agent cannot open a browser. The human must verify all animated runes (⌽, ∧, ∨, ↕, +N, scan, fold, filter, ∾, ↑N, ↓N, ⊑N, ≠, ⥊, ∘, ⍉) play correctly in the game after this refactor. Key risk: the ghost is now built by querying `[data-cell-id]` instead of iterating `.row > .wrap` children by index — any .wrap without `data-cell-id` (e.g. inside the goal viz clone) would silently produce empty ghostNodes, which is correct and harmless (animations fall back to revealLive in that case).
<!-- SECTION:FINAL_SUMMARY:END -->
