---
id: DRAFT-1
title: >-
  Animation dispatcher: collapse hasAnimation + dispatchAnimation into a single
  registry
status: Draft
assignee: []
created_date: '2026-05-10 11:15'
updated_date: '2026-05-10 14:37'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Status: superseded by animation-language design

This draft proposed merging `hasAnimation` and `dispatchAnimation` in `src/lib/animations/index.ts` into a single registry walked by both consumers.

The animation-language design (`docs/design/animation-language.md`) supersedes this. Both predicates collapse into the new engine's exhaustive `animate(op)` switch, where every Operation kind has a registered animation by construction — there is no "is this animatable?" question to answer separately.

## Recommendation

Archive this draft after phase 1 of the animation-language migration lands (DRAFT-2). The old dispatcher dies in phase 4 (cut-over), at which point the entire mechanism this draft addressed is gone.

No standalone work to do here.
<!-- SECTION:DESCRIPTION:END -->
