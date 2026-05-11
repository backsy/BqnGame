import type { BqnValue } from './value.js';
import type { FnExpr } from './fn-expr.js';

export type Step =
	| { kind: 'monadic'; fn: FnExpr; x: BqnValue; result: BqnValue }
	| { kind: 'dyadic'; fn: FnExpr; w: BqnValue; x: BqnValue; result: BqnValue }
	| { kind: 'assign'; name: string; value: BqnValue } // ← (define) and ↩ (modify)
	| { kind: 'access'; target: BqnValue; field: string; result: BqnValue }; // ns.field
