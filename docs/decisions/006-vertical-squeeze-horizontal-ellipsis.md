# 006 — Vertical squeezes, horizontal ellipsizes

**Status:** accepted
**Date:** 2026-05-21

## Context

The renderer's two axes do different jobs:

- **Vertical** carries *magnitude*. A bar's height encodes `|value|`.
- **Horizontal** carries *identity*. A cell's slot encodes "which element"
  — `cells[3]` is the third one from the left, and that's load-bearing.

Both axes can overflow the viewBox: a tall mat with mixed signs blows past
280 vertical units, a long vec blows past 400 horizontal units. Each axis
needs a strategy for "too much content". Before v3 these were handled ad
hoc (saturate at `BAR_HEIGHT_MAX`, silently clip, or just look bad). v3
collapses them to one rule per axis.

## Decision

**Vertical squeezes. Horizontal ellipsizes.** They are not interchangeable.

### Vertical (bar height)

When the scene's content can't fit at natural heights, every bar in the
scene scales uniformly into `[BAR_FLOOR, ceil]`, where `ceil` is picked
per-scene from the structural budget. Bars get shorter; no bar disappears.
The relationship "bar A is taller than bar B" survives compression.

There is no `…` along this axis. Magnitudes must remain visible.

### Horizontal (cell count)

When too many cells would fit in a row (or too many rows in a mat), the
middle ones are hidden behind an ellipsis marker:

- `…` between cells in a vec or a mat row.
- `⋮` between rows of a mat.

Head and tail keep their natural slot widths (`BAR_WIDTH`). We do **not**
shrink-slot-to-fit. A row with eight cells does not become a row with
eight half-width cells; it becomes head[3] + `…` + tail[3], and the
elided cells are gone from the Scene.

The cap is `MAX_ELLIPSIZED_VISIBLE = 7` (3 head + ellipsis + 3 tail).
Beyond that, density itself becomes unreadable — and animations on
densely-packed cells become incoherent — so the cap applies even when
the budget would technically allow more.

## Why

- **Magnitude vs identity.** Squeezing a bar still reads as "this value,
  smaller bar". Hiding a bar would erase the value. Conversely, narrowing
  a slot distorts identity ("which one is `cells[5]` now that they're all
  half-width?"). Hiding cells with `…` is honest about the elision.
- **Animations need stable widths.** A reverse, rotate, or scan moves
  cells across positions. If positions also resize mid-tween, the motion
  stops reading as motion and reads as a UI bug.
- **Labels are baked in.** Each cell carries its numeric label centred
  in `BAR_WIDTH`. Variable-width slots would clip or wrap labels in
  edge cases.
- **Visual rhythm.** A scene with consistent slot widths reads as a
  grid; the eye groups cells naturally. Variable-width slots break
  the rhythm and require the eye to re-scan.

## What this rules out

- Horizontal auto-fit: shrinking `BAR_WIDTH` so more cells squeeze in.
  If a row doesn't fit, ellipsize — never narrow.
- Vertical ellipsis between bars (e.g. a tall bar replaced by `⋮`).
  Bars must remain visible at their squeezed height.
- Animations that reflow widths mid-tween. Bars move and morph
  vertically; horizontally they slide between fixed slots.
- "Smooth scroll" style horizontal panning of a long row. The ellipsis
  marker is the answer; panning would imply variable-width revealing
  which contradicts the identity contract.

## Where this lives in code

- `src/lib/v3/layout.ts`:
  - `pickBarCeil` — per-scene vertical compression target, derived
    from the structural budget.
  - `barHeight(v, scale)` — maps `|v|` linearly into
    `[BAR_FLOOR, scale.ceil]`. The same `scale` reaches every atom in
    the scene, so all bars share one rhythm.
  - `chooseSlotsForFit` and `makeVecPlan` — budget-aware horizontal
    ellipsis at every container. Recursive: nested containers ellipsize
    within their sub-budget.
  - `MAX_ELLIPSIZED_VISIBLE` and `MIN_VISIBLE` — the head/tail cap.
- `src/lib/v3/SceneNode.svelte`:
  - The renderer picks `…` for tall-or-square ellipsis cells (between
    cells in a row) and `⋮` for wide-and-short ones (between rows of
    a mat). The cell's aspect ratio is the disambiguator; no extra
    cell kind needed.

## Implications for animations

This is the language animations must speak.

- **Allowed:** stretch, shrink, fade, slide-vertical, scale-vertical,
  drop-to-baseline. Any motion that respects fixed horizontal slot
  widths.
- **Allowed:** moving cells horizontally between fixed slots (reverse,
  rotate, swap). The slots stay the same width; cells just exchange
  positions.
- **Disallowed:** any primitive that narrows a slot to make room.
- **Disallowed:** animating reverse / rotate / fold across an
  ellipsized vec. The hidden cells aren't in the Scene; the
  animation would be lying about what it's doing. Steps that
  operate on full data must take the BQN value as input rather
  than reading it back from the (lossy) scene.

## When to revisit

If we ever want a "this row collapses to a single dot" primitive, or a
horizontal-resize gesture (e.g. for a tutorial overlay), we'd be
breaking the fixed-slot contract. Discuss before, not after, such an
animation lands.
