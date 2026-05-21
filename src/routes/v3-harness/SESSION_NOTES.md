# Session notes — squeeze / unsqueeze for higher-rank arrays

Date: 2026-05-19.

## What we observed

On a 2×3 matrix, `squeeze + rotate + unsqueeze` produces a wrong end
state: gaps grow between rows, the matrix sits higher on screen than the
original / than a fresh `⌽`-result would. Just `rotate` (no squeeze /
unsqueeze) actually lands every atom at the same pixel a fresh `⌽` would
— because rotating around the cells' bbox centre lets rows at
proportional distances from the centre swap into positions that match
the fresh layout's geometry.

Separately, even after squeeze the row wrappers clip each other during
the rotation animation (rows are wide; at θ=90° they swing through the
centre region as horizontal bars and overlap). Squeezing the atoms
inside rows reduces row HEIGHT but not row WIDTH, so doesn't address
this.

## What we are NOT going to do

Earlier suggestion (rejected): make squeeze a no-op on wrappers and tell
matrix users to call rotate directly. The user wants the
squeeze / animate / unsqueeze PATTERN to apply uniformly across ranks;
the pattern itself is what conveys "elements moving as units."

## The pattern the user wants

```
squeeze  : normalise the scene so any subsequent motion primitive is
           CLEAN — uniform tile sizes AND uniform spacing such that
           rotation arcs don't overlap. Stage the outer frame as already.
rotate   : just moves the top-level cells. Generic. The same op
           regardless of what the cells are (atoms, rows, deeper).
unsqueeze: pure function of the data it sees. Recovers the natural
           layout from cell values alone — no carried info from
           squeeze, no awareness of what came before. Whatever cells
           it sees, lay them out the way `bqnValueToScene` would lay
           those same values out fresh.
```

Key rules (per user):

- "We need to normalize with squeeze and denormalize with unsqueeze."
- "No data should carry over so unsqueeze can figure out from data
  what it should be."
- "Squeeze normalizes centers and things so that rotate is always
  clean."
- "Rotate should not be the issue."

## What this means concretely

### squeeze, generalised

Per-rank work:

- **Lists (atomic cells)**: every atom → unit square at row baseline.
  (This is what squeeze does today.) Also stage the outer frame
  generously enough that the rotation cells trace fits. (Today.)
- **Matrices / rank ≥ 2 (wrapper cells)**: every leaf atom → unit
  square recursively (today). PLUS: reposition the row wrappers so
  their rotation arcs around the matrix centre DO NOT OVERLAP. That
  means pushing rows apart vertically until the vertical separation
  between row centres exceeds the row width (so at θ=90° they're
  horizontally separated by more than their own widths). Stage the
  outer frame to fit the spread-out rotated extent.

Generalising: squeeze re-spaces the elements at the top level so the
rotation can happen without overlap. It does this for any rank.

### rotate, unchanged

Rotate is generic. It rotates whatever cells exist at the top level,
arcing them around the bbox centre. Squeeze has already arranged
things so the arc is clean.

### unsqueeze, redefined

Unsqueeze is **re-layout from data**. It does NOT translate from
"squeezed positions." It walks the scene and re-emits each cell's
natural layout as if `bqnValueToScene` were run on the current values:

- Each leaf atom recovers its `barHeight(value)` size, anchored
  according to sign.
- Each wrapper (row, etc.) recovers its natural rect from its inner
  cells' fresh layout.
- Row baselines / positions are recomputed from the rows' new contents,
  not from where rotate happened to drop them.
- Outer frame auto-fits the new layout.

So if the cells inside have been permuted by rotate, unsqueeze produces
the fresh layout for the permuted values — automatically matching what
`bqnValueToScene` would produce for that BQN value. End state aligns
with BQN truth.

## Open questions to revisit next session

1. **How much extra spacing does squeeze add for higher-rank arrays?**
   For a 2×3 matrix: row centres need to be ≥ row width apart for arcs
   not to overlap at θ=90°. So roughly: vertical spacing = max(row.w,
   natural spacing). Generalises to rank-3 (slabs need spacing ≥ slab
   dim). Worth a formula.
2. **Does unsqueeze "re-layout" know enough?** It needs the bag of
   (id, value, inner-structure) at each level and must emit a fresh
   layout. Currently `bqnValueToScene` consumes a `BqnStructuredValue`,
   not a Scene — so we either invert (Scene → fresh layout) or factor
   out a layout-of-cells helper that takes the current bag of cells
   and produces a Scene. The factored helper is probably the right shape.
3. **Squeeze for atom Scenes**: still meaningful? An atom Scene is
   already a single tile; squeeze on it is identity. Probably keep as
   identity (current behaviour).
4. **What about empty arrays?** rank-1 length 0 etc. Squeeze and
   unsqueeze should both be identity. Already are.

## State of the code at session end

- `Scene.array` has explicit `frame: Rect`. Initial layout sets it to
  auto-fit. **Pushed and live on the branch.**
- `squeeze` recursively unit-sizes atoms, rebuilds wrapper rects from
  inner frames, auto-fits inner frames, then **stages the top-level
  frame** to a square that fits the rotation extent. Atoms-only behaves
  correctly; **matrices have the gap/shift bug described above.**
- `unsqueeze` recursively grows atoms back to `barHeight(value)`,
  rebuilds wrapper rects, auto-fits frames at every level. **Pure
  translation from squeezed state — does NOT re-layout. This is the
  thing that needs replacing per the new spec.**
- `rotate` rotates top-level cells around bbox centre, translates
  inner sub-scenes (frame included) so contents ride along as rigid
  units. Lists rotate cleanly. Matrices: end state is geometrically
  correct, but clipping occurs during the arc.
- `Scene` no longer has a `rotation` field. SVG carries no transform
  state. Everything is positions.
- `rotate.test.ts` (rotate ∘ rotate = identity by leaf positions)
  passes.
- Working tree is dirty (the explicit-frame refactor + this notes
  file). NOT committed, NOT pushed at user's direction.

## Resume here

Next time, implement:

1. Re-frame `unsqueeze` as "re-layout from current data" using a
   factored layout-of-cells helper.
2. Re-frame `squeeze` to also re-space wrapper cells at the top level
   so any 180° rotation around the bbox centre is overlap-free.
3. Verify on a 2×3 matrix end-to-end:
   `squeeze + rotate + unsqueeze` lands at the same pixels as a fresh
   `bqnValueToScene` of the reversed BQN value.
