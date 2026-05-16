# v3 animation architecture

Instructions for AI agents working on the v3 animation system. Read before
touching anything in this directory or in `src/lib/v3/` (the home for the
scene, history, render, tween, runner, and step modules described below).

For repo-wide rules (Nix toolchain, deploy, BQN invariants) see the root
[`CLAUDE.md`](../../../CLAUDE.md). This file is **additive** and is
load-bearing for v3 only.

## Why v3 exists

v2 animates DOM elements via a WAAPI/motion-lib pipeline. The animation
system and the DOM hold two separate models of "where things are." They
drift; the visible result is whatever drifts in front. End-state mismatches
are common and impossible to fully prevent inside that model.

v3 collapses both models into one. The **Scene** (a plain JS object) is the
only truth. Everything visible is a pure function of it. Animation is the
Scene evolving over time — never a separate state.

Do not port v2's mental model in. v3 starts from zero.

## History & REPL (load-bearing)

v3 is a BQN REPL whose UI happens to be an SVG-animated visualisation.
**Every change to the visible state corresponds to exactly one valid BQN
expression that the worker evaluated.** There are no fake operations, no
pseudo-primitives, no shortcuts that bypass the worker. The animation is
how we _show_ a BQN reduction; it is not the thing happening.

### The data model

- **HistoryEntry** = `{ source: string, value: BqnValue, scene: Scene }`.
  - `source` — the BQN expression that produced this entry, e.g.
    `⌽⟨3‿1‿4‿1‿5⟩`. Must round-trip through the worker.
  - `value` — the structured BQN value the worker returned.
  - `scene` — `bqnValueToScene(value)`, the projection used to render.
- **History** = `{ entries: HistoryEntry[], cursor: number }`. Pure data,
  JSON-serialisable, replayable, inspectable in devtools.

### Operations on history

- `reset(source)` — clear; evaluate `source`; install as entry 0; cursor 0.
  Starter buttons call this.
- `apply(source)` — evaluate in the worker; append; cursor advances.
  Op buttons call this.
- `undo()` / `redo()` — move cursor by one, clamped to bounds. No worker call.
- `jumpTo(i)` — set cursor to `i` (bounds-checked). No worker call.
- **Truncate-on-write**: `apply` when the cursor is not at the tip
  discards the forward tail. Standard REPL semantics, not git semantics.

### Source of truth

`entries[cursor].scene` is the resting Scene. The renderer reads from it,
or — during an in-flight tween — from a lerped Scene that resolves to it
at `t=1`. History is the model; rendering, debug, property tests, and
animations all derive from it.

## Architecture (load-bearing)

```
History  (entries: HistoryEntry[],  cursor: number)
   │
   │  reset(source) | apply(source)  → worker.eval → push entry
   │  undo / redo / jumpTo(i)        → cursor moves
   ▼
currentScene  ──render──▶  SVG  ──browser──▶  pixels
   ▲
   │  during a transition, currentScene is
   │  tween(prevEntry.scene, nextEntry.scene, t)
   │  driven by an rAF runner. At t=1:
   │  currentScene === entries[cursor].scene  (by construction).
```

- **Scene** — plain serialisable JS object covering all four shape
  variants (scalar, boxed, vec, mat). Cells, viewBox, optional global
  transforms. Nothing else.
- **bqnValueToScene(value)** — pure projection from a BQN value (whatever
  shape) to a Scene. Single function with shape dispatch.
- **render(scene)** — Svelte template reactive on `scene`. Pure: same
  Scene → identical SVG. No `getBoundingClientRect`, no DOM measurement.
- **Primitive** — `(fromScene, params) → Scene[]`. A reusable visual
  atom (shrink, rotate, stretch, drift, fade, slot-swap, …). The last
  snapshot is the deterministic post-Scene. Primitives are the visual
  alphabet; steps compose them. See **Primitive animations** below.
- **Step** — `(prevScene, nextScene) → Scene[]` choreography for one
  BQN operation `f`, built by chaining primitives. The first element
  equals `prevScene`; the last equals `nextScene`; the middle elements
  are primitive phases (the "dance" the operation performs). Steps
  are pure; they never call the worker. **Step IO must match the BQN
  function exactly**: for a step animating `f`,
  `prevScene === bqnValueToScene(prevValue)` and
  `nextScene === bqnValueToScene(f(prevValue))`. The worker computes
  the post-value; the step only visualises. Steps never invent values.
- **tween(from, to, durationMs, easing, onFrame)** — pure interpolator
  driven by `requestAnimationFrame`. Calls `onFrame(scene)` each tick.
  ~30 lines. Returns `{ promise, cancel }`.
- **runner** — sequences a step's snapshots through `tween`, awaits each.
  Publishes a debug tap.

## Primitive animations (visual language)

Primitives are how we build up complex motion. They are reusable visual
atoms that bigger animations compose. We **build the visual language as
we go** — primitives are added only when a real animation needs one, and
each one earns its keep by being reused.

### What a primitive is

A primitive is a pure function

```ts
primitive(fromScene: Scene, params: P): { snapshots: Scene[]; toScene: Scene }
```

- Snapshots include the start (`snapshots[0] === fromScene`) and the end
  (`snapshots[last] === toScene`). Middle entries are visual phases the
  tween runner interpolates between.
- `toScene` is deterministic from `(fromScene, params)`. Property tests
  enforce this.
- A primitive may declare a **shape precondition** (e.g. "operates on a
  row of cells", "requires a vec Scene"). Invoking outside the
  documented domain throws a typed error; never produces nonsense.

### Across all four BQN data types

The Scene model carries **scalar / box / vec / mat** from day one. Each
primitive declares which of those shapes it operates on. Some
primitives are shape-agnostic ("fade every cell's opacity to X"); most
have a domain. When the same idea applies in two shapes with different
geometry (e.g. shrink-to-unit on a vec vs on each row of a mat), it's
two primitives with related names, not one overloaded primitive. Honest
specialisation beats clever generalisation.

### Playable as building blocks

Every primitive is independently invokable from the harness, before any
step uses it. A **Primitives panel** in the harness lists every defined
primitive; clicking one runs it against the current Scene so we can
watch it in isolation. This panel is how the visual language grows: try,
see, decide, keep or discard.

Primitive previews are **not** history entries. They run, the resulting
`toScene` is displayed, and a "back to current BQN state" control
restores `entries[cursor].scene`. History stays pure-BQN.

### Composing into steps

A step for a real BQN operation is a chain of primitives:

```
step(prev, next) =
   [...primA(prev,         paramsA).snapshots,
    ...primB(primA.toScene, paramsB).snapshots,
    ...primC(primB.toScene, paramsC).snapshots]
```

The composer's job is choosing primitives + params so the final
`toScene` equals `next` exactly. If no chain reaches `next`, the step
is not yet implementable — author a new primitive or refine an existing
one. Steps never paper over a gap with ad-hoc code.

## Hard rules

1. **No imports from `$lib/animations/v2`.** v3 is a clean slate.
2. **No WAAPI, no motion-lib, no GSAP, no library.** Hand-rolled rAF
   tween only.
3. **No HTML cells. No CSS auto-layout.** Everything visible lives
   inside the SVG element, in viewBox units. Centring, padding, gaps
   are computed in JS.
4. **No DOM measurement.** `getBoundingClientRect`, `offsetWidth` and
   friends are forbidden inside the v3 pipeline. If you need a width,
   you stored it in the Scene.
5. **No `<animate>` (SMIL) elements.** Attribute updates from JS only.
6. **No `fill: forwards`, no `commitStyles`, no `transition:` CSS on
   animated SVG attrs.** The Scene is the truth; the tween writes Scene
   to attrs; that is the entire mechanism.
7. **Step output is data.** Steps never touch the DOM, never start
   tweens, never call `setTimeout`. They return snapshot lists.
8. **Cells have stable `id`.** Across a step's snapshots, the same
   cell keeps the same id, so `{#each ... (cell.id)}` produces stable
   `<g>` elements that the renderer just updates attrs on.
9. **Every history entry is a valid BQN expression.** Entries are
   produced by `bqnWorker.eval(source)`. No fake BQN operations, no
   synthetic semantics, no shortcuts that bypass the worker. Visual
   primitives (rule 12) are a separate concept: they are not BQN ops
   and do not produce history entries when previewed standalone.
10. **History is the model.** A cursor over an ordered list of entries
    IS the application state for the BQN side. All BQN-op UI actions
    are history operations; all rendering reads from history (directly
    or via an in-flight tween over two adjacent entries).
11. **Don't simplify away required features.** Scope from day one:
    scalar + boxed + vec + mat shapes, worker-backed evaluation,
    REPL-grade history with back/forward navigation, and a playable
    primitives panel. Implementations may be skeletal but the data
    shapes and entry points must exist in the first slice. Do not
    strip features to ease a first commit.
12. **Primitive animations are the visual alphabet.** A primitive is
    a pure `(fromScene, params) → { snapshots, toScene }` whose
    `toScene` is deterministic and whose `snapshots[last] === toScene`.
    Steps compose primitives; bespoke per-op choreography that does not
    decompose into primitives is rejected — refactor it into a
    primitive first, then call it.
13. **Primitives are pure data transforms.** No DOM reads, no clock,
    no worker. Same inputs → same snapshot list every time. Shape
    preconditions are documented and asserted; out-of-domain invocation
    throws.
14. **Every primitive is playable in isolation.** Adding a primitive
    requires registering it with the harness's primitives panel so a
    developer can invoke it on the current Scene with no step or BQN
    context. Unplayable primitives are not allowed.

## Determinism commitments

- `render(scene)` is a pure function of `scene`. No `Date`,
  `Math.random`, or DOM reads.
- `bqnValueToScene(value)` is a pure function of `value`.
- `primitive(fromScene, params)` is a pure function. `toScene` is
  deterministic from inputs and IS the post-Scene every test compares
  against.
- `step(a, b)` is a pure function of its inputs.
- History operations are pure transitions on the History value (the
  one exception: `apply` and `reset` await the worker, which is
  deterministic per BQN's semantics).
- `lerpScene(a, a, t) === a` for any `t`. (Tested.)
- `lerpScene(a, b, 0)` deep-equals `a`. (Tested.)
- `lerpScene(a, b, 1)` deep-equals `b`. (Tested.)
- The final snapshot of a step IS `nextScene`. There is no separate
  "after rendering" or "after commit" — the snapshot is authoritative.
  Mismatch is structurally impossible.

## Debuggability commitments

These are not optional. Every feature of v3 must preserve them.

1. **Scene and History are JSON-serialisable.** Stringify and paste
   into a debugger to reconstruct any frame, or replay an entire
   session.
2. **History navigation is a first-class UI feature**, not a debug
   afterthought. Back/forward buttons (and keyboard shortcuts) live
   in the harness chrome.
3. **Step output is inspectable.** Calling a step from a console gives
   the full snapshot list with zero animation running.
4. **Runner exposes a tap.** The active runner publishes
   `{ entryIdx, phaseIdx, t, currentScene }` for read-only inspection
   from devtools.
5. **Pause / scrub / step.** The harness chrome exposes these as
   first-class UI controls (not debug afterthoughts):
   - **Pause** — toggle. The runner freezes; the displayed Scene
     stays at whatever lerped state was current.
   - **Speed** — picker including at least `0.25×`, `0.5×`, `1×`,
     `2×`. The slow end is the primary tool for catching bad frames.
   - **Frame stepper** — `←` / `→` arrow keys advance the runner by
     one frame backward / forward while paused.
   - **Frame counter** — visible. Lets the user report "frame N
     looks wrong" with a precise referent.
   Pause and step work by re-running the tween's interpolator on a
   target `t`. No clock dependency outside the runner.
   **Cancel** is unresolved — possibly added later if a need shows up.
6. **Single-frame render.** Given any Scene, `render(scene)` produces
   the SVG. Inspection works without the runner running.

## Property-based testing (fast-check)

The chosen test discipline. Every step, every primitive, and every
history operation has property tests; example-based tests are
supplementary, not primary.

- **Library**: [`fast-check`](https://fast-check.dev/). Add as a dev
  dependency (`pnpm add -D fast-check`). Do not substitute another
  property library.
- **Where**: `src/lib/v3/__tests__/` next to the modules they cover.
  One file per concept (`tween.test.ts`, `history.test.ts`,
  `step-reverse.test.ts`, …).
- **For every shape's `bqnValueToScene`**:
  - Pure: called twice on the same value, deep-equals.
  - No-overlap: cells never overlap each other in viewBox space.
  - viewBox containment: every cell rect is inside the viewBox.
- **For every primitive**:
  - Pure: `primitive(s, p)` called twice deep-equals.
  - Endpoint determinism: `snapshots[last]` deep-equals the declared
    `toScene`, for every `(fromScene, params)` in the documented domain.
  - No-overlap and viewBox containment hold at every snapshot.
  - Shape preconditions: invoking outside the domain throws a typed
    error; never silently produces nonsense.
  - For each shape in the primitive's domain, an arbitrary-Scene
    property test confirms it actually works on that shape.
- **For every step**:
  - Pure: `step(a, b)` called twice deep-equals.
  - Endpoint correctness: `step(a, b)[0] === a` and
    `step(a, b)[last] === b`.
  - Decomposes into primitives: the snapshot list is the concatenation
    of primitive snapshot lists (verifiable by inspection or a tagged
    structure).
  - Cardinality: multiset of cell values preserved for permutations,
    or matches the BQN reference for transforming ops.
  - Stable ids: ids in `step(a,b)[k]` ⊂ ids in `step(a,b)[k+1]`
    ∪ removed-this-phase. No id appears from nowhere.
- **For tween**: identity at `t=0` and `t=1`; monotonic progress per
  scalar field; no field changes that aren't lerped.
- **For history**:
  - Cursor always in `[0, entries.length - 1]`.
  - `undo` then `redo` is identity at any cursor not at the
    endpoints.
  - `reset` produces a History with `entries.length === 1` and
    `cursor === 0`.
  - `apply` on a non-tip cursor truncates the forward tail.
- **Arbitraries** live in a shared `__tests__/arbs.ts`
  (`arbBqnValue`, `arbScene`, `arbHistory`, …) and are reused across
  test files.

## Directory layout (target)

```
src/routes/v3-harness/
  +page.ts          # prerender:false, ssr:false
  +page.svelte      # the frame; binds runner; calls history ops
  CLAUDE.md         # this file

src/lib/v3/
  scene.ts          # Scene, Cell, shape variants (scalar/box/vec/mat)
  layout.ts         # bqnValueToScene; pure projection per shape
  history.ts        # History type + reset/apply/undo/redo/jumpTo
  tween.ts          # lerpScene, tween()
  runner.ts         # orchestrates tweens during apply/back/forward
  primitives/
    index.ts        # registry consumed by the harness primitives panel
    shrink.ts       # one file per primitive; export + register
    rotate.ts
    stretch.ts
    ...
  steps/
    reverse.ts      # composes primitives; pure
    ...
  __tests__/
    arbs.ts                    # arbBqnValue, arbScene per shape, arbHistory
    history.test.ts
    scene.test.ts
    tween.test.ts
    primitive-shrink.test.ts
    step-reverse.test.ts
    ...
```

The BQN worker lives at `src/lib/bqn/` and is shared infrastructure;
v3 uses it freely. (Rule 1 forbids `$lib/animations/v2`, not `$lib/bqn`.)

## Working style

- The first slice MUST include skeletal forms of all the load-bearing
  pieces: history, all four shape variants (scalar/box/vec/mat),
  worker-backed evaluation, back/forward navigation, and the harness's
  primitives panel (even if empty at first). Animations layer on top
  later; they do not gate the substrate.
- **Grow the visual language by need.** Add a primitive only when a
  step actually needs it. Implement against the user's spec (see
  next bullet), register with the panel, property-test it, then
  compose. No speculative primitives.
- **The user designs primitives.** Visual choreography, parameters,
  and the invariants each primitive must satisfy are the user's call.
  Ask inline when a primitive's spec is ambiguous; do not invent. Do
  not propose unrequested alternatives or "improve" what the user
  described. Capture each new primitive's spec (as the user stated
  it) in the header comment of `primitives/<name>.ts` for posterity.
- Don't speculate about future ops or step shapes. Add steps one at a
  time; refactor the shared shape when the third one tells you what
  the shape is.
- Every new piece either lives behind a property test or is rejected.
  No "I'll add tests later."
- When in doubt about determinism, ask: "could this read the DOM or
  the clock?" If yes, redesign.
- When in doubt about scope, ask: "does this preserve REPL validity
  (every state reachable by a real BQN expression)?" If no, redesign.
