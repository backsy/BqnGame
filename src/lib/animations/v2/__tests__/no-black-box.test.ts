// Black-box is the *default* — the fallback we accept for operations we
// haven't choreographed yet. Every entry in this registry, by contrast, is
// a motion that claims to own its visual story for the listed inputs.
//
// This test verifies that claim: for each (motion × input) pair, the
// production blackBox export is replaced with a spy via vi.doMock, the
// motion runs, and we assert the spy was never called. If the motion
// bailed internally (shape mismatch, non-numeric cells, beforeRoot.children
// not matching the assumed flat layout, …), the spy fires and the test
// fails pointing at the exact (op, input) combination.
//
// Why this is a separate test from all-motions.test.ts:
// Black-box fades beforeRoot.opacity → 0, which makes the no-overlap,
// smooth-motion, and handoff-alignment invariants in that file vacuous —
// a silently-black-boxed motion looks like it passes them all. This test
// closes that loophole at the source: no animation we've registered is
// allowed to fall back to the default.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FnExpr } from '../fn-expr';
import type { Step } from '../step';
import type { BqnValue } from '../value';
import { getTotalMotionMs, installAnimateMock, resetMotionTime } from './overlap-harness';
import { buildSceneFor, evalBqn } from './scene';

const STAGE_BEFORE_CX = 480;
const STAGE_BEFORE_CY = 300;
const STAGE_AFTER_CX  = 480;
const STAGE_AFTER_CY  = 300;

// ── Input fixtures ────────────────────────────────────────────────────────
// Same shape as all-motions.test.ts. Kept inline (not imported from a
// shared module) so this file can fail on its own without depending on
// the other test file's internals.
const SCALAR   = { name: 'scalar 5',     source: '5',                 build: () => evalBqn('5') };
const VEC_SM   = { name: 'vector ⟨3 1 4⟩', source: '3‿1‿4',            build: () => evalBqn('3‿1‿4') };
const VEC_5    = { name: 'vector ⟨3 1 4 1 5⟩', source: '3‿1‿4‿1‿5',   build: () => evalBqn('3‿1‿4‿1‿5') };
const MATRIX   = { name: 'matrix 2×3',   source: '2‿3⥊1‿2‿3‿4‿5‿6',  build: () => evalBqn('2‿3⥊1‿2‿3‿4‿5‿6') };

type Input = typeof SCALAR;

type MotionCase = {
	name: string;
	fn: FnExpr;
	arity: 'monadic' | 'dyadic';
	w?: BqnValue;
	source: (inputLit: string) => string;
	inputs: Input[];
};

const W2: BqnValue = { kind: 'number', value: 2 };

// Mirrors the registry in all-motions.test.ts. Every entry is a motion
// that should NOT need blackBox for the listed inputs. If we add a new
// motion that handles a new shape, add the (motion × input) row here so
// the no-fall-through guarantee is enforced from day one.
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
	// sizing
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

// ─────────────────────────────────────────────────────────────────────────
// Architectural invariant: motions are SIBLINGS of blackBox at the dispatch
// level, not parents of it. The dispatcher in animate.ts picks one or the
// other based on the step's signature; a motion never nests a fallback
// `return blackBox(...)` inside itself.
//
// This test reads every file in motions/ (except black-box.ts itself) and
// asserts the source code contains no reference to `blackBox`. If a motion
// can't handle a particular input, it must signal that upward (return early
// with no animate calls; the dispatcher catches that) — NOT reach across
// and invoke the fallback itself. The current dynamic test below ("every
// registered motion runs without falling back to blackBox") catches the
// runtime symptom; this static test catches the architectural cause.
//
// Currently most motion files violate this — they all `import { blackBox }
// from './black-box.js'` and bail to it on shape mismatches. That's the
// pattern we're declaring incorrect; one failure per file pinpoints what
// has to migrate to dispatcher-level dispatch.
// ─────────────────────────────────────────────────────────────────────────

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const motionsDir = join(__dirname_, '..', 'motions');
const motionFiles = readdirSync(motionsDir)
	.filter(f => f.endsWith('.ts') && f !== 'black-box.ts')
	.sort();

describe('motions do not reference blackBox (it is a sibling at dispatch, not a nested fallback)', () => {
	for (const file of motionFiles) {
		test(`${file}`, () => {
			const src = readFileSync(join(motionsDir, file), 'utf8');
			// Strip block + line comments so a doc that mentions "blackBox"
			// for explanatory reasons doesn't trip the check. We're only
			// interested in references in executable code.
			const stripped = src
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/\/\/[^\n]*/g, '');
			const offenders: number[] = [];
			const strippedLines = stripped.split('\n');
			for (let i = 0; i < strippedLines.length; i++) {
				if (/\bblackBox\b/.test(strippedLines[i])) offenders.push(i + 1);
			}
			expect(
				offenders,
				`${file} references blackBox on lines ${offenders.join(', ')}. ` +
					`Motions are at the same dispatch level as blackBox — animate.ts ` +
					`picks one or the other based on the step's signature. If this ` +
					`motion can't handle the shape it receives, return early without ` +
					`animating; the dispatcher's choice of blackBox is the fallback. ` +
					`Don't nest the fallback inside the motion.`,
			).toEqual([]);
		});
	}
});

describe('every registered motion runs without falling back to blackBox', () => {
	beforeEach(() => {
		resetMotionTime();
		installAnimateMock();
		vi.resetModules();
	});

	afterEach(() => {
		vi.doUnmock('motion');
		vi.doUnmock('../motions/black-box');
	});

	for (const m of MOTIONS) {
		for (const input of m.inputs) {
			test(`${m.name} on ${input.name}`, async () => {
				const xVal = input.build();
				const resultVal = evalBqn(m.source(bqnLiteral(xVal)));
				const { root: beforeRoot } = buildSceneFor(xVal, STAGE_BEFORE_CX, STAGE_BEFORE_CY, 'before');
				const { root: afterRoot } = buildSceneFor(resultVal, STAGE_AFTER_CX, STAGE_AFTER_CY, 'after');

				const step: Step = m.arity === 'monadic'
					? { kind: 'monadic', fn: m.fn, x: xVal, result: resultVal }
					: { kind: 'dyadic', fn: m.fn, w: m.w!, x: xVal, result: resultVal };

				// Spy on blackBox. Returning a resolved promise keeps any
				// downstream `await` in the motion happy without running the
				// real choreography (which we don't care about — only whether
				// it was reached). Tracks the step kind for error context.
				const blackBoxSpy = vi.fn(async () => {});
				vi.doMock('../motions/black-box', () => ({ blackBox: blackBoxSpy }));

				const { animateStep } = await import('../animate');
				await animateStep(step)(step, beforeRoot, afterRoot);

				expect(
					blackBoxSpy,
					`'${m.name} on ${input.name}' fell through to blackBox — the motion ` +
						`registered for this op silently bailed for this input shape. ` +
						`Either the motion needs to handle this shape, or this ` +
						`(motion × input) row should be removed from the registry.`,
				).not.toHaveBeenCalled();

				// Belt-and-braces: a motion can also weasel around the
				// blackBox check by hitting an internal early-return that
				// doesn't call blackBox and doesn't animate anything (e.g.
				// `if (cells.length === 0) { afterRoot.style.opacity = '';
				// return; }`). The spy never fires, but nothing visual
				// happens either — the user sees an instant snap. Require
				// at least one tracked `animate()` call to prove the motion
				// actually choreographed something.
				expect(
					getTotalMotionMs(),
					`'${m.name} on ${input.name}' produced zero animate() calls — the ` +
						`motion silently returned without choreographing anything. The ` +
						`spy didn't catch a blackBox fall-through, but nothing animated ` +
						`either, so the user would see an instant snap.`,
				).toBeGreaterThan(0);
			});
		}
	}
});
