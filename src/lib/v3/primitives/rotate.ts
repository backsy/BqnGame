// rotate primitive — the whole scene rotates as one rigid body.
//
// Spec from user:
//   "The whole scene should rotate. Everything. No adjusting boxes or
//    anything. Very simple PRIMITIVE rotation. Everything rotates
//    except inner components that do move with the rotation but they
//    stay upright."
//
// State-discipline correction (user, after seeing unsqueeze break):
//   "There should be no state between animations. Unsqueeze should not
//    know anything about the rotation."
//
// Resolution: the rotation animation runs via SVG transform on the
// outer group (cheap, arcs naturally — encoded as the rotation field
// in the intermediate snapshot). But the FINAL toScene bakes the
// rotation into cell positions and resets the rotation field to 0,
// so the next primitive sees clean data with no rotation state to
// reason about.

import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

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

/**
 * Reflect every cell's rect through (pX, pY) — equivalent to a 180°
 * rotation around that point. Walks recursively so nested sub-scenes'
 * cells reflect around the SAME outer pivot (they ride along).
 */
function reflectPositions(scene: Scene, pX: number, pY: number): Scene {
	if (scene.kind === 'atom') {
		const c = scene.atom;
		return {
			...scene,
			atom: {
				...c,
				x: 2 * pX - c.x - c.w,
				y: 2 * pY - c.y - c.h,
			},
		};
	}
	return {
		...scene,
		cells: scene.cells.map((cell) => ({
			...cell,
			x: 2 * pX - cell.x - cell.w,
			y: 2 * pY - cell.y - cell.h,
			inner:
				cell.inner === null
					? null
					: reflectPositions(cell.inner, pX, pY),
		})),
	};
}

export const rotate: Primitive<RotateParams> = (
	fromScene,
	params,
): PrimitiveResult => {
	if (fromScene.kind !== 'array') {
		throw new Error('rotate: requires an array scene');
	}
	if (params.degrees !== 180) {
		throw new Error('rotate: only 180° is supported');
	}

	// Animation snapshot end: rotation field flipped, positions unchanged.
	// The renderer's SVG transform makes the rotation visible.
	const animEnd: Scene = {
		...fromScene,
		rotation: fromScene.rotation + params.degrees,
	};

	// Settled toScene: reflect cell positions through the bbox centre
	// AND reset rotation to 0. Visually identical to animEnd; the
	// post-animation snap from animEnd → toScene is invisible. From
	// here on, no rotation state leaks into subsequent primitives.
	const { cx, cy } = cellsBboxCentre(fromScene.cells);
	const baked = reflectPositions(fromScene, cx, cy);
	if (baked.kind !== 'array') {
		throw new Error('rotate: unreachable — reflect of an array stays array');
	}
	const settled: Scene = { ...baked, rotation: 0 };

	return { snapshots: [fromScene, animEnd], toScene: settled };
};
