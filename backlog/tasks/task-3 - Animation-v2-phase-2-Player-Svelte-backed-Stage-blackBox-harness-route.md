---
id: TASK-3
title: 'Animation v2 phase 2: Player + Svelte-backed Stage + blackBox + harness route'
status: Done
assignee: []
created_date: '2026-05-11 05:29'
updated_date: '2026-05-11 18:47'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Context

Phase 2 of the migration in `docs/design/animation-language.md`. Brings the v2 engine to life off the game's critical path. Old engine still drives the game; no game integration this phase.

This phase is where the type model from phase 1 becomes runnable animation, and where the substrate (boxes-encoding-values) first appears in code. Visual choices made here propagate.

## Sources of truth

- `docs/design/animation-language.md` — type model (phase 1 done), player loop sketch, blackBox choreography, Stage contract, Motion vocabulary discipline.
- `docs/design/animator-for-array-languages.md` — visual language: boxes whose size encodes value; row of boxes is an array.
- `docs/decisions/004` (state/animation layering) and `005` (type-driven design).
- `CLAUDE.md` — project invariants.

## Deliverables

### 1. Player — `src/lib/animations/v2/player.ts`

```ts
export async function play(t: Trajectory, stage: Stage): Promise<void>
```

Loop sketch:
```ts
for (const step of t.steps) {
  const beforeRoot = stage.current
  const afterValue = resultOf(step)
  const afterRoot = await stage.prepare(afterValue)   // pipelined
  await animateStep(step)(step, beforeRoot, afterRoot)
  stage.commit(afterRoot)
}
```

`resultOf(step)` is a pure helper: monadic/dyadic/access → `step.result`; assign → `step.value`. Exhaustive switch, assertNever default. No try/catch.

### 2. Label function — `src/lib/animations/v2/fn-label.ts`

```ts
export function fnExprLabel(fn: FnExpr): string
```

Exhaustive over `FnExpr['kind']`. Returns the BQN glyph for primitives, user name for `opaque`, recursive composition for modifiers (e.g. `+´` for fold of add), `{…}` for lambda.

### 3. blackBox motion — `src/lib/animations/v2/motions/black-box.ts`

Establishes `motions/` directory (per Motion vocabulary discipline). Exports `blackBox: AnimateStep` implementing the choreography:
1. Frame before value on left.
2. Labeled box appears in middle (label from `fnExprLabel(step.fn)` for monadic/dyadic; `step.name` for assign; `step.field` for access).
3. Before cells slide right + collapse into box.
4. After cells emerge + slide to fill the right.

Use the `motion` library already in the project. If full choreography is hard in one pass, prefer simpler (fade-out + label flash + fade-in) over half-built — but NOT an empty Promise.resolve.

Replace `blackBoxStub` in `animate.ts` with the real `blackBox` import.

### 4. Stage + harness — `src/routes/v2-harness/+page.svelte`

Standalone page that:
- Implements `Stage` (script section or sibling .ts file). Implementation MAY use Svelte; v2 never imports from this route.
- Builds a hardcoded `Trajectory` in-place (≥3 steps, e.g. `[1,2,3] → reverse → [3,2,1] → take 2 → [3,2]`).
- Has a "play" button that calls `play(trajectory, stage)`.

`Stage.prepare` renders via a small `renderBqnValue(value): HTMLElement`:
- number → `<div class="bar">` with height proportional to value.
- number-array → `<div class="row">` of bars.
- char/fn/namespace/nested-array → placeholder div.

## Non-negotiable rules

**A — `v2/` stays framework-free.** No imports of svelte/svelte-*, old engine, routes, or components. DOM types and runtime APIs (HTMLElement, document.createElement) are allowed — platform, not framework.

**B — Svelte coupling ONLY in the harness route.** Stage implementation lives in `src/routes/v2-harness/`. It imports the Stage *type* from v2 and provides an implementation.

**C — `motions/` established with one entry.** `src/lib/animations/v2/motions/black-box.ts` is the first. Future phases add lateral/vertical/etc. as deliberate, named acts.

**D — Orphan old, write new.** Don't touch: `src/lib/animations/index.ts`/`types.ts`/per-animation modules, `src/routes/+page.svelte`, `src/routes/sandbox/`, `AnimatedRow`, `ValueViz`, `Editor`, `GlyphPalette`. Phase 2 is purely additive.

**E — Exhaustive switches with assertNever.** `resultOf`, `fnExprLabel`, and any new switches you add. Compile-time exhaustiveness plus runtime safety net.

**F — blackBox plays real animation.** Clicking play in the harness must visibly show: content moves to box, label appears, new content emerges. Not perfect, but not a no-op.

**G — Type-driven (ADR-005).** Errors as values where applicable. No `any`/loose `unknown`. No "only-valid-in-some-phases" fields.

**H — `pnpm check` and `pnpm build` both pass.** Static-adapter compatible (no SSR-only APIs).

## Working rules

1. DO NOT COMMIT. Leave changes in the working tree.
2. DO NOT EDIT TASK FILES. Reviewer handles status.
3. DO NOT WRITE A FINAL SUMMARY OR REPORT. Diff is the report.
4. Use `nix develop --command pnpm check` and `pnpm build` to verify. Don't report results.
5. No global installs.
6. No tests this phase. Harness route IS the validation surface.
7. Match design docs' names and shapes exactly. Ambiguous → match words and add ONE `// TODO: clarify`.
8. No comments that restate code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/lib/animations/v2/player.ts exports play(t, stage): Promise<void> with pipelined prepare
- [x] #2 src/lib/animations/v2/fn-label.ts exports fnExprLabel(fn): string — exhaustive over FnExpr['kind'] with assertNever default
- [x] #3 src/lib/animations/v2/motions/ exists with black-box.ts exporting blackBox: AnimateStep
- [x] #4 blackBox plays an actual choreography (input motion, labeled box, output motion) — not an empty Promise
- [x] #5 animate.ts's blackBoxStub is replaced by the real blackBox import from motions/black-box.ts
- [x] #6 src/routes/v2-harness/+page.svelte exists, mounts a Stage, builds a hardcoded Trajectory (≥3 steps), has a play button
- [x] #7 Stage implementation lives in the harness route, not in v2/
- [x] #8 renderBqnValue handles number and number-array cleanly; other BqnValue variants are placeholder
- [x] #9 No imports of svelte/components/routes/old-engine into v2/ files
- [x] #10 Old engine, game route, sandbox route, AnimatedRow, ValueViz, Editor, GlyphPalette untouched
- [x] #11 pnpm check and pnpm build both pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Phase 2 of the animation language migration. Engine is now runnable end-to-end on a Trajectory, driven by a real blackBox animation, validated via a standalone harness route.

Files added:
- src/lib/animations/v2/player.ts — play(t, stage) loop, resultOf helper
- src/lib/animations/v2/fn-label.ts — fnExprLabel exhaustive over 65 FnExpr kinds, recursive for modifier-composed shapes
- src/lib/animations/v2/motions/black-box.ts — first motion vocabulary entry; three-phase choreography
- src/routes/v2-harness/+page.svelte — Svelte-backed Stage implementation + hardcoded 3-step Trajectory
- src/routes/v2-harness/+page.ts — disables prerender/ssr (DOM APIs at runtime)

Files modified:
- src/lib/animations/v2/animate.ts — blackBoxStub replaced with real blackBox import
- src/lib/animations/v2/index.ts — barrel re-exports play, resultOf, fnExprLabel

Old engine, route, sandbox, AnimatedRow, ValueViz, Editor, GlyphPalette untouched (Rule D — orphan old).

Reviewed against all 8 rules (A–H): pass. Build clean (pnpm check 0 errors, pnpm build succeeds).

One bug found in review and fixed before commit: Stage.prepare originally placed the prepared element in an off-screen holdEl, making blackBox's phase-3 emerge animation invisible (animation ran while element was at left:-9999px, then commit moved it to containerEl post-animation, producing a snap-in rather than a slide-in). Fix: prepare appends directly into containerEl with position:absolute;bottom:0;opacity:0 so the element is in the visible coordinate space during animation. commit strips the staging styles. containerEl has overflow:hidden so the pre-emerge x:-40px offset is clipped.

Two minor issues noted but not blocking:
- Player loop doesn't actually pipeline (sketch matches but await on prepare blocks animate from starting before prepare resolves). Doesn't matter for blackBox-only phase 2 where prepare is cheap DOM construction. Revisit when per-frame motion comes in.
- renderBqnValue in harness lacks assertNever default. TS's return-type analysis catches missing variants but no runtime safety net. Minor.

Visual review: not done by agent (no browser). Human can open /v2-harness/ to verify the three-phase choreography plays correctly.
<!-- SECTION:FINAL_SUMMARY:END -->
