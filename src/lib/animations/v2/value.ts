import type { FnExpr } from './fn-expr.js';

export type BqnValue =
	| { kind: 'number'; value: number }
	| { kind: 'char'; value: string } // single grapheme
	| { kind: 'fn'; def: FnExpr } // functions are first-class values
	| { kind: 'array'; shape: ReadonlyArray<number>; data: ReadonlyArray<BqnValue> } // row-major; rank = shape.length
	| { kind: 'namespace'; entries: ReadonlyMap<string, BqnValue> };

export function valuesEqual(a: BqnValue, b: BqnValue): boolean {
	if (a.kind !== b.kind) return false;
	switch (a.kind) {
		case 'number':
			return a.value === (b as Extract<BqnValue, { kind: 'number' }>).value;
		case 'char':
			return a.value === (b as Extract<BqnValue, { kind: 'char' }>).value;
		case 'fn':
			// Reference equality: worker preserves identity for shared bindings
			return a.def === (b as Extract<BqnValue, { kind: 'fn' }>).def;
		case 'array': {
			const ba = b as Extract<BqnValue, { kind: 'array' }>;
			if (a.shape.length !== ba.shape.length) return false;
			for (let i = 0; i < a.shape.length; i++) {
				if (a.shape[i] !== ba.shape[i]) return false;
			}
			if (a.data.length !== ba.data.length) return false;
			for (let i = 0; i < a.data.length; i++) {
				if (!valuesEqual(a.data[i], ba.data[i])) return false;
			}
			return true;
		}
		case 'namespace':
			// Reference equality: same reasoning as fn
			return a.entries === (b as Extract<BqnValue, { kind: 'namespace' }>).entries;
		default:
			return assertNever(a);
	}
}

export function assertNever(x: never): never {
	throw new Error(`assertNever: unreachable case reached with value ${JSON.stringify(x)}`);
}
