// Property tests for reverseAnimation.
//
// Five properties, each over arbitrary BQN array values:
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
//   4. Produces a real animation. For any animatable input (rank-1 or
//      rank-2 array with ≥2 cells and no ellipsis), `reverseAnimation`
//      must return more than one snapshot. Catches the "silent refuse"
//      cheat where the impl returns `[prevScene]` so properties 2/3
//      pass trivially on a one-element list.
//
//   5. At least one leaf actually moves. Multi-snapshot return is not
//      enough — N empty pad-snapshots is still a refusal in disguise.
//      Final snapshot must differ from start at ≥1 leaf centre.
//
// Tests 2–5 are expected to fail for some inputs on the current
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
//
// Value range is intentionally wide: bar scaling, label rendering, and
// fraction reduction all key off magnitude, so a -10..10 corpus barely
// exercises the layout. Length range is wide too — anything that
// overflows naturally triggers the ellipsis path, which is excluded
// from the must-animate property by predicate.

const arbInt: fc.Arbitrary<BqnStructuredValue> = fc
	.integer({ min: -1000, max: 1000 })
	.map((value) => ({ kind: 'number', value }));

// Fractions are part of the displayable corpus (see commit 3eb3f95);
// keep a denominator range that exercises the reducer.
const arbFrac: fc.Arbitrary<BqnStructuredValue> = fc
	.tuple(
		fc.integer({ min: -1000, max: 1000 }),
		fc.integer({ min: 2, max: 50 }),
	)
	.map(([n, d]) => ({ kind: 'number', value: n / d }));

const arbNum: fc.Arbitrary<BqnStructuredValue> = fc.oneof(
	{ weight: 4, arbitrary: arbInt },
	{ weight: 1, arbitrary: arbFrac },
);

const arbVec: fc.Arbitrary<BqnStructuredValue> = fc
	.array(arbNum, { minLength: 1, maxLength: 200 })
	.map((data) => ({ kind: 'array', shape: [data.length], data }));

const arbMatrix: fc.Arbitrary<BqnStructuredValue> = fc
	.tuple(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 1, max: 200 }))
	.chain(([r, c]) =>
		fc
			.array(arbNum, { minLength: r * c, maxLength: r * c })
			.map((data) => ({ kind: 'array', shape: [r, c], data })),
	);

const arbListOfLists: fc.Arbitrary<BqnStructuredValue> = fc
	.array(
		fc
			.array(arbNum, { minLength: 1, maxLength: 200 })
			.map(
				(sub) =>
					({
						kind: 'array' as const,
						shape: [sub.length],
						data: sub,
					}) satisfies BqnStructuredValue,
			),
		{ minLength: 1, maxLength: 200 },
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

// Mirrors `sceneHasEllipsis` in steps/reverse.ts. Not exported there,
// so duplicated here — the impl's refuse-on-ellipsis is a legit "no",
// and the must-animate property has to exclude exactly those inputs.
function hasEllipsis(scene: Scene): boolean {
	if (scene.kind === 'atom') return false;
	for (const c of scene.cells) {
		if (c.kind === 'ellipsis') return true;
		if (c.inner !== null && hasEllipsis(c.inner)) return true;
	}
	return false;
}

// Inputs the impl is contractually supposed to animate: rank-1 or
// rank-2 array, at least two cells (so reverse actually permutes
// something), no ellipsis. Anything else is a legit refuse — scalar,
// single-cell, overflowed-and-ellipsized, higher-rank.
function shouldAnimate(scene: Scene): boolean {
	if (scene.kind !== 'array') return false;
	if (scene.cells.length < 2) return false;
	if (scene.shape.length !== 1 && scene.shape.length !== 2) return false;
	if (hasEllipsis(scene)) return false;
	return true;
}

// Did any leaf centre actually move between two scenes? Compares by
// leaf id so re-orderings count as motion even when the multiset of
// centres is the same.
function someLeafMoved(a: Scene, b: Scene): boolean {
	const before = leafPositions(a);
	const after = leafPositions(b);
	for (const [id, bp] of before) {
		const ap = after.get(id);
		if (ap === undefined) return true;
		if (Math.abs(ap.x - bp.x) > EPS || Math.abs(ap.y - bp.y) > EPS) return true;
	}
	return false;
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

	// Anti-cheat: properties 2 and 3 above pass trivially when the impl
	// returns `[prevScene]` (one snapshot, no motion). Without this
	// test, "fix" can mean "add `return [prevScene]` to the broken
	// branch". This pins that as a regression.
	test(
		'produces a multi-snapshot animation for animatable inputs',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const start = bqnValueToScene(v, VIEW_BOX);
					if (!shouldAnimate(start)) return;
					const snaps = reverseAnimation(start);
					if (snaps.length <= 1) {
						throw new Error(
							`silent refuse: shape=[${start.kind === 'array' ? start.shape.join(',') : '?'}] `
								+ `cells=${start.kind === 'array' ? start.cells.length : 0} `
								+ `→ snaps.length=${snaps.length}`,
						);
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);

	// Stronger version: a multi-snapshot list whose last frame matches
	// the first is also a refusal in disguise. At least one leaf has
	// to land somewhere new.
	test(
		'at least one leaf moves between start and final snapshot',
		() => {
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const start = bqnValueToScene(v, VIEW_BOX);
					if (!shouldAnimate(start)) return;
					const snaps = reverseAnimation(start);
					const end = snaps[snaps.length - 1];
					if (!someLeafMoved(start, end)) {
						throw new Error(
							`no leaf moved: shape=[${start.kind === 'array' ? start.shape.join(',') : '?'}] `
								+ `cells=${start.kind === 'array' ? start.cells.length : 0} `
								+ `snaps=${snaps.length}`,
						);
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);

	// "Don't teleport": the animation runner lerps between consecutive
	// snapshots. lerp is genuinely linear (lerp.test.ts pins that), so
	// the visible motion between snaps[s] and snaps[s+1] traces a
	// straight line at constant speed. If a step in that list places
	// the same leaf at positions farther apart than the viewBox width,
	// the user sees a jump — technically linear, visually a teleport.
	// Bound the per-step displacement well below "across the whole
	// canvas" to catch any phase that skips its sub-snapshots.
	test(
		'no leaf jumps the full viewBox between consecutive snapshots',
		() => {
			const MAX_JUMP = VIEW_BOX.w;
			fc.assert(
				fc.property(arbBqnValue, (v) => {
					const start = bqnValueToScene(v, VIEW_BOX);
					if (!shouldAnimate(start)) return;
					const snaps = reverseAnimation(start);
					for (let s = 0; s < snaps.length - 1; s++) {
						const before = leafPositions(snaps[s]);
						const after = leafPositions(snaps[s + 1]);
						for (const [id, bp] of before) {
							const ap = after.get(id);
							if (ap === undefined) continue;
							const d = Math.hypot(ap.x - bp.x, ap.y - bp.y);
							if (d > MAX_JUMP) {
								throw new Error(
									`leaf ${id} teleports ${d.toFixed(1)}px `
										+ `between snaps ${s} → ${s + 1}/${snaps.length - 1} `
										+ `(max=${MAX_JUMP}, shape=[${start.kind === 'array' ? start.shape.join(',') : '?'}])`,
								);
							}
						}
					}
				}),
				{ numRuns: NUM_RUNS },
			);
		},
		TEST_TIMEOUT_MS,
	);
});
