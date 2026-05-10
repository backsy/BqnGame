---
id: DRAFT-8
title: >-
  DOM contract between value renderers and the animations layer (weakest
  candidate)
status: Draft
assignee: []
created_date: '2026-05-10 11:37'
updated_date: '2026-05-10 12:36'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Status: largely subsumed by DRAFT-2

The original friction here was implicit DOM contract between value renderers (ValueViz / AnimatedRow) and the animations layer — animation code reading DOM under .wrap / .bar / .char without a typed contract or shared selector module.

DRAFT-2's grilling settled that **cell addressability moves to `data-cell-id` attributes** rendered by the value renderers. This gives the explicit, framework-agnostic contract this draft was asking for. Once DRAFT-2 lands, that piece is done.

## Remaining scope (if any)

The third pass flagged a related but separate friction: **ModifierDiagram.svelte** holds hard-coded SVG geometry per modifier, with no declaration in primitives.ts of which modifiers have diagrams. That is its own implicit-contract issue, not the same one DRAFT-2 fixes.

Two ways to handle:

1. **Close this draft as subsumed.** Open a fresh narrow draft if/when ModifierDiagram's coupling actually bites (third diagram needing addition, or a glyph silently falling back to empty diagram).
2. **Re-scope this draft to ModifierDiagram only.** Update primitives.ts to declare `hasDiagram: bool` (or similar); ModifierDiagram becomes a registry indexed by glyph; GlyphPalette renders the diagram conditionally without knowing Diagram's internals.

## Recommendation

Option 1 (close as subsumed) once DRAFT-2 lands. The ModifierDiagram concern is small, isolated, and doesn't need to be queued up; it can be a one-paragraph follow-up draft when something forces the issue. With only 7 hand-tuned diagrams that change rarely, the deepening case is genuinely weak.

## Definition of done (outcome-shaped)

After DRAFT-2 lands:
- Verify cell addressability via data-cell-id is actually clean across all value-renderer call sites
- Either close this draft as subsumed, or re-scope to ModifierDiagram only with a fresh sketch
<!-- SECTION:DESCRIPTION:END -->
