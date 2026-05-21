// Render invariants for bqnValueToScene.
//
// Foundation tests: before any animation can be meaningful, the
// renderer itself must produce scenes that fit on the canvas with no
// internal clipping. These properties have to hold for any BQN value
// the layout supports today (number, rank 1 vec, rank 2 matrix,
// list-of-lists / nested arrays).
//
// Two invariants:
//   1. Root frame ⊆ viewBox. Nothing the renderer puts on screen lies
//      outside the canvas.
//   2. Nothing clips. At every array node, every child rect is inside
//      its parent's frame AND no two siblings share interior area.
//      Recursive — covers wrapper-vs-wrapper, scalar-crosses-border,
//      and scalar-overlaps-scalar with one walk.
//
// Both are expected to fail today for some inputs (e.g. long vecs or
// wide matrices whose canonical layout exceeds the viewBox). That's
// the point — these tests pin the renderer's contract.

import { describe, test } from 'vitest';
import fc from 'fast-check';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene } from '../layout';
import type { Cell, Rect, Scene, ViewBox } from '../scene';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };
const EPS = 0.5;
const NUM_RUNS = 100;
const TEST_TIMEOUT_MS = 120_000;

// ── arbitraries ───────────────────────────────────────────────────────────

const arbNum: fc.Arbitrary<BqnStructuredValue> = fc
	.integer({ min: -10, max: 10 })
	.map((value) => ({ kind: 'number', value }));

const arbVec: fc.Arbitrary<BqnStructuredValue> = fc
	.array(arbNum, { minLength: 1, maxLength: 100 })
	.map((data) => ({ kind: 'array', shape: [data.length], data }));

const arbMatrix: fc.Arbitrary<BqnStructuredValue> = fc
	.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100 }))
	.chain(([r, c]) =>
		fc
			.array(arbNum, { minLength: r * c, maxLength: r * c })
			.map((data) => ({ kind: 'array', shape: [r, c], data })),
	);

const arbListOfLists: fc.Arbitrary<BqnStructuredValue> = fc
	.array(
		fc
			.array(arbNum, { minLength: 1, maxLength: 100 })
			.map(
				(sub) =>
					({
						kind: 'array' as const,
						shape: [sub.length],
						data: sub,
					}) satisfies BqnStructuredValue,
			),
		{ minLength: 1, maxLength: 100 },
	)
	.map((data) => ({ kind: 'array', shape: [data.length], data }));

const arbBqnValue: fc.Arbitrary<BqnStructuredValue> = fc.oneof(
	arbNum,
	arbVec,
	arbMatrix,
	arbListOfLists,
);

// ── geometry helpers ─────────────────────────────────────────────────────

function rectInside(
	c: { x: number; y: number; w: number; h: number },
	r: Rect,
): boolean {
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

function rootRect(scene: Scene): Rect {
	if (scene.kind === 'atom') {
		const a = scene.atom;
		return { x: a.x, y: a.y, w: a.w, h: a.h };
	}
	return scene.frame;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('bqnValueToScene', () => {
	test(
		'root frame stays inside viewBox',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const scene = bqnValueToScene(v, VIEW_BOX);
					const r = rootRect(scene);
					if (!rectInside(r, VIEW_BOX)) {
						throw new Error(
							`root rect (${r.x.toFixed(1)},${r.y.toFixed(1)}) `
								+ `${r.w.toFixed(1)}x${r.h.toFixed(1)} `
								+ `escapes viewBox (${VIEW_BOX.x},${VIEW_BOX.y}) ${VIEW_BOX.w}x${VIEW_BOX.h}`,
						);
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		'nothing clips',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const scene = bqnValueToScene(v, VIEW_BOX);
					const fail = clipFailure(scene);
					if (fail !== null) {
						throw new Error(fail);
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);
});
