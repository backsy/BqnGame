---
id: DRAFT-6
title: >-
  Move keymap.ts out of src/lib/bqn/ — it's an editor concern, not a worker
  concern
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

src/lib/bqn/keymap.ts (107 LoC) holds the slash-mnemonic table for the editor (MNEMONICS, GLYPH_TO_MNEMONIC). It never crosses the worker boundary — it's a pure UI concern, consumed by Editor.svelte and GlyphPalette.svelte.

Its presence in src/lib/bqn/ is a labelling lie. The folder name promises 'BQN evaluation plumbing' (worker, protocol, vendored interpreter) but actually contains a frontend concern. Future agents (and future you) reach for the wrong things in the wrong folder.

This is a hygiene fix, not a deepening opportunity in the strict sense — surfaced here so it doesn't evaporate.

## Direction (sketch, not commitment)

Move to src/lib/editor/keymap.ts (or wherever the editor module lands if the editor-extensions draft happens). Two-line change at consumers (Editor.svelte and GlyphPalette.svelte imports).

## Architecture work needed before this is implementable

Almost none. Decision is just: where does the editor module live? src/lib/editor/, src/lib/input/, or alongside Editor.svelte itself? Probably worth coordinating with the editor-extensions draft so the destination is settled once.

## Definition of done (outcome-shaped)

- src/lib/bqn/ contains only worker-boundary code (protocol, client, worker, eval, vendored interpreter)
- keymap.ts lives in a folder whose name correctly describes its concern
- Both consumers import from the new location
- No behaviour change
<!-- SECTION:DESCRIPTION:END -->
