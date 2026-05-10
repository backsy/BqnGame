---
id: DRAFT-4
title: >-
  Playground module: extract shared editor + palette + worker plumbing from the
  two routes
status: Draft
assignee: []
created_date: '2026-05-10 11:35'
updated_date: '2026-05-10 12:35'
labels:
  - architecture
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Friction (original framing — partially superseded)

src/routes/+page.svelte (898 LoC) and src/routes/sandbox/+page.svelte (825 LoC) both stand up an Editor + GlyphPalette + BqnClient + glyph dispatch. The shared editor lifecycle and worker plumbing exist twice; bugs in palette → editor insertion get fixed in two places.

## Reframed after DRAFT-2 grilling

The original draft assumed a Svelte Playground component. DRAFT-2 settled that the controller (the framework-free TS module that orchestrates state→visual handoff) is the real shared seam — game and sandbox both compose around it, plus their own UI shells.

That changes what 'Playground' means here:

- **Possibility A: there's no Playground component to extract.** Game and sandbox each compose Editor + GlyphPalette + BqnClient + controller themselves. The 'duplication' is mostly Svelte boilerplate around shared modules; once those modules (controller, BqnClient) are tight, the boilerplate is small enough to live in each route. No abstraction needed.

- **Possibility B: extract a thin TS controller wrapper.** A 'Playground' becomes a TS module that wires Editor's imperative API + GlyphPalette's insert callback + BqnClient + the animation controller into one 'run this expression' entry point. Game and sandbox each render their own UI but call this entry. Still framework-free at the seam.

- **Possibility C: extract a Svelte component.** The original framing. Likely the wrong call now — it couples the seam to Svelte, contrary to ADR-004's spirit.

## Still real friction (regardless of resolution)

- Glyph insertion at the cursor: today's logic exists twice. Wherever it lives, it should live once.
- BqnClient lifecycle: today created twice. Should be one instance per playground, owned by whoever holds the editor.
- Run path: tap a rune (game) vs press Run (sandbox) end up calling the same worker eval. Different triggers, same machinery.

## Architecture work needed before this is implementable

- DRAFT-2 lands first (controller exists)
- Decide between possibilities A / B / C above
- If B, the 'run an expression' entry point's contract: does it own the worker, or take it as input?
- How animation dispatch differs between game and sandbox (game animates, sandbox just shows the result) — option B's entry point would need an `animate?: boolean` or similar

## Definition of done (outcome-shaped)

- Editor + glyph dispatch + worker run path is not duplicated between game and sandbox
- Whichever shape (A, B, C) is picked, the seam is framework-free or as close as the framework allows
- Existing behaviour preserved on both routes
<!-- SECTION:DESCRIPTION:END -->
