// Test harness for the no-overlap invariant.
//
// USAGE: run a motion through `runWithCapture`, then call
// `assertNoOverlapAcross(scene, timesteps)` to sample positions at N
// evenly-spaced points across the motion's timeline and verify that
// no two visible elements share screen rectangles at any sample.
//
// The harness:
//   - mocks `motion`'s `animate` so each call records keyframes,
//     duration, and delay against a synthetic "motion time" that
//     advances when awaited.
//   - replays each element's keyframed properties (x, y, scale,
//     opacity) by linear interpolation at sample time t.
//   - composes natural rects (provided by the scene) with the
//     interpolated transform to compute each element's rect at t.
//   - skips elements with opacity ≤ INVISIBLE_THRESHOLD when
//     checking overlaps (faded-out things don't "cover" anything).
//
// This is intentionally a math-only simulation — no real animation
// frames, no jsdom layout. The motion's geometric reasoning is what
// gets verified.

import { vi } from 'vitest';
import type { Rect } from '../geometry';
import { rectsOverlap } from '../geometry';

export type SceneElement = {
	id: string;             // human-readable name for error messages
	el: HTMLElement;        // the actual element the motion will animate
	naturalRect: Rect;      // its bounding rect with no transform applied
	initialOpacity?: number; // default 1
};

export type Scene = {
	elements: SceneElement[];
	// Look up an element by id once the motion has been run. Used by tests
	// to identify offenders in overlap reports.
	byEl: Map<HTMLElement, SceneElement>;
};

const INVISIBLE_THRESHOLD = 0.05;

type Keyframes = Record<string, unknown>;
type AnimateCall = {
	el: HTMLElement;
	keyframes: Keyframes;
	startMs: number; // motion-time when the call's animation starts (after delay)
	endMs: number;
};

let calls: AnimateCall[] = [];
let motionTimeMs = 0;
let totalMotionMs = 0;

function asNumber(v: unknown): number | null {
	if (typeof v === 'number') return v;
	if (typeof v === 'string') {
		const n = parseFloat(v);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function keyframeValueAt(keyframes: unknown, t: number): number | null {
	// t in [0, 1] across the keyframes' duration.
	if (Array.isArray(keyframes)) {
		if (keyframes.length === 0) return null;
		if (keyframes.length === 1) return asNumber(keyframes[0]);
		const segment = (keyframes.length - 1) * t;
		const i = Math.min(keyframes.length - 2, Math.floor(segment));
		const localT = segment - i;
		const a = asNumber(keyframes[i]);
		const b = asNumber(keyframes[i + 1]);
		if (a === null || b === null) return null;
		return a + (b - a) * localT;
	}
	return asNumber(keyframes);
}

// Mock implementation of motion's `animate`. Records the call, advances
// motion time on .finished await. Returns synchronously-resolving promise.
function makeMockAnimate() {
	return function mockAnimate(
		el: HTMLElement,
		keyframes: Keyframes,
		options?: { duration?: number; delay?: number },
	): { finished: Promise<void> } {
		const duration = ((options?.duration ?? 0) as number) * 1000;
		const delay = ((options?.delay ?? 0) as number) * 1000;
		const startMs = motionTimeMs + delay;
		const endMs = startMs + duration;
		totalMotionMs = Math.max(totalMotionMs, endMs);
		calls.push({ el, keyframes, startMs, endMs });
		return {
			finished: Promise.resolve().then(() => {
				motionTimeMs = Math.max(motionTimeMs, endMs);
				// Real motion-lib sets inline.transform continuously
				// during the animation. The mock can't replicate that
				// frame-by-frame, but it CAN set the final value when
				// .finished resolves — so production code that calls
				// getBoundingClientRect AFTER a motion (e.g. to plan
				// the next phase) sees the correct rect, including
				// ancestor-applied rotations.
				applyFinalKeyframesToInlineTransform(el, keyframes);
			}),
		};
	};
}

function applyFinalKeyframesToInlineTransform(
	el: HTMLElement,
	keyframes: Keyframes,
): void {
	const kfFinal = (...names: string[]): number | null => {
		for (const name of names) {
			if (!(name in keyframes)) continue;
			const v = (keyframes as Record<string, unknown>)[name];
			const last = Array.isArray(v) ? v[v.length - 1] : v;
			const n = typeof last === 'number' ? last : parseFloat(String(last));
			if (Number.isFinite(n)) return n;
		}
		return null;
	};
	const x = kfFinal('x', 'translateX');
	const y = kfFinal('y', 'translateY');
	const scale = kfFinal('scale', 'scaleX');
	const rotate = kfFinal('rotate', 'rotateZ');
	if (x === null && y === null && scale === null && rotate === null) return;
	const parts: string[] = [];
	if (x !== null) parts.push(`translateX(${x}px)`);
	if (y !== null) parts.push(`translateY(${y}px)`);
	if (scale !== null) parts.push(`scale(${scale})`);
	if (rotate !== null) parts.push(`rotate(${rotate}deg)`);
	el.style.transform = parts.join(' ');
}

export function installAnimateMock(): void {
	calls = [];
	motionTimeMs = 0;
	totalMotionMs = 0;
	vi.doMock('motion', () => ({ animate: makeMockAnimate() }));
}

export function resetMotionTime(): void {
	calls = [];
	motionTimeMs = 0;
	totalMotionMs = 0;
}

export function getCalls(): readonly AnimateCall[] {
	return calls;
}

export function getTotalMotionMs(): number {
	return totalMotionMs;
}

// Element state at time t: compose all keyframed properties from animate
// calls that have started by time t. Later calls (for the same property)
// override earlier ones — matches Motion's "last-write-wins" semantics
// for sequential animations.
function elementStateAt(el: HTMLElement, t: number): { tx: number; ty: number; scale: number; opacity: number } {
	let tx = 0;
	let ty = 0;
	let scale = 1;
	let opacity = 1;

	const sorted = calls
		.filter(c => c.el === el && c.startMs <= t)
		.sort((a, b) => a.startMs - b.startMs);

	// Apply each animate call in start-order. For ARRAY keyframes we
	// interpolate within the array. For SCALAR keyframes (e.g.
	// `animate(el, { x: 100 }, { duration })`) motion-library tweens from
	// the element's prior value to the scalar — so we must do the same
	// here: ease from the running tx to the target scalar across the
	// call's duration. Treating a scalar as an instant teleport hides
	// real-time overlaps that motion would otherwise show.
	for (const call of sorted) {
		const localT = call.endMs > call.startMs
			? Math.min(1, (t - call.startMs) / (call.endMs - call.startMs))
			: 1;
		const kf = call.keyframes;
		const xKf = kf.x ?? (kf as Record<string, unknown>).translateX;
		const yKf = kf.y ?? (kf as Record<string, unknown>).translateY;
		const sKf = kf.scale ?? (kf as Record<string, unknown>).scaleX;
		const oKf = kf.opacity;
		tx = mixKf(xKf, tx, localT) ?? tx;
		ty = mixKf(yKf, ty, localT) ?? ty;
		scale = mixKf(sKf, scale, localT) ?? scale;
		opacity = mixKf(oKf, opacity, localT) ?? opacity;
	}

	return { tx, ty, scale, opacity };
}

// Resolve one keyframe specification against the prior accumulated value.
// Arrays interpolate among themselves (existing behaviour). Scalars tween
// from `prior` to the scalar — matching motion's "animate to value" mode.
function mixKf(kf: unknown, prior: number, localT: number): number | null {
	if (kf === undefined) return null;
	if (Array.isArray(kf)) {
		return keyframeValueAt(kf, localT);
	}
	const target = asNumber(kf);
	if (target === null) return null;
	return prior + (target - prior) * localT;
}

function elementRectAt(el: SceneElement, t: number): Rect {
	const { tx, ty, scale } = elementStateAt(el.el, t);
	const r = el.naturalRect;
	const cx = (r.left + r.right) / 2;
	const cy = (r.top + r.bottom) / 2;
	const w = (r.right - r.left) * scale;
	const h = (r.bottom - r.top) * scale;
	return {
		left: cx + tx - w / 2,
		top: cy + ty - h / 2,
		right: cx + tx + w / 2,
		bottom: cy + ty + h / 2,
	};
}

// Compute the opacity contribution of one element at time t, from
// animate calls only. Walks every opacity-changing call in start-order
// (matching elementStateAt's logic) so scalar keyframes ease from the
// running prior value over their duration — the same way motion-lib
// would. Returns null when no opacity animation is tracked for this
// element. Ignores inline style.opacity, which can't be time-correlated.
function trackedOpacityAt(el: Element, t: number): number | null {
	const sorted = calls
		.filter(c => c.el === el && c.startMs <= t && 'opacity' in c.keyframes)
		.sort((a, b) => a.startMs - b.startMs);
	if (sorted.length === 0) return null;
	let opacity = 1; // implicit prior before any tracked opacity animation
	for (const call of sorted) {
		const localT = call.endMs > call.startMs
			? Math.min(1, (t - call.startMs) / (call.endMs - call.startMs))
			: 1;
		const v = mixKf(call.keyframes.opacity, opacity, localT);
		if (v !== null) opacity = v;
	}
	return opacity;
}

// Effective opacity of an element at time t: own contribution × ancestor
// contributions. An element with style.visibility = 'hidden' (read live)
// is treated as 0 — many motions toggle visibility imperatively to hide
// after-cells until handoff, and the live read of that is the most
// reliable signal available without intercepting style mutations.
//
// `initialOpacity` on the SceneElement is the starting value for an
// element with NO tracked opacity animation. After-cells should set
// this to 0 in tests so they stay invisible unless a motion explicitly
// fades them in.
function elementOpacityAt(el: SceneElement, t: number): number {
	if (el.el.style.visibility === 'hidden') return 0;
	let own = trackedOpacityAt(el.el, t);
	if (own === null) own = el.initialOpacity ?? 1;
	let parent: Element | null = el.el.parentElement;
	while (parent) {
		if ((parent as HTMLElement).style.visibility === 'hidden') return 0;
		const p = trackedOpacityAt(parent, t);
		if (p !== null) own *= p;
		parent = parent.parentElement;
	}
	return own;
}

// Sample N timesteps evenly across the motion's interior (exclusive of
// the endpoints, since t=0 is pre-motion setup and t=total is post-motion
// handoff — neither represents what the user sees during the animation).
// Returns any overlap detected, with the offender pair and the timestep.
export function assertNoOverlapAcross(
	scene: Scene,
	samples: number,
): void {
	const total = totalMotionMs > 0 ? totalMotionMs : 1;
	for (let s = 1; s < samples; s++) {
		const t = (s / samples) * total;
		const visible = scene.elements.filter(el => elementOpacityAt(el, t) > INVISIBLE_THRESHOLD);
		for (let i = 0; i < visible.length; i++) {
			for (let j = i + 1; j < visible.length; j++) {
				const a = visible[i];
				const b = visible[j];
				const rectA = elementRectAt(a, t);
				const rectB = elementRectAt(b, t);
				if (rectsOverlap(rectA, rectB)) {
					throw new Error(
						`No-overlap invariant broken at t=${t.toFixed(1)}ms (sample ${s}/${samples}, total motion=${total.toFixed(0)}ms): ` +
							`'${a.id}' (rect ${rectStr(rectA)}, opacity ${elementOpacityAt(a, t).toFixed(2)}) ` +
							`overlaps '${b.id}' (rect ${rectStr(rectB)}, opacity ${elementOpacityAt(b, t).toFixed(2)}).`,
					);
				}
			}
		}
	}
}

function rectStr(r: Rect): string {
	return `[${r.left.toFixed(1)},${r.top.toFixed(1)} → ${r.right.toFixed(1)},${r.bottom.toFixed(1)}]`;
}

// Smooth-motion invariant: no scene element may "teleport." Sample at
// fine resolution and assert that between adjacent samples each
// element's opacity changes by less than MAX_OPACITY_DELTA, and its
// rect centre moves by less than MAX_POSITION_DELTA_PX (only checked
// when the element is visible at both samples — a fade-in/out is a
// visibility change, not a position change).
//
// Catches:
//   - duration-0 opacity tweens (e.g. animate(el, { opacity: 0 },
//     { duration: 0 })) which instantly hide an element.
//   - animation chains where a later array-keyframe starts at a
//     different value than the previous animation ended at, causing
//     a transform jump at the seam.
//   - direct style.opacity / style.visibility flips that the harness
//     happens to observe (visibility flips are read live; opacity
//     flips via animate() are tracked here).
//
// Sweeps s ∈ [0, samples] INCLUSIVE so the very-end-of-motion jumps
// (e.g. a duration-0 hide at totalMotionMs that the user sees as the
// motion's last visual moment) get compared against the prior sample.
const SMOOTH_DEFAULT_SAMPLES = 360;
const SMOOTH_MAX_OPACITY_DELTA = 0.5;     // ~catches duration < 12ms full fades
const SMOOTH_MAX_POSITION_DELTA_PX = 60;  // ~5000px/s at 240 samples on 1500ms

export function assertSmoothMotion(
	scene: Scene,
	samples: number = SMOOTH_DEFAULT_SAMPLES,
	opts: { maxOpacityDelta?: number; maxPositionDeltaPx?: number } = {},
): void {
	const maxOpacityDelta = opts.maxOpacityDelta ?? SMOOTH_MAX_OPACITY_DELTA;
	const maxPositionDeltaPx = opts.maxPositionDeltaPx ?? SMOOTH_MAX_POSITION_DELTA_PX;
	const total = totalMotionMs > 0 ? totalMotionMs : 1;
	type State = { opacity: number; cx: number; cy: number };
	let prev: State[] | null = null;
	for (let s = 0; s <= samples; s++) {
		const t = (s / samples) * total;
		const states: State[] = scene.elements.map(el => {
			const opacity = elementOpacityAt(el, t);
			const r = elementRectAt(el, t);
			return { opacity, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
		});
		if (prev) {
			const prevT = ((s - 1) / samples) * total;
			for (let i = 0; i < scene.elements.length; i++) {
				const el = scene.elements[i];
				const cur = states[i];
				const old = prev[i];
				const dOp = Math.abs(cur.opacity - old.opacity);
				if (dOp > maxOpacityDelta) {
					throw new Error(
						`Smooth-motion: '${el.id}' opacity jumped ${old.opacity.toFixed(2)} → ${cur.opacity.toFixed(2)} ` +
							`(Δ=${dOp.toFixed(2)} > ${maxOpacityDelta}) ` +
							`between t=${prevT.toFixed(1)}ms and t=${t.toFixed(1)}ms (sample ${s - 1}→${s}/${samples}, total=${total.toFixed(0)}ms). ` +
							`That's an instant fade — use a tracked tween with non-zero duration.`,
					);
				}
				if (cur.opacity > INVISIBLE_THRESHOLD && old.opacity > INVISIBLE_THRESHOLD) {
					const dPos = Math.hypot(cur.cx - old.cx, cur.cy - old.cy);
					if (dPos > maxPositionDeltaPx) {
						throw new Error(
							`Smooth-motion: '${el.id}' centre jumped ${dPos.toFixed(1)}px ` +
								`(${old.cx.toFixed(1)},${old.cy.toFixed(1)} → ${cur.cx.toFixed(1)},${cur.cy.toFixed(1)}) ` +
								`(> ${maxPositionDeltaPx}px) ` +
								`between t=${prevT.toFixed(1)}ms and t=${t.toFixed(1)}ms (sample ${s - 1}→${s}/${samples}, total=${total.toFixed(0)}ms). ` +
								`That's a teleport — animate transforms continuously across phase seams.`,
						);
					}
				}
			}
		}
		prev = states;
	}
}

// Handoff-alignment invariant: at the end of motion (t = totalMotionMs),
// every VISIBLE before-cell must occupy the SAME viewport rect as some
// after-cell's natural (post-commit) rect. If a before-cell is still
// visible at end and not at any after-cell's natural rect, the
// post-commit render will visibly teleport — afterRoot snaps in at
// its natural positions and the before-cell's pixels jump.
//
// Identifying which cells are which: SceneElement ids start with
// "before." or "after." (per the test's buildSceneFor prefix arg).
//
// Tolerance covers sub-pixel arithmetic; full-rect alignment is the
// invariant. Motions that animate properties the harness can't see
// (e.g. inline `height` keyframes used by sizing / comparison) won't
// satisfy this; they should fade the before-cells out at end so the
// check is vacuous for them.
export function assertHandoffAligned(
	scene: Scene,
	opts: { tolerance?: number } = {},
): void {
	const tolerance = opts.tolerance ?? 1.5;
	const total = totalMotionMs > 0 ? totalMotionMs : 1;
	const t = total;

	const beforeCells = scene.elements.filter(el => el.id.startsWith('before.'));
	const afterCells = scene.elements.filter(el => el.id.startsWith('after.'));
	if (afterCells.length === 0) return;

	// END-OF-MOTION SCREEN RECT for each scene element comes from the
	// mock's getBoundingClientRect, which already walks ancestor chains
	// and applies inline transforms (set by the mock animate's final
	// keyframe snapshot when each animation's .finished resolved).
	// That gives the EXACT viewport rect the user would see, post-
	// motion, in production.
	for (const before of beforeCells) {
		const opacity = elementOpacityAt(before, t);
		if (opacity <= INVISIBLE_THRESHOLD) continue;

		const endRect = domRectToRect(before.el.getBoundingClientRect());
		const matched = afterCells.find(a => {
			const aRect = domRectToRect(a.el.getBoundingClientRect());
			return rectsAlign(endRect, aRect, tolerance);
		});
		if (!matched) {
			const candidates = afterCells
				.map(a => {
					const ar = domRectToRect(a.el.getBoundingClientRect());
					return { a, ar, d: rectMaxAbsDiff(endRect, ar) };
				})
				.sort((p, q) => p.d - q.d)
				.slice(0, 3)
				.map(({ a, ar, d }) => `'${a.id}' end=${rectStr(ar)} maxΔ=${d.toFixed(2)}px`);
			throw new Error(
				`Handoff-alignment: '${before.id}' is VISIBLE at end of motion ` +
					`(rect ${rectStr(endRect)}, opacity ${opacity.toFixed(2)}, ` +
					`t=${t.toFixed(0)}ms total=${total.toFixed(0)}ms) ` +
					`but is NOT at any after-cell's end-of-motion rect ` +
					`(tolerance ${tolerance}px). ` +
					`Post-commit will visibly TELEPORT. Nearest candidates: ` +
					candidates.join('; '),
			);
		}
	}
}

function domRectToRect(r: DOMRect): Rect {
	return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function rectsAlign(a: Rect, b: Rect, tol: number): boolean {
	return (
		Math.abs(a.left - b.left) <= tol &&
		Math.abs(a.right - b.right) <= tol &&
		Math.abs(a.top - b.top) <= tol &&
		Math.abs(a.bottom - b.bottom) <= tol
	);
}

function rectMaxAbsDiff(a: Rect, b: Rect): number {
	return Math.max(
		Math.abs(a.left - b.left),
		Math.abs(a.right - b.right),
		Math.abs(a.top - b.top),
		Math.abs(a.bottom - b.bottom),
	);
}

// Helpers for scene setup.
export function makeMockElement(
	id: string,
	rect: Rect,
	opts?: { initialOpacity?: number; initialVisibility?: string },
): SceneElement {
	const el = document.createElement('div');
	if (opts?.initialOpacity !== undefined) el.style.opacity = String(opts.initialOpacity);
	if (opts?.initialVisibility) el.style.visibility = opts.initialVisibility;
	// Mock getBoundingClientRect so production code's measurements use
	// our rect. Walks the ancestor chain and applies inline rotations
	// (in a real browser this is automatic — in jsdom we have to do
	// it ourselves, otherwise a child of a rotated parent measures as
	// if no rotation had happened).
	el.getBoundingClientRect = function (): DOMRect {
		const tx = parseInlineTranslateX(el.style.transform);
		const ty = parseInlineTranslateY(el.style.transform);
		const w = rect.right - rect.left;
		const h = rect.bottom - rect.top;
		let cur: Rect = {
			left: rect.left + tx,
			top: rect.top + ty,
			right: rect.left + tx + w,
			bottom: rect.top + ty + h,
		};
		let parent: HTMLElement | null = el.parentElement;
		while (parent) {
			const rot = parseInlineRotateDeg(parent.style.transform);
			if (rot !== 0) {
				const pr = parent.getBoundingClientRect();
				const pcx = (pr.left + pr.right) / 2;
				const pcy = (pr.top + pr.bottom) / 2;
				cur = rotateAxisAlignedRect(cur, pcx, pcy, rot);
			}
			parent = parent.parentElement;
		}
		const w2 = cur.right - cur.left;
		const h2 = cur.bottom - cur.top;
		return {
			left: cur.left, top: cur.top, right: cur.right, bottom: cur.bottom,
			width: w2, height: h2, x: cur.left, y: cur.top,
			toJSON: () => ({}),
		} as DOMRect;
	};
	return { id, el, naturalRect: rect, initialOpacity: opts?.initialOpacity ?? 1 };
}

function parseInlineTranslateX(transform: string): number {
	const m = transform.match(/translate(?:X|3d)?\(\s*([-0-9.]+)px/);
	return m ? parseFloat(m[1]) : 0;
}
function parseInlineTranslateY(transform: string): number {
	const m = transform.match(/translateY\(\s*([-0-9.]+)px/);
	if (m) return parseFloat(m[1]);
	const t = transform.match(/translate(?:3d)?\(\s*[-0-9.]+px\s*,\s*([-0-9.]+)px/);
	return t ? parseFloat(t[1]) : 0;
}
function parseInlineRotateDeg(transform: string): number {
	const m = transform.match(/rotate(?:Z)?\(\s*([-0-9.]+)deg/);
	return m ? parseFloat(m[1]) : 0;
}
function rotateAxisAlignedRect(r: Rect, cx: number, cy: number, deg: number): Rect {
	const d = ((deg % 360) + 360) % 360;
	if (Math.abs(d - 180) < 1e-6) {
		return {
			left: 2 * cx - r.right,
			right: 2 * cx - r.left,
			top: 2 * cy - r.bottom,
			bottom: 2 * cy - r.top,
		};
	}
	if (d < 1e-6 || Math.abs(d - 360) < 1e-6) return r;
	const rad = (deg * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const corners: [number, number][] = [
		[r.left, r.top],
		[r.right, r.top],
		[r.left, r.bottom],
		[r.right, r.bottom],
	];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [px, py] of corners) {
		const dx = px - cx;
		const dy = py - cy;
		const nx = cx + dx * cos - dy * sin;
		const ny = cy + dx * sin + dy * cos;
		if (nx < minX) minX = nx;
		if (nx > maxX) maxX = nx;
		if (ny < minY) minY = ny;
		if (ny > maxY) maxY = ny;
	}
	return { left: minX, right: maxX, top: minY, bottom: maxY };
}

export function makeScene(elements: SceneElement[]): Scene {
	const byEl = new Map<HTMLElement, SceneElement>();
	for (const e of elements) byEl.set(e.el, e);
	return { elements, byEl };
}
