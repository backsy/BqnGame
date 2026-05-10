---
id: DRAFT-8
title: >-
  DOM contract between value renderers and the animations layer (weakest
  candidate)
status: Draft
assignee: []
created_date: '2026-05-10 11:37'
updated_date: '2026-05-10 14:37'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Status: superseded by animation-language design

This draft flagged the implicit DOM contract between value renderers (ValueViz / AnimatedRow) and the animations layer — animations reading DOM under .wrap / .bar / .char without a typed contract.

The animation-language design (`docs/design/animation-language.md`) makes this irrelevant. The new model:
- Animations receive freshly rendered DOM roots per step (`beforeRoot`, `afterRoot`) — they don't query inside someone else's DOM.
- There are no stable cell IDs to address; animations work on positions and values, deriving their own mappings from the operation's algebra.
- The `Stage` interface is the only contract between renderer and engine, and it's deliberately narrow (`current`, `prepare`, `commit`).

The original concern (implicit selector knowledge) is dissolved, not fixed.

## ModifierDiagram (separate concern)

Pass 3 also flagged ModifierDiagram.svelte's hard-coded SVG geometry per modifier as a related but distinct issue. That stays open as its own concern; it's a help-modal feature, not animation.

## Recommendation

Archive this draft after phase 1 lands. If ModifierDiagram's coupling ever needs addressing, it gets a fresh narrow draft.
<!-- SECTION:DESCRIPTION:END -->
