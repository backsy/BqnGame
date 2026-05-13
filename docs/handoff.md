# Session handoff — bqnGame v2 animation engine

Paste/reference this at the start of the next session to pick up where this one left off.

---

## What this project is

A mobile-first BQN playground. The *new* animation engine (v2) is being built in parallel with an old engine; the old engine still drives the live game. Development happens on a dedicated harness route, not on the game.

See `CLAUDE.md` for full invariants. Key ones:

- Static build only (`@sveltejs/adapter-static`).
- BQN evaluation lives only in the worker; never on the main thread.
- Mobile is the primary target — usable at ~390px wide.
- v2 modules stay framework-free; Svelte coupling lives only in routes.

## Where the v2 engine lives

```
src/lib/animations/v2/
  value.ts        BqnValue union (5 variants), valuesEqual, assertNever
  fn-expr.ts      FnExpr union (~65 kinds covering BQN), LambdaBody
  step.ts         Step union (monadic, dyadic, assign, access)
  trajectory.ts   opaque branded Trajectory + smart constructors
  stage.ts        Stage interface + AnimateStep function type
  animate.ts      animateMonadic, animateDyadic, animateStep — exhaustive switches
  player.ts       play(trajectory, stage) loop
  fn-label.ts     fnExprLabel(fn): string — BQN glyph rendering
  speed.ts        animation speed multiplier (0.5x/1x/2x), scaled() / scaledMs()
  motions/
    black-box.ts  universal default (inputs → labelled box → outputs)
    lateral.ts    reverse, sort-up, sort-down, rotate, transpose (and the helpers)
  index.ts        barrel
```

```
src/routes/v2-harness/
  +page.svelte    interactive harness — starter picker, op buttons, speed
                  control, stage rendering. Stage implementation + small
                  evalStep evaluator live here.
  +page.ts        prerender/ssr disabled (uses DOM APIs at runtime)
```

Deployed at `https://backsy.github.io/BqnGame/v2-harness/` (GH Actions auto-deploys on push to `claude/**`).

## What's done

- **Phase 1** (TASK-2): scaffolded full BQN type model — opaque Trajectory with chaining-by-construction, exhaustive FnExpr/Step switches with assertNever, errors-as-values.
- **Phase 2** (TASK-3): player + Stage + blackBox + harness route. Harness can play hardcoded trajectories with the default blackBox choreography.
- **Phase 3a** (TASK-4): first hand-tuned motion family (lateral) — reverse, sort, rotate, transpose all on the new engine.

All on-screen behaviour is via v2 in the harness. The actual game (`/`) still uses the old engine in `src/lib/animations/*.ts` (untouched per orphan-don't-delete policy).

### Animation polish iterations on lateral

The four lateral animations have been polished in-session:

- **reverse**: clockwise wheel rotation pivoting on the bars' baseline (height-independent translation). For 2D it's a wheel around the horizontal axis through grid centre — rows swap top↔bottom via opposing arcs.
- **rotate** (`W⌽X`): sequential per-position shift with a counter (1, 2, ..., W). The leftmost bar arcs over the row to the back; others slide one slot left. Cosine arc, ARC_PEAK 56.
- **transpose** (`⍉`): three-phase. Phase 0 shifts BEFORE matrix right as a rigid block; Phase 1 cells leave one at a time and land in a staging area on the centre-left (no off-screen clipping); Phase 2 the new shape slides to centre. Dynamic offsets based on actual matrix widths.
- **sort up/down** (`∧` / `∨`): insertion sort with adjacent swaps only — each iteration places one element via small one-slot hops. Iteration boundaries are visually separated by 260ms pauses. On 2D, sorts ROWS by lex comparison; row swap moves all cells in a row together (vertically, with horizontal arcs to avoid clip).

Speed control affects every motion via `scaled()` / `scaledMs()` in `speed.ts`.

## What's next

Next concrete pieces in priority order:

1. **More motion families** — phase 3b through 3e per `docs/design/animation-language.md` migration plan. Order suggested in the design doc:
   - **Vertical family**: `take`, `drop`, `filter`. Up = keep, down = discard (per `animator-for-array-languages.md`).
   - **Sizing family**: per-element arithmetic. Bars grow/shrink in place.
   - **Merging family**: fold (`F´`), scan (`F`` ``). Pair-merging, scan leaves a trail.
   - **Distributing family**: `range` (`↕`), broadcast (scalar spreads).
2. **Game integration** — phase 4. The route's `applyRune` gains a per-`fn.kind` conditional that routes specific operations to v2. The old engine stays on disk; nothing is deleted (per migration policy in the design doc).
3. **Playground** — phase 5. Worker stepwise eval, AST→Step classifier, playground UI.

Open backlog drafts that may inform direction:

- **DRAFT-4** (Playground): now reframed — withSnapshot/controller may not need a separate Svelte component since v2's Stage is the seam.
- **DRAFT-5** (Rune constructor): bind-stripping invariant via smart constructor + branded type.
- **DRAFT-6** (keymap relocation).
- **DRAFT-7** (Editor extensions for syntax + glyph completion).
- **TASK-1** (glyph animation demo player) — depends on Phase 3+ being mature.

## How agents should be dispatched on v2 work

Lessons learned (and the rules that produced a clean review on the first try):

- **No commit** by the agent. Leave changes in the working tree.
- **No task edits** by the agent. The reviewer updates status.
- **No final summary or report**. Terminate without explanatory output — the diff is the report. Anything the agent says will be ignored.
- **Match the design doc's type names exactly.** If something is ambiguous, match the words and add ONE `// TODO: clarify` comment.
- Strict task spec with **lettered non-negotiable rules** keyed to specific bugs from previous attempts. Each rule names the failure mode it prevents.
- Use `nix develop --command pnpm check` and `pnpm build` to verify. Don't report results.

## Key constraints to honour

- **No overlap / no clip-through invariant** for cell animations. Cells must never share screen position; paths must not cross through other cells. Use staging areas (transpose) or opposing arcs (sort, reverse) or sequential per-cell motion (rotate) — whichever fits the operation.
- **Motion vocabulary discipline** — when two operations share a motion meaning, they share the motion code. The motions/ directory grows slowly; new motions are deliberate, not side-effects of writing an animation.
- **State and animation are separate layers** (ADR-004). Animations cannot mutate state.
- **Illegal states unrepresentable** (ADR-005). Opaque Trajectory, branded types, exhaustive switches, errors as values.
- **Orphan old, write new** — the old engine and any code that gets superseded stays on disk untouched. Removal is a separate decision later.

## Key files for context

- `docs/design/animation-language.md` — comprehensive type model, migration phases, motion vocabulary discipline section.
- `docs/design/animator-for-array-languages.md` — visual language (boxes/motion families/visibility rule/audience).
- `docs/design/keyboard-design.md` — keyboard direction (motion-family grouping, long-press preview animations).
- `docs/decisions/004-state-and-animation-layering.md`
- `docs/decisions/005-type-driven-design.md`
- `CLAUDE.md` — project invariants.

## Quick sanity checks

```bash
nix develop --command pnpm check    # 0 errors, 0 warnings expected
nix develop --command pnpm build    # static adapter, builds clean
```

Open `https://backsy.github.io/BqnGame/v2-harness/` after a `git push`. The harness has 5 starter values (1D arrays of various lengths, mixed-sign, and a 2×3 grid), op buttons grouped by motion family (Lateral / Black-box), and a Reset + 0.5x/1x/2x Speed control.
