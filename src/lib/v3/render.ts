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
	// kind === 'array' — emit the frame around the cells, then recurse.
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
