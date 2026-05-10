# 004 — State and animation are separate layers

**Status:** accepted
**Date:** 2026-05-10

## Context

Earlier in the project, animation logic and state mutation were intertwined
inside the route's tap handler — the animation could observe and influence
*when* state landed, sometimes deferring the commit until motion finished.
That coupling produced subtle bugs (state visible to one piece of code but
not another while an animation was in flight) and made animations
untestable in isolation, because they couldn't be exercised without the
full state machine.

A refactor (commit `564345a`) split the concerns:

- **State layer.** `history` mutates synchronously the moment a rune
  button fires. Svelte's reactivity renders it. The state layer does not
  know animation exists.
- **Pure animation library** under `src/lib/animations/`. Each module is
  one exported function taking structured DOM/rect/value inputs and
  returning `Promise<void>`. None reads game state, none mutates history,
  none calls commit. They are testable in isolation: hand them DOM nodes
  and rects, they animate.
- **Controller** (currently in `src/routes/+page.svelte`). The only
  place that knows both layers exist. It snapshots pre-commit DOM,
  performs the synchronous commit, then dispatches an animation against
  already-committed state.

## Decision

Keep this layering intact. Specifically:

1. **State mutates synchronously, without animation knowledge.** The
   commit is `history = [...history, expr]; await tick();` and nothing
   about animation gets to defer, intercept, or skip it.
2. **Animations run against already-committed state and cannot mutate
   it.** They receive a `Snapshot` carrying pre-commit info (`oldCells`,
   `oldRects`, `ghost`) and post-commit info (`cells`, `getLiveNode`,
   `liveViz`). They have no path back to `history`.
3. **The controller is the only place that knows both layers exist.**
   Today that's the route; future refactors may pull the controller
   into a dedicated module (e.g. when DRAFT-2's snapshot extraction
   lands), but the layering survives the move.

## Why

- **Testability.** Pure animation modules can be unit-tested without
  Svelte, without state, without the worker.
- **Predictability.** State is always in one of two definite shapes —
  pre-commit or post-commit. Never a third "animating" shape with
  partial truth.
- **Reuse.** Same animations can drive long-press demos in the palette
  (DRAFT-9), tutorial overlays, or future playground-wide animation,
  because they carry no game-specific state assumptions.
- **Past pain.** The pre-`564345a` mess is documented enough that we
  know what re-coupling costs.

## What this rules out

- Animation modules calling into `history`, `cells`, or any reactive
  state.
- Wrapping the commit so animation can observe or delay it.
- "Optimistic" commits that the animation might roll back.
- Snapshot/controller code mutating state — it orchestrates DOM and
  delegates the commit; it does not own the commit shape.

## When to revisit

If a future feature genuinely cannot be expressed without animation
influencing state (the only plausible case I can think of: branching
demos where the user picks one of N animation outcomes and the chosen
one becomes state), revisit — but the burden of proof is on whoever
proposes the coupling, not on this ADR.
