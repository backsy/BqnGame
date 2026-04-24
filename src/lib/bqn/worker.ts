/// <reference lib="webworker" />

// Real BQN worker. Wraps the self-hosted JavaScript BQN interpreter from
// mlochbaum/BQN (docs/bqn.js, vendored under ./vendor with an ESM export
// layer added — see vendor/bqn.js for the exact upstream source).
//
// The message contract (protocol.ts) is intentionally identical to the
// earlier mock, so swapping this file is the whole diff between "fake"
// and "real" evaluation.

import { compile, run, fmt, fmtErr, unstr } from './vendor/bqn.js';
import type { Request, Response } from './protocol';

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

ctx.addEventListener('message', (e: MessageEvent<Request>) => {
	const req = e.data;
	if (req.kind !== 'eval') return;

	const src = req.source;
	if (!src.trim()) {
		post({ id: req.id, kind: 'error', message: 'empty input' });
		return;
	}

	try {
		const compiled = compile(src);
		const result = run(...compiled);
		const formatted = fmt(result);
		post({ id: req.id, kind: 'ok', value: toJs(formatted) });
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
