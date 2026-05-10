---
id: DRAFT-2
title: >-
  Snapshot/controller: extract a framework-free TS module that orchestrates the
  state→visual handoff
status: Draft
assignee: []
created_date: '2026-05-10 11:15'
updated_date: '2026-05-10 12:35'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

src/routes/+page.svelte's `applyRune` body (lines 304–384, ~80 LoC — earlier estimates of 150 were wrong) owns DOM-coupled snapshot assembly + state commit + animation dispatch + cleanup. It mixes three layers: the Svelte route's reactive state, the DOM choreography around a state change, and the call into the pure animations layer.

This is the trickiest code in the file. It's the seam where future bugs will hide silently — exactly the point of a deepening.

## Settled in grilling (load-bearing decisions)

These are locked unless a future load-bearing reason re-opens them:

1. **Route owns the state commit; new module owns the DOM choreography.** Per ADR-004 (state and animation are separate layers), animations and the orchestrator that calls them must never mutate state. The new module receives a `commit: () => void` closure from the caller and invokes it between phase A and phase C; it does not know what `history` is.

2. **The new module is plain TypeScript, framework-free.** Today's code uses Svelte but the controller takes `HTMLElement` / `DOMRect` / pure data — no `$state`, no Svelte imports. Any framework (or no framework) can call into it. This unblocks DRAFT-4 (game + sandbox both call the same controller) and TASK-1 (the demo player calls the same controller on synthetic input).

3. **Cell addressability moves to `data-cell-id` attributes.** Today the route maintains a `cellNodes: Map<id, HTMLElement>` populated via Svelte `setNode` callbacks on AnimatedRow — that's a Svelte-shaped mechanism. Replace it with `data-cell-id="N"` rendered on each `.wrap` element. The controller queries `[data-cell-id]` inside whatever DOM root the caller hands it. Drops `cellNodes` + `setNode` entirely. This also gives DRAFT-8 most of what it wanted (an explicit DOM contract).

## Three-phase shape (concrete)

- **Phase A (pre-commit prep)**: snapshot `oldCells` + `oldRects` from a `vizRoot: HTMLElement`, clone the live viz into a ghost, position the ghost, build `ghostNodesByOldId` from the ghost's children, hide the live viz, set up `revealLive`.
- **The commit (caller's job)**: caller runs the closure, awaits `tick()` if needed.
- **Phase C (post-commit assemble + run)**: build the full `Snapshot` record (cells now reflect new state, `getLiveNode` queries `[data-cell-id]` on the post-commit DOM), dispatch animation, finally cleanup (revealLive + dispose ghost).

API shape (sketch — exact signature TBD):

    runWithSnapshot({
      vizRoot: HTMLElement,
      oldCells: Cell[],
      newCells: Cell[],     // post-commit cells, supplied by caller after commit
      commit: () => void | Promise<void>,
      animation: (snap: Snapshot) => Promise<void>,
    }): Promise<void>

The caller's responsibilities shrink to: render BQN values to a DOM root, supply pre-commit and post-commit `Cell[]`, supply the commit closure, supply the animation. The controller does the rest.

## Open questions (still need design)

- Does `runWithSnapshot` take pre- and post-commit cells as inputs, or does it also take a `getCells()` accessor and call it twice around the commit?
- How does `tick()` cross the seam — caller awaits before passing post-commit info, or controller awaits internally after invoking `commit()`?
- Test strategy: jsdom enough? Fake DOM elements? Skip tests for the controller and only test the pure animations? (Animations are already testable in isolation; the controller is the new surface.)
- Error cleanup placement: is `revealLive` idempotent inside the controller's `finally`, or does the snapshot expose it for animations to call early?
- Naming: `controller.ts`? `snapshotRunner.ts`? `applyAnimated.ts`? The name should survive becoming the seam DRAFT-4 and TASK-1 both compose with.

## Knock-on effects on other drafts

- **DRAFT-8 (DOM contract)**: largely subsumed by the `data-cell-id` decision above. Remaining scope is just ModifierDiagram's diagram registry, if anything.
- **DRAFT-4 (Playground)**: reframed. The controller IS the shared seam between game and sandbox; "Playground" may just be a thin wrapper or unnecessary.
- **TASK-1 (demo player)**: the controller is the prereq this draft delivers. Demo player composes controller + a tiny stage + the per-glyph demo data.

## Definition of done (outcome-shaped)

- A framework-free TS module under src/lib/animations/ orchestrates the state→visual handoff
- Route's `applyRune` shrinks to: build cells, supply commit closure, call the controller
- `cellNodes` Map + `setNode` callbacks are gone; cell addressability is via `data-cell-id`
- Existing animations behave identically in the game (no visual regressions on tap)
- The controller is callable from a non-Svelte caller (proof: TASK-1 can compose it)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Controller lives as plain TS under src/lib/animations/; no Svelte imports
- [ ] #2 Route's applyRune delegates DOM choreography to the controller; only owns the commit closure and post-commit cell construction
- [ ] #3 cellNodes Map + setNode callbacks are removed; cell addressability is via data-cell-id attributes
- [ ] #4 Existing animations behave identically in the game (visual regressions check on every animated rune)
- [ ] #5 Controller is callable from a non-Svelte context (test or TASK-1 composes it)
- [ ] #6 ADR-004 invariant holds: controller never mutates state directly
<!-- AC:END -->
