// v3 render helper — flatten a Scene into a list of SVG primitive
// descriptions ready for the harness <svg> loop. Pure walk: no DOM,
// no clock, no allocation surprises.
//
// Two primitive kinds today:
//   - `frame`  — an outline rect for an array (rank ≥ 0). `rank0=true`
//                marks rank-0 boxes so the renderer can apply the glow
//                filter. Same data, no extra fields, the renderer reads
//                rank0 to pick the styling.
//   - `bar`    — a colored rect + numeric label for an atom cell.
//
// More primitive kinds get added as new shape variants land.

import { PADDING } from './layout';
import type { Cell, Scene } from './scene';

export type RenderPrim =
	| { kind: 'frame'; x: number; y: number; w: number; h: number; rank0: boolean }
	| { kind: 'bar'; x: number; y: number; w: number; h: number; value: number };

// ── formatAtomLabel ──────────────────────────────────────────────────────
// Display an atom value as BQN-form text.
//   • integers → `3`, `¯3`
//   • non-integers → reduced fraction `n/d` (e.g. 0.5 → `1/2`, ¯0.333 → `¯1/3`)
//   • non-finite values (Infinity, NaN) → their JS string
// Non-integers that can't be matched to a fraction within a small
// denominator fall back to the decimal string — covers irrationals etc.

function gcd(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b !== 0) {
		const t = b;
		b = a % b;
		a = t;
	}
	return a;
}

const FRACTION_MAX_DENOM = 100;
const FRACTION_TOL = 1e-10;

export function formatAtomLabel(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	if (Number.isInteger(value)) {
		return value < 0 ? '¯' + (-value) : String(value);
	}
	const sign = value < 0 ? '¯' : '';
	const abs = Math.abs(value);
	for (let d = 1; d <= FRACTION_MAX_DENOM; d++) {
		const n = Math.round(abs * d);
		if (n > 0 && Math.abs(abs - n / d) < FRACTION_TOL) {
			const g = gcd(n, d);
			return sign + (n / g) + '/' + (d / g);
		}
	}
	return sign + abs.toString();
}

export function flattenScene(scene: Scene): RenderPrim[] {
	const out: RenderPrim[] = [];
	walkScene(scene, out);
	return out;
}

function walkScene(scene: Scene, out: RenderPrim[]): void {
	if (scene.kind === 'atom') {
		walkCell(scene.atom, out);
		return;
	}
	if (scene.shape.length === 2) {
		// Mat = array of rows. Emit outer frame (2×PADDING beyond cells:
		// once for the row frame, once for the outer), then per-row
		// frames, then the cells themselves.
		const [R, C] = scene.shape;
		const all = bboxOfCells(scene.cells);
		out.push({
			kind: 'frame',
			x: all.x - 2 * PADDING,
			y: all.y - 2 * PADDING,
			w: all.w + 4 * PADDING,
			h: all.h + 4 * PADDING,
			rank0: false,
		});
		for (let r = 0; r < R; r++) {
			const rowCells = scene.cells.slice(r * C, (r + 1) * C);
			const rb = bboxOfCells(rowCells);
			out.push({
				kind: 'frame',
				x: rb.x - PADDING,
				y: rb.y - PADDING,
				w: rb.w + 2 * PADDING,
				h: rb.h + 2 * PADDING,
				rank0: false,
			});
		}
		for (const cell of scene.cells) walkCell(cell, out);
		return;
	}
	// rank 0 or 1: single frame around the cells.
	const bbox = bboxOfCells(scene.cells);
	out.push({
		kind: 'frame',
		x: bbox.x - PADDING,
		y: bbox.y - PADDING,
		w: bbox.w + 2 * PADDING,
		h: bbox.h + 2 * PADDING,
		rank0: scene.shape.length === 0,
	});
	for (const cell of scene.cells) walkCell(cell, out);
}

function walkCell(cell: Cell, out: RenderPrim[]): void {
	if (cell.inner === null) {
		out.push({
			kind: 'bar',
			x: cell.x,
			y: cell.y,
			w: cell.w,
			h: cell.h,
			value: cell.value,
		});
		return;
	}
	walkScene(cell.inner, out);
}

function bboxOfCells(
	cells: Cell[],
): { x: number; y: number; w: number; h: number } {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const c of cells) {
		if (c.x < minX) minX = c.x;
		if (c.y < minY) minY = c.y;
		if (c.x + c.w > maxX) maxX = c.x + c.w;
		if (c.y + c.h > maxY) maxY = c.y + c.h;
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
