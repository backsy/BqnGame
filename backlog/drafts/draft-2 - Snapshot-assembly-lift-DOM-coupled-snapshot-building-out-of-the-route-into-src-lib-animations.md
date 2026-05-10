---
id: DRAFT-2
title: >-
  Snapshot assembly: lift DOM-coupled snapshot building out of the route into
  src/lib/animations/
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

src/routes/+page.svelte ('applyRune' body, ~150 LoC of the 898-LoC file) owns DOM-coupled snapshot assembly: querySelectorAll on .cell/.viz/.row/.wrap, getBoundingClientRect, ghost cloning with CSS positioning, building the cellNodes ↔ ghostNodesByOldId map, visibility toggles for hide-live, tick() synchronisation, and the cleanup try/catch.

This is the trickiest pre-animation code in the file and it sits between BQN evaluation and Svelte reactivity — exactly where future bugs will hide silently. The route should answer 'user tapped a rune; show the new state'; it should not be the source of truth for how a Snapshot is wired up.

Deletion test: deleting this code from the route is fatal, but moving it to src/lib/animations/<somewhere> concentrates DOM-mapping knowledge in one module instead of spreading it across the route + animations. Animations already know about cells; the route does not need to.

## Direction (sketch, not commitment)

A new module under src/lib/animations/ owns DOM-to-Snapshot translation. Working name: snapshot.ts. Possibly two entry points: one to prepare (clone ghosts, hide live), one to commit (swap and dispose). All .cell/.viz/.row/.wrap selectors live there.

## Architecture work needed before this is implementable

- Exact split between 'prepare' and 'commit' phases — what's atomic vs what's torn down on error
- Whether the new module receives DOM nodes or owns its own selector queries
- How tick() interacts with the seam (caller's responsibility or hidden inside?)
- Test strategy: jsdom vs fake nodes vs no test (this is the first DOM-coupled module that becomes testable)

## Definition of done (outcome-shaped)

- applyRune in +page.svelte delegates Snapshot construction to a module under src/lib/animations/
- DOM selectors for .cell/.viz/.row/.wrap live in the new module, not in the route
- The module's interface lets a test exercise snapshot building without the full Svelte component tree
- Existing animations behave identically in the game
<!-- SECTION:DESCRIPTION:END -->
