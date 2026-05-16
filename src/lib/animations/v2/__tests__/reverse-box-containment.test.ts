// Reverse-specific containment invariant: at every point in the motion,
// every leaf cell (.bar) must stay inside the array's outer box
// (.bqn-vector). The cell may move, rotate, shrink — but its rect must
// never poke past the box's top, bottom, left, or right edges.
//
// What this catches: the bug where Phase 3's height regrowth, combined
// with the row's 180° rotation, sends bars sliding past the box's
// screen-top edge as they grow back. Visually that's "the elements
// grow upward and out of the box around them"; geometrically it's a
// cell rect whose top is above the box rect's top.
//
// Why it's a separate file from all-motions.test.ts: this invariant is
// stricter than the no-overlap / smooth-motion / handoff-alignment
// trio in that file. Those all reason about cells against each other
// or against the after-scene; this one reasons about a cell against
// its containing box. Adding it to the shared registry would force
// every motion to satisfy it on day one; for now it's scoped to
// reverse to lock down the regression we just saw.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BqnValue } from '../value';
import { installAnimateMock, resetMotionTime } from './overlap-harness';
import { buildSceneFor, evalBqn } from './scene';

const STAGE_CX = 480;
const STAGE_CY = 300;
const CONTAIN_TOLERANCE = 1;

const VECTORS: Array<{ name: string; source: string }> = [
	{ name: '⟨3 1 4⟩',       source: '3‿1‿4' },
	{ name: '⟨3 1 4 1 5⟩',   source: '3‿1‿4‿1‿5' },
];

describe('reverse: cells stay inside the array box', () => {
	beforeEach(() => {
		resetMotionTime();
		installAnimateMock();
		vi.resetModules();
	});

	afterEach(() => {
		vi.doUnmock('motion');
	});

	for (const v of VECTORS) {
		test(`reverse on ${v.name}`, async () => {
			const xVal: BqnValue = evalBqn(v.source);
			const resultVal: BqnValue = evalBqn(`⌽${v.source}`);
			const { root: beforeRoot } = buildSceneFor(xVal, STAGE_CX, STAGE_CY, 'before');
			const { root: afterRoot } = buildSceneFor(resultVal, STAGE_CX, STAGE_CY, 'after');

			const step = { kind: 'monadic' as const, fn: { kind: 'reverse' as const }, x: xVal, result: resultVal };
			const { animateStep } = await import('../animate');
			await animateStep(step)(step, beforeRoot, afterRoot);

			// At end of motion, every leaf cell's screen rect must sit
			// inside the box's screen rect. Both rects come from the mock's
			// getBoundingClientRect, which respects inline transforms set
			// by motion's final keyframe snapshot AND walks the ancestor
			// chain to apply each parent's rotation — so a cell that has
			// been pushed past the rotated box's edge surfaces here exactly
			// as the user would see it.
			const boxRect = beforeRoot.getBoundingClientRect();
			const bars = Array.from(beforeRoot.querySelectorAll('.bar')) as HTMLElement[];
			const violations: string[] = [];
			for (let i = 0; i < bars.length; i++) {
				const r = bars[i].getBoundingClientRect();
				const sides: string[] = [];
				if (r.top    < boxRect.top    - CONTAIN_TOLERANCE) sides.push(`top ${r.top.toFixed(1)} above box.top ${boxRect.top.toFixed(1)} (by ${(boxRect.top - r.top).toFixed(1)}px)`);
				if (r.bottom > boxRect.bottom + CONTAIN_TOLERANCE) sides.push(`bottom ${r.bottom.toFixed(1)} below box.bottom ${boxRect.bottom.toFixed(1)} (by ${(r.bottom - boxRect.bottom).toFixed(1)}px)`);
				if (r.left   < boxRect.left   - CONTAIN_TOLERANCE) sides.push(`left ${r.left.toFixed(1)} past box.left ${boxRect.left.toFixed(1)} (by ${(boxRect.left - r.left).toFixed(1)}px)`);
				if (r.right  > boxRect.right  + CONTAIN_TOLERANCE) sides.push(`right ${r.right.toFixed(1)} past box.right ${boxRect.right.toFixed(1)} (by ${(r.right - boxRect.right).toFixed(1)}px)`);
				if (sides.length > 0) {
					violations.push(`cell[${i}] (rect [${r.left.toFixed(1)},${r.top.toFixed(1)} → ${r.right.toFixed(1)},${r.bottom.toFixed(1)}]): ${sides.join('; ')}`);
				}
			}
			expect(
				violations,
				`Reverse on ${v.name} — cells escaped the array box at end of motion.\n` +
					`Box rect: [${boxRect.left.toFixed(1)},${boxRect.top.toFixed(1)} → ${boxRect.right.toFixed(1)},${boxRect.bottom.toFixed(1)}].\n` +
					`Violations:\n  ${violations.join('\n  ')}`,
			).toEqual([]);
		});
	}
});
