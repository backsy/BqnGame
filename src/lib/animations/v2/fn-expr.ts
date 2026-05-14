import type { BqnValue } from './value.js';

// Opaque lambda body — animation treats lambda application as a blackbox step.
// Sub-trajectory animation of bodies is deferred (see design doc § Deferred).
export type LambdaBody = { readonly source: string };

export type FnExpr =
	// ── Base function primitives ──────────────────────────────────────────
	// Arithmetic
	| { kind: 'add' }
	| { kind: 'sub' }
	| { kind: 'mul' }
	| { kind: 'div' }
	| { kind: 'pow' }
	| { kind: 'root' }
	| { kind: 'mod' }
	| { kind: 'min' }
	| { kind: 'max' }
	| { kind: 'floor' }
	| { kind: 'ceil' }
	| { kind: 'abs' }
	| { kind: 'neg' }
	// Comparison
	| { kind: 'eq' }
	| { kind: 'ne' }
	| { kind: 'lt' }
	| { kind: 'le' }
	| { kind: 'gt' }
	| { kind: 'ge' }
	| { kind: 'match' }
	| { kind: 'not-match' } // ≡ ≢ (depth-aware)
	// Logical
	| { kind: 'and' }
	| { kind: 'or' }
	| { kind: 'not' }
	| { kind: 'span' } // ¬
	// Shape / structural
	| { kind: 'reverse' }
	| { kind: 'rotate' }
	| { kind: 'reshape' }
	| { kind: 'deshape' }
	| { kind: 'transpose' }
	| { kind: 'length' }
	| { kind: 'shape' }
	| { kind: 'rank-of' } // ≢ — base primitive (tally of shape)
	| { kind: 'take' }
	| { kind: 'drop' }
	| { kind: 'replicate' } // / — Indices (monadic) / Replicate aka filter (dyadic)
	| { kind: 'pick' }
	| { kind: 'first' }
	| { kind: 'enclose' }
	| { kind: 'merge' }
	| { kind: 'join-to' } // ∾
	| { kind: 'pair' } // ⋈
	| { kind: 'solo' } // ≍
	| { kind: 'range' }
	| { kind: 'sort-up' }
	| { kind: 'sort-down' }
	| { kind: 'grade-up' }
	| { kind: 'grade-down' }
	| { kind: 'group' }
	| { kind: 'index-of' }
	| { kind: 'progressive-index-of' }
	| { kind: 'unique' }
	| { kind: 'mark-firsts' }
	| { kind: 'find' }
	| { kind: 'member' }
	| { kind: 'left-id' } // ⊣
	| { kind: 'right-id' } // ⊢

	// ── 1-modifier applications (operand is a FnExpr) ─────────────────────
	| { kind: 'fold'; over: FnExpr } // F´
	| { kind: 'fold-from'; over: FnExpr; seed: BqnValue } // F˝ (fold with initial value)
	| { kind: 'scan'; over: FnExpr } // F`
	| { kind: 'each'; of: FnExpr } // F¨
	| { kind: 'cells'; of: FnExpr } // F˘
	| { kind: 'table'; of: FnExpr } // F⌜
	| { kind: 'self'; of: FnExpr } // F˜
	| { kind: 'const'; value: BqnValue } // F˙

	// ── 2-modifier applications (two operands; FnExpr or BqnValue) ────────
	| { kind: 'compose'; f: FnExpr; g: FnExpr } // F∘G
	| { kind: 'over'; f: FnExpr; g: FnExpr } // F○G
	| { kind: 'bind-left'; left: BqnValue; of: FnExpr } // N⊸F (subject bind)
	| { kind: 'bind-right'; right: BqnValue; of: FnExpr } // F⟜N
	| { kind: 'before'; f: FnExpr; g: FnExpr } // F⊸G (function-function variant of ⊸)
	| { kind: 'after'; f: FnExpr; g: FnExpr } // F⟜G
	| { kind: 'under'; f: FnExpr; g: FnExpr } // F⌾G
	| { kind: 'choose'; f: FnExpr; g: FnExpr } // F◶G
	| { kind: 'rank'; of: FnExpr; spec: BqnValue | FnExpr } // F⎉K — 2-modifier, NOT the base rank-of primitive
	| { kind: 'depth'; of: FnExpr; spec: BqnValue | FnExpr } // F⚇K
	| { kind: 'repeat'; of: FnExpr; spec: BqnValue | FnExpr } // F⍟K
	| { kind: 'valences'; f: FnExpr; g: FnExpr } // F⊘G
	| { kind: 'catch'; f: FnExpr; g: FnExpr } // F⎊G

	// ── Trains ────────────────────────────────────────────────────────────
	| { kind: 'atop'; f: FnExpr; g: FnExpr } // 2-train: F G
	| { kind: 'fork'; f: FnExpr | BqnValue; g: FnExpr; h: FnExpr } // 3-train: F G H

	// ── Lambdas ───────────────────────────────────────────────────────────
	| { kind: 'lambda'; role: 'fn' | 'mod1' | 'mod2'; body: LambdaBody }

	// ── Resolved name (opaque to the engine) ──────────────────────────────
	| { kind: 'opaque'; name: string; resolved: FnExpr };
