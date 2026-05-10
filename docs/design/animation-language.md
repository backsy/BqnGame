# Animation language design

**Status:** design, not yet implemented
**Date:** 2026-05-10

This document specifies the animation system for the bqnGame app. It is the
target architecture; current code does not yet match it.

The system is shared between the game and the playground. The playground
animates arbitrary BQN one-liners end-to-end; the game animates the trivial
case where each rune tap is one step. Both consume the same engine.

## Frame

The system is a player for a typed sequence of evaluation steps. Each step
visualises the application of one BQN operation to a value, producing the
next value. Composition is BQN's syntactic composition — we do not invent
combinators.

Properties we hold load-bearing:

1. **Monoidal composition.** Step *i*'s output value is step *i+1*'s input
   value, by construction of the type. Trajectories with broken seams are
   unrepresentable.
2. **Total over the supported language.** Every operation that can appear in
   a parsed BQN expression has a kind in the `Operation` union and an
   animation function. There is no "no animation" path.
3. **Type-driven (per ADR-005).** Operation kinds are a tagged union;
   animation dispatch is exhaustive `switch`; missing animations fail the
   build, not the runtime.
4. **State and animation are separate layers (per ADR-004).** Animations
   never mutate state. The route owns commits; the player owns motion.

## Domains

### `BqnValue`

A BQN value. Atom or array of any rank. Comes from the worker.

### `Operation`

A typed tree mirroring BQN's algebra of operations. Every BQN expression
parses into a tree of these.

```ts
type Operation =
  // Base function primitives
  | { kind: 'add' } | { kind: 'sub' } | { kind: 'mul' } | { kind: 'div' }
  | { kind: 'pow' } | { kind: 'mod' } | { kind: 'min' } | { kind: 'max' }
  | { kind: 'eq' } | { kind: 'lt' } | { kind: 'gt' } | { kind: 'le' } | { kind: 'ge' } | { kind: 'ne' }
  | { kind: 'and' } | { kind: 'or' } | { kind: 'not' }

  // Shape / structural primitives
  | { kind: 'reverse' }
  | { kind: 'rotate' }
  | { kind: 'range' }
  | { kind: 'reshape' }
  | { kind: 'deshape' }
  | { kind: 'transpose' }
  | { kind: 'length' }
  | { kind: 'shape' }
  | { kind: 'take' }
  | { kind: 'drop' }
  | { kind: 'select' }
  | { kind: 'pick' }
  | { kind: 'join' }
  | { kind: 'sort' }
  | { kind: 'grade-up' } | { kind: 'grade-down' }
  | { kind: 'first' } | { kind: 'last' }
  | { kind: 'enclose' } | { kind: 'merge' }
  | { kind: 'group' }
  // …grows to cover every BQN function we encounter

  // Modifier-composed forms (recursive: inner is itself an Operation)
  | { kind: 'fold';   over: Operation }              // F´
  | { kind: 'scan';   over: Operation }              // F`
  | { kind: 'each';   of:   Operation }              // F¨
  | { kind: 'cells';  of:   Operation }              // F˘
  | { kind: 'table';  of:   Operation }              // F⌜
  | { kind: 'self';   of:   Operation }              // F˜
  | { kind: 'const';  value: BqnValue }              // F˙
  | { kind: 'compose'; left: Operation; right: Operation } // F∘G
  | { kind: 'over';    left: Operation; right: Operation } // F○G
  | { kind: 'bind-left';  left:  BqnValue; of: Operation } // N⊸F
  | { kind: 'bind-right'; right: BqnValue; of: Operation } // F⟜N

  // Opaque (user-named)
  | { kind: 'opaque'; name: string }                 // applying a user-defined name
```

The recursive shape lets `+˜´` (fold of self of plus) be `{kind: 'fold',
over: {kind: 'self', of: {kind: 'add'}}}`. No primitive-modifier
combination is too exotic to type.

The kind set is finite — BQN's primitive set is finite, the modifier set is
finite. The recursion stops at base primitives and `opaque` names.

### `Step`

One evaluation increment with chaining-by-construction.

```ts
type Step = {
  readonly op: Operation
  readonly before: BqnValue
  readonly after:  BqnValue
}
```

### `Trajectory`

Non-empty sequence of steps, opaque, constructible only via:

```ts
function trajectoryFrom(start: BqnValue, ops: ReadonlyArray<Operation>): Trajectory
function append(t: Trajectory, op: Operation): Trajectory
```

The constructors thread `before → after` between consecutive steps. Type
invariant: `∀ i. trajectory[i].after ≡ trajectory[i+1].before`. Cannot be
fabricated with a broken seam.

### `Stage`

The DOM surface that renders BQN values.

```ts
type Stage = {
  readonly current: HTMLElement
  prepare(value: BqnValue): Promise<HTMLElement>   // render off-screen
  commit(prepared: HTMLElement): void              // discard current, mount prepared
}
```

Renderer (Svelte today, anything tomorrow) implements this. Stage owns the
DOM root. Animations receive `current` and `prepared` HTMLElements.

### `AnimateStep`

```ts
type AnimateStep = (
  step: Step,
  beforeRoot: HTMLElement,
  afterRoot:  HTMLElement,
) => Promise<void>
```

Total — animations cannot fail. Cancellation deferred (when added: jump to
final state). The animation derives its position mapping from `op` plus the
before/after values.

## Animation registry

Exhaustive switch keyed on `op.kind`:

```ts
function animate(op: Operation): AnimateStep {
  switch (op.kind) {
    case 'reverse': return arcReverse
    case 'sort':    return stagSort
    case 'range':   return counterRange
    case 'fold':    return foldAnim(animate(op.over))   // recursive
    case 'scan':    return scanAnim(animate(op.over))
    case 'each':    return eachAnim(animate(op.of))
    // …
    case 'add':     return blackBox        // not yet hand-designed
    case 'mul':     return blackBox
    case 'opaque':  return blackBox        // named values are opaque by design
    // …exhaustive: build fails when a kind is added without an animation
  }
}
```

### The blackbox animation

The universal animation for kinds not yet hand-designed. Visualises a
function as a labeled box with inputs flowing in and outputs flowing out:

```
   before  ─┐                    ┌─  after
   value   ─┤   ┌──────────┐    ─┤  value
            ├──→│   F      │──→  │
            ─┤   └──────────┘    ─┤
            ─┘                    ┘
```

Choreography (sketch):
1. Frame the before value on the left half of the stage.
2. A box appears in the middle, labeled with the operation's display form
   (the BQN glyph, or the user-given name for `opaque`).
3. The before value's cells flow into the box (slide right + collapse).
4. The after value's cells emerge from the box (slide right + materialise).
5. Settle at the after-state filling the stage.

The viewer infers what the operation does from input → output, even when
we haven't designed a richer choreography. This is real animation — not a
fallback to "skip animating."

### Why `opaque` uses blackbox

When a BQN expression contains a user-defined name (e.g. `f ← +´` then
applying `f`), the engine treats `f` as opaque: applies the blackbox
animation labeled with `f`. The user named it; the animation respects the
abstraction. We do not animate the internals of named functions, even when
their definition uses primitives we have hand-tuned. Naming is the user
saying "treat this as a unit."

## Player

```ts
async function play(t: Trajectory, stage: Stage): Promise<void> {
  for (const step of t) {
    const before = stage.current
    const afterPromise = stage.prepare(step.after)   // pipelined: render next while animating current
    const after = await afterPromise
    await animate(step.op)(step, before, after)
    stage.commit(after)
  }
}
```

Pipelined render: `stage.prepare` for step *N+1* runs while step *N*'s
animation is in flight. Player keeps invariants either way.

No `try/catch`. Animations cannot fail by contract.

## How both sides hit the same engine

### Game

A `Rune` carries an `Operation`:

```ts
type Rune = {
  readonly glyph: string
  readonly expr:  string
  readonly op:    Operation
}
```

Tap a rune → append one step → player animates the new step.

### Playground

Parse a BQN one-liner → emit a list of `Operation`s in evaluation order
→ build a `Trajectory` → player animates the sequence.

The parser is the worker's job: BQN's parser is in the vendored interpreter.
The worker emits a stream of `(operation-tree, before-value, after-value)`
tuples, one per evaluation step. Main-thread classifier turns each tuple
into a typed `Operation` (the worker emits the AST shape; main thread maps
it to the union).

## Knock-on consequences

- **Cell IDs are gone.** No per-cell stable identity tracked across
  operations. Animations work on freshly rendered DOM per step, deriving
  their position mappings from the operation's algebra and the before/after
  values. The chaining invariant is between *values*, not between *cells*.
- **The route's 130-line `$effect` of special cases is gone.** `cells` is a
  function of `currentValue`, full stop. No per-rune ID-preservation
  branches. The reconciliation that used to live there is encoded in each
  operation's animation.
- **`hasAnimation` and `dispatchAnimation` collapse.** Replaced by the
  exhaustive switch over `Operation['kind']`. There is no "is this rune
  animated?" — every operation is animated.
- **Coverage growth is mechanical.** Adding a BQN primitive = one variant +
  one entry in the switch. Compiler enforces; you can't forget.

## Worker contract (sketch)

```ts
type WorkerRequest =
  | { id: string; kind: 'eval';   source: string }
  | { id: string; kind: 'trace';  source: string; start?: BqnValue }
  // 'trace' returns a list of evaluation steps for animation playback.

type TraceStep = {
  // The AST node applied at this step (worker-side representation).
  ast: BqnAstNode
  before: BqnValue
  after:  BqnValue
}

type WorkerResponse =
  | { id: string; kind: 'ok';    value: string /* pretty-printed */ }
  | { id: string; kind: 'trace'; steps: TraceStep[] }
  | { id: string; kind: 'error'; message: string }
```

The worker's job is BQN evaluation, with stepwise emission for trace
requests. The main thread owns the `Operation` union; classifier maps
`BqnAstNode + values` → `Operation` exhaustively.

## Deferred

- **Cancellation.** Not planned. When added: per-step abort signal,
  animation observes and snaps to final state. Player invariants unchanged.
- **Performance budget for very long one-liners.** A 30-operation expression
  takes 30 × animation duration to play through. Need to think about
  pacing, skipping, or live-control (pause/scrub) before this becomes
  unusable on long inputs.
- **Worker stepwise emission.** The vendored JS interpreter doesn't expose
  intermediate values today. Implementing `trace` requires either
  instrumenting the interpreter or running each sub-expression as a
  separate eval and accumulating. Design called out in implementation
  draft.
- **`Operation` union growth.** This document lists the variants we know
  we'll need; the actual list will grow as the parser encounters real BQN.
  Each new variant is one switch arm + one animation entry.

## Migration strategy

The new engine ships in parallel with the existing one. Existing animations
(the per-glyph choreographies in `src/lib/animations/*.ts`) are kept and
ported one-by-one. At every point the game still works.

### Phase 1 — Scaffold (no game integration)

- `src/lib/animations/v2/` (or similar) holds the new types: `Operation`,
  `Step`, `Trajectory`, `Stage`, `AnimateStep`.
- `Trajectory` smart constructors (`trajectoryFrom`, `append`) are pure
  data; no DOM.
- The exhaustive `animate(op)` switch is wired with every known kind, all
  pointing at `blackBox` initially. Build fails if a kind is added without
  a switch arm.
- Game route untouched. New engine exists, unused.

### Phase 2 — Player + Stage + blackBox

- Player loop consumes a `Trajectory` + `Stage` end-to-end.
- `Stage` interface defined; Svelte-backed implementation provided.
- `blackBox` animation implemented (inputs → labelled F → outputs).
- A small harness (test page or sandbox surface) runs a hard-coded
  Trajectory through the Player using only blackBox. Proves the engine
  works in isolation.
- Game route still untouched.

### Phase 3 — Migrate animations one at a time

For each existing animation in `src/lib/animations/*.ts`:
- Add an entry in the new engine's `animate(op)` switch for the matching
  kind, ported from the old choreography.
- The route's `applyRune` switches on which engine to use per
  Operation kind: matched → new engine; unmatched → old engine. (One
  conditional, removed at end of migration.)
- Visual review in browser before moving on.
- Pick simple, low-coupling animations first (`reverse`, `sort`,
  `transpose`, `deshape`). Save the dependency-heavy ones (`fold`,
  `tables`, `windows`) for last.

### Phase 4 — Cut over

- All animations migrated; remove the per-kind conditional in the route.
- Delete old engine (`hasAnimation`, `dispatchAnimation`, the `runX`
  wrappers in `index.ts`).
- The route's 130-line `$effect` of per-rune ID-preservation special cases
  collapses to a pure `cells = currentValue`. Bug class (first-rotate-after-
  range) gone by construction.

### Phase 5 — Playground

- Worker exposes stepwise eval (`trace` request).
- Main-thread AST→Operation classifier.
- Playground UI calls `play(trajectoryFromTrace(traceSteps), stage)`.

### Phase 6 — Coverage growth

- Hand-design choreographies for kinds still on `blackBox` as desired.
  Each is one switch-arm change; no architectural ripple.

### Reversibility

Phases 1–2 land entirely without touching the game. Phase 3 is the only
phase that risks regression, and it's per-animation: any single migration
can be reverted independently. The conditional in the route is the kill
switch.

## Out of scope (this document)

- Specific choreography of every hand-tuned animation (lives in the
  per-animation modules).
- BQN parser implementation details (lives behind the worker contract).
- Rendering details of `Stage` implementations (Svelte today; whatever
  later).

## Open questions

1. **How does the AST node from the worker map to `Operation`?** The worker
   emits something like `{type: 'fold', f: {type: 'prim', glyph: '+'}}`.
   The main-thread classifier walks this tree and produces an `Operation`.
   The mapping is mostly mechanical, but exotic BQN forms (e.g. `⌾` under,
   `◶` choose, `⎉` rank, `⚇` depth, `⍟` repeat) will need careful design
   for both their `Operation` variant and their animation. Not blocking the
   model; flagged for when implementation reaches them.

2. **Do operations with multiple arguments (binary primitives like `+`)
   produce one Step or two?** A dyadic application `2 + 3` has two argument
   values plus the function. In the trajectory, is this one step (with
   `before` being a tuple) or two? Likely one step where `Step.before` is
   the *right argument* and the *left argument* is part of the operation's
   visual frame (handled in the blackbox or the hand-tuned variant). Needs
   resolution before the parser is built.

3. **Is `Step.before` a single `BqnValue`, or do we need a richer "input
   shape" for dyadic operations?** Tied to question 2.
