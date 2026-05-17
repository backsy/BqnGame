// squeeze primitive — collapse every direct atomic cell into a unit
// square (BAR_WIDTH × BAR_WIDTH) sitting bottom-anchored to the row's
// baseline. Negatives move up to land alongside positives so the result
// is a horizontal line of identical-sized squares; only the fill colour
// and label differ.
//
// Spec from user (verbatim, paraphrased):
//   "squeeze the array down so the elements are unit size. Baseline
//    stays put but negatives have to move up to be inline with the
//    other units. The colour and text is different but they are still
//    in line and unit size."
//
// Scope today: a list of atoms. Throws if any direct cell wraps a
// sub-Scene — recursion can land later when a step needs it.

import { BAR_WIDTH } from '../layout';
import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type SqueezeParams = Record<string, never>;

export const squeeze: Primitive<SqueezeParams> = (
	fromScene,
): PrimitiveResult => {
	if (fromScene.kind !== 'array') {
		throw new Error('squeeze: requires an array scene');
	}
	const newCells: Cell[] = fromScene.cells.map((c) => {
		if (c.inner !== null) {
			throw new Error(
				'squeeze: direct cells with inner scenes are not supported yet',
			);
		}
		// Baseline = the line both before and after squeeze. For positive
		// bars it's the bottom; for negatives it's the top. Either way,
		// after squeeze the bar sits ABOVE that baseline as a unit square.
		const baseline = c.value < 0 ? c.y : c.y + c.h;
		return {
			...c,
			y: baseline - BAR_WIDTH,
			h: BAR_WIDTH,
		};
	});
	const to: Scene = { ...fromScene, cells: newCells };
	return { snapshots: [fromScene, to], toScene: to };
};
