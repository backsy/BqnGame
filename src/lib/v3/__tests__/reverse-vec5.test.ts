// Example-based: 5-element vec, all positive uniform-ish values.
// Currently refused by the vec path (N > 3); after the fix it must
// produce a real animation that doesn't clip and stays in the
// viewBox. Same checks as the property tests, just on a fixed input
// so we can iterate against a concrete counterexample.

import { describe, test, expect } from 'vitest';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene } from '../layout';
import { reverseAnimation } from '../steps/reverse';
import type { Cell, Rect, Scene, ViewBox } from '../scene';
import { lerpScene } from '../tween';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };
const EPS = 0.5;
const LERP_SAMPLES = 8;

function num(value: number): BqnStructuredValue {
	return { kind: 'number', value };
}

function rectInside(c: Rect, r: Rect): boolean {
	return (
		c.x >= r.x - EPS
		&& c.y >= r.y - EPS
		&& c.x + c.w <= r.x + r.w + EPS
		&& c.y + c.h <= r.y + r.h + EPS
	);
}

function cellsOverlap(a: Cell, b: Cell): boolean {
	return (
		a.x + a.w > b.x + EPS
		&& b.x + b.w > a.x + EPS
		&& a.y + a.h > b.y + EPS
		&& b.y + b.h > a.y + EPS
	);
}

function clipFailure(scene: Scene, path = 'root'): string | null {
	if (scene.kind === 'atom') return null;
	const frame = scene.frame;
	const cs = scene.cells;
	for (let i = 0; i < cs.length; i++) {
		if (!rectInside(cs[i], frame)) {
			const c = cs[i];
			return (
				`${path}: cell #${i} `
				+ `at (${c.x.toFixed(1)},${c.y.toFixed(1)}) ${c.w.toFixed(1)}x${c.h.toFixed(1)} `
				+ `escapes frame (${frame.x.toFixed(1)},${frame.y.toFixed(1)}) `
				+ `${frame.w.toFixed(1)}x${frame.h.toFixed(1)}`
			);
		}
	}
	for (let i = 0; i < cs.length; i++) {
		for (let j = i + 1; j < cs.length; j++) {
			if (cellsOverlap(cs[i], cs[j])) {
				const a = cs[i];
				const b = cs[j];
				return (
					`${path}: cells #${i} and #${j} overlap. `
					+ `A=(${a.x.toFixed(1)},${a.y.toFixed(1)}) ${a.w.toFixed(1)}x${a.h.toFixed(1)}; `
					+ `B=(${b.x.toFixed(1)},${b.y.toFixed(1)}) ${b.w.toFixed(1)}x${b.h.toFixed(1)}`
				);
			}
		}
	}
	for (let i = 0; i < cs.length; i++) {
		const inner = cs[i].inner;
		if (inner !== null) {
			const hit = clipFailure(inner, `${path}.${i}`);
			if (hit !== null) return hit;
		}
	}
	return null;
}

function rootInsideViewBox(scene: Scene, vb: ViewBox): boolean {
	if (scene.kind === 'atom') {
		const a = scene.atom;
		return rectInside({ x: a.x, y: a.y, w: a.w, h: a.h }, vb);
	}
	return rectInside(scene.frame, vb);
}

describe('reverseAnimation — 5-vec, positive values', () => {
	const v: BqnStructuredValue = {
		kind: 'array',
		shape: [5],
		data: [1, 2, 3, 4, 5].map(num),
	};
	const start = bqnValueToScene(v, VIEW_BOX);

	test('produces a real animation', () => {
		const snaps = reverseAnimation(start);
		expect(snaps.length).toBeGreaterThan(1);
	});

	test('nothing clips at any snapshot or between them', () => {
		const snaps = reverseAnimation(start);
		for (let s = 0; s < snaps.length; s++) {
			const fail = clipFailure(snaps[s]);
			expect(fail, `snap ${s}/${snaps.length - 1}: ${fail ?? ''}`).toBeNull();
			if (s < snaps.length - 1) {
				for (let k = 1; k < LERP_SAMPLES; k++) {
					const t = k / LERP_SAMPLES;
					const mid = lerpScene(snaps[s], snaps[s + 1], t);
					const midFail = clipFailure(mid);
					expect(
						midFail,
						`lerp t=${t.toFixed(3)} between ${s} and ${s + 1}: ${midFail ?? ''}`,
					).toBeNull();
				}
			}
		}
	});

	test('root stays inside viewBox at every snapshot', () => {
		const snaps = reverseAnimation(start);
		for (let s = 0; s < snaps.length; s++) {
			expect(
				rootInsideViewBox(snaps[s], VIEW_BOX),
				`snap ${s} escapes viewBox`,
			).toBe(true);
		}
	});
});
