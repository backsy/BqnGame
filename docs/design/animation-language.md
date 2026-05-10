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
2. **Total over BQN.** Every BQN concept that can appear in a parsed
   expression — base primitives, 1-modifiers, 2-modifiers, trains,
   lambdas, names, namespaces, assignments, member access — has a typed
   home in the `FnExpr` and `Step` unions, and an animation. There is no
   "no animation" path. Coverage gaps surface as classifier-level
   "unsupported" errors at the parser boundary, never as silent half-
   animation.
3. **Type-driven (per ADR-005).** All unions are exhaustively switched;
   missing animations fail the build, not the runtime. Smart constructors
   make broken trajectories unrepresentable.
4. **State and animation are separate layers (per ADR-004).** Animations
   never mutate state. The route owns commits; the player owns motion.

## Domains

### `BqnValue`

A BQN value. Atom or array of any rank. Comes from the worker.

### `BqnValue`

The full value model. Atoms, arrays of any rank (with rank-0 distinct from
atoms — BQN distinguishes), functions-as-values, and namespaces.

```ts
type BqnValue =
  | { kind: 'number';    value: number }
  | { kind: 'char';      value: string }                       // single grapheme
  | { kind: 'fn';        def: FnExpr }                         // functions are values
  | { kind: 'array';
      shape: ReadonlyArray<number>;                            // rank = shape.length
      data:  ReadonlyArray<BqnValue> }                         // row-major; heterogeneous OK
  | { kind: 'namespace'; entries: ReadonlyMap<string, BqnValue> }
```

Rank is runtime data on `array.shape`, not a phantom type — encoding rank
at the TS type level is exactly the kind of TS heroics ADR-005 carves out.
Animations branch on `shape` cleanly (read-only, immutable).

### `FnExpr`

A typed tree mirroring BQN's algebra of function expressions. Every BQN
expression parses into a tree of these. Recursive: modifiers and trains
take FnExprs as operands.

```ts
type FnExpr =
  // ── Base function primitives ──────────────────────────────────────────
  // Arithmetic
  | { kind: 'add' } | { kind: 'sub' } | { kind: 'mul' } | { kind: 'div' }
  | { kind: 'pow' } | { kind: 'root' } | { kind: 'mod' }
  | { kind: 'min' } | { kind: 'max' } | { kind: 'floor' } | { kind: 'ceil' }
  | { kind: 'abs' } | { kind: 'neg' }
  // Comparison
  | { kind: 'eq' } | { kind: 'ne' }
  | { kind: 'lt' } | { kind: 'le' } | { kind: 'gt' } | { kind: 'ge' }
  | { kind: 'match' } | { kind: 'not-match' }                  // ≡ ≢ (depth-aware)
  // Logical
  | { kind: 'and' } | { kind: 'or' } | { kind: 'not' }
  | { kind: 'span' }                                           // ¬
  // Shape / structural
  | { kind: 'reverse' } | { kind: 'rotate' }
  | { kind: 'reshape' } | { kind: 'deshape' }
  | { kind: 'transpose' }
  | { kind: 'length' } | { kind: 'shape' } | { kind: 'rank' }
  | { kind: 'take' }   | { kind: 'drop' }
  | { kind: 'select' } | { kind: 'pick' }
  | { kind: 'first' }  | { kind: 'last' }
  | { kind: 'enclose' } | { kind: 'merge' }
  | { kind: 'join-to' } | { kind: 'pair' } | { kind: 'solo' }   // ∾ ⋈ ≍
  | { kind: 'range' }
  | { kind: 'sort-up' } | { kind: 'sort-down' }
  | { kind: 'grade-up' } | { kind: 'grade-down' }
  | { kind: 'group' }
  | { kind: 'index-of' } | { kind: 'progressive-index-of' }
  | { kind: 'unique' } | { kind: 'mark-firsts' }
  | { kind: 'find' } | { kind: 'member' }
  | { kind: 'left-id' } | { kind: 'right-id' }                  // ⊣ ⊢
  | { kind: 'fmt' } | { kind: 'fmt-num' }                       // •Fmt, •Repr-style if used

  // ── 1-modifier applications (operand is a FnExpr) ─────────────────────
  | { kind: 'fold';      over: FnExpr }                         // F´
  | { kind: 'fold-from'; over: FnExpr; seed: BqnValue }         // F˝ if treated as fold w/ seed
  | { kind: 'scan';      over: FnExpr }                         // F`
  | { kind: 'each';      of:   FnExpr }                         // F¨
  | { kind: 'cells';     of:   FnExpr }                         // F˘
  | { kind: 'table';     of:   FnExpr }                         // F⌜
  | { kind: 'self';      of:   FnExpr }                         // F˜
  | { kind: 'const';     value: BqnValue }                      // F˙

  // ── 2-modifier applications (two operands; FnExpr or BqnValue) ────────
  | { kind: 'compose';     f: FnExpr; g: FnExpr }                          // F∘G
  | { kind: 'over';        f: FnExpr; g: FnExpr }                          // F○G
  | { kind: 'bind-left';   left:  BqnValue; of: FnExpr }                   // N⊸F (subject bind)
  | { kind: 'bind-right';  right: BqnValue; of: FnExpr }                   // F⟜N
  | { kind: 'before';      f: FnExpr; g: FnExpr }                          // F⊸G (function-function variant of ⊸)
  | { kind: 'after';       f: FnExpr; g: FnExpr }                          // F⟜G
  | { kind: 'under';       f: FnExpr; g: FnExpr }                          // F⌾G
  | { kind: 'choose';      f: FnExpr; g: FnExpr }                          // F◶G
  | { kind: 'rank';        of: FnExpr; spec: BqnValue | FnExpr }           // F⎉K
  | { kind: 'depth';       of: FnExpr; spec: BqnValue | FnExpr }           // F⚇K
  | { kind: 'repeat';      of: FnExpr; spec: BqnValue | FnExpr }           // F⍟K
  | { kind: 'valences';    f: FnExpr; g: FnExpr }                          // F⊘G
  | { kind: 'catch';       f: FnExpr; g: FnExpr }                          // F⎊G

  // ── Trains ────────────────────────────────────────────────────────────
  | { kind: 'atop';   f: FnExpr; g: FnExpr }                               // 2-train: F G
  | { kind: 'fork';   f: FnExpr | BqnValue; g: FnExpr; h: FnExpr }         // 3-train: F G H (F can be subject)
  // 4+ trains in BQN are right-associative forks. Encoded by nesting:
  // `A B C D E` ≡ fork(A, B, fork(C, D, E)). No separate variant needed.

  // ── Lambdas ───────────────────────────────────────────────────────────
  | { kind: 'lambda';
      role:    'fn' | 'mod1' | 'mod2';                                     // function, 1-mod, 2-mod
      body:    LambdaBody }                                                // see below

  // ── Resolved name (opaque to the engine) ──────────────────────────────
  | { kind: 'opaque'; name: string; resolved: FnExpr }
  // 'resolved' carries the actual function expression but the engine
  // refuses to look at it. Animation uses 'name' as the box label.
```

`LambdaBody` is currently opaque — the body is captured by the parser but
the engine treats lambda application as a blackbox step. Sub-trajectory
animation of anonymous lambda bodies is reserved for a future iteration
(noted in "Deferred" below); the type variant is in place so opening it
up is purely an animation-side change.

```ts
type LambdaBody = { readonly source: string }   // opaque payload, animation-side blackbox
```

The recursion lets `+˜´` (fold of self of plus) be `{kind: 'fold', over:
{kind: 'self', of: {kind: 'add'}}}` and `(+ × -)` be `{kind: 'fork', f:
{kind: 'add'}, g: {kind: 'mul'}, h: {kind: 'sub'}}`. No primitive-modifier-
train combination is too exotic to type.

The kind set is finite — BQN's primitive set is finite, the modifier set
is finite, train shapes nest. The recursion stops at base primitives,
opaque names, or lambda bodies.

### `Step`

One evaluation increment with chaining-by-construction. Three variants
because BQN distinguishes monadic vs dyadic application, and assignment
is a distinct kind of step that the playground can produce:

```ts
type Step =
  | { kind: 'monadic'; fn: FnExpr; x: BqnValue;       result: BqnValue }
  | { kind: 'dyadic';  fn: FnExpr; w: BqnValue; x: BqnValue; result: BqnValue }
  | { kind: 'assign';  name: string; value: BqnValue }                  // ← (define) and ↩ (modify)
  | { kind: 'access';  target: BqnValue; field: string; result: BqnValue }   // ns.field
```

Animations dispatch on Step kind first, then on `fn.kind` for monadic /
dyadic (the per-function specialisation lives in the `animate(fn)`
registry — see below).

### `Trajectory`

Non-empty sequence of steps, opaque, constructible only via:

```ts
function trajectoryFrom(start: BqnValue, steps: ReadonlyArray<StepInput>): Trajectory
function append(t: Trajectory, step: StepInput): Trajectory
```

`StepInput` is a `Step` *minus* the `result`/`before` fields that the
constructor threads itself. Type invariant the constructors enforce:

- For `monadic` step *i+1*: `step[i+1].x ≡ step[i].result`.
- For `dyadic`: caller supplies `w` and `x`, constructor checks at least
  one of them matches the previous step's result (BQN composition is
  pipeline-of-monadic by default; dyadic composition needs explicit
  threading from the parser).
- For `assign`: doesn't consume the previous result (introduces a binding,
  doesn't change the data flow).
- For `access`: `target` matches the previous step's result.

Trajectories with broken seams are unrepresentable.

### `Stage`

The DOM surface that renders BQN values. Renderer (Svelte today, anything
tomorrow) implements this. Stage owns the DOM root.

```ts
type Stage = {
  readonly current: HTMLElement
  prepare(value: BqnValue): Promise<HTMLElement>   // render off-screen
  commit(prepared: HTMLElement): void              // discard current, mount prepared
}
```

### `AnimateStep`

```ts
type AnimateStep = (
  step: Step,
  beforeRoot: HTMLElement,
  afterRoot:  HTMLElement,
) => Promise<void>
```

Total — animations cannot fail. Cancellation deferred (when added: jump to
final state). The animation derives its position mapping from `step.fn`
plus the before/after values.

## Animation registry

Two layers, both exhaustive switches.

**Outer layer: dispatch by Step kind.**

```ts
function animateStep(step: Step): AnimateStep {
  switch (step.kind) {
    case 'monadic':  return animateMonadic(step.fn)
    case 'dyadic':   return animateDyadic(step.fn)
    case 'assign':   return assignAnimation
    case 'access':   return accessAnimation
  }
}
```

**Inner layer: dispatch by `fn.kind`** (for monadic and dyadic Steps). One
exhaustive switch per arity. Reverse, sort, range, fold-of-X all fan out
here.

```ts
function animateMonadic(fn: FnExpr): AnimateStep {
  switch (fn.kind) {
    case 'reverse':    return arcReverse
    case 'sort-up':    return stagSortAsc
    case 'range':      return counterRange
    case 'fold':       return foldAnim(animateDyadic(fn.over))      // recursive
    case 'scan':       return scanAnim(animateDyadic(fn.over))
    case 'each':       return eachAnim(animateMonadic(fn.of))
    case 'lambda':     return blackBox                                // body opaque for now
    case 'opaque':     return blackBox                                // named — opaque by design
    case 'add':        return blackBox                                // monadic + = identity, not yet hand-designed
    // …exhaustive over every FnExpr kind: build fails when a kind is added without coverage
  }
}

function animateDyadic(fn: FnExpr): AnimateStep {
  switch (fn.kind) {
    case 'add':        return blackBox
    case 'sub':        return blackBox
    // …same exhaustiveness for every FnExpr kind in dyadic context
  }
}
```

`blackBox` is the universal default for kinds not yet hand-designed —
real animation, not a fallback. See below.

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
    const beforeRoot = stage.current
    const afterValue = resultOf(step)                         // helper: extracts result/value/threaded
    const afterRootPromise = stage.prepare(afterValue)        // pipelined render
    const afterRoot = await afterRootPromise
    await animateStep(step)(step, beforeRoot, afterRoot)
    stage.commit(afterRoot)
  }
}
```

`resultOf` is a small total function over Step kinds:
`monadic`/`dyadic`/`access` → `step.result`; `assign` → `step.value`.

Pipelined render: `stage.prepare` for step *N+1* runs while step *N*'s
animation is in flight.

No `try/catch`. Animations cannot fail by contract.

## How both sides hit the same engine

### Game

A `Rune` carries enough info to produce a `Step` from the current value:

```ts
type Rune = {
  readonly glyph: string                          // button label
  readonly stepFromCurrent: (cur: BqnValue) => Step
}
```

`stepFromCurrent` returns either a `monadic` or `dyadic` Step (game runes
are mostly monadic; some bind a left value via `bind-left` to make a
dyadic primitive into a monadic application). Tap a rune → append one
step → player animates it.

### Playground

Parse a BQN one-liner → walk the AST emitting `Step`s in evaluation order
(each `Step` carries its `FnExpr`) → build a `Trajectory` → player
animates the sequence.

The parser is the worker's job: BQN's parser is in the vendored interpreter.
The worker emits a stream of evaluation events, one per step. Main-thread
classifier turns each event into a typed `Step` (with embedded `FnExpr`)
exhaustively over BQN's grammar. Anything the classifier can't recognise
is rejected — no silent fallthrough. Coverage gaps surface as parser-level
"unsupported" errors, not as half-animated playback.

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
  exhaustive switch over `Step['kind']` × `FnExpr['kind']`. There is no
  "is this rune animated?" — every step is animated.
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
requests. The main thread owns the `FnExpr` and `Step` unions; classifier
maps `BqnAstNode + values` → `Step` exhaustively, rejecting at the parser
boundary anything outside the union.

## Deferred (intentional, not unknown)

- **Cancellation.** Not planned. When added: per-step abort signal,
  animation observes and snaps to final state. Player invariants unchanged.
- **Performance budget for very long one-liners.** A 30-step expression
  takes 30 × animation duration to play through. Pacing, skipping, or
  live-control (pause/scrub) is its own design problem; doesn't affect
  the type model.
- **Sub-trajectory animation of anonymous lambda bodies.** Lambda bodies
  are opaque (blackbox) today. The `lambda` variant exists in `FnExpr`;
  switching to sub-trajectory rendering is a pure animation-side change
  later, no type model impact.
- **System functions (`•`).** Out of scope by architecture (static PWA, no
  I/O). The classifier rejects them at the parser boundary.
- **Worker stepwise emission.** The vendored JS interpreter doesn't expose
  intermediate values today. Implementing `trace` requires either
  instrumenting the interpreter or running each sub-expression as a
  separate eval and accumulating. Design problem for the worker, not for
  this document.

## Migration strategy

The new engine ships in parallel with the existing one. Existing animations
(the per-glyph choreographies in `src/lib/animations/*.ts`) are kept and
ported one-by-one. At every point the game still works.

### Phase 1 — Scaffold (no game integration)

- `src/lib/animations/v2/` (or similar) holds the new types: `BqnValue`,
  `FnExpr`, `Step`, `Trajectory`, `Stage`, `AnimateStep`.
- `Trajectory` smart constructors (`trajectoryFrom`, `append`) are pure
  data; no DOM. Threading invariant enforced by construction.
- Two exhaustive switches: `animateMonadic(fn)` and `animateDyadic(fn)`,
  both fully covering `FnExpr['kind']`. All arms initially return
  `blackBox`. Build fails if a kind is added to `FnExpr` without coverage
  in both switches.
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
  `fn.kind`: matched → new engine; unmatched → old engine. (One
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
- Main-thread AST→Step classifier (exhaustive over BQN's grammar).
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

## Resolved decisions (was: open questions)

All questions previously open under this heading have been resolved by the
type model above:

- **Dyadic vs monadic application.** `Step` has explicit `monadic` and
  `dyadic` variants. `dyadic` carries `w` and `x` separately; the engine
  doesn't tuple them.
- **Mapping AST → typed value.** The classifier is exhaustive over BQN's
  grammar. All variants (base prims, every 1-mod, every 2-mod, trains,
  lambdas, names, namespaces, assignments, member access, strands as data
  literals) have type-level homes. Anything outside the union is rejected
  by the classifier — no silent fallthrough.
- **Lambda body animation.** Bodies are opaque (rendered as blackbox,
  labeled with the lambda's expression) for now. Type variant `lambda` is
  in place; opening up to sub-trajectory animation is a future
  animation-side change with no type-model impact.
- **System functions (`•`).** Out of scope. Classifier rejects expressions
  that reference them. Documented and enforced at the parser boundary.
- **Strands (`‿`).** Pure value construction, not an Operation step.
  Parser produces `BqnValue` with `kind: 'array'` directly.
- **Block headers, `𝕨`/`𝕩`/`𝕗`/`𝕘` implicit operands.** Parser-level
  concerns. The engine sees only resolved values inside lambda bodies (or
  not at all, since bodies are opaque for now).
