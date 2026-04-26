// Synchronous BQN evaluation helpers used by the game. The vendored
// interpreter runs on the main thread (no worker), so callers get
// raw JS values back and can inspect type / shape directly.

import { compile, run, fmt, fmtErr, unstr } from './vendor/bqn.js';

/** Evaluate source and return the raw BQN value (or throw on error). */
export function evalRaw(source: string): unknown {
	return run(...compile(source));
}

/** Eval, return either the formatted result string or a readable error. */
export function evalFormatted(
	source: string
): { kind: 'ok'; value: string } | { kind: 'error'; message: string } {
	try {
		return { kind: 'ok', value: toJs(fmt(evalRaw(source))) };
	} catch (e) {
		let message: string;
		try {
			message = toJs(fmtErr(e));
		} catch {
			message = e instanceof Error ? e.message : String(e);
		}
		return { kind: 'error', message };
	}
}

/** True if `aExpr` and `bExpr` evaluate to BQN-Match-equal values. */
export function valueMatches(aExpr: string, bExpr: string): boolean {
	try {
		return evalRaw(`(${aExpr}) ≡ (${bExpr})`) === 1;
	} catch {
		return false;
	}
}

const toJs = (v: unknown): string => {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return unstr(v);
	return String(v);
};
