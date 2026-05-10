---
id: TASK-2
title: 'Animation language v2 — phase 1: scaffold types and Trajectory'
status: To Do
assignee: []
created_date: '2026-05-10 11:15'
updated_date: '2026-05-10 15:51'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Context

Phase 1 of the migration laid out in `docs/design/animation-language.md`. Scaffolds the new animation engine's data layer in parallel with the existing engine. Pure types + smart constructors + exhaustive switches. No DOM, no game integration, no animations actually running.

A previous implementation attempt was rejected during review. This task description embeds the lessons learned: every divergence found in review is now a non-negotiable rule below. Read those rules carefully — they exist because they were violated.

## Sources of truth

The design doc is canonical for type names, field shapes, and dispatch structure. This task adds rules that the design doc leaves implicit but that the implementation MUST enforce.

- `docs/design/animation-language.md` — type model, dispatch shape, migration phases.
- `docs/decisions/004-state-and-animation-layering.md` — animations cannot mutate state.
- `docs/decisions/005-type-driven-design.md` — illegal states unrepresentable; errors as values; pragmatic exception for unreadable type machinery (rank stays as runtime `array.shape`).
- `CLAUDE.md` — project invariants.

## Deliverable

Module tree under `src/lib/animations/v2/`:

- `value.ts` — `BqnValue` union (5 variants per spec).
- `fn-expr.ts` — `FnExpr` tagged union, comprehensive over BQN per spec, including `LambdaBody`.
- `step.ts` — `Step` 4-variant union per spec.
- `trajectory.ts` — opaque `Trajectory` with `trajectoryFrom`, `append`, `TrajectoryError`, `StepInput`, and the chaining checker.
- `stage.ts` — `Stage` interface + `AnimateStep` function type.
- `animate.ts` — `animateMonadic`, `animateDyadic`, `animateStep` exhaustive switches.
- `index.ts` — barrel re-exports.

## Non-negotiable rules

These exist because the previous attempt violated them. They are not suggestions.

### Rule A — `kind: 'rank'` is the 2-modifier ONLY

The design doc has been updated. The base primitive `≢` (rank-of-array) is `kind: 'rank-of'`. The 2-modifier `F⎉K` (apply-at-rank) is `kind: 'rank'`. Two distinct kinds. NEVER reuse the same `kind` string for two variants — the union narrowing collapses them, defeating type-driven dispatch. If you spot any other accidental collision in the design doc, STOP and flag it; do not paper over.

### Rule B — `fmt` and `fmt-num` are NOT in `FnExpr`

System functions (`•Fmt`, `•Repr`) are out of scope per the design doc's Resolved decisions section. The doc has been updated; the FnExpr enumeration must not include them. Don't add them back.

### Rule C — Chaining semantics for each Step kind

`trajectoryFrom` and `append` enforce these rules. The chain anchor (the value the next step's input is checked against) updates per-step:

- **monadic step at index i**: `step.x` must equal the chain anchor. After this step, the chain anchor is `step.result`.
- **dyadic step**: AT LEAST ONE of `step.w` or `step.x` must equal the chain anchor (BQN allows the pipelined value to land in either argument depending on grammar position). Check both. After this step, anchor is `step.result`.
- **assign step**: NO chaining constraint on input. The chain anchor does NOT change. The next step chains against the SAME anchor as before this assign. Assign is a passthrough on the data flow; the bound value is captured for naming, not for threading.
- **access step**: `step.target` must equal the chain anchor. After this step, anchor is `step.result`.

The previous implementation broke rule for assign by treating its `value` as the new chain anchor. Do not repeat.

### Rule D — `StepInput` is structurally narrower than `Step`

Per the design doc: "StepInput is a Step minus the result/before fields that the constructor threads itself."

Concrete shapes:

```ts
type StepInput =
  | { kind: 'monadic'; fn: FnExpr;            result: BqnValue }   // x is threaded
  | { kind: 'dyadic';  fn: FnExpr; w: BqnValue; x: BqnValue;
                                              result: BqnValue }   // both args supplied; at least one must match anchor
  | { kind: 'assign';  name: string; value: BqnValue }
  | { kind: 'access';                field: string; result: BqnValue }   // target is threaded
```

The constructor SETS `step.x` (monadic) and `step.target` (access) from the chain anchor. Caller cannot supply them. By construction, those threaded fields cannot be wrong — the only way they enter the Trajectory is through the constructor.

The previous implementation made StepInput identical to Step ("verify what caller passes, don't thread") which weakens "by construction" to "by check." Do not repeat. The check still happens for dyadic (because both w and x are caller-supplied), but for monadic and access, threading is the rule.

### Rule E — `valuesEqual` is total and structural for every BqnValue variant

The previous implementation returned `false` unconditionally for `fn` and `namespace` variants. Both are first-class BqnValue variants; trajectories that flow function values or namespace values must be able to chain.

Required behaviour per variant:

- **number**: `a.value === b.value`.
- **char**: `a.value === b.value`.
- **fn**: `a.def === b.def` (reference equality on the FnExpr tree). Two function values are equal iff their underlying FnExpr is the same object reference. Justification: structural equality over recursive FnExprs is expensive and the worker can preserve identity for shared bindings.
- **array**: same shape AND same data length AND each element pairwise `valuesEqual`. Recursive over nested BqnValues.
- **namespace**: `a.entries === b.entries` (reference equality on the Map). Same reasoning as fn.

If a kind is missing from the switch, `assertNever` fails the build. No `TODO` punts; if a variant's equality semantics aren't decided, this task cannot ship.

### Rule F — Every exhaustive switch has an `assertNever` default

Three switches: `animateMonadic`, `animateDyadic`, `animateStep`. All three must end with `default: return assertNever(<scrutinee>)`. Compile-time exhaustiveness AND runtime safety net. The previous implementation omitted it on `animateStep` — inconsistency that's not allowed here.

### Rule G — `Trajectory` is opaque; structural literals impossible

Use a `unique symbol` brand that is `declare const` (not exported). `makeTrajectory` is the only way to produce a `Trajectory` and lives inside `trajectory.ts`. External callers cannot import the brand and so cannot construct the type.

### Rule H — Errors as values

`TrajectoryError` is a discriminated union; the smart constructors return `Trajectory | TrajectoryError`. No throwing for chain-break or empty-input cases. `assertNever` may throw because it represents an unreachable bug, not a user-input error.

### Rule I — No DOM, no Svelte, no leakage

`v2/` files do not import:
- `svelte` or `svelte/*`
- Anything from `src/lib/animations/` (the old engine)
- Anything from `src/routes/` or `src/lib/components/`
- Browser globals (`document`, `window`, etc.)

`Stage` references `HTMLElement` (a DOM type) — that's fine; `HTMLElement` is a TS lib type, not a browser-runtime import. Implementations of `Stage` live OUTSIDE v2/ in later phases.

### Rule J — Old engine untouched

Don't modify `src/lib/animations/index.ts`, `src/lib/animations/types.ts`, or any per-animation module under `src/lib/animations/`. Don't modify the route, AnimatedRow, ValueViz. Don't modify any backlog file directly. Don't update task status. Don't commit.

## Working rules

1. **DO NOT COMMIT.** Leave all changes uncommitted in the working tree.
2. **DO NOT EDIT TASK FILES** or use backlog MCP tools. The reviewer updates status after review.
3. **DO NOT WRITE A FINAL SUMMARY OR REPORT.** When the work compiles, terminate without explanatory output. The diff is the report.
4. **Use `nix develop --command pnpm check`** to verify the work compiles. Don't report the result.
5. **Use `nix develop --command`** for any node/pnpm invocation. Don't install globally.
6. **No tests this phase.** The compiler IS the test surface for type-driven scaffolding.
7. **Match the design doc's type names exactly.** If something in the doc seems ambiguous, match its words and add ONE short `// TODO: clarify` comment — don't invent alternatives.
8. **No comments that restate code.** Comments only for non-obvious WHY.

## Acceptance criteria (compile-time-checkable except A and J)

- [ ] BqnValue covers all 5 variants per spec.
- [ ] FnExpr is comprehensive over BQN per spec; no `fmt`/`fmt-num`; `rank-of` is base primitive, `rank` is the 2-modifier; LambdaBody opaque.
- [ ] Step has all 4 variants per spec.
- [ ] StepInput is structurally narrower than Step per Rule D (monadic and access miss their threaded fields).
- [ ] Trajectory is opaque per Rule G; structural literal impossible.
- [ ] trajectoryFrom and append enforce chaining per Rule C, including assign-as-passthrough.
- [ ] valuesEqual is total per Rule E; no kind returns false unconditionally.
- [ ] All three exhaustive switches have assertNever defaults per Rule F.
- [ ] No DOM/Svelte/old-engine/route/component imports per Rule I.
- [ ] Old engine untouched per Rule J.
- [ ] pnpm check passes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 BqnValue covers all 5 variants per spec (number, char, fn, array with shape, namespace)
- [ ] #2 FnExpr is comprehensive over BQN per spec; no fmt/fmt-num; rank-of is the base primitive, rank is the 2-modifier; LambdaBody opaque
- [ ] #3 Step has all 4 variants per spec (monadic, dyadic, assign, access)
- [ ] #4 StepInput is structurally narrower than Step per Rule D — monadic StepInput has no x; access StepInput has no target
- [ ] #5 Trajectory is opaque per Rule G — unique-symbol brand, declare const, structural literal impossible
- [ ] #6 trajectoryFrom and append enforce chaining per Rule C, including assign-as-passthrough (assign does NOT advance the chain anchor)
- [ ] #7 valuesEqual is total per Rule E; no variant returns false unconditionally; fn uses reference equality on def, namespace uses reference equality on entries, array is recursive structural
- [ ] #8 All three exhaustive switches (animateMonadic, animateDyadic, animateStep) have assertNever defaults per Rule F
- [ ] #9 No DOM/Svelte/old-engine/route/component imports per Rule I
- [ ] #10 Old engine, route, and components untouched per Rule J
- [ ] #11 pnpm check passes
<!-- AC:END -->
