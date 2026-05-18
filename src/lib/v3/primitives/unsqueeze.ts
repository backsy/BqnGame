// unsqueeze primitive — recursively restore every leaf atomic cell to
// its value-derived height, anchored to its current bottom edge.
// Wrapper cells recurse; their rect is rebuilt from the new inner bbox.
//
// Dual of squeeze: where squeeze strips magnitude (everything becomes
// a uniform tile), unsqueeze brings magnitude back from each cell's
// stored `value`. Reads ONLY from each cell's current data (no
// remembered state, no rotation-awareness).
//
// Scope: any Scene — atom, list, table, boxed, nested arbitrarily deep.

import { barHeight, PADDING } from '../layout';
import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type UnsqueezeParams = Record<string, never>;

function unsqueezeAtomCell(c: Cell): Cell {
	// Anchor at the cell's current bottom. After squeeze, that bottom is
	// the row baseline. Positives grow up from it, negatives grow down.
	const baseline = c.y + c.h;
	const h = barHeight(c.value);
	return {
		...c,
		y: c.value < 0 ? baseline : baseline - h,
		h,
	};
}

function bboxOf(cells: Cell[]): { x: number; y: number; w: number; h: number } {
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

function rebuildWrapperRect(cell: Cell, newInner: Scene): Cell {
	const innerCells =
		newInner.kind === 'atom' ? [newInner.atom] : newInner.cells;
	if (innerCells.length === 0) {
		return { ...cell, inner: newInner };
	}
	const bb = bboxOf(innerCells);
	return {
		...cell,
		x: bb.x - PADDING,
		y: bb.y - PADDING,
		w: bb.w + 2 * PADDING,
		h: bb.h + 2 * PADDING,
		inner: newInner,
	};
}

function unsqueezeScene(scene: Scene): Scene {
	if (scene.kind === 'atom') {
		return { ...scene, atom: unsqueezeAtomCell(scene.atom) };
	}
	const newCells = scene.cells.map((cell) => {
		if (cell.inner === null) return unsqueezeAtomCell(cell);
		return rebuildWrapperRect(cell, unsqueezeScene(cell.inner));
	});
	return { ...scene, cells: newCells };
}

export const unsqueeze: Primitive<UnsqueezeParams> = (
	fromScene,
): PrimitiveResult => {
	const to = unsqueezeScene(fromScene);
	return { snapshots: [fromScene, to], toScene: to };
};
