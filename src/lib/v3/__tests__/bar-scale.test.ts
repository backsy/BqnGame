// Property tests for per-scene bar scaling.
//
// Four invariants that have to hold for any rank-1 / rank-2 number
// array the layout accepts:
//
//   1. Bar heights are bounded: BAR_FLOOR ≤ h ≤ scene ceil for every
//      leaf.
//   2. Bar height is monotone in |value| within a scene — bigger
//      magnitude never shrinks the bar.
//   3. Zero values render at exactly BAR_FLOOR.
//   4. If max |v| > 0, the cells with max |v| reach the scene ceiling.
//
// Plus two structural pins (single-atom cap, all-zero scene) over a
// wider value/shape range than the previous fixed-input tests.

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene, BAR_FLOOR } from '../layout';
import type { Scene, ViewBox } from '../scene';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };
const NUM_RUNS = 100;
const SINGLE_ATOM_CAP = 100;
const EPS = 0.001;

// Wide value range — covers prominent bars, scalar tiles, and the
// scaler's ceiling math at non-trivial magnitudes. -10..10 (the old
// fixed-test corpus) barely exercised the ratio computation.
const arbInt = fc.integer({ min: -1000, max: 1000 });

const arbNumLeaf: fc.Arbitrary<BqnStructuredValue> = arbInt.map((value) => ({
	kind: 'number',
	value,
}));

const arbVec: fc.Arbitrary<BqnStructuredValue> = fc
	.array(arbNumLeaf, { minLength: 2, maxLength: 16 })
	.map((data) => ({ kind: 'array', shape: [data.length], data }));

// Bounded shape so the natural layout fits without ellipsis — bar
// heights are not directly observable on ellipsized cells. The
// reverse property tests stress unbounded ranges; here every leaf
// must remain intact.
const arbMat: fc.Arbitrary<BqnStructuredValue> = fc
	.tuple(fc.integer({ min: 2, max: 6 }), fc.integer({ min: 2, max: 6 }))
	.chain(([r, c]) =>
		fc
			.array(arbNumLeaf, { minLength: r * c, maxLength: r * c })
			.map((data) => ({ kind: 'array', shape: [r, c], data })),
	);

const arbBarScene = fc.oneof(arbVec, arbMat);

// Walk every atomic cell, paired with its underlying numeric value
// so monotonicity / floor / ceil claims can be correlated.
type Sample = { v: number; h: number };

function samples(scene: Scene): Sample[] {
	const out: Sample[] = [];
	const visit = (s: Scene): void => {
		if (s.kind === 'atom') {
			out.push({ v: s.atom.value, h: s.atom.h });
			return;
		}
		for (const c of s.cells) {
			if (c.inner !== null) visit(c.inner);
			else if (c.kind !== 'ellipsis') out.push({ v: c.value, h: c.h });
		}
	};
	visit(scene);
	return out;
}

describe('per-scene bar scaling — properties', () => {
	test('every bar lies in [BAR_FLOOR, scene ceil]', () => {
		fc.assert(
			fc.property(arbBarScene, (v) => {
				const scene = bqnValueToScene(v, VIEW_BOX);
				const ss = samples(scene);
				if (ss.length === 0) return;
				const maxH = Math.max(...ss.map((s) => s.h));
				for (const s of ss) {
					if (s.h < BAR_FLOOR - EPS) {
						throw new Error(
							`v=${s.v} h=${s.h} < BAR_FLOOR=${BAR_FLOOR}`,
						);
					}
					if (s.h > maxH + EPS) {
						throw new Error(
							`v=${s.v} h=${s.h} exceeds scene ceil=${maxH}`,
						);
					}
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('bar height is monotone in |value| within a scene', () => {
		fc.assert(
			fc.property(arbBarScene, (v) => {
				const scene = bqnValueToScene(v, VIEW_BOX);
				const sorted = [...samples(scene)].sort(
					(a, b) => Math.abs(a.v) - Math.abs(b.v),
				);
				for (let i = 1; i < sorted.length; i++) {
					const prev = sorted[i - 1];
					const cur = sorted[i];
					if (cur.h + EPS < prev.h) {
						throw new Error(
							`monotone violated: |v|=${Math.abs(prev.v)} h=${prev.h} `
								+ `then |v|=${Math.abs(cur.v)} h=${cur.h}`,
						);
					}
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('zero values render at exactly BAR_FLOOR', () => {
		fc.assert(
			fc.property(arbBarScene, (v) => {
				const scene = bqnValueToScene(v, VIEW_BOX);
				for (const s of samples(scene)) {
					if (s.v === 0 && Math.abs(s.h - BAR_FLOOR) > EPS) {
						throw new Error(
							`zero rendered at h=${s.h}, expected BAR_FLOOR=${BAR_FLOOR}`,
						);
					}
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('cells at max |v| reach the scene ceiling', () => {
		fc.assert(
			fc.property(arbBarScene, (v) => {
				const scene = bqnValueToScene(v, VIEW_BOX);
				const ss = samples(scene);
				const maxAbs = Math.max(...ss.map((s) => Math.abs(s.v)));
				if (maxAbs === 0) return; // all-zero handled separately
				const maxH = Math.max(...ss.map((s) => s.h));
				for (const s of ss) {
					if (Math.abs(s.v) === maxAbs && Math.abs(s.h - maxH) > EPS) {
						throw new Error(
							`max-|v| cell v=${s.v} h=${s.h} < ceil=${maxH}`,
						);
					}
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('root frame fits the viewBox vertically', () => {
		fc.assert(
			fc.property(arbBarScene, (v) => {
				const scene = bqnValueToScene(v, VIEW_BOX);
				if (scene.kind !== 'array') return;
				if (scene.frame.y < -EPS) {
					throw new Error(`frame.y=${scene.frame.y} < 0`);
				}
				if (scene.frame.y + scene.frame.h > VIEW_BOX.h + EPS) {
					throw new Error(
						`frame.y+h=${scene.frame.y + scene.frame.h} > ${VIEW_BOX.h}`,
					);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});
});

describe('per-scene bar scaling — structural pins', () => {
	test('a single non-zero atom uses the full ceil cap', () => {
		fc.assert(
			fc.property(arbInt.filter((n) => n !== 0), (value) => {
				const v: BqnStructuredValue = { kind: 'number', value };
				const scene = bqnValueToScene(v, VIEW_BOX);
				if (scene.kind !== 'atom') {
					throw new Error('expected atom scene');
				}
				if (scene.atom.h !== SINGLE_ATOM_CAP) {
					throw new Error(
						`single-atom h=${scene.atom.h}, expected ${SINGLE_ATOM_CAP}`,
					);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('all-zero vec of any size renders every bar at BAR_FLOOR', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 32 }), (n) => {
				const v: BqnStructuredValue = {
					kind: 'array',
					shape: [n],
					data: Array.from({ length: n }, () => ({
						kind: 'number' as const,
						value: 0,
					})),
				};
				const scene = bqnValueToScene(v, VIEW_BOX);
				for (const s of samples(scene)) {
					expect(s.h).toBeCloseTo(BAR_FLOOR, 5);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});
});
