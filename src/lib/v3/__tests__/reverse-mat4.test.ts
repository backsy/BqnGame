// Example-based test: 4-row mat reverse must produce a real animation
// (multiple snapshots) AND keep cells inside their parent frame at
// every snapshot and every interpolated frame between them.
//
// Started as a single uniform-height case to nail down multi-pair
// lateral-slot geometry before touching the asymmetric-h work.

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

describe('reverseAnimation — 4×2 mat, uniform positive heights', () => {
	// Same row pattern in every row → every row wrapper ends up the
	// same height. Reverse becomes a pure permutation of identical
	// stripes — isolates the multi-pair plumbing from anything
	// h-dependent.
	const v: BqnStructuredValue = {
		kind: 'array',
		shape: [4, 2],
		data: [1, 8, 1, 8, 1, 8, 1, 8].map(num),
	};
	const start = bqnValueToScene(v, VIEW_BOX);

	test('produces a real animation (more than one snapshot)', () => {
		expect(start.kind).toBe('array');
		const snaps = reverseAnimation(start);
		expect(snaps.length).toBeGreaterThan(1);
	});

	test('nothing clips at any snapshot or between them', () => {
		const snaps = reverseAnimation(start);
		for (let s = 0; s < snaps.length; s++) {
			const fail = clipFailure(snaps[s]);
			expect(fail, `snapshot ${s}/${snaps.length - 1}: ${fail ?? ''}`).toBeNull();
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
				`snapshot ${s} escapes viewBox`,
			).toBe(true);
		}
	});
});
