---
id: DRAFT-4
title: >-
  Playground module: extract shared editor + palette + worker plumbing from the
  two routes
status: Draft
assignee: []
created_date: '2026-05-10 11:35'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

src/routes/+page.svelte (898 LoC) and src/routes/sandbox/+page.svelte (825 LoC) are two routes of similar size that both stand up: a CodeMirror Editor instance, a GlyphPalette, a BqnClient with run path, and palette-to-editor glyph dispatch. They diverge after that — the game owns level/history/animation; sandbox owns transcript/dedupe — but the editor lifecycle and worker plumbing exist in both files.

Today, fixing a bug in palette → editor insertion means fixing it twice. Editor + palette + run flow has no test surface because it only exists wedged inside two giant Svelte files.

## Direction (sketch, not commitment)

A 'Playground' module (component or controller) owns the editor instance, glyph insertion, worker client, and a 'run this expression' entry point. Game and sandbox compose around it, configuring the parts that genuinely differ (level state vs transcript, animated commit vs plain commit, distinct output panes).

Real seam, two adapters: game and sandbox.

## Architecture work needed before this is implementable

- Whether Playground is a Svelte component (slot-based composition) or a controller object (caller renders, Playground manages state)
- What the 'run' entry point's contract looks like — does it return raw worker output, or commit somewhere?
- How animation orchestration interacts with the Playground (game wants to animate before commit; sandbox wants plain commit)
- Whether DRAFT-2 (snapshot assembly extraction) lands first, since the route is being decluttered there too

## Sequencing

This and DRAFT-2 both shrink the route. Worth deciding which lands first — likely DRAFT-2, so the snapshot module is a stable dependency the Playground can compose with.

## Definition of done (outcome-shaped)

- Editor + palette + worker setup lives in one place, not two
- Game and sandbox routes are both noticeably smaller, with their distinct concerns clearly visible
- The shared editor flow is testable without standing up the full game
- Existing behaviour preserved on both routes (palette insertion, run, glyph rendering)
<!-- SECTION:DESCRIPTION:END -->
