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
			}),
		};
	};
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

	for (const call of sorted) {
		const localT = call.endMs > call.startMs
			? Math.min(1, (t - call.startMs) / (call.endMs - call.startMs))
			: 1;
		const kf = call.keyframes;
		const xKf = kf.x ?? (kf as Record<string, unknown>).translateX;
		const yKf = kf.y ?? (kf as Record<string, unknown>).translateY;
		const sKf = kf.scale ?? (kf as Record<string, unknown>).scaleX;
		const oKf = kf.opacity;
		if (xKf !== undefined) {
			const v = keyframeValueAt(xKf, localT);
			if (v !== null) tx = v;
		}
		if (yKf !== undefined) {
			const v = keyframeValueAt(yKf, localT);
			if (v !== null) ty = v;
		}
		if (sKf !== undefined) {
			const v = keyframeValueAt(sKf, localT);
			if (v !== null) scale = v;
		}
		if (oKf !== undefined) {
			const v = keyframeValueAt(oKf, localT);
			if (v !== null) opacity = v;
		}
	}

	return { tx, ty, scale, opacity };
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

function elementOpacityAt(el: SceneElement, t: number): number {
	const inline = el.el.style.opacity;
	const inlineN = inline === '' ? null : parseFloat(inline);
	const base = el.initialOpacity ?? 1;
	const { opacity } = elementStateAt(el.el, t);
	// Inline-set opacity (e.g. crate set to visibility:hidden via inline)
	// takes precedence at the start. If the motion later animates it,
	// the interpolated value wins.
	let val = opacity;
	if (inlineN !== null && !calls.some(c => c.el === el.el && 'opacity' in c.keyframes)) {
		val = inlineN;
	}
	const vis = el.el.style.visibility;
	if (vis === 'hidden') return 0;
	return val * base;
}

// Sample N timesteps evenly across the motion's duration. Returns any
// overlap detected, with the offender pair and the timestep.
export function assertNoOverlapAcross(
	scene: Scene,
	samples: number,
): void {
	const total = totalMotionMs > 0 ? totalMotionMs : 1;
	for (let s = 0; s <= samples; s++) {
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

// Helpers for scene setup.
export function makeMockElement(
	id: string,
	rect: Rect,
	opts?: { initialOpacity?: number; initialVisibility?: string },
): SceneElement {
	const el = document.createElement('div');
	if (opts?.initialOpacity !== undefined) el.style.opacity = String(opts.initialOpacity);
	if (opts?.initialVisibility) el.style.visibility = opts.initialVisibility;
	// Mock getBoundingClientRect so the motion's measurements use our rect.
	el.getBoundingClientRect = function (): DOMRect {
		// Return the rect adjusted by the current inline transform — the
		// motion measures live, and may translate before measuring.
		const tx = parseInlineTranslateX(el.style.transform);
		const ty = parseInlineTranslateY(el.style.transform);
		const w = rect.right - rect.left;
		const h = rect.bottom - rect.top;
		const left = rect.left + tx;
		const top = rect.top + ty;
		return {
			left,
			top,
			right: left + w,
			bottom: top + h,
			width: w,
			height: h,
			x: left,
			y: top,
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

export function makeScene(elements: SceneElement[]): Scene {
	const byEl = new Map<HTMLElement, SceneElement>();
	for (const e of elements) byEl.set(e.el, e);
	return { elements, byEl };
}
