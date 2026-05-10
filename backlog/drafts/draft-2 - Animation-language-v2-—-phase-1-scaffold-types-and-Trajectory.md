---
id: DRAFT-2
title: 'Animation language v2 — phase 1: scaffold types and Trajectory'
status: Draft
assignee: []
created_date: '2026-05-10 11:15'
updated_date: '2026-05-10 14:37'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Context

This draft is phase 1 of the migration laid out in `docs/design/animation-language.md` ("Migration strategy" section). It scaffolds the new animation engine's data layer in parallel with the existing engine. Game route is untouched.

The previous shape of this draft (a `withSnapshot` extraction) was reverted in commit fold (revert of 164f0fe) — the refactor moved DOM choreography out of the route but didn't touch the architectural source of the bug (cell-id reconciliation special cases). The new design replaces that whole layer.

## What this delivers

A new module tree under `src/lib/animations/v2/` (name TBD) with:

1. **`Operation` tagged union.** Every BQN function we know we'll encounter, plus modifier-composed variants (recursive: `{kind: 'fold', over: Operation}`, etc.) and `{kind: 'opaque', name}` for user-named functions. See the design doc for the full enumeration shape; the actual list at this phase is "the kinds that appear in our existing rune set" plus `opaque`. The union grows as the engine encounters more BQN.

2. **`Step` and `Trajectory` types.** Smart constructors `trajectoryFrom(start, ops)` and `append(t, op)` enforce the chaining invariant by construction (step[i].after === step[i+1].before). The Trajectory type is opaque; structural literal Trajectories are unrepresentable.

3. **`Stage` and `AnimateStep` types.** Type-only at this phase — implementation comes in phase 2.

4. **The exhaustive `animate(op): AnimateStep` switch.** Every kind in the union is covered. All arms initially return a placeholder (a typed reference; phase 2 ships the actual `blackBox` implementation, but the switch must be exhaustive now so the compiler enforces coverage).

## Non-goals (this phase)

- No DOM code. No Svelte. No game integration. No Player. No animations actually running.
- No worker changes.
- The old engine (src/lib/animations/index.ts, types.ts) stays untouched and continues to drive the game.

## Constraints

- Per ADR-005 (illegal states unrepresentable): `Operation` is a tagged union with exhaustive dispatch; `Trajectory` is opaque with smart constructors that can't produce broken seams.
- Per ADR-004 (state and animation separate): no animation code mutates state. At this phase that's trivially true (no animation code runs yet).

## Definition of done

- `src/lib/animations/v2/` exists with `operation.ts`, `trajectory.ts`, `stage.ts`, `animate.ts` (or similar shape — final names TBD).
- The Operation union covers every kind that appears in the current rune set, plus `opaque`.
- `trajectoryFrom` and `append` enforce the chaining invariant; structural literal `Trajectory` is impossible.
- `animate(op)` is an exhaustive switch (TS build fails if a kind is added without a switch arm).
- `pnpm check` passes.
- Game still works exactly as before (this phase changes nothing user-facing).

## Out of scope (lands in later phases)

- Player loop (phase 2)
- Svelte-backed Stage implementation (phase 2)
- blackBox animation choreography (phase 2)
- Migrating any existing animation to the new engine (phase 3+)
- Playground integration (phase 5)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operation tagged union covers every kind in the current rune set, plus 'opaque' for named functions
- [ ] #2 Trajectory type is opaque; smart constructors enforce step[i].after === step[i+1].before
- [ ] #3 animate(op) is an exhaustive switch over Operation['kind'] — TS build fails if a kind is added without coverage
- [ ] #4 All new types and switches live under src/lib/animations/v2/ (or agreed name); old engine untouched
- [ ] #5 pnpm check passes
- [ ] #6 Game animations are visually identical to before this draft (no integration yet, so trivially true)
<!-- AC:END -->
