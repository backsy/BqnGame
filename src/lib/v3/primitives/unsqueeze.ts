// unsqueeze primitive — grow every direct atomic cell back to its
// natural (value-derived) height, anchored to its current bottom edge.
//
// Spec from user:
//   "unsqueeze based on the values on the items. State may carry over
//    from squeeze so it has to work only on the data it has."
//
// Pure on the scene's data: reads each cell's `value` to pick a target
// height via `barHeight`, and uses the cell's current bottom (`y + h`)
// as the row baseline. After squeeze, every bar is a unit square with
// its bottom at the baseline, so this anchor recovers the original
// natural layout: positives grow upward from baseline, negatives grow
// downward from baseline.
//
// Scope today (same as squeeze): top-level array's direct atomic cells.
// Throws on wrapper cells.

import { barHeight } from '../layout';
import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type UnsqueezeParams = Record<string, never>;

export const unsqueeze: Primitive<UnsqueezeParams> = (
	fromScene,
): PrimitiveResult => {
	if (fromScene.kind !== 'array') {
		throw new Error('unsqueeze: requires an array scene');
	}
	const newCells: Cell[] = fromScene.cells.map((c) => {
		if (c.inner !== null) {
			throw new Error(
				'unsqueeze: direct cells with inner scenes are not supported yet',
			);
		}
		const baseline = c.y + c.h;
		const h = barHeight(c.value);
		return {
			...c,
			y: c.value < 0 ? baseline : baseline - h,
			h,
		};
	});
	const to: Scene = { ...fromScene, cells: newCells };
	return { snapshots: [fromScene, to], toScene: to };
};
