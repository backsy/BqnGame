---
id: DRAFT-8
title: >-
  DOM contract between value renderers and the animations layer (weakest
  candidate)
status: Draft
assignee: []
created_date: '2026-05-10 11:37'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction

src/lib/components/ValueViz.svelte and AnimatedRow.svelte own the rendered DOM structure for BQN values: nesting under .wrap, leaf cells as .bar (numeric) or .char (textual). The animations layer (snapshot assembly in src/routes/+page.svelte, plus per-animation modules) measures and clones nodes under those classes.

But the DOM contract is implicit — there's no shared selector module, no type encoding 'this is the wrap of a row', no constant for the .bar / .char class names. If a ValueViz refactor renamed .bar to .cell-content, snapshot assembly would break silently. Knowledge of the cell DOM shape lives in CSS class strings repeated across files.

## Honest assessment

This is the weakest of the architecture candidates. Real friction is more 'implicit contract' than 'shallow module', and depending on how DRAFT-2 (snapshot assembly extraction) lands, this might be subsumed entirely. With only two value-renderer adapters today (ValueViz, AnimatedRow) plus one consumer (snapshot assembly), the deepening case is borderline — easily premature abstraction.

Capturing it so it isn't forgotten, but expect it to be either (a) closed as redundant after DRAFT-2, or (b) left open as 'document the contract in a comment' rather than a code-level fix.

## Direction (one of)

- Tiny cellDom.ts module: selector constants and cellNodeAt(rowEl, id) helper. Concentrates the DOM contract.
- OR a comment near the value-renderer class definitions explaining what the animation layer expects. Cheap, no real seam, no test surface — but matches the actual two-adapter-today shape.
- OR close as subsumed once DRAFT-2 makes the snapshot module the sole consumer of the DOM contract.

## Architecture work needed before this is implementable

- Wait for DRAFT-2 to land — it might leave nothing to do here
- If still relevant, decide between code-level concentration vs documented contract

## Definition of done (outcome-shaped)

- One of the three resolutions above, recorded clearly
- Either a single-module DOM contract exists, or the contract is documented near the renderers, or this draft is explicitly closed as redundant
<!-- SECTION:DESCRIPTION:END -->
