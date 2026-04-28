// Worker for verify-levels.mjs. Reads a single level as JSON on stdin,
// runs a depth-limited BFS over rune applications, prints a single
// JSON line summarising the result on stdout.
//
// We pre-check the input value before each rune application because
// `↕` on a length-n list of naturals k_i builds a rank-n array of size
// ∏k_i — easy to overflow before any post-eval prune can catch it.

import { compile, run, fmt, unstr } from '../src/lib/bqn/vendor/bqn.js';

const evalRaw = (src) => run(...compile(src));
const toJs = (v) =>
	v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? unstr(v) : String(v);

const MAX_DEPTH = 5;
const MAX_STATES = 5000;
const TIMEOUT_MS = 20000;
const MAX_KEY_LEN = 300;
const MAX_ARRAY_SIZE = 64;

const raw = await new Promise((res) => {
	let buf = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', (c) => (buf += c));
	process.stdin.on('end', () => res(buf));
});
const level = JSON.parse(raw);

function arrSize(v) {
	if (!Array.isArray(v)) return 1;
	const sh = v.sh ?? [v.length];
	let total = 1;
	for (const d of sh) total *= d;
	return total;
}

// Would (↕) (value) explode? `↕⟨k₀,k₁,…⟩` builds a rank-n array of size ∏kᵢ.
function rangeWouldExplode(value) {
	if (!Array.isArray(value)) return false;
	let prod = 1;
	for (const x of value) {
		if (typeof x !== 'number' || x < 0 || !Number.isFinite(x)) return false;
		prod *= x;
		if (prod > MAX_ARRAY_SIZE) return true;
	}
	return false;
}

let startVal;
try {
	startVal = evalRaw(level.start);
} catch {
	process.stdout.write(JSON.stringify({ found: null, exhausted: false, seen: 0 }) + '\n');
	process.exit(0);
}
const targetKey = toJs(fmt(evalRaw(level.target)));

const seen = new Set();
const queue = [{ expr: level.start, value: startVal, path: [] }];
const startKey = toJs(fmt(startVal));
seen.add(startKey);

const deadline = Date.now() + TIMEOUT_MS;
let found = startKey === targetKey ? [] : null;
let exhausted = false;

while (!found && queue.length) {
	if (Date.now() > deadline || seen.size > MAX_STATES) {
		exhausted = true;
		break;
	}
	const { expr, value, path } = queue.shift();
	if (path.length >= MAX_DEPTH) continue;
	for (const rune of level.runes) {
		// Pre-prune dangerous rune/value combinations before evaluation.
		if (rune.expr === '↕' && rangeWouldExplode(value)) continue;
		const next = `(${rune.expr}) (${expr})`;
		let v, key;
		try {
			v = evalRaw(next);
			if (Array.isArray(v) && arrSize(v) > MAX_ARRAY_SIZE) continue;
			key = toJs(fmt(v));
		} catch {
			continue;
		}
		if (key.length > MAX_KEY_LEN) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		const newPath = [...path, rune.glyph];
		if (key === targetKey) {
			found = newPath;
			break;
		}
		queue.push({ expr: next, value: v, path: newPath });
	}
}

process.stdout.write(JSON.stringify({ found, exhausted, seen: seen.size }) + '\n');
