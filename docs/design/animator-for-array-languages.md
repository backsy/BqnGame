# Animator for Array Languages — Design Notes

## Core Idea

A tool that animates the reduction of array language code (BQN primarily) using a consistent vocabulary of physical motions. The animation is not a visualization layered over execution — the animation is the execution made visible.

This works because array language primitives are morphisms in a freely generated category: each has a fixed shape transformation determined by types, not values. Pure, total, point-free code has a finite string-diagram representation, and that diagram can be rendered as motion.

## Visual Language

Substrate: boxes whose size encodes value (bigger number = bigger box). A row of boxes is an array. Nested arrays are rows within visible frames.

No words, no representational icons (no wheels, sieves, etc.). Abstract physicality: position, size, motion, grouping, merging.

Motion families so far:

- Vertical: up = keep, down = discard. One rule covers take, drop, filter, compress.
- Merging: pairs combine into one. Trail-leaving variant = scan; no-trail = fold.
- Distributing: scalar spreads over many positions (broadcast, reverse of merging).
- Lateral: boxes slide preserving identity (rotate, reverse, transpose, sort).
- Sizing: box grows or shrinks in place (per-element arithmetic).

Discipline: motion vocabulary grows much slower than operation vocabulary. New operation seeming to need a new motion is a flag to check whether existing motions compose to cover it. Maintain a registry mapping motions to operations as the source of truth for visual semantics.

## Visibility Rule

The visibility of the animation tracks the visibility of the code.

- Primitives (+, ⌽, /): atomic motions, always animated, can't be opened. They are the motion vocabulary itself.
- Lambdas ({𝕩+1}): inline, animated transparently, no boundary. Inlining is the opposite of abstraction.
- Named functions (f ← ...): black boxes. Naming is the act of saying "treat this as one thing." Tap/long-press to expand and animate internals.
- I/O and effects: visually marked as outside the pure core. Distinct visual register — hazier edge, different texture, explicit frame. Values appear from / disappear into the boundary; what's beyond isn't shown because it isn't knowable. Same treatment for randomness, time, FFI, system queries.

This means style choices in code become style choices in animation. Heavily named code reads as high-level black-box diagram; heavily inlined code reads as detailed motion. Learning to write clearer code and learning to read clearer animations are the same skill.

Honesty principle: don't animate what can't be faithfully animated. The boundary is a teaching moment, not a cop-out.

## Product Surfaces

### Puzzle Game (the wedge)

Output-given, input-given, glyph buttons to assemble solutions. Animation runs as the user builds the answer — feedback during the attempt, not after. Multiple solutions accepted. Solution length comparison after solving (sets up leaderboards naturally — shortest/fewest glyphs is the array-thinking metric).

Progression keyed to motion vocabulary, not glyph count:

1. Introduce one new motion in isolation
2. Use it solo on varied inputs
3. Compose with one previously-learned motion
4. Compose with two
5. Introduce next motion

Variation across examples is what teaches the function (humans learn invariants from contrast).

Weekly puzzles probably more sustainable than daily for a solo project until tooling or community can supply content.

### REPL / Animator

Same surface as the puzzle (glyph keyboard reused, muscle memory transfers). Drop in any BQN code, watch it animate. Live re-render as glyphs change — no explicit run button. Scrub bar for frame-by-frame inspection (phone-native gesture, matches video idioms).

The REPL is also:

- A debugger by default — see where a reduction goes wrong, not just a stack trace
- A code-explanation tool — paste unfamiliar BQN, the animation explains it
- A code-comparison tool — two solutions side by side reveal why one is more elegant

### Animation Export (content flywheel)

Shareable clips as first-class output. MP4/WebP, 10–30 seconds, looping where natural, code embedded as caption. One-tap export from puzzles and REPL. Arrival path from a shared clip lands on the exact puzzle or REPL state that produced it.

Users generate teaching material as a side effect of using the tool. Each clip must be locally interpretable without prior context — reinforces the wordless, physically-grounded design as a hard constraint.

Code-as-text sharing is just code; falls out of the system, no design needed.

## Phone-First

Glyph keyboard is non-negotiable. Animation as primary output (phone screens favour animated grids over cramped text). Live update on edit. Scrubbing as a phone-native gesture. Test: usable one-handed on a commute.

## Audience Layering

Three audiences, decreasing in size and increasing in commitment:

1. Puzzle-game players (largest, the hook)
2. Programmers wanting clearer thinking about code
3. Array-language learners

Zachtronics model: real educational content delivered as a genuine game, not a tutorial with game elements. If the puzzle is good as a puzzle, learning happens incidentally.

Puzzles are the hook; REPL is retention.

## Risks to Watch

- Animation polish has a cliff edge below threshold: jerky/ambiguous motion miseducates. Eight perfect motions beat thirty rough ones.
- Iconography drift: when an animation is ambiguous, fix the animation, don't add a symbol. Once symbols creep in, you've reinvented notation.
- Daily puzzles need a content pipeline. Start weekly.
- The REPL and puzzle compete for design attention. Treat puzzle as onboarding, REPL as destination.

## Framing

The tool isn't "BQN with animations." It's an attempt at a visual notation for array semantics that BQN happens to compile to nicely. The value extends past any one language. The animations aren't illustrations of the code — they're a parallel notation for the same underlying thing, with code being one rendering and animation being another.

## Open Items

- Visual treatment of nested/rank operations (containment with visible frames seems right; needs working through)
- Conditionals — physical branching where the data's own property triggers the switch
- Recursion — self-similarity, fractal containment, base case as terminal element
- Higher-order functions — consistent visual marker for "this thing is itself a function"
- Long tail of BQN primitives that may not fit the motion vocabulary cleanly — fallback register needed for honesty
- Export format details (MP4 vs WebP), embedding source, looping vs one-shot, speed variants
