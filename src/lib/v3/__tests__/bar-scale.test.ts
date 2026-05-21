// Pins the per-scene bar scaling. Zeros must be substantial (BAR_FLOOR),
// the max-abs bar must reach the structurally-chosen ceil, and a
// 2-row mixed-sign mat must fit the 280-unit viewBox.

import { describe, test, expect } from 'vitest';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene, BAR_FLOOR } from '../layout';
import type { ViewBox } from '../scene';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };

// Walk every atomic cell in a Scene, accumulating their bar heights.
function leafHeights(scene: ReturnType<typeof bqnValueToScene>): number[] {
	const out: number[] = [];
	const visit = (s: ReturnType<typeof bqnValueToScene>): void => {
		if (s.kind === 'atom') {
			out.push(s.atom.h);
			return;
		}
		for (const c of s.cells) {
			if (c.inner !== null) visit(c.inner);
			else if (c.kind !== 'ellipsis') out.push(c.h);
		}
	};
	visit(scene);
	return out;
}

describe('per-scene bar scaling', () => {
	test('zeros render at BAR_FLOOR, max-abs reaches the scene ceil', () => {
		const v: BqnStructuredValue = {
			kind: 'array',
			shape: [2, 4],
			data: [0, 0, -1, 8, 5, 0, -6, 0].map((value) => ({
				kind: 'number',
				value,
			})),
		};
		const scene = bqnValueToScene(v, VIEW_BOX);
		const hs = leafHeights(scene);
		// All zeros have the same height (BAR_FLOOR).
		const zeros = hs.filter((_, i) => v.data[i].kind === 'number'
			&& (v.data[i] as { value: number }).value === 0);
		for (const z of zeros) expect(z).toBeCloseTo(BAR_FLOOR, 5);
		// max-abs is 8 → that bar is the tallest.
		const maxH = Math.max(...hs);
		const idxOfMax = hs.indexOf(maxH);
		expect((v.data[idxOfMax] as { value: number }).value).toBe(8);
		// |1| / 8 of the way from floor to ceil. So bar(1) sits a third
		// of the way up — substantial, not a sliver.
		const bar1 = hs[v.data.findIndex((d) =>
			d.kind === 'number' && (d as { value: number }).value === -1,
		)];
		const ratio = (bar1 - BAR_FLOOR) / (maxH - BAR_FLOOR);
		expect(ratio).toBeCloseTo(1 / 8, 5);
	});

	test('the 2x4 mixed-sign mat fits the viewBox', () => {
		const v: BqnStructuredValue = {
			kind: 'array',
			shape: [2, 4],
			data: [0, 0, -1, 8, 5, 0, -6, 0].map((value) => ({
				kind: 'number',
				value,
			})),
		};
		const scene = bqnValueToScene(v, VIEW_BOX);
		if (scene.kind !== 'array') throw new Error('expected array scene');
		expect(scene.frame.y).toBeGreaterThanOrEqual(0);
		expect(scene.frame.y + scene.frame.h).toBeLessThanOrEqual(VIEW_BOX.h);
	});

	test('a single atom uses the full ceil cap (most prominent)', () => {
		const v: BqnStructuredValue = { kind: 'number', value: 8 };
		const scene = bqnValueToScene(v, VIEW_BOX);
		if (scene.kind !== 'atom') throw new Error('expected atom scene');
		// The cap is 100; a single atom hits it.
		expect(scene.atom.h).toBe(100);
	});

	test('an all-zero scene renders every bar at BAR_FLOOR', () => {
		const v: BqnStructuredValue = {
			kind: 'array',
			shape: [3],
			data: [0, 0, 0].map((value) => ({ kind: 'number', value })),
		};
		const scene = bqnValueToScene(v, VIEW_BOX);
		const hs = leafHeights(scene);
		for (const h of hs) expect(h).toBeCloseTo(BAR_FLOOR, 5);
	});
});
