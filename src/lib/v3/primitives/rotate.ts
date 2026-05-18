// rotate primitive — the whole scene rotates as one rigid body. Inner
// cells move with the rotation but stay upright (counter-rotated at
// render time, so their orientation is identity from screen).
//
// Spec from user (verbatim):
//   "The whole scene should rotate. Everything. No adjusting boxes or
//    anything. Very simple PRIMITIVE rotation. Everything rotates
//    except inner components that do move with the rotation but they
//    stay upright."
//
// Implementation: two snapshots — `from` and `to` — differ only in the
// `rotation` field. The tween lerps the rotation linearly; the SVG
// renderer applies `rotate(...)` on the outer group and counter-rotates
// each cell. Nothing is baked, no positions are touched.

import type { Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type RotateParams = { degrees: number };

export const rotate: Primitive<RotateParams> = (
	fromScene,
	params,
): PrimitiveResult => {
	if (fromScene.kind !== 'array') {
		throw new Error('rotate: requires an array scene');
	}
	const to: Scene = {
		...fromScene,
		rotation: fromScene.rotation + params.degrees,
	};
	return { snapshots: [fromScene, to], toScene: to };
};
