// One test, all motions, all input shapes.
//
// For each (operation × input) case:
//   1. Evaluate the BQN source with the real interpreter to get the
//      result value (no custom eval).
//   2. Build before/after DOM scenes from the input and result.
//   3. Construct the Step the production harness would dispatch.
//   4. Dispatch via animateStep, ship through the mocked animate.
//   5. Sample 60 timesteps; assert no two visible rectangles overlap.
//
// The motion registry is intentionally exhaustive — every wired motion,
// every input shape it can legitimately receive. Adding a new motion =
// add a row here; the harness handles the rest. Failures point at the
// concrete (operation, input, timestep, offender pair) so it's obvious
// which case broke.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FnExpr } from '../fn-expr';
import type { Step } from '../step';
import type { BqnValue } from '../value';
import {
	assertNoOverlapAcross,
	assertSmoothMotion,
	getTotalMotionMs,
	installAnimateMock,
	makeScene,
	resetMotionTime,
} from './overlap-harness';
import { buildSceneFor, evalBqn } from './scene';

const STAGE_BEFORE_CX = 480;
const STAGE_BEFORE_CY = 300;
const STAGE_AFTER_CX  = 480;
const STAGE_AFTER_CY  = 300;
const SAMPLES = 60;

// ── Input fixtures ────────────────────────────────────────────────────────
const SCALAR   = { name: 'scalar 5',     source: '5',                 build: () => evalBqn('5') };
const VEC_SM   = { name: 'vector ⟨3 1 4⟩', source: '3‿1‿4',            build: () => evalBqn('3‿1‿4') };
const VEC_5    = { name: 'vector ⟨3 1 4 1 5⟩', source: '3‿1‿4‿1‿5',   build: () => evalBqn('3‿1‿4‿1‿5') };
const MATRIX   = { name: 'matrix 2×3',   source: '2‿3⥊1‿2‿3‿4‿5‿6',  build: () => evalBqn('2‿3⥊1‿2‿3‿4‿5‿6') };

type Input = typeof SCALAR;

// ── Motion registry ───────────────────────────────────────────────────────
// Each entry:
//   - name: human label
//   - fn:    the FnExpr to dispatch on (animateStep picks the motion)
//   - arity: 'monadic' or 'dyadic'
//   - w?:    bound left value when arity is dyadic
//   - xForStep?: bound right value (for bind-right unwraps); defaults to the input
//   - source: BQN source template; receives the input's BQN literal
//   - inputs: which input fixtures this motion applies to
//   - skip?:  case-by-case skip reasons (e.g. transpose only on matrix)
type MotionCase = {
	name: string;
	fn: FnExpr;
	arity: 'monadic' | 'dyadic';
	w?: BqnValue;
	xLiteralFor?: (inputLit: string) => string;       // override the "X" position in source
	source: (inputLit: string) => string;
	inputs: Input[];
};

const W2: BqnValue = { kind: 'number', value: 2 };

const MOTIONS: MotionCase[] = [
	// lateral
	{ name: 'reverse',   fn: { kind: 'reverse' },   arity: 'monadic', source: x => `⌽${x}`, inputs: [VEC_SM, VEC_5, MATRIX] },
	{ name: 'sort-up',   fn: { kind: 'sort-up' },   arity: 'monadic', source: x => `∧${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: 'sort-down', fn: { kind: 'sort-down' }, arity: 'monadic', source: x => `∨${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '2⌽',        fn: { kind: 'rotate' },    arity: 'dyadic', w: W2, source: x => `2⌽${x}`, inputs: [VEC_5] },
	{ name: 'transpose', fn: { kind: 'transpose' }, arity: 'monadic', source: x => `⍉${x}`, inputs: [MATRIX] },
	// vertical
	{ name: '2↑',        fn: { kind: 'take' }, arity: 'dyadic', w: W2, source: x => `2↑${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '2↓',        fn: { kind: 'drop' }, arity: 'dyadic', w: W2, source: x => `2↓${x}`, inputs: [VEC_SM, VEC_5] },
	// sizing — same gesture on any element-bearing input
	{ name: '2+',        fn: { kind: 'add' },  arity: 'dyadic', w: W2, source: x => `2+${x}`, inputs: [VEC_SM, VEC_5, MATRIX] },
	{ name: '2-',        fn: { kind: 'sub' },  arity: 'dyadic', w: W2, source: x => `2-${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '2×',        fn: { kind: 'mul' },  arity: 'dyadic', w: W2, source: x => `2×${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '2÷',        fn: { kind: 'div' },  arity: 'dyadic', w: W2, source: x => `2÷${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: 'neg',       fn: { kind: 'neg' },  arity: 'monadic', source: x => `-${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: 'abs',       fn: { kind: 'abs' },  arity: 'monadic', source: x => `|${x}`, inputs: [VEC_SM, VEC_5] },
	// comparison
	{ name: '2=',        fn: { kind: 'eq' },   arity: 'dyadic', w: W2, source: x => `2=${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '2>',        fn: { kind: 'gt' },   arity: 'dyadic', w: W2, source: x => `2>${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '2<',        fn: { kind: 'lt' },   arity: 'dyadic', w: W2, source: x => `2<${x}`, inputs: [VEC_SM, VEC_5] },
	// merging
	{ name: '+´',        fn: { kind: 'fold', over: { kind: 'add' } }, arity: 'monadic', source: x => `+´${x}`, inputs: [VEC_SM, VEC_5] },
	{ name: '×´',        fn: { kind: 'fold', over: { kind: 'mul' } }, arity: 'monadic', source: x => `×´${x}`, inputs: [VEC_SM] },
	{ name: '+`',        fn: { kind: 'scan', over: { kind: 'add' } }, arity: 'monadic', source: x => `+\`${x}`, inputs: [VEC_SM, VEC_5] },
	// distributing
	{ name: '↕',         fn: { kind: 'range' },     arity: 'monadic', source: x => `↕${x}`, inputs: [SCALAR] },
	{ name: '<',         fn: { kind: 'enclose' },   arity: 'monadic', source: x => `<${x}`, inputs: [SCALAR, VEC_SM, MATRIX] },
	// structural
	{ name: 'first',     fn: { kind: 'first' },   arity: 'monadic', source: x => `⊑${x}`, inputs: [VEC_SM, VEC_5, MATRIX] },
	{ name: 'length',    fn: { kind: 'length' },  arity: 'monadic', source: x => `≠${x}`, inputs: [SCALAR, VEC_SM, VEC_5, MATRIX] },
	{ name: 'shape',     fn: { kind: 'shape' },   arity: 'monadic', source: x => `≢${x}`, inputs: [SCALAR, VEC_SM, VEC_5, MATRIX] },
	{ name: 'rank-of',   fn: { kind: 'rank-of' }, arity: 'monadic', source: x => `=${x}`, inputs: [SCALAR, VEC_SM, VEC_5, MATRIX] },
	{ name: 'solo',      fn: { kind: 'solo' },    arity: 'monadic', source: x => `≍${x}`, inputs: [SCALAR, VEC_SM, MATRIX] },
];

function bqnLiteral(v: BqnValue): string {
	if (v.kind === 'number') return v.value < 0 ? `¯${Math.abs(v.value)}` : String(v.value);
	if (v.kind === 'char') return `'${v.value}'`;
	if (v.kind === 'array') {
		if (v.shape.length === 0 && v.data.length === 1) return `<${bqnLiteral(v.data[0])}`;
		if (v.shape.length === 1) {
			if (v.data.length === 0) return '⟨⟩';
			if (v.data.length === 1) return `⟨${bqnLiteral(v.data[0])}⟩`;
			return v.data.map(bqnLiteral).join('‿');
		}
		if (v.shape.length === 2) {
			return `${v.shape[0]}‿${v.shape[1]}⥊${v.data.map(bqnLiteral).join('‿')}`;
		}
	}
	throw new Error(`bqnLiteral: cannot serialise kind=${v.kind}`);
}

describe('all motions — no-overlap invariant across input shapes', () => {
	beforeEach(() => {
		resetMotionTime();
		installAnimateMock();
		vi.resetModules();
	});

	afterEach(() => {
		vi.doUnmock('motion');
	});

	for (const m of MOTIONS) {
		for (const input of m.inputs) {
			test(`${m.name} on ${input.name}`, async () => {
				const xVal = input.build();
				const src = m.source(bqnLiteral(xVal));
				const resultVal = evalBqn(src);
				const { root: beforeRoot, cells: beforeCells } = buildSceneFor(xVal, STAGE_BEFORE_CX, STAGE_BEFORE_CY, 'before');
				const { root: afterRoot,  cells: afterCells  } = buildSceneFor(resultVal, STAGE_AFTER_CX, STAGE_AFTER_CY, 'after');

				const step: Step = m.arity === 'monadic'
					? { kind: 'monadic', fn: m.fn, x: xVal, result: resultVal }
					: { kind: 'dyadic', fn: m.fn, w: m.w!, x: xVal, result: resultVal };

				const { animateStep } = await import('../animate');
				await animateStep(step)(step, beforeRoot, afterRoot);
				expect(getTotalMotionMs()).toBeGreaterThan(0);

				// After-cells are visibility:hidden in production until the
				// motion explicitly reveals them at handoff. Mark them
				// invisible-by-default so the overlap harness treats them
				// as not-on-screen unless a tracked opacity animation
				// brings them up.
				for (const cell of afterCells) cell.initialOpacity = 0;

				const scene = makeScene([...beforeCells, ...afterCells]);
				assertNoOverlapAcross(scene, SAMPLES);
				assertSmoothMotion(scene);
			});
		}
	}
});
