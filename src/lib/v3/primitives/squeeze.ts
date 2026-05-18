// squeeze primitive — recursively collapse every leaf atomic cell into a
// unit square (BAR_WIDTH × BAR_WIDTH) sitting bottom-anchored to its
// row's baseline. Negatives move up so they sit alongside positives;
// after squeeze every leaf reads as the same kind of "element" — only
// colour and label differ.
//
// Spec from user (paraphrased):
//   While rotating, bars shouldn't carry magnitude. Squeeze them down to
//   uniform tiles so the rotation is value-blind; unsqueeze re-introduces
//   magnitude after the structural shuffle.
//
// Scope: any Scene — atom, list, table, boxed, nested arbitrarily deep.
//   * Atom Scene → its single atom cell becomes a unit square.
//   * Wrapper cells (cell.inner !== null) recurse; the wrapper's rect
//     is rebuilt to fit the new inner bbox + PADDING.
//   * Atomic cells become unit squares directly.

import { BAR_WIDTH, PADDING } from '../layout';
import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type SqueezeParams = Record<string, never>;

function squeezeAtomCell(c: Cell): Cell {
	// Baseline = where the cell currently rests. Positive bars have bottom
	// at baseline; negatives have top at baseline. Either way, after
	// squeeze, every cell sits ABOVE that baseline as a unit square.
	const baseline = c.value < 0 ? c.y : c.y + c.h;
	return {
		...c,
		y: baseline - BAR_WIDTH,
		h: BAR_WIDTH,
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

function squeezeScene(scene: Scene): Scene {
	if (scene.kind === 'atom') {
		return { ...scene, atom: squeezeAtomCell(scene.atom) };
	}
	const newCells = scene.cells.map((cell) => {
		if (cell.inner === null) return squeezeAtomCell(cell);
		return rebuildWrapperRect(cell, squeezeScene(cell.inner));
	});
	return { ...scene, cells: newCells };
}

export const squeeze: Primitive<SqueezeParams> = (
	fromScene,
): PrimitiveResult => {
	const to = squeezeScene(fromScene);
	return { snapshots: [fromScene, to], toScene: to };
};
