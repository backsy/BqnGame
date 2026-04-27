// Sanity-check that every level's target is reachable from its start
// using only the listed runes via at least one tap-sequence (BFS over
// rune applications, capped depth). Run with:
//   node --experimental-strip-types scripts/verify-levels.mjs
//
// The vendored BQN interpreter retains state across many evaluations,
// so we run each level in a fresh child process to keep memory bounded.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { levels } from '../src/lib/learn/levels.ts';

const here = dirname(fileURLToPath(import.meta.url));
const worker = resolve(here, 'verify-level-worker.mjs');

let totalOk = 0;
let totalBad = 0;

for (const level of levels) {
	const res = spawnSync(
		process.execPath,
		['--experimental-strip-types', worker],
		{
			input: JSON.stringify(level),
			encoding: 'utf8',
			maxBuffer: 8 * 1024 * 1024,
			timeout: 15000
		}
	);
	const out = (res.stdout || '').trim();
	if (res.status !== 0 || !out) {
		totalBad++;
		console.log(
			`Level ${level.id} CRASHED (status=${res.status}, signal=${res.signal})`
		);
		continue;
	}
	const last = out.split('\n').pop();
	let parsed;
	try {
		parsed = JSON.parse(last);
	} catch {
		totalBad++;
		console.log(`Level ${level.id} BAD-OUTPUT: ${last.slice(0, 120)}`);
		continue;
	}
	if (parsed.found) {
		totalOk++;
		console.log(
			`Level ${level.id} OK in ${parsed.found.length} taps: [${parsed.found.join(', ')}]`
		);
	} else {
		totalBad++;
		console.log(
			`Level ${level.id} ${parsed.exhausted ? 'EXHAUSTED' : 'UNREACHABLE'} (${parsed.seen} states explored)`
		);
	}
}

console.log(`\n${totalOk} ok, ${totalBad} unreachable`);
if (totalBad > 0) process.exit(1);
