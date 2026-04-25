// One-shot verifier: evaluates every example declared on a Primitive against
// vendor/bqn.js and reports any mismatches. Run after editing examples:
//
//   node --experimental-strip-types scripts/verify-examples.mjs
//
// Exits non-zero on any mismatch so we can add this to CI later if we want.

import { compile, run, fmt, unstr } from '../src/lib/bqn/vendor/bqn.js';
import { primitives } from '../src/lib/primitives.ts';

const toJs = (v) =>
	v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? unstr(v) : String(v);

let ok = 0;
let bad = 0;

const entries = [
	...primitives.fn,
	...primitives.mod1,
	...primitives.mod2,
	...primitives.sym
];

for (const p of entries) {
	if (!p.examples?.length) continue;
	for (const ex of p.examples) {
		let actual;
		try {
			actual = toJs(fmt(run(...compile(ex.source))));
		} catch (e) {
			actual = `ERR ${toJs(e.message ?? e)}`;
		}
		const match = actual === ex.result;
		if (match) ok++;
		else bad++;
		console.log(
			`${match ? 'OK ' : 'FIX'}  ${p.glyph}  ${ex.source.padEnd(24)} -> ${JSON.stringify(actual)}${match ? '' : `   (expected ${JSON.stringify(ex.result)})`}`
		);
	}
}

console.log(`\n${ok} ok, ${bad} mismatched`);
if (bad > 0) process.exit(1);
