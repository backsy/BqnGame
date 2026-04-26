// Sanity-check that every level's target is reachable from its start
// using only the listed runes via at least one tap-sequence (BFS over
// rune applications, capped depth). Run with:
//   node --experimental-strip-types scripts/verify-levels.mjs

import { compile, run, fmt, unstr } from '../src/lib/bqn/vendor/bqn.js';
import { levels } from '../src/lib/learn/levels.ts';

const evalRaw = (src) => run(...compile(src));
const matches = (a, b) => {
	try {
		return evalRaw(`(${a}) ≡ (${b})`) === 1;
	} catch {
		return false;
	}
};
const toJs = (v) =>
	v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? unstr(v) : String(v);

const MAX_DEPTH = 6;

let totalOk = 0;
let totalBad = 0;

for (const level of levels) {
	const seen = new Set();
	const start = level.start;
	let found = null;
	const queue = [{ expr: start, path: [] }];
	while (queue.length) {
		const { expr, path } = queue.shift();
		if (matches(expr, level.target)) {
			found = path;
			break;
		}
		if (path.length >= MAX_DEPTH) continue;
		for (const rune of level.runes) {
			const next = `(${rune.expr}) (${expr})`;
			let key;
			try {
				key = toJs(fmt(evalRaw(next)));
			} catch {
				continue;
			}
			if (seen.has(key)) continue;
			seen.add(key);
			queue.push({ expr: next, path: [...path, rune.glyph] });
		}
	}

	if (found) {
		totalOk++;
		console.log(`Level ${level.id} OK in ${found.length} taps: [${found.join(', ')}]`);
	} else {
		totalBad++;
		console.log(`Level ${level.id} UNREACHABLE within ${MAX_DEPTH} taps`);
	}
}

console.log(`\n${totalOk} ok, ${totalBad} unreachable`);
if (totalBad > 0) process.exit(1);
