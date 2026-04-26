// Synchronous main-thread BQN client. The vendored interpreter is pure
// JS and fast enough for REPL-sized expressions; running it inline
// removes the worker postMessage protocol and the class of bugs that
// come with it (init failures, message-cloning quirks, hung
// communication). API stays Promise-shaped so callers don't change.

import { compile, run, fmt, fmtErr, unstr } from './vendor/bqn.js';
import type { Response } from './protocol';

const toJs = (v: unknown): string => {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return unstr(v);
	return String(v);
};

export class BqnClient {
	private nextId = 0;

	eval(source: string): Promise<Response> {
		const id = this.nextId++;
		const src = source.trim();
		if (!src) {
			return Promise.resolve({ id, kind: 'error', message: 'empty input' });
		}
		try {
			const compiled = compile(src);
			const result = run(...compiled);
			const formatted = fmt(result);
			return Promise.resolve({ id, kind: 'ok', value: toJs(formatted) });
		} catch (err) {
			let message: string;
			try {
				message = toJs(fmtErr(err));
			} catch {
				message = err instanceof Error ? err.message : String(err);
			}
			return Promise.resolve({ id, kind: 'error', message });
		}
	}

	destroy() {
		// no-op; here for API parity
	}
}
