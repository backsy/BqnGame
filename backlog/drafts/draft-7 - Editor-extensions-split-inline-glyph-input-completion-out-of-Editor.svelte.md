---
id: DRAFT-7
title: 'Editor extensions: split inline glyph input + completion out of Editor.svelte'
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

src/lib/components/Editor.svelte (348 LoC) genuinely deepens CodeMirror — its imperative API (insert, value, focus) is small and the implementation hides a fair amount of setup (theme, mobile keyboard suppression, dispatch wiring).

But two distinct features are inlined inside the wrapper:
- The slash-mnemonic input method (~47 LoC of ViewPlugin + domEventHandlers per Explore agent)
- The glyph autocompletion source (~44 LoC, reads primitiveByGlyph and builds completions)

Both reach into MNEMONICS and primitiveByGlyph from outside the file. Adding a third extension — BQN syntax highlighting is named in docs/architecture.md as planned — would inline another tangle. The wrapper's implementation is widening as features stack, even though the public interface stays small.

## Direction (sketch, not commitment)

Each extension lives as its own module — glyphInputExtension(mnemonics), glyphCompletionExtension(primitiveByGlyph) — and Editor.svelte composes them. Two adapters today (input, completion); the planned syntax highlighting would be the validating third.

Likely home: src/lib/components/editor/extensions/ (alongside Editor.svelte), or sibling to the Editor module if a dedicated folder emerges.

## Architecture work needed before this is implementable

- Decide what shape an 'extension' is in this codebase — pure factory function returning CodeMirror Extension, or something richer
- Coordinate with the keymap relocation draft so the data dependencies (MNEMONICS, primitiveByGlyph) live in the right places
- If syntax highlighting lands first, this draft's design might need to absorb that shape

## Definition of done (outcome-shaped)

- Editor.svelte's body shrinks; glyph input and glyph completion live in their own modules
- Each extension is testable against a CodeMirror state without booting Svelte
- A new editor extension can land without modifying Editor.svelte beyond composition
- No behaviour regressions in the editor (palette insertion, slash mnemonics, completion, mobile keyboard)
<!-- SECTION:DESCRIPTION:END -->
