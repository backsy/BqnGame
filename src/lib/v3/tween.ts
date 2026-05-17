// v3 tween — pure interpolation + an rAF runner.
//
// `lerpScene` is strict: the two scenes must share structure (kind,
// shape, cell ids, inner-null pattern). Any mismatch throws. Shape
// changes are the responsibility of the primitives emitting the
// snapshots — they keep consecutive snapshots structurally identical
// (e.g. a newly-appearing cell is included in the prior snapshot at
// opacity 0 / zero size, then tweens to visible).
//
// `tween(...)` drives `lerpScene` over time with `requestAnimationFrame`
// and pushes each frame to a caller-supplied `onFrame`. Returns a handle
// with `{ promise, cancel }`. No clock dependency beyond `performance.now`
// inside this module; the harness can later replace the rAF driver for
// pause / scrub / frame-step without touching `lerpScene`.

import type { Scene, Cell, ViewBox } from './scene';

const lerpNum = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpViewBox(a: ViewBox, b: ViewBox, t: number): ViewBox {
	return {
		x: lerpNum(a.x, b.x, t),
		y: lerpNum(a.y, b.y, t),
		w: lerpNum(a.w, b.w, t),
		h: lerpNum(a.h, b.h, t),
	};
}

function lerpCell(a: Cell, b: Cell, t: number): Cell {
	if (a.id !== b.id) {
		throw new Error(`lerpCell: id mismatch (${a.id} vs ${b.id})`);
	}
	if ((a.inner === null) !== (b.inner === null)) {
		throw new Error(`lerpCell[id=${a.id}]: inner-null mismatch`);
	}
	return {
		id: a.id,
		x: lerpNum(a.x, b.x, t),
		y: lerpNum(a.y, b.y, t),
		w: lerpNum(a.w, b.w, t),
		h: lerpNum(a.h, b.h, t),
		value: lerpNum(a.value, b.value, t),
		inner:
			a.inner !== null && b.inner !== null
				? lerpScene(a.inner, b.inner, t)
				: null,
	};
}

/**
 * Strict same-structure lerp between two scenes.
 *
 * Pre-conditions (any violation throws):
 *   - same `kind`
 *   - for array: same rank, same shape per axis, same cell count
 *   - each pair of cells: same `id`, same `inner === null` pattern
 *   - recursively for nested inner scenes
 *
 * Lerped fields: viewBox (x/y/w/h), each cell's (x/y/w/h/value),
 * recursively for inner scenes. `id` is preserved.
 */
export function lerpScene(a: Scene, b: Scene, t: number): Scene {
	if (a.kind !== b.kind) {
		throw new Error(`lerpScene: kind mismatch (${a.kind} vs ${b.kind})`);
	}
	const viewBox = lerpViewBox(a.viewBox, b.viewBox, t);
	if (a.kind === 'atom' && b.kind === 'atom') {
		return { kind: 'atom', viewBox, atom: lerpCell(a.atom, b.atom, t) };
	}
	if (a.kind === 'array' && b.kind === 'array') {
		if (a.shape.length !== b.shape.length) {
			throw new Error(
				`lerpScene: rank mismatch (${a.shape.length} vs ${b.shape.length})`,
			);
		}
		for (let i = 0; i < a.shape.length; i++) {
			if (a.shape[i] !== b.shape[i]) {
				throw new Error(
					`lerpScene: shape mismatch at axis ${i} (${a.shape[i]} vs ${b.shape[i]})`,
				);
			}
		}
		if (a.cells.length !== b.cells.length) {
			throw new Error(
				`lerpScene: cell count mismatch (${a.cells.length} vs ${b.cells.length})`,
			);
		}
		const cells = a.cells.map((c, i) => lerpCell(c, b.cells[i], t));
		const rotation = lerpNum(a.rotation, b.rotation, t);
		return { kind: 'array', viewBox, shape: a.shape, cells, rotation };
	}
	// TypeScript can't see the kind check above narrowed both; explicit
	// throw keeps the function total without silently mis-handling a
	// future variant.
	throw new Error('lerpScene: unreachable');
}

export type Easing = (t: number) => number;
export const linear: Easing = (t) => t;
export const easeInOut: Easing = (t) => (1 - Math.cos(Math.PI * t)) / 2;

export type TweenOpts = {
	from: Scene;
	to: Scene;
	durationMs: number;
	easing?: Easing;
	onFrame: (scene: Scene) => void;
};

export type TweenHandle = {
	promise: Promise<'done' | 'cancelled'>;
	cancel: () => void;
};

/**
 * rAF-driven tween. Returns immediately with a handle. The promise
 * settles with `'done'` when raw progress reaches 1, or `'cancelled'`
 * if `cancel()` is called before completion.
 */
export function tween(opts: TweenOpts): TweenHandle {
	const easing = opts.easing ?? easeInOut;
	let cancelled = false;
	const promise = new Promise<'done' | 'cancelled'>((resolve) => {
		const start = performance.now();
		const step = (now: number): void => {
			if (cancelled) {
				resolve('cancelled');
				return;
			}
			const raw = Math.min(1, (now - start) / opts.durationMs);
			const t = easing(raw);
			opts.onFrame(lerpScene(opts.from, opts.to, t));
			if (raw < 1) {
				requestAnimationFrame(step);
			} else {
				resolve('done');
			}
		};
		requestAnimationFrame(step);
	});
	return {
		promise,
		cancel: () => {
			cancelled = true;
		},
	};
}
