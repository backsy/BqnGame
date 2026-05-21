// Property tests for reverseAnimation.
//
// Three properties, each over arbitrary BQN array values:
//
//   1. reverse ∘ reverse = identity on leaf positions. Apply the
//      animation twice, take the last snapshot, every leaf atom centre
//      lands back exactly where it started.
//
//   2. Nothing clips, anywhere. At every nesting level: every child
//      rect ⊆ its parent array's frame AND no two siblings share
//      interior area. Recursive — applies to wrappers, atoms, every
//      pair at every depth. Catches "border crosses border", "scalar
//      crosses border", "scalar overlaps scalar" with one walk.
//
//   3. Nothing leaves the draw area. The root frame on every snapshot
//      lies inside `scene.viewBox`. Combined with (2)'s recursive
//      containment, every drawn rect is inside the viewBox transitively.
//
// Tests 2 and 3 are expected to fail for some inputs on the current
// implementation; that's the point.

import { describe, test } from 'vitest';
import fc from 'fast-check';
import type { BqnStructuredValue } from '$lib/bqn/protocol';
import { bqnValueToScene } from '../layout';
import { reverseAnimation } from '../steps/reverse';
import type { Cell, Rect, Scene, ViewBox } from '../scene';
import { lerpScene } from '../tween';

const VIEW_BOX: ViewBox = { x: 0, y: 0, w: 400, h: 280 };
const EPS = 0.5;
const NUM_RUNS = 100;
const TEST_TIMEOUT_MS = 120_000;
// Lerp samples between each consecutive snapshot pair. Non-overlap is
// NOT convex: two rects disjoint at t=0 and disjoint at t=1 can overlap
// at t=0.5 (cells passing through each other). So clip-checking only at
// keyframes would miss mid-tween clips. Sampling intermediate t values
// catches it.
const LERP_SAMPLES = 8;

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
	arbVec,
	arbMatrix,
	arbListOfLists,
);

// ── walk helpers ──────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

function leafPositions(scene: Scene): Map<string, Pt> {
	const out = new Map<string, Pt>();
	walkLeaves(scene, out);
	return out;
}

function walkLeaves(scene: Scene, out: Map<string, Pt>): void {
	if (scene.kind === 'atom') {
		const a = scene.atom;
		out.set(a.id, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
		return;
	}
	for (const c of scene.cells) {
		if (c.inner === null) {
			out.set(c.id, { x: c.x + c.w / 2, y: c.y + c.h / 2 });
		} else {
			walkLeaves(c.inner, out);
		}
	}
}

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

// Two cells overlap iff their axis-aligned rects share interior area.
// Touching edges (e.g. canonical siblings abutting) don't count.
function cellsOverlap(a: Cell, b: Cell): boolean {
	return (
		a.x + a.w > b.x + EPS
		&& b.x + b.w > a.x + EPS
		&& a.y + a.h > b.y + EPS
		&& b.y + b.h > a.y + EPS
	);
}

// Recursive walk: at every array node, all children must be inside the
// node's frame AND no two children share interior area. Returns the
// first failure description, or null if clean.
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

function escapesViewBox(scene: Scene, vb: ViewBox): boolean {
	return !rectInside(rootRect(scene), vb);
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('reverseAnimation', () => {
	test(
		'reverse ∘ reverse = identity (leaf positions unchanged)',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const start = bqnValueToScene(v, VIEW_BOX);
					if (start.kind !== 'array') return;
					const onceSnaps = reverseAnimation(start);
					const once = onceSnaps[onceSnaps.length - 1];
					if (once.kind !== 'array') return;
					const twiceSnaps = reverseAnimation(once);
					const twice = twiceSnaps[twiceSnaps.length - 1];
					const before = leafPositions(start);
					const after = leafPositions(twice);
					if (after.size !== before.size) {
						throw new Error(
							`leaf count changed: ${before.size} → ${after.size}`,
						);
					}
					for (const [id, bp] of before) {
						const ap = after.get(id);
						if (ap === undefined) {
							throw new Error(`leaf ${id} missing after reverse∘reverse`);
						}
						if (Math.abs(ap.x - bp.x) > EPS || Math.abs(ap.y - bp.y) > EPS) {
							throw new Error(
								`leaf ${id}: before (${bp.x.toFixed(2)},${bp.y.toFixed(2)}) `
									+ `after (${ap.x.toFixed(2)},${ap.y.toFixed(2)})`,
							);
						}
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		'nothing clips at every snapshot or in between',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const start = bqnValueToScene(v, VIEW_BOX);
					if (start.kind !== 'array') return;
					const snapshots = reverseAnimation(start);
					for (let s = 0; s < snapshots.length; s++) {
						const fail = clipFailure(snapshots[s]);
						if (fail !== null) {
							throw new Error(
								`snapshot ${s}/${snapshots.length - 1}: ${fail}`,
							);
						}
						// Sample the runner's lerp between this snapshot and the
						// next. Non-overlap is not convex; mid-tween clips are
						// invisible to a keyframe-only check.
						if (s < snapshots.length - 1) {
							for (let k = 1; k < LERP_SAMPLES; k++) {
								const t = k / LERP_SAMPLES;
								const mid = lerpScene(snapshots[s], snapshots[s + 1], t);
								const midFail = clipFailure(mid);
								if (midFail !== null) {
									throw new Error(
										`lerp t=${t.toFixed(3)} between snapshots ${s} and `
											+ `${s + 1}/${snapshots.length - 1}: ${midFail}`,
									);
								}
							}
						}
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		'root frame stays inside viewBox at every snapshot',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const start = bqnValueToScene(v, VIEW_BOX);
					if (start.kind !== 'array') return;
					const snapshots = reverseAnimation(start);
					for (let s = 0; s < snapshots.length; s++) {
						if (escapesViewBox(snapshots[s], VIEW_BOX)) {
							const r = rootRect(snapshots[s]);
							throw new Error(
								`snapshot ${s}/${snapshots.length - 1}: root rect `
									+ `(${r.x.toFixed(1)},${r.y.toFixed(1)}) ${r.w.toFixed(1)}x${r.h.toFixed(1)} `
									+ `escapes viewBox (${VIEW_BOX.x},${VIEW_BOX.y}) ${VIEW_BOX.w}x${VIEW_BOX.h}`,
							);
						}
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);
});
