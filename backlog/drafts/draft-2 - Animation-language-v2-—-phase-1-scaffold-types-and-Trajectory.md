---
id: DRAFT-2
title: 'Animation language v2 — phase 1: scaffold types and Trajectory'
status: Draft
assignee: []
created_date: '2026-05-10 11:15'
updated_date: '2026-05-10 15:14'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Context

Phase 1 of the migration laid out in `docs/design/animation-language.md`. Scaffolds the new animation engine's data layer in parallel with the existing engine. Game route untouched.

The previous shape of this draft (`withSnapshot` extraction) was reverted in commit fold (revert of 164f0fe) — it moved DOM choreography out of the route but didn't touch the architectural source of bugs (cell-id reconciliation special cases). The new design replaces that whole layer.

## What this delivers

Module tree under `src/lib/animations/v2/` (name TBD) implementing the full type model from the design doc:

1. **`BqnValue` union.** All BQN value shapes: `number`, `char`, `fn` (function-as-value), `array` (with `shape: ReadonlyArray<number>` for rank), `namespace`. Heterogeneous arrays supported. Rank-0 arrays distinct from atoms.

2. **`FnExpr` tagged union — comprehensive over BQN.** Every base primitive (every BQN function that can appear in a parsed expression), every 1-modifier variant (fold, scan, each, cells, table, self, const), every 2-modifier variant (compose, over, bind-left, bind-right, before, after, under, choose, rank, depth, repeat, valences, catch), train shapes (atop, fork — n-trains nest right), `lambda` (body opaque for now per the design doc), and `opaque` (for resolved named functions). System functions are explicitly NOT in the union — they're rejected at the parser boundary in phase 5.

3. **`Step` union with the four variants:** `monadic`, `dyadic`, `assign`, `access`. Each carries its result/value (chained from previous step's output by the smart constructors).

4. **`Trajectory` opaque type with smart constructors** that thread `before → after` between consecutive steps. The chaining invariant (step[i+1].x ≡ step[i].result for monadic; equivalent rules for other Step kinds) is enforced by construction. Structural literal Trajectories are unrepresentable.

5. **`Stage` and `AnimateStep` types — type-only at this phase.** No implementation yet.

6. **Exhaustive `animateStep(step)` outer switch and `animateMonadic(fn)` / `animateDyadic(fn)` inner switches.** All `FnExpr` kinds covered in both arity contexts. All arms return a placeholder reference; phase 2 ships `blackBox`. Compiler exhaustiveness guarantees no kind can be added to `FnExpr` without forcing the switches to be updated.

## Non-goals (this phase)

- No DOM code. No Svelte. No game integration. No Player. No animations actually running.
- No worker changes. No parser.
- The old engine (src/lib/animations/index.ts, types.ts, etc.) stays untouched and continues to drive the game.
- Lambda body sub-trajectory animation: lambda variant is in the type, but body remains opaque.

## Constraints

- Per ADR-005 (illegal states unrepresentable): every union exhaustively switched; `Trajectory` opaque with smart constructors; structural literal Trajectories impossible.
- Per ADR-004 (state and animation separate): no animation code mutates state. Trivially true at this phase.

## Definition of done

- `src/lib/animations/v2/` exists with the type modules in place. Naming TBD but the design doc's vocabulary is the canonical reference.
- `BqnValue`, `FnExpr`, `Step`, `Trajectory`, `Stage`, `AnimateStep` types match the design doc.
- `FnExpr` covers every BQN concept enumerated in the doc (base prims, 1-mods, 2-mods, trains, lambda, opaque).
- `Step` has all four variants (`monadic`, `dyadic`, `assign`, `access`).
- `trajectoryFrom` and `append` enforce the chaining invariant; structural literal `Trajectory` is impossible.
- `animateMonadic(fn)` and `animateDyadic(fn)` are exhaustive over `FnExpr['kind']`. TS build fails if a kind is added without both switches covering it.
- `pnpm check` passes.
- Game still works exactly as before (no integration yet).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 BqnValue covers all five variants (number, char, fn, array with shape, namespace); arrays support heterogeneous data and any rank
- [ ] #2 FnExpr is comprehensive over BQN: every base primitive enumerated in the design doc, every 1-modifier and 2-modifier variant, train shapes (atop/fork), lambda variant, opaque variant
- [ ] #3 Step has all four variants (monadic, dyadic, assign, access)
- [ ] #4 Trajectory is opaque; smart constructors enforce chaining invariant for each Step kind by construction
- [ ] #5 animateMonadic(fn) and animateDyadic(fn) are exhaustive switches over FnExpr['kind']; TS build fails if a kind lacks coverage in either
- [ ] #6 All new types live under src/lib/animations/v2/ (or agreed name); old engine untouched
- [ ] #7 pnpm check passes
- [ ] #8 Game animations are visually identical to before this draft (no integration)
<!-- AC:END -->
