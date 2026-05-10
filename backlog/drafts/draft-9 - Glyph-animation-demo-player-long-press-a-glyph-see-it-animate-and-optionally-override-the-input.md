---
id: DRAFT-9
title: >-
  Glyph animation demo player: long-press a glyph, see it animate (and
  optionally override the input)
status: Draft
assignee: []
created_date: '2026-05-10 12:03'
labels:
  - feature
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Goal

Long-press a glyph in the palette, see an animation showing what the glyph does, on data that naturally showcases it. As a bonus capability that falls out for free: the user can type their own BQN input into the demo and watch the same animation play on it — a per-glyph mini-sandbox.

## Architectural decision baked in

Animation modules ship with their own canonical demo data. Each src/lib/animations/<name>.ts exports both the animate function AND a demo descriptor:

    export const demo = { source: '3‿1‿4‿1‿5', rune: '⌽' };

The demo player evaluates source through the worker, takes the snapshot, applies the rune, runs the animation — i.e., reuses the entire game machinery on synthetic input. This widens the per-animation module's interface slightly but concentrates pedagogy with motion: one module = one glyph behaviour, end-to-end including how to show it off.

The alternative (a parallel demos.ts registry, or pre-formed cell arrays in each module) was rejected because (1) splitting demos from animations breaks locality and (2) pre-formed cells force the module to know about ValueViz cell shape, which is concerns it doesn't own today.

## Pieces

- A glyph → animation lookup (provided by DRAFT-1's registry as a glyph index).
- A demo player UI — likely embedded in GlyphPalette's existing help modal (third pass verified the modal is the right home; long-press already opens it).
- A way for the user to override the demo input. Cheap version: a small text field that replaces source. Reuses worker eval and the rest of the pipeline as-is.
- Per-animation demo descriptors. Picking values that genuinely show off each glyph is editorial work, not architectural.

## Hard prerequisites

- DRAFT-1 (registry merge): exposes a glyph index so the demo player can look up animations by glyph.
- DRAFT-2 (snapshot assembly extraction): the snapshot module must be callable from outside the route, or the demo player has to re-implement the DOM choreography.

## Soft prerequisites (strengthen the shape but not strictly blocking)

- DRAFT-3 (per-animation modules own state extraction): with it, each module is the complete unit and the demo player just calls it. Without it, the demo player invokes runX wrappers in index.ts.
- DRAFT-5 (rune constructor): demo.rune is the same Rune type the game uses; bind-stripping invariant is enforced automatically.

## Architecture work needed before this is implementable

- Decide whether 'demo' is a single descriptor or a list (e.g. for glyphs with multiple interesting cases — ↑ with positive vs negative argument)
- Whether the demo player lives inside GlyphPalette's help modal or in a sibling component
- The user-override input shape — plain textarea vs tiny CodeMirror instance vs structured cell editor
- What happens for glyphs that have no animation today (most of the palette) — silently no demo, or a 'no animation yet' affordance

## Definition of done (outcome-shaped)

- Each animatable glyph has demo data co-located with its animation module
- Long-pressing an animatable glyph in the palette shows the animation playing on its demo data
- The user can edit the input in some form and replay the animation
- Glyphs without animations don't show a broken or empty player
- No game-route regressions
<!-- SECTION:DESCRIPTION:END -->
