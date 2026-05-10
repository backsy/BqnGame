---
id: DRAFT-3
title: >-
  Per-animation modules own state extraction end-to-end (collapse runX wrappers
  in index.ts)
status: Draft
assignee: []
created_date: '2026-05-10 11:16'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

In src/lib/animations/index.ts, each runX wrapper (runScan, runFold, runSort, etc.) does the same shape of work: extract oldVals/newVals from cells, type-guard them as numbers, compute a visualMax for scaling, build the items array — then hand off to a small per-animation module (sort.ts at 33 LoC, transpose.ts at 37, etc.) that does the actual motion.

The per-animation modules are correctly deep — small interface, real motion behaviour hidden. But the runX wrapper layer adjacent to them is shallow: its interface (a Snapshot) is roughly the same complexity as its implementation. The work is split awkwardly — half in the dispatcher, half in the module.

Deletion test: folding a runX body into the per-animation module concentrates complexity (good — extract+scale+animate live together). Folding it up into the dispatcher table scatters it across 18 entries (bad).

## Direction (sketch, not commitment)

Each animation module exposes one entry point that takes (snapshot, match) and does the whole thing — extract, scale, animate. Shared 'extract numeric pairs + compute visualMax' helpers live in a sibling module like animations/items.ts only when at least two adapters truly need them (two-adapter rule).

## Architecture work needed before this is implementable

- Settle the registry shape first (sibling draft on dispatcher), since the entry point signature is the contract this draft has to fit
- Decide whether the shared 'numeric items' helper exists ahead of time or emerges when a second module asks for it
- How modules that don't need numeric scaling (transpose, reverse, deshape) fit the same shape — uniform interface vs polymorphism
- What 'snapshot' contract per-animation modules actually depend on (subset of full Snapshot?)

## Sequencing

This is downstream of the dispatcher draft. Do the registry first so the entry-point signature is settled.

## Definition of done (outcome-shaped)

- Each animatable rune has one module owning extract → scale → animate end-to-end
- index.ts no longer holds runX procedures
- Shared scaling helpers exist only where at least two animations need them
- Existing animations behave identically in the game
<!-- SECTION:DESCRIPTION:END -->
