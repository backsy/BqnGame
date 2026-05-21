// Ellipsis rendering for budget-overflowing rank-1 vecs and rank-2 mats.
//
// No fixed count anywhere — the test exercises the fit-based contract:
// a value whose natural layout overflows the viewBox must come back
// from `bqnValueToScene` with cells of `kind: 'ellipsis'` inserted and
// the root frame must fit. The threshold is whatever the budget dictates.

import { describe, test, expect } from 'vitest';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene, sceneToBqnValue } from '../layout';
import type { Scene, ViewBox } from '../scene';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };

function vecOfLength(n: number): BqnStructuredValue {
	return {
		kind: 'array',
		shape: [n],
		data: Array.from({ length: n }, (_, i) => ({ kind: 'number', value: i })),
	};
}

function matOfShape(R: number, C: number): BqnStructuredValue {
	return {
		kind: 'array',
		shape: [R, C],
		data: Array.from({ length: R * C }, (_, i) => ({
			kind: 'number',
			value: i,
		})),
	};
}

// Walk a scene and count any ellipsis cells.
function countEllipsis(scene: Scene): number {
	let n = 0;
	const visit = (s: Scene): void => {
		if (s.kind === 'atom') return;
		for (const c of s.cells) {
			if (c.kind === 'ellipsis') n++;
			if (c.inner !== null) visit(c.inner);
		}
	};
	visit(scene);
	return n;
}

describe('fit-based ellipsis', () => {
	test('a short vec renders with no ellipsis', () => {
		const scene = bqnValueToScene(vecOfLength(5), VIEW_BOX);
		expect(countEllipsis(scene)).toBe(0);
	});

	test('a long vec overflows naturally and ellipsizes to fit', () => {
		const scene = bqnValueToScene(vecOfLength(50), VIEW_BOX);
		expect(countEllipsis(scene)).toBeGreaterThanOrEqual(1);
		if (scene.kind !== 'array') throw new Error('expected array scene');
		expect(scene.frame.x).toBeGreaterThanOrEqual(-0.5);
		expect(scene.frame.x + scene.frame.w).toBeLessThanOrEqual(VIEW_BOX.w + 0.5);
	});

	test('threshold is the budget, not a fixed count', () => {
		// At some N the vec just fits without ellipsis; one more and it
		// must ellipsize. Search for that crossover from the rendered
		// scenes — no test-side assumption about the exact N.
		let lastFitN = -1;
		let firstOverflowN = -1;
		for (let n = 1; n <= 30 && firstOverflowN < 0; n++) {
			const s = bqnValueToScene(vecOfLength(n), VIEW_BOX);
			if (countEllipsis(s) === 0) lastFitN = n;
			else firstOverflowN = n;
		}
		expect(lastFitN).toBeGreaterThan(0);
		expect(firstOverflowN).toBe(lastFitN + 1);
	});

	test('mat with many rows ellipsizes vertically', () => {
		const scene = bqnValueToScene(matOfShape(20, 2), VIEW_BOX);
		expect(countEllipsis(scene)).toBeGreaterThanOrEqual(1);
		if (scene.kind !== 'array') throw new Error('expected array scene');
		expect(scene.frame.y).toBeGreaterThanOrEqual(-0.5);
		expect(scene.frame.y + scene.frame.h).toBeLessThanOrEqual(VIEW_BOX.h + 0.5);
	});

	test('mat with many columns ellipsizes horizontally per row', () => {
		const scene = bqnValueToScene(matOfShape(2, 30), VIEW_BOX);
		expect(countEllipsis(scene)).toBeGreaterThanOrEqual(1);
		if (scene.kind !== 'array') throw new Error('expected array scene');
		expect(scene.frame.x + scene.frame.w).toBeLessThanOrEqual(VIEW_BOX.w + 0.5);
	});

	test('long vec inside a short outer list still ellipsizes (recursive)', () => {
		// Outer rank-1 of length 2 can't ellipsize itself. The wide
		// inner vec gets a sub-budget and ellipsizes within its share.
		const inner50 = vecOfLength(50);
		const inner2 = vecOfLength(2);
		const v: BqnStructuredValue = {
			kind: 'array',
			shape: [2],
			data: [inner50, inner2],
		};
		const scene = bqnValueToScene(v, VIEW_BOX);
		expect(countEllipsis(scene)).toBeGreaterThanOrEqual(1);
		if (scene.kind !== 'array') throw new Error('expected array scene');
		expect(scene.frame.x).toBeGreaterThanOrEqual(-0.5);
		expect(scene.frame.x + scene.frame.w).toBeLessThanOrEqual(VIEW_BOX.w + 0.5);
	});

	test('sceneToBqnValue throws on an ellipsized scene', () => {
		const scene = bqnValueToScene(vecOfLength(50), VIEW_BOX);
		expect(() => sceneToBqnValue(scene)).toThrowError(/ellipsis/);
	});
});
