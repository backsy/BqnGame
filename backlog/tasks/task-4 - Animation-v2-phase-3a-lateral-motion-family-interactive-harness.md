---
id: TASK-4
title: 'Animation v2 phase 3a: lateral motion family + interactive harness'
status: To Do
assignee: []
created_date: '2026-05-12 04:27'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Context

Phase 3a of the migration in `docs/design/animation-language.md`. Builds the FIRST hand-tuned motion family (lateral) and ports its operations off blackBox. Reworks the harness route into an interactive surface so the motion vocabulary can be visually validated as it grows.

Old engine still drives the game; no game integration this phase. The harness is the development surface.

Lateral motion family per `docs/design/animator-for-array-languages.md`: boxes slide preserving identity. Covers `reverse`, `sort-up`, `sort-down`, `rotate` (when monadic = reverse; dyadic = N-shift), and `transpose` (2D). Each operation's animation derives its permutation from before/after values and calls the shared lateral motion helper.

## Sources of truth

- `docs/design/animation-language.md` — Motion vocabulary discipline section. Phase 3 description.
- `docs/design/animator-for-array-languages.md` — substrate (boxes-encoding-values), motion families.
- `docs/decisions/004`, `005`.
- Existing v2 code: `src/lib/animations/v2/` from phases 1 & 2.
- `src/routes/v2-harness/+page.svelte` from phase 2 — to be reworked.

## Deliverables

### 1. Lateral motion helper — `src/lib/animations/v2/motions/lateral.ts`

A FLIP-style helper that animates each cell from its before-position to its after-position. Identity is preserved by the permutation argument.

```ts
export function lateralMove(
  beforeRoot: HTMLElement,
  afterRoot: HTMLElement,
  permutation: ReadonlyArray<number>,
): Promise<void>
```

`permutation[i]` is the index in `afterRoot`'s cells where `beforeRoot`'s cell at index `i` ends up. For `reverse` on length N: `permutation[i] = N - 1 - i`.

Implementation sketch:
- Read child positions of `beforeRoot` and `afterRoot` via `getBoundingClientRect`.
- For each `i`, animate the before-child OR the after-child (FLIP — animate one, hide the other) from before-rect to after-rect.
- Use the `motion` library.
- No game-state knowledge. Pure pixel math + permutation.

### 2. Per-operation animation functions

Five new exports, one per lateral operation. Each computes its permutation from the Step values and calls `lateralMove`. Lives in `src/lib/animations/v2/motions/lateral.ts` or sibling files — design call, but the actual permutation logic must live alongside the lateral motion, not in animate.ts.

- `reverseMonadic: AnimateStep` — permutation i → N-1-i.
- `sortUpMonadic: AnimateStep` — permutation derived by ascending sort of before.values; stable for duplicates.
- `sortDownMonadic: AnimateStep` — permutation derived by descending sort; stable.
- `rotateDyadic: AnimateStep` — permutation derived from `step.w` (rotation count). Monadic rotate = reverse, so `rotateMonadic` reuses reverseMonadic.
- `transposeMonadic: AnimateStep` — permutation derived from before.shape and after.shape (2D transpose).

For step kinds that can't apply (e.g. dyadic reverse — there is no dyadic reverse in BQN), animation stays blackBox. Per the task list below, only the specific arity-pairs are migrated.

### 3. Wire into `animate.ts`

Replace `blackBox` with the lateral animations for these arity-pairs only:

| FnExpr kind | animateMonadic arm | animateDyadic arm |
|---|---|---|
| reverse | reverseMonadic | rotateDyadic (BQN W⌽X = rotate by W) |
| rotate | reverseMonadic | rotateDyadic |
| sort-up | sortUpMonadic | (blackBox — no dyadic) |
| sort-down | sortDownMonadic | (blackBox — no dyadic) |
| transpose | transposeMonadic | (blackBox — no standard dyadic transpose in our subset) |

All other arms continue to return `blackBox`. The exhaustive switch with `assertNever` still holds.

### 4. Interactive harness — rework `src/routes/v2-harness/+page.svelte`

Replace the hardcoded 3-step Trajectory with an interactive picker:

- **Starter values**: a small set of hardcoded `BqnValue`s the user can pick (e.g. `[3, 1, 4, 1, 5, 9, 2, 6]`, `[1, 2, 3]`, a 2D 2×3, mixed-sign array). Pick-one radio or button row. Selected starter renders in the stage.
- **Operation buttons**: grouped visually by motion family.
  - "lateral" group: reverse, sort-up, sort-down, rotate (monadic), transpose.
  - "blackBox" group: a handful of representative still-on-blackBox ops (e.g. add, fold, take, range) just so the contrast between hand-tuned and default is visible.
- **Play behaviour**: clicking an op button (a) builds a 1-step Trajectory from the current stage value to the operation's result (computed by a small evaluator in the harness — see below), (b) calls `play(trajectory, stage)`. After the animation, the stage shows the result. Clicking another op continues from there.
- **Reset button**: re-mounts the chosen starter.
- **Operation labels**: use `fnExprLabel(fn)` to render the BQN glyph on each button — keyboard-design principle, the glyph is the label.

### 5. Small in-harness evaluator — local to the harness route

`src/routes/v2-harness/eval.ts` (or inline in `+page.svelte`). Pure TS function that takes a `(BqnValue, FnExpr, arity)` and returns the result `BqnValue`. Handles ONLY the operations the harness wires up. NOT in v2/; this is dev test code, not engine code.

```ts
function evalStep(input: BqnValue, fn: FnExpr, arity: 'monadic' | 'dyadic', w?: BqnValue): BqnValue
```

For unsupported operations: throw or return a placeholder. The harness won't call it with unsupported combinations.

### 6. Harness layout for the new substrate

The stage container from phase 2 stays (position:relative, overflow:hidden, the prepare/commit pattern). Visual style of bars from phase 2 stays. Layout grows:

```
┌─────────────────────────────────────┐
│ v2 Animation Harness                │
├─────────────────────────────────────┤
│ Starter: [arr1] [arr2] [2D] [...]   │
├─────────────────────────────────────┤
│ [Stage container with current value]│
├─────────────────────────────────────┤
│ Lateral: ⌽ ∧ ∨ ⍉                   │
│ Black-box: + +´ N⊸↑ ↕               │
├─────────────────────────────────────┤
│ [Reset]                              │
└─────────────────────────────────────┘
```

Mobile-first per CLAUDE.md — usable at ~390px wide.

## Non-negotiable rules

**A — v2/ stays framework-free.** No svelte imports. The lateral motion uses DOM APIs (HTMLElement, getBoundingClientRect, the motion library). Allowed.

**B — Svelte coupling only in the harness route.** Same as TASK-3.

**C — Motion vocabulary discipline.** Lateral is the second entry under `motions/` (after blackBox). The motion helper `lateralMove` and the per-operation `reverseMonadic`, `sortUpMonadic`, etc. live alongside `black-box.ts`. ALL five lateral operations share the same `lateralMove` call — they differ ONLY in how they compute their permutation. If you find yourself writing motion code outside `lateralMove` for a specific operation, stop — that means you've invented a new motion that needs a name and its own helper.

**D — Orphan old, write new.** Don't touch the game route, sandbox, AnimatedRow, ValueViz, Editor, GlyphPalette, old engine. Phase 3a touches v2/ and the harness route only.

**E — Exhaustive switches with assertNever.** Including any new switches in lateral.ts. animateMonadic / animateDyadic stay exhaustive.

**F — Lateral animations play real, visually correct motion.** Bars slide from before-position to after-position. Identity preserved (same DOM node — or a clone that ends at exactly the after-position). Phase 3 of the previous blackBox bug is fully addressed: the lateral move must be visible across the animation, not snap-in at the end.

**G — Type-driven (ADR-005).** No `any`. No loose casts. Permutation arrays are typed precisely.

**H — pnpm check and pnpm build both pass.**

**I — Harness is interactive but minimal.** Don't build a UI framework. Plain buttons, plain layout. The point is to *see* the motion vocabulary, not to ship a polished tool. If you find yourself designing complex UI, stop.

**J — No new operations get hand-tuned animations in this task.** Only the five lateral ones listed. Other operations stay on blackBox even if they would obviously benefit from lateral or another family. Discipline: one family per phase, named explicitly.

## Working rules

1. DO NOT COMMIT. Leave changes in the working tree.
2. DO NOT EDIT TASK FILES. Reviewer handles status.
3. DO NOT WRITE A FINAL SUMMARY OR REPORT. Diff is the report.
4. Use `nix develop --command pnpm check` and `pnpm build`. Don't report results.
5. No global installs.
6. No tests. Harness is the validation surface.
7. Match design docs' shapes exactly. Ambiguous → match words, add ONE `// TODO: clarify`.
8. No comments that restate code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/lib/animations/v2/motions/lateral.ts exports lateralMove(beforeRoot, afterRoot, permutation): Promise<void>
- [ ] #2 Five per-operation animations exist: reverseMonadic, sortUpMonadic, sortDownMonadic, rotateDyadic, transposeMonadic. Each calls lateralMove with a permutation it derives from Step values
- [ ] #3 animate.ts arms for reverse/rotate (monadic + dyadic), sort-up (monadic), sort-down (monadic), transpose (monadic) return their respective lateral animations; all other arms still return blackBox
- [ ] #4 All five lateral animations call the SAME lateralMove helper — no per-operation motion code outside lateral.ts
- [ ] #5 Harness route has a starter picker (≥3 options), an op picker grouped by motion family with the BQN glyph as the button label
- [ ] #6 Clicking an op builds a 1-step Trajectory and calls play(); the stage shows the operation's result after animation
- [ ] #7 Reset button re-mounts the chosen starter
- [ ] #8 The in-harness evaluator handles only operations the harness wires up; lives in the route, not in v2/
- [ ] #9 Lateral animations are visually correct: bars slide from before-position to after-position with identity preserved
- [ ] #10 No svelte/components/routes/old-engine imports in v2/
- [ ] #11 Old engine, game route, sandbox, AnimatedRow, ValueViz, Editor, GlyphPalette untouched
- [ ] #12 pnpm check and pnpm build both pass
<!-- AC:END -->
