// rotate primitive — animates the major-cell elements moving around the
// node's bbox centre. Pure on data: no `scene.rotation`, no SVG transform
// state, no carry-over between animations. The scene itself doesn't move
// — only the elements inside it do.
//
// Spec from user:
//   "We animate the elements moving. The scene may not move. Every
//    animation must be a pure function. No state between animations,
//    no global variables."
//
// Per snapshot, each TOP-LEVEL cell's centre rotates around the pivot by
// the snapshot's angle. Inner sub-scenes inside a wrapper cell translate
// by the same delta as the wrapper (so they ride along upright; no
// internal reordering of the wrapper's contents).
//
// Snapshots are dense (24 steps) so the linear tween between consecutive
// snapshots closely approximates the arc segment between them.

import { translateScene } from '../layout';
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

function rotateAtAngle(
	scene: Scene,
	degrees: number,
	pX: number,
	pY: number,
): Scene {
	if (scene.kind === 'atom') return scene;
	const rad = (degrees * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const newCells = scene.cells.map((cell) => {
		const oldCx = cell.x + cell.w / 2;
		const oldCy = cell.y + cell.h / 2;
		const dx = oldCx - pX;
		const dy = oldCy - pY;
		const newCx = pX + dx * cos - dy * sin;
		const newCy = pY + dx * sin + dy * cos;
		const newX = newCx - cell.w / 2;
		const newY = newCy - cell.h / 2;
		const tx = newX - cell.x;
		const ty = newY - cell.y;
		return {
			...cell,
			x: newX,
			y: newY,
			inner:
				cell.inner === null ? null : translateScene(cell.inner, tx, ty),
		};
	});
	return { ...scene, cells: newCells };
}

export const rotate: Primitive<RotateParams> = (
	fromScene,
	params,
): PrimitiveResult => {
	if (fromScene.kind !== 'array') {
		throw new Error('rotate: requires an array scene');
	}
	if (fromScene.cells.length === 0) {
		return { snapshots: [fromScene], toScene: fromScene };
	}
	const { cx, cy } = cellsBboxCentre(fromScene.cells);
	const snapshots: Scene[] = [fromScene];
	for (let i = 1; i <= NUM_SNAPSHOTS; i++) {
		const angle = (i / NUM_SNAPSHOTS) * params.degrees;
		snapshots.push(rotateAtAngle(fromScene, angle, cx, cy));
	}
	return { snapshots, toScene: snapshots[snapshots.length - 1] };
};
