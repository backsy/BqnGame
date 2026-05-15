// Parametrised no-overlap test for the enclose (`<x`) motion.
//
// For each supported input shape (scalar, vector, matrix), build a
// scene with one input cell at the stage centre and a crate at its
// natural slot, install the animate mock, run encloseMonadic, then
// sample N timesteps across the recorded motion timeline and assert
// that no two visible rectangles overlap at any sample.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Step } from '../step';
import type { Rect } from '../geometry';
import {
	assertNoOverlapAcross,
	getTotalMotionMs,
	installAnimateMock,
	makeMockElement,
	makeScene,
	resetMotionTime,
} from './overlap-harness';

const BAR_WIDTH = 24;
const CRATE_SIZE = 56;
const STAGE_CENTER_X = 480;
const STAGE_CENTER_Y = 300;

// Build before/after roots wrapping the cells, then place them at
// the stage centre (input rect and crate rect both centred at the
// stage's middle, matching what the harness's centred prepare()
// produces).
function rectCentred(cx: number, cy: number, w: number, h: number): Rect {
	return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

type EncloseScene = {
	beforeRoot: HTMLElement;
	afterRoot: HTMLElement;
	step: Step;
};

function buildEncloseScene(input: { kind: 'number'; value: number } | { kind: 'array'; shape: number[]; data: number[] }): EncloseScene {
	// Input element: a bar (24 wide × value-derived height) inside a row.
	const inputCellRect = rectCentred(STAGE_CENTER_X, STAGE_CENTER_Y, BAR_WIDTH, 58);
	const inputCell = makeMockElement('inputCell', inputCellRect).el;

	const beforeRoot = document.createElement('div');
	beforeRoot.appendChild(inputCell);
	// beforeRoot's own rect — not strictly needed for the overlap check,
	// but we provide it for completeness.
	(beforeRoot as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () => {
		const r = inputCellRect;
		return { ...r, width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect;
	};

	// Crate element: a 56×56 square at the stage centre (its natural slot
	// after stage.prepare puts afterRoot at top:50%/left:50% translate).
	const crateRect = rectCentred(STAGE_CENTER_X, STAGE_CENTER_Y, CRATE_SIZE, CRATE_SIZE);
	const crate = makeMockElement('crate', crateRect, { initialVisibility: '' }).el;
	// Add a .bqn-box-content child since encloseMonadic looks it up.
	const content = document.createElement('div');
	content.className = 'bqn-box-content';
	crate.appendChild(content);

	const afterRoot = document.createElement('div');
	afterRoot.appendChild(crate);
	(afterRoot as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect = () => {
		const r = crateRect;
		return { ...r, width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect;
	};

	// Step.x is the input value; step.result is the boxed value.
	const xValue = input as unknown as Step extends { kind: 'monadic'; x: infer X } ? X : never;
	const step: Step = {
		kind: 'monadic',
		fn: { kind: 'enclose' },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		x: xValue as any,
		result: { kind: 'array', shape: [], data: [xValue] } as unknown as Step extends { kind: 'monadic'; result: infer R } ? R : never,
	};
	return { beforeRoot, afterRoot, step };
}

describe('encloseMonadic — no-overlap invariant', () => {
	beforeEach(() => {
		resetMotionTime();
		installAnimateMock();
		vi.resetModules();
	});

	afterEach(() => {
		vi.doUnmock('motion');
	});

	const cases: Array<{ name: string; input: { kind: 'number'; value: number } | { kind: 'array'; shape: number[]; data: number[] } }> = [
		{ name: 'scalar number',              input: { kind: 'number', value: 5 } },
		{ name: '1D vector ⟨3 1 4⟩',          input: { kind: 'array', shape: [3], data: [3, 1, 4] } },
		{ name: '2×3 matrix',                 input: { kind: 'array', shape: [2, 3], data: [1, 2, 3, 4, 5, 6] } },
		{ name: 'rank-0 box (already boxed)', input: { kind: 'array', shape: [], data: [5] } },
	];

	for (const c of cases) {
		test(c.name, async () => {
			const scene = buildEncloseScene(c.input);
			const { encloseMonadic } = await import('../motions/distributing');
			await encloseMonadic(scene.step, scene.beforeRoot, scene.afterRoot);

			expect(getTotalMotionMs()).toBeGreaterThan(0);
			const inputElement = scene.beforeRoot.firstElementChild as HTMLElement;
			const crateElement = scene.afterRoot.firstElementChild as HTMLElement;
			const sceneObj = makeScene([
				{
					id: 'input',
					el: inputElement,
					naturalRect: rectCentred(STAGE_CENTER_X, STAGE_CENTER_Y, BAR_WIDTH, 58),
					initialOpacity: 1,
				},
				{
					id: 'crate',
					el: crateElement,
					naturalRect: rectCentred(STAGE_CENTER_X, STAGE_CENTER_Y, CRATE_SIZE, CRATE_SIZE),
					initialOpacity: 1,
				},
			]);
			assertNoOverlapAcross(sceneObj, 60);
		});
	}
});
