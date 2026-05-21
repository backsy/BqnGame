// Animation spacing — shared geometry helpers used by any animation
// that orbits cells around a pivot (rotate, swap-by-arc, …).
//
// Cells in v3 stay axis-aligned during rotation; only their centres
// orbit. That fact drives every formula in this module.

import { GAP } from './layout';
import type { Cell, ViewBox } from './scene';

// ── Minimum spacing constants ─────────────────────────────────────────────

/** Minimum visible gap between two cells at the tightest moment of a
 *  rotation animation. Anything smaller looks like the cells are
 *  touching; anything larger leaves useless empty space.
 *
 *  Used by `minRotationSpacing` as the additive margin on top of the
 *  geometric minimum (cell diagonal). */
export const ROTATION_GAP = GAP;

// ── Per-cell helpers ──────────────────────────────────────────────────────

/** A cell's diagonal — the centre-to-centre distance at which two
 *  copies of that cell, axis-aligned and orbiting around a common pivot,
 *  just barely avoid overlap at every rotation angle.
 *
 *  Derivation: two cells overlap iff |Δx|<W and |Δy|<H simultaneously.
 *  With (Δx, Δy) = d·(sin θ, cos θ), such a θ exists iff d² < W² + H².
 *  So `d ≥ √(W² + H²)` is the geometric minimum.
 */
export function cellDiagonal(c: Cell): number {
	return Math.hypot(c.w, c.h);
}

// ── Multi-cell helpers ────────────────────────────────────────────────────

/** Minimum centre-to-centre spacing for a set of cells respacing along
 *  one major axis, such that no two cells overlap at any rotation
 *  angle. Adds `ROTATION_GAP` to the worst-case diagonal so cells have
 *  a visible (but minimal) gap at the tightest moment. */
export function minRotationSpacing(cells: readonly Cell[]): number {
	let maxDiag = 0;
	for (const c of cells) {
		const d = cellDiagonal(c);
		if (d > maxDiag) maxDiag = d;
	}
	return maxDiag + ROTATION_GAP;
}

/** Axis-aligned bounding box of the union of cell rects across a full
 *  rotation around `(cx, cy)`. Cells stay axis-aligned, so each cell's
 *  centre orbits at distance r ≤ rMax from the pivot and the cell
 *  extends maxHalfW horizontally and maxHalfH vertically past its
 *  centre. The union therefore fits inside
 *  `(2·rMax + 2·maxHalfW) × (2·rMax + 2·maxHalfH)`.
 *
 *  This is NOT a disc `2·(rMax + maxHalfDim)²`: for rectangular cells
 *  the disc bound massively overestimates the smaller dimension, which
 *  would force unnecessary scaling.
 */
export function rotationBbox(
	cells: readonly Cell[],
	cx: number,
	cy: number,
): { width: number; height: number } {
	let rMax = 0;
	let maxHalfW = 0;
	let maxHalfH = 0;
	for (const c of cells) {
		const ccx = c.x + c.w / 2;
		const ccy = c.y + c.h / 2;
		const r = Math.hypot(ccx - cx, ccy - cy);
		if (r > rMax) rMax = r;
		const hw = c.w / 2;
		const hh = c.h / 2;
		if (hw > maxHalfW) maxHalfW = hw;
		if (hh > maxHalfH) maxHalfH = hh;
	}
	return {
		width: 2 * rMax + 2 * maxHalfW,
		height: 2 * rMax + 2 * maxHalfH,
	};
}

/** True iff the rotation bbox of the cells (around the given pivot)
 *  fits inside the viewBox with `PADDING_VIEWBOX` margin on each side. */
export function fitsInViewBox(
	cells: readonly Cell[],
	cx: number,
	cy: number,
	viewBox: ViewBox,
	padding = 0,
): boolean {
	const bbox = rotationBbox(cells, cx, cy);
	return (
		bbox.width <= viewBox.w - 2 * padding
		&& bbox.height <= viewBox.h - 2 * padding
	);
}
