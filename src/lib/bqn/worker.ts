/// <reference lib="webworker" />

// Real BQN worker. Wraps the self-hosted JavaScript BQN interpreter from
// mlochbaum/BQN (docs/bqn.js, vendored under ./vendor with an ESM export
// layer added — see vendor/bqn.js for the exact upstream source).
//
// Two request kinds:
//   - 'eval':            returns fmt(result) as a JS string. For REPL-style
//                        callers that want BQN's own pretty-printed output.
//   - 'eval-structured': walks the post-eval BQN value and returns a
//                        structured snapshot (shape + numeric data) for
//                        callers that need to render or animate the value.
//                        NO custom evaluation — the value comes from real
//                        BQN; we only re-shape its representation for the
//                        wire.

import { compile, run, fmt, fmtErr, unstr } from './vendor/bqn.js';
import type { Request, Response, BqnStructuredValue } from './protocol';

const ctx = self as DedicatedWorkerGlobalScope;
const post = (msg: Response) => ctx.postMessage(msg);

// fmt / fmtErr return BQN strings, which in this runtime are JS arrays of
// single-char strings with extra shape metadata. unstr joins them back into
// a plain JS string. Guard against the occasional non-array (e.g. plain
// string from an internal path) so we don't throw during error reporting.
function toJs(v: unknown): string {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return unstr(v);
	return String(v);
}

// Walk a BQN runtime value into a structured snapshot. BQN's value model in
// the vendored JS interpreter:
//   - number   → JS number
//   - char     → JS string of length 1
//   - function → callable JS function (we don't introspect, just label)
//   - array    → JS array with .sh (shape) attached as a property
//   - ns       → plain object with .ns flag
function structurize(v: unknown): BqnStructuredValue {
	if (typeof v === 'number') return { kind: 'number', value: v };
	if (typeof v === 'string') {
		// BQN single-char string. Arrays of chars (BQN strings) are caught by
		// the Array.isArray branch and carry their own shape.
		return { kind: 'char', value: v };
	}
	if (Array.isArray(v)) {
		const arr = v as unknown[] & { sh?: number[] };
		const shape = Array.isArray(arr.sh) ? [...arr.sh] : [arr.length];
		const data = arr.map(structurize);
		return { kind: 'array', shape, data };
	}
	if (typeof v === 'function') return { kind: 'fn' };
	if (v && typeof v === 'object' && (v as { ns?: unknown }).ns) {
		return { kind: 'namespace' };
	}
	// Unknown — surface as a generic empty namespace so the wire type stays
	// well-formed; callers can detect via valuesEqual.
	return { kind: 'namespace' };
}

ctx.addEventListener('message', (e: MessageEvent<Request>) => {
	const req = e.data;
	const src = req.source;
	if (!src.trim()) {
		post({ id: req.id, kind: 'error', message: 'empty input' });
		return;
	}

	try {
		const compiled = compile(src);
		const result = run(...compiled);
		if (req.kind === 'eval') {
			const formatted = fmt(result);
			post({ id: req.id, kind: 'ok', value: toJs(formatted) });
		} else if (req.kind === 'eval-structured') {
			post({ id: req.id, kind: 'ok-structured', value: structurize(result) });
		}
	} catch (err) {
		let message: string;
		try {
			message = toJs(fmtErr(err));
		} catch {
			message = err instanceof Error ? err.message : String(err);
		}
		post({ id: req.id, kind: 'error', message });
	}
});
