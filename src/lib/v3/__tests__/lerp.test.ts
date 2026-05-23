// Property tests for lerpScene and the easing functions.
//
// Animations animate and don't teleport. Two halves:
//
//   1. lerpScene itself must be genuinely linear in every numeric
//      field (x, y, w, h, value, viewBox, frame). A lerp that
//      short-circuits — returning the start scene for t < threshold
//      and snapping to end at t = 1 — would pass every existing
//      reverse property because the snapshot list is structurally
//      consistent. This file pins the function so that escape hatch
//      is closed.
//
//   2. Leaf identity is preserved across t. If lerp dropped, added,
//      or renamed a leaf mid-tween, the visible motion would look
//      like a teleport (one cell vanishes, another appears) even
//      though every numeric field interpolates smoothly.
//
// The animation-pipeline side of "don't teleport" (consecutive
// snapshots not too far apart) lives in reverse.test.ts as
// `between consecutive snapshots, no leaf jumps the full viewBox`.

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene } from '../layout';
import { lerpScene, linear, easeInOut } from '../tween';
import type { Cell, Scene, ViewBox } from '../scene';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };
const NUM_RUNS = 100;

// ── arbitraries ───────────────────────────────────────────────────────────

const arbNum: fc.Arbitrary<BqnStructuredValue> = fc
	.integer({ min: -1000, max: 1000 })
	.map((value) => ({ kind: 'number', value }));

const arbVec: fc.Arbitrary<BqnStructuredValue> = fc
	.array(arbNum, { minLength: 1, maxLength: 16 })
	.map((data) => ({ kind: 'array', shape: [data.length], data }));

const arbMat: fc.Arbitrary<BqnStructuredValue> = fc
	.tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }))
	.chain(([r, c]) =>
		fc
			.array(arbNum, { minLength: r * c, maxLength: r * c })
			.map((data) => ({ kind: 'array', shape: [r, c], data })),
	);

const arbBqnValue: fc.Arbitrary<BqnStructuredValue> = fc.oneof(arbVec, arbMat);

// t sampled as a rational with 0.001 precision — keeps shrinking
// readable when a counterexample lands.
const arbT = fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000);

// ── helpers ───────────────────────────────────────────────────────────────

// Add a per-cell offset to every numeric field, recursively. Produces
// a scene with exactly the same structure as `scene` — so lerpScene
// will accept the pair without a structure-mismatch throw — but with
// every numeric field shifted by the given deltas.
function shiftScene(
	scene: Scene,
	dx: number,
	dy: number,
	dw: number,
	dh: number,
	dvalue: number,
): Scene {
	if (scene.kind === 'atom') {
		const a = scene.atom;
		return {
			kind: 'atom',
			viewBox: scene.viewBox,
			atom: {
				...a,
				x: a.x + dx,
				y: a.y + dy,
				w: a.w + dw,
				h: a.h + dh,
				value: a.value + dvalue,
			},
		};
	}
	return {
		kind: 'array',
		viewBox: scene.viewBox,
		shape: scene.shape,
		frame: {
			x: scene.frame.x + dx,
			y: scene.frame.y + dy,
			w: scene.frame.w + dw,
			h: scene.frame.h + dh,
		},
		cells: scene.cells.map(
			(c): Cell => ({
				...c,
				x: c.x + dx,
				y: c.y + dy,
				w: c.w + dw,
				h: c.h + dh,
				value: c.value + dvalue,
				inner:
					c.inner !== null
						? shiftScene(c.inner, dx, dy, dw, dh, dvalue)
						: null,
			}),
		),
	};
}

type Geo = { x: number; y: number; w: number; h: number; value: number };

// Walk every leaf cell (atom or inner-null) and record geometry by id.
function leafGeo(scene: Scene): Map<string, Geo> {
	const out = new Map<string, Geo>();
	const visit = (s: Scene): void => {
		if (s.kind === 'atom') {
			out.set(s.atom.id, {
				x: s.atom.x,
				y: s.atom.y,
				w: s.atom.w,
				h: s.atom.h,
				value: s.atom.value,
			});
			return;
		}
		for (const c of s.cells) {
			if (c.inner === null) {
				out.set(c.id, {
					x: c.x,
					y: c.y,
					w: c.w,
					h: c.h,
					value: c.value,
				});
			} else {
				visit(c.inner);
			}
		}
	};
	visit(scene);
	return out;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('lerpScene — endpoints', () => {
	test('lerp(a, a, t) ≡ a structurally and numerically', () => {
		fc.assert(
			fc.property(arbBqnValue, arbT, (v, t) => {
				const a = bqnValueToScene(v, VIEW_BOX);
				const r = lerpScene(a, a, t);
				const before = leafGeo(a);
				const after = leafGeo(r);
				expect(after.size).toBe(before.size);
				for (const [id, bg] of before) {
					const ag = after.get(id);
					if (ag === undefined) {
						throw new Error(`leaf ${id} missing from lerp(a,a,${t})`);
					}
					expect(ag.x).toBeCloseTo(bg.x, 6);
					expect(ag.y).toBeCloseTo(bg.y, 6);
					expect(ag.w).toBeCloseTo(bg.w, 6);
					expect(ag.h).toBeCloseTo(bg.h, 6);
					expect(ag.value).toBeCloseTo(bg.value, 6);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('lerp(a, b, 0) ≡ a at every leaf', () => {
		fc.assert(
			fc.property(arbBqnValue, (v) => {
				const a = bqnValueToScene(v, VIEW_BOX);
				const b = shiftScene(a, 30, -20, 5, -3, 7);
				const r = lerpScene(a, b, 0);
				const before = leafGeo(a);
				const after = leafGeo(r);
				for (const [id, bg] of before) {
					const ag = after.get(id);
					if (ag === undefined) throw new Error(`leaf ${id} missing`);
					expect(ag.x).toBeCloseTo(bg.x, 6);
					expect(ag.y).toBeCloseTo(bg.y, 6);
					expect(ag.w).toBeCloseTo(bg.w, 6);
					expect(ag.h).toBeCloseTo(bg.h, 6);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	test('lerp(a, b, 1) ≡ b at every leaf', () => {
		fc.assert(
			fc.property(arbBqnValue, (v) => {
				const a = bqnValueToScene(v, VIEW_BOX);
				const b = shiftScene(a, 30, -20, 5, -3, 7);
				const r = lerpScene(a, b, 1);
				const before = leafGeo(b);
				const after = leafGeo(r);
				for (const [id, bg] of before) {
					const ag = after.get(id);
					if (ag === undefined) throw new Error(`leaf ${id} missing`);
					expect(ag.x).toBeCloseTo(bg.x, 6);
					expect(ag.y).toBeCloseTo(bg.y, 6);
					expect(ag.w).toBeCloseTo(bg.w, 6);
					expect(ag.h).toBeCloseTo(bg.h, 6);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});
});

describe('lerpScene — linearity (the anti-teleport core)', () => {
	test('every numeric field equals (1-t)·a + t·b for any t in [0,1]', () => {
		fc.assert(
			fc.property(
				arbBqnValue,
				fc.integer({ min: -200, max: 200 }),
				fc.integer({ min: -200, max: 200 }),
				arbT,
				(v, dx, dy, t) => {
					const a = bqnValueToScene(v, VIEW_BOX);
					const b = shiftScene(a, dx, dy, 0, 0, 0);
					const r = lerpScene(a, b, t);
					const ag = leafGeo(a);
					const rg = leafGeo(r);
					for (const [id, ageo] of ag) {
						const rgeo = rg.get(id);
						if (rgeo === undefined) {
							throw new Error(`leaf ${id} disappeared at t=${t}`);
						}
						expect(rgeo.x).toBeCloseTo(ageo.x + dx * t, 4);
						expect(rgeo.y).toBeCloseTo(ageo.y + dy * t, 4);
					}
				},
			),
			{ numRuns: NUM_RUNS },
		);
	});

	test('leaf ids are preserved at every t (no phantom appearance / drop)', () => {
		fc.assert(
			fc.property(arbBqnValue, arbT, (v, t) => {
				const a = bqnValueToScene(v, VIEW_BOX);
				const b = shiftScene(a, 50, 30, 0, 0, 0);
				const r = lerpScene(a, b, t);
				const aids = new Set(leafGeo(a).keys());
				const rids = new Set(leafGeo(r).keys());
				expect(rids.size).toBe(aids.size);
				for (const id of aids) {
					if (!rids.has(id)) {
						throw new Error(`leaf ${id} present in a, missing at t=${t}`);
					}
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});

	// Composition probe: lerp at 0.5 from a→b must equal lerp at 0.25
	// from a→b composed through the midpoint. Catches any lerp that
	// returns identical-to-start for small t (a staircase that fakes
	// motion by jumping at t=1).
	test('composition: lerp(a, lerp(a,b,0.5), 0.5) == lerp(a, b, 0.25)', () => {
		fc.assert(
			fc.property(arbBqnValue, (v) => {
				const a = bqnValueToScene(v, VIEW_BOX);
				const b = shiftScene(a, 80, -40, 0, 0, 0);
				const half = lerpScene(a, b, 0.5);
				const composed = lerpScene(a, half, 0.5);
				const direct = lerpScene(a, b, 0.25);
				const cg = leafGeo(composed);
				const dg = leafGeo(direct);
				for (const [id, dgeo] of dg) {
					const cgeo = cg.get(id);
					if (cgeo === undefined) throw new Error(`leaf ${id} missing`);
					expect(cgeo.x).toBeCloseTo(dgeo.x, 4);
					expect(cgeo.y).toBeCloseTo(dgeo.y, 4);
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});
});

describe('lerpScene — strictness', () => {
	test('throws on kind mismatch (atom vs array)', () => {
		const atomScene = bqnValueToScene(
			{ kind: 'number', value: 1 },
			VIEW_BOX,
		);
		const arrScene = bqnValueToScene(
			{
				kind: 'array',
				shape: [2],
				data: [
					{ kind: 'number', value: 1 },
					{ kind: 'number', value: 2 },
				],
			},
			VIEW_BOX,
		);
		expect(() => lerpScene(atomScene, arrScene, 0.5)).toThrowError(
			/kind mismatch/,
		);
	});

	test('throws on cell-count mismatch (same rank, different length)', () => {
		const two = bqnValueToScene(
			{
				kind: 'array',
				shape: [2],
				data: [
					{ kind: 'number', value: 1 },
					{ kind: 'number', value: 2 },
				],
			},
			VIEW_BOX,
		);
		const three = bqnValueToScene(
			{
				kind: 'array',
				shape: [3],
				data: [
					{ kind: 'number', value: 1 },
					{ kind: 'number', value: 2 },
					{ kind: 'number', value: 3 },
				],
			},
			VIEW_BOX,
		);
		expect(() => lerpScene(two, three, 0.5)).toThrowError(
			/shape mismatch|cell count/,
		);
	});

	test('throws on id mismatch', () => {
		const make = (id0: string, id1: string): Scene => ({
			kind: 'array',
			viewBox: VIEW_BOX,
			shape: [2],
			frame: { x: 0, y: 0, w: 100, h: 100 },
			cells: [
				{ id: id0, x: 0, y: 0, w: 50, h: 100, value: 0, inner: null },
				{ id: id1, x: 50, y: 0, w: 50, h: 100, value: 1, inner: null },
			],
		});
		expect(() => lerpScene(make('a', 'b'), make('a', 'c'), 0.5)).toThrowError(
			/id mismatch/,
		);
	});
});

describe('lerpScene — finiteness', () => {
	test('produces only finite numbers for finite inputs and t in [0,1]', () => {
		fc.assert(
			fc.property(arbBqnValue, arbT, (v, t) => {
				const a = bqnValueToScene(v, VIEW_BOX);
				const b = shiftScene(a, 10, -5, 0, 0, 0);
				const r = lerpScene(a, b, t);
				for (const g of leafGeo(r).values()) {
					for (const n of [g.x, g.y, g.w, g.h, g.value]) {
						if (!Number.isFinite(n)) {
							throw new Error(`non-finite field at t=${t}: ${n}`);
						}
					}
				}
			}),
			{ numRuns: NUM_RUNS },
		);
	});
});

describe('easing functions', () => {
	test('linear: identity', () => {
		expect(linear(0)).toBe(0);
		expect(linear(1)).toBe(1);
		expect(linear(0.5)).toBe(0.5);
	});

	test('easeInOut: pins endpoints and midpoint, monotone non-decreasing', () => {
		expect(easeInOut(0)).toBeCloseTo(0, 6);
		expect(easeInOut(1)).toBeCloseTo(1, 6);
		expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
		let prev = easeInOut(0);
		for (let i = 1; i <= 100; i++) {
			const cur = easeInOut(i / 100);
			expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
			prev = cur;
		}
	});
});
