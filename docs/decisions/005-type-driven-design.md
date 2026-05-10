# 005 — Type-driven design: illegal states unrepresentable

**Status:** accepted
**Date:** 2026-05-10

## Context

The project's modules are settling into clear domains (state, evaluation,
value rendering, animation, snapshot, runes). As the type definitions
across those domains accumulate, there's a design choice for *how* types
encode intent. Without a stated principle, future contributors (human or
agent) may reach for boolean flags, optional-everywhere records, and
runtime validation where the type system could enforce shape directly.

The human prefers a functional / category-theory leaning style; the
animations layer is already pure-functional. The project should commit
to a type discipline that matches.

## Decision

**Business logic is encoded in types. Illegal states must be
unrepresentable.**

Concrete rules:

1. **Discriminated unions over flag + optional fields.** A value with two
   modes is a sum type (`{kind: 'a', ...} | {kind: 'b', ...}`), not a
   record where some fields are conditionally meaningful.
2. **Smart constructors for domain values.** Where an invariant exists
   (e.g. the bind-stripping rule for runes), the type is constructed only
   through a function that enforces it. The structural literal
   `{ glyph, expr }` is not how a `Rune` is made.
3. **Phantom / brand types for distinct units that share a shape.** If
   two `string` values have different meaning (e.g. `RuneExpr` vs
   `BqnSource`), they get different types even when structurally
   identical.
4. **Lifecycle stages as distinct types, not boolean flags.** A snapshot
   in different phases (prepared, committed, completed) is different
   types; functions advance between them. No `phase: 'prepared' |
   'committed'` field on one big record.
5. **Errors as values, not exceptions.** Domain operations that can fail
   return a result type, not throw. Throwing is reserved for "the
   universe is broken" cases (out-of-memory, bug-not-handled).

## Why

- **Compiler is the first reviewer.** Misuse caught at type-check time
  beats misuse caught in production (or never caught).
- **Refactors are safer.** Renaming or restructuring a domain type
  surfaces every call site that depends on its old shape.
- **Domain knowledge concentrates.** The type definition becomes the
  authoritative description of the concept; comments and runbooks don't
  have to repeat what the type already says.
- **Matches existing pure-functional bias.** Animations are already pure
  functions; this discipline extends to the data those functions work on.

## What this rules out

- Records where some fields are only valid in specific phases (e.g. a
  Snapshot with optional `liveViz` that only exists post-commit). Use
  phase-distinct types.
- Boolean flags like `isCommitted: bool` on a record that exists in
  multiple phases.
- Throwing constructors for domain values (e.g. `new Rune(g, e)` that
  throws if invalid). Use a smart constructor returning a result.
- "Validate then trust" patterns where validation is a separate step
  that can be skipped.
- `any` / loose `unknown` casts in domain modules to paper over a missing
  type.

## Scope

- **Applies to**: `src/lib/` modules and the types they expose. The
  domain — animations, snapshots, runes, levels, primitives, BQN
  protocol.
- **Doesn't apply to**: vendored code (`src/lib/bqn/vendor/bqn.js`),
  Svelte view-layer where reactivity needs specific shapes, or
  framework-config files.
- **Pragmatic exception**: this is a learning project. If a type
  expression becomes unreadable to the human, prefer a structurally
  simpler type with a documented invariant over a TypeScript pretzel that
  technically encodes everything. The goal is clarity, not heroics.

## When to revisit

- TypeScript's type system genuinely can't express an invariant we need.
  Mark with a comment, add a runtime check, move on; the principle still
  holds in spirit.
- The discipline is making the codebase less learnable rather than more.
  Step back, simplify, document the invariant in prose if needed.
