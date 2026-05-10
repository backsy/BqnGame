---
id: DRAFT-5
title: 'Rune constructor: concentrate the bind-stripping invariant in one module'
status: Draft
assignee: []
created_date: '2026-05-10 11:36'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

The Rune type is a small {glyph, expr} record. The invariant — strip ⊸ / ⟜ from glyph (the button label) but keep them in expr (what's evaluated) — is enforced by convention only. A new rune that violates it would type-check fine and silently leak ⊸ onto a button.

Knowledge of the rule lives in three places:
- CLAUDE.md invariant 6
- A comment near the top of src/lib/learn/levels.ts (lines ~27–31 per Explore agent)
- Muscle memory of whoever wrote the local r() / same() helpers in levels.ts

Adding a rune means using r() or same() correctly. There is no function whose contract is 'produce a valid Rune', so the invariant has nothing testable backing it.

## Direction (sketch, not commitment)

A runes.ts module exposes one or two constructors that produce Rune values guaranteed to obey the invariant. levels.ts shrinks to pure level data; the rune library (the named table of reusable runes) moves to the new module or stays in levels.ts depending on what reads cleanest.

Real seam — every rune in the library becomes an adapter through the same constructor.

## Architecture work needed before this is implementable

- Whether the constructor strips ⊸ / ⟜ automatically, or rejects glyphs containing them, or both modes
- Whether the rune library data lives with the constructor or alongside the level data
- How the comment-documented design decisions ('display ≠ evaluation') survive — probably as a doc comment on the constructor

## Definition of done (outcome-shaped)

- One module owns the bind-stripping invariant; consumers cannot create a Rune that violates it
- Adding a new rune is one function call with clear semantics, not a {glyph, expr} literal that could be wrong
- The invariant is unit-testable
- All existing levels render their rune buttons identically
<!-- SECTION:DESCRIPTION:END -->
