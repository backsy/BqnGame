// rotate primitive — rotate the outer box's contents around the cells'
// bounding-box centre. Cells move along arcs to their rotated positions
// but stay upright (no rotation applied to cell orientation). For 180°
// around a rectangular frame the frame is invariant, so the frame itself
// needs no rotation field today — when 90° rotations land we'll add one.
//
// Spec (verbatim, from the user):
//   "just rotate the outer box while elements stay upright. Rotate 180
//    degrees. Keep it centered and rotate around the center."
//
// Snapshots are dense (24 steps over the full rotation) so the linear
// tween between consecutive snapshots closely approximates each arc
// segment.

import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

const NUM_SNAPSHOTS = 24;

export type RotateParams = { degrees: number };

function cellsBboxCentre(
	cells: readonly Cell[],
): { cx: number; cy: number } {
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
	return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function rotateCell(
	cell: Cell,
	pX: number,
	pY: number,
	cosA: number,
	sinA: number,
): Cell {
	const cx = cell.x + cell.w / 2;
	const cy = cell.y + cell.h / 2;
	const dx = cx - pX;
	const dy = cy - pY;
	const newCx = pX + dx * cosA - dy * sinA;
	const newCy = pY + dx * sinA + dy * cosA;
	return {
		...cell,
		x: newCx - cell.w / 2,
		y: newCy - cell.h / 2,
		inner:
			cell.inner === null
				? null
				: rotateSceneCells(cell.inner, pX, pY, cosA, sinA),
	};
}

function rotateSceneCells(
	scene: Scene,
	pX: number,
	pY: number,
	cosA: number,
	sinA: number,
): Scene {
	if (scene.kind === 'atom') {
		return { ...scene, atom: rotateCell(scene.atom, pX, pY, cosA, sinA) };
	}
	return {
		...scene,
		cells: scene.cells.map((c) => rotateCell(c, pX, pY, cosA, sinA)),
	};
}

export const rotate: Primitive<RotateParams> = (
	fromScene,
	params,
): PrimitiveResult => {
	if (fromScene.kind !== 'array') {
		throw new Error('rotate: requires an array scene');
	}
	const { cx: pX, cy: pY } = cellsBboxCentre(fromScene.cells);
	const totalRad = (params.degrees * Math.PI) / 180;

	const snapshots: Scene[] = [fromScene];
	for (let i = 1; i <= NUM_SNAPSHOTS; i++) {
		const t = i / NUM_SNAPSHOTS;
		const a = t * totalRad;
		snapshots.push(
			rotateSceneCells(fromScene, pX, pY, Math.cos(a), Math.sin(a)),
		);
	}
	return { snapshots, toScene: snapshots[snapshots.length - 1] };
};
