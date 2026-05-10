---
id: DRAFT-1
title: >-
  Animation dispatcher: collapse hasAnimation + dispatchAnimation into a single
  registry
status: Draft
assignee: []
created_date: '2026-05-10 11:15'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

src/lib/animations/index.ts (~853 LoC) holds two parallel structures that walk the same set of regex patterns: dispatchAnimation() runs a long if-chain matching expressions to runX functions, and hasAnimation() repeats roughly the same checks so the route can decide whether to set up ghost+hide-live machinery before evaluation. Adding a new animatable rune touches three spots in this file (regex constant, dispatch arm, predicate entry).

The seam between 'is this animatable?' and 'animate it' is a false seam — there is one body of knowledge but two callers walking it. Deletion test: hasAnimation() earns its keep (route needs the predicate), but the duplicate implementation does not.

## Direction (sketch, not commitment)

One registry of {match, run} adapters; both consumers walk it. Each registry entry becomes the real seam — adding a primitive is one entry, not three.

## Architecture work needed before this is implementable

- Shape of a registry entry: plain regex vs richer matcher; how match groups feed runX
- Whether registry is array-of-objects, Map, or generated table
- Ordering rules for ambiguous matches (longest-match? declaration order?)
- Whether per-animation modules expose run directly or stay behind index.ts wrappers (interacts with draft on state extraction)

## Definition of done (outcome-shaped)

- hasAnimation and dispatchAnimation share a single source of truth for what is animatable
- Adding a new animatable rune is one new registry entry, not edits in three places of index.ts
- Existing animated runes behave identically in the game (no visual regressions on tap)
- Sandbox REPL behaviour for non-animated expressions is unchanged
<!-- SECTION:DESCRIPTION:END -->
