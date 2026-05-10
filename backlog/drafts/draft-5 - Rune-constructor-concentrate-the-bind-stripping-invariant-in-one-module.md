---
id: DRAFT-5
title: 'Rune constructor: concentrate the bind-stripping invariant in one module'
status: Draft
assignee: []
created_date: '2026-05-10 11:36'
updated_date: '2026-05-10 12:51'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

The Rune type today is a small structural record: `{glyph, expr}`. The invariant — strip ⊸ / ⟜ from `glyph` (the button label) but keep them in `expr` (what's evaluated) — is enforced by convention only. A new rune that violates it would type-check fine and silently leak ⊸ onto a button.

Knowledge of the rule lives in three places:
- CLAUDE.md invariant 6
- A comment near the top of src/lib/learn/levels.ts
- Muscle memory of whoever wrote the local `r()` / `same()` helpers

Adding a rune means using `r()` or `same()` correctly. There is no function whose contract is 'produce a valid Rune', so the invariant has nothing testable backing it.

## Direction (per ADR-005: illegal states unrepresentable)

Smart constructor + branded type. Concretely:

```ts
declare const RuneBrand: unique symbol
export type Rune = {
  readonly [RuneBrand]: true
  readonly glyph: string
  readonly expr: string
}

// only legal way to construct a Rune
export const rune = (expr: string, glyph?: string): Rune
export const sameRune = (s: string): Rune  // glyph === expr (no bind plumbing)
```

The brand prevents any structural literal `{glyph, expr}` from passing as a `Rune`. The constructor enforces the invariant (by either stripping ⊸/⟜ from a default glyph, or by rejecting glyphs that contain them — design choice TBD). The rune library data in `levels.ts` (or wherever it lands) goes through the constructor; no literal `{glyph, expr}` shapes survive.

## Architecture work needed before this is implementable

- Whether the constructor strips ⊸/⟜ automatically, or rejects glyphs containing them, or both modes (e.g. strict `rune(expr)` always strips for the default glyph; `rune(expr, glyph)` validates the explicit glyph)
- Whether the rune library data lives with the constructor module or alongside the level data
- Whether `History` (currently `string[]`) should be reshaped to `RuneExpr[]` (a brand on the expression string) so accumulating history can't mix in arbitrary BQN sources

## Definition of done (outcome-shaped)

- One module owns the bind-stripping invariant; the type system prevents structural-literal Runes
- Adding a new rune is one constructor call with clear semantics
- The bind-stripping rule is unit-testable
- All existing levels render their rune buttons identically
<!-- SECTION:DESCRIPTION:END -->
