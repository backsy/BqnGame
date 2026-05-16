// v3 layout — pure projection from a BQN value to a Scene.
//
// Visual constants match v2-harness's makeBar 1:1 so scalars look the
// same here as they do in v2 and the game. The renderer (in the
// harness .svelte) picks the colour from `value` at draw time; this
// module deals only in geometry (where rectangles sit, how tall they
// are).
//
// Currently handles `number` only. Char, array, fn, namespace throw —
// they land as the user spec's their visuals.

import type { BqnStructuredValue } from '$lib/bqn/protocol';
import type { Cell, Scene, ViewBox } from './scene';

// Bar geometry — copied from v2-harness makeBar constants. Same
// magnitudes, same visual rhythm.
export const BAR_WIDTH = 24;
export const BAR_HEIGHT_BASE = 18;
export const BAR_HEIGHT_PER_UNIT = 8;
export const BAR_HEIGHT_MAX = 140;
// Baseline = where the bar's bottom sits, as a fraction of viewBox
// height. ~82% down matches v2's flex-end-with-padding feel without
// committing to a particular viewBox size.
export const BASELINE_FRAC = 180 / 220;

export function barHeight(value: number): number {
	return Math.min(
		BAR_HEIGHT_MAX,
		Math.abs(value) * BAR_HEIGHT_PER_UNIT + BAR_HEIGHT_BASE,
	);
}

function atomCell(vb: ViewBox, value: number): Cell {
	const w = BAR_WIDTH;
	const h = barHeight(value);
	const baseline = vb.y + vb.h * BASELINE_FRAC;
	return {
		id: 'atom',
		x: vb.x + vb.w / 2 - w / 2,
		y: baseline - h,
		w,
		h,
		value,
		inner: null,
	};
}

/** Pure: BQN structured value → Scene under the given viewBox. */
export function bqnValueToScene(
	value: BqnStructuredValue,
	viewBox: ViewBox,
): Scene {
	switch (value.kind) {
		case 'number':
			return {
				kind: 'atom',
				viewBox,
				atom: atomCell(viewBox, value.value),
			};
		case 'char':
		case 'array':
		case 'fn':
		case 'namespace':
			throw new Error(
				`bqnValueToScene: '${value.kind}' not implemented yet`,
			);
	}
}
