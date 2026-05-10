---
id: DRAFT-3
title: >-
  Per-animation modules own state extraction end-to-end (collapse runX wrappers
  in index.ts)
status: Draft
assignee: []
created_date: '2026-05-10 11:16'
updated_date: '2026-05-10 14:37'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Status: superseded by animation-language design

This draft proposed pushing state extraction (the runX wrapper layer in `src/lib/animations/index.ts`) into per-animation modules so each animation owns extract → scale → animate end-to-end.

The animation-language design (`docs/design/animation-language.md`) supersedes this. In the new model, animations are pure functions on `(step, beforeRoot, afterRoot)` — they receive freshly rendered DOM and the (before, after) BqnValue pair, and own everything. There are no `runX` wrappers to push down because the dispatcher itself is replaced by the exhaustive `animate(op)` switch.

## Recommendation

Archive this draft after phase 1 of the animation-language migration lands (DRAFT-2). The old dispatcher and runX wrappers are removed in phase 4.

No standalone work to do here.
<!-- SECTION:DESCRIPTION:END -->
