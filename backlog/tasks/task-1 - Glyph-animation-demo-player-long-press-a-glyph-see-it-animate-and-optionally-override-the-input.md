---
id: TASK-1
title: >-
  Glyph animation demo player: long-press a glyph, see it animate (and
  optionally override the input)
status: To Do
assignee: []
created_date: '2026-05-10 12:03'
updated_date: '2026-05-10 12:17'
labels:
  - feature
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What this is

A real feature, not architecture exploration. The user wants per-glyph animation reuse: long-press a glyph in the palette → see it animate on data that naturally showcases it. Beyond that, the medium-term vision is **animating arbitrary BQN code on user-supplied data** — the whole playground gains an 'animate this' affordance, not just a static REPL.

This task captures the first concrete step of that arc: per-glyph demos in the palette help modal, with an input the user can override.

## Architectural decision baked in

Animation modules ship with their own canonical demo data. Each src/lib/animations/<name>.ts exports both the animate function AND a demo descriptor:

    export const demo = { source: '3‿1‿4‿1‿5', rune: '⌽' };

The demo player evaluates source through the worker, takes the snapshot, applies the rune, runs the animation — i.e., reuses the entire game machinery on synthetic input. This widens the per-animation module's interface slightly but concentrates pedagogy with motion: one module = one glyph behaviour, end-to-end including how to show it off.

The alternative (a parallel demos.ts registry, or pre-formed cell arrays in each module) was rejected because (1) splitting demos from animations breaks locality and (2) pre-formed cells force the module to know about ValueViz cell shape, which is a concern it doesn't own today.

## Pieces

- A glyph → animation lookup (provided by DRAFT-1's registry as a glyph index).
- A demo player UI — likely embedded in GlyphPalette's existing help modal (long-press already opens it).
- A way for the user to override the demo input with their own BQN source.
- Per-animation demo descriptors. Picking values that genuinely show off each glyph is editorial work, not architectural.

## Future direction (out of scope here, but the design should not preclude it)

- Animate arbitrary expressions, not just single-glyph runes.
- A 'play' button in the sandbox that animates each rune application against the running buffer.
- Tutorial overlays where the level itself includes scripted demo animations.

## Hard prerequisites

- DRAFT-1 (registry merge): exposes a glyph index so the demo player can look up animations by glyph.
- DRAFT-2 (snapshot assembly extraction): the snapshot module must be callable from outside the route, or the demo player has to re-implement the DOM choreography.

## Soft prerequisites (strengthen the shape but not strictly blocking)

- DRAFT-3 (per-animation modules own state extraction).
- DRAFT-5 (rune constructor): demo.rune is the same Rune type the game uses; bind-stripping invariant is enforced automatically.

## Architecture work needed before this is implementable

- Decide whether demo is a single descriptor or a list (e.g. for glyphs with multiple interesting cases — ↑ with positive vs negative argument).
- Whether the demo player lives inside GlyphPalette's help modal or in a sibling component.
- The user-override input shape — plain textarea vs tiny CodeMirror instance vs structured cell editor.
- What happens for glyphs that have no animation today (most of the palette) — silently no demo, or a 'no animation yet' affordance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Long-pressing an animatable glyph in the palette plays its animation on demo data
- [ ] #2 Each animatable per-animation module exports its own canonical demo data (BQN source + rune)
- [ ] #3 The user can override the demo input with their own BQN source and replay the animation
- [ ] #4 Glyphs without animations show a graceful fallback in the help modal, not a broken player
- [ ] #5 No regressions in the main game route's rune-tap behaviour
<!-- AC:END -->
