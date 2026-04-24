# BQN primitive reference

Authoritative table of the primitives that agents may use in examples, tests,
puzzles, and doc snippets. **Consult this before writing BQN.** Training data
on BQN is thin and glyphs are easy to hallucinate; guess-and-commit leads to
subtly broken code that looks right.

Source of truth: [mlochbaum/BQN — doc/primitive.md](https://github.com/mlochbaum/BQN/blob/master/doc/primitive.md).
If this file disagrees with upstream, upstream wins.

Verification rule (CLAUDE.md invariant #4): any BQN snippet committed to
this repo must first be executed and checked against its expected output. Use
the in-app REPL once wired up; until then, paste into
[BQN online playground](https://mlochbaum.github.io/BQN/try.html) before
committing.

## Functions

Monadic is the one-argument (prefix) call; dyadic is two-argument (infix).

### Arithmetic

| Glyph | Monadic | Dyadic |
|-------|---------|--------|
| `+`   | Conjugate | Add |
| `-`   | Negate | Subtract |
| `×`   | Sign | Multiply |
| `÷`   | Reciprocal | Divide |
| `⋆`   | Exponential | Power |
| `√`   | Square Root | Root |
| `⌊`   | Floor | Minimum |
| `⌈`   | Ceiling | Maximum |
| `\|`  | Absolute Value | Modulus |

### Logic

| Glyph | Monadic | Dyadic |
|-------|---------|--------|
| `∧`   | Sort Up | And |
| `∨`   | Sort Down | Or |
| `¬`   | Not | Span |

### Comparison

| Glyph | Monadic | Dyadic |
|-------|---------|--------|
| `<`   | Enclose | Less Than |
| `>`   | Merge | Greater Than |
| `≤`   | — | Less Than or Equal |
| `≥`   | — | Greater Than or Equal |
| `=`   | Rank | Equals |
| `≠`   | Length | Not Equals |
| `≡`   | Depth | Match |
| `≢`   | Shape | Not Match |

### Structural

| Glyph | Monadic | Dyadic |
|-------|---------|--------|
| `⊣`   | Identity | Left |
| `⊢`   | Identity | Right |
| `⥊`   | Deshape | Reshape |
| `∾`   | Join | Join to |
| `≍`   | Solo | Couple |
| `⋈`   | Enlist | Pair |
| `↑`   | Prefixes | Take |
| `↓`   | Suffixes | Drop |
| `↕`   | Range | Windows |
| `»`   | Nudge | Shift Before |
| `«`   | Nudge Back | Shift After |
| `⌽`   | Reverse | Rotate |
| `⍉`   | Transpose | Reorder Axes |
| `/`   | Indices | Replicate |

### Search / selection

| Glyph | Monadic | Dyadic |
|-------|---------|--------|
| `⍋`   | Grade Up | Bins Up |
| `⍒`   | Grade Down | Bins Down |
| `⊏`   | First Cell | Select |
| `⊑`   | First | Pick |
| `⊐`   | Classify | Index of |
| `⊒`   | Occurrence Count | Progressive Index of |
| `∊`   | Mark Firsts | Member of |
| `⍷`   | Deduplicate | Find |
| `⊔`   | Group Indices | Group |

### Other

| Glyph | Monadic | Dyadic |
|-------|---------|--------|
| `!`   | Assert | Assert with Message |

## 1-Modifiers

Apply to one operand to produce a new function.

| Glyph | Name | What it does |
|-------|------|--------------|
| `˙`   | Constant | Returns a function that returns the operand |
| `˜`   | Self / Swap | Duplicate one arg, or swap the two |
| `˘`   | Cells | Apply to each major cell |
| `¨`   | Each | Apply to each element |
| `⌜`   | Table | Apply to every pair from left × right |
| `⁼`   | Undo | Apply the function's inverse |
| `´`   | Fold | Reduce from the right |
| `˝`   | Insert | Fold along first axis |
| `` ` ``| Scan | Cumulative reduction |

## 2-Modifiers

Apply to two operands.

| Glyph | Name | What it does |
|-------|------|--------------|
| `∘`   | Atop | Apply `𝔾`, then `𝔽` to the result |
| `○`   | Over | Apply `𝔾` to each arg, then `𝔽` to the results |
| `⊸`   | Before / Bind | `𝔾`'s left arg comes from `𝔽` |
| `⟜`   | After / Bind | `𝔽`'s right arg comes from `𝔾` |
| `⊘`   | Valences | Apply `𝔽` if one arg, `𝔾` if two |
| `◶`   | Choose | Select one of the functions in list `𝕘` |
| `⌾`   | Under | Apply `𝔽` in the "frame" of `𝔾`, then undo `𝔾` |
| `⎊`   | Catch | Apply `𝔽`; if it errors, apply `𝔾` |
| `⎉`   | Rank | Apply to sub-cells at given rank |
| `⚇`   | Depth | Apply at given depth |
| `⍟`   | Repeat | Apply `𝔽` `𝕘` times |

## Argument and operand glyphs

These are not primitives — they are how BQN refers to arguments and operands
inside function / modifier bodies.

| Glyph | Meaning |
|-------|---------|
| `𝕨`   | Left argument (value) |
| `𝕩`   | Right argument (value) |
| `𝕗`   | Left operand (value) |
| `𝕘`   | Right operand (value) |
| `𝔽`   | Left operand (function) |
| `𝔾`   | Right operand (function) |
| `𝕤`   | Self (the function itself) — for recursion |

## Worked examples

Deliberately empty until the in-app REPL exists. Once it does, every example
added here must be copy-pasted from a real REPL session — expression on one
line, actual output on the next — so future readers can trust the pairs
without re-verifying.

## Further reading

- [BQN tutorial](https://mlochbaum.github.io/BQN/tutorial/index.html) — start here if learning
- [BQN primitive reference](https://mlochbaum.github.io/BQN/doc/primitive.html) — upstream version of this file
- [BQN help index](https://mlochbaum.github.io/BQN/help/index.html) — one-page-per-primitive deep dive
- [Try BQN online](https://mlochbaum.github.io/BQN/try.html) — paste-and-run for verification
