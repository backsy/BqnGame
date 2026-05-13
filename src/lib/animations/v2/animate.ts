import type { FnExpr } from './fn-expr.js';
import type { Step } from './step.js';
import type { AnimateStep } from './stage.js';
import { assertNever } from './value.js';
import { blackBox } from './motions/black-box.js';
import {
	reverseMonadic,
	sortUpMonadic,
	sortDownMonadic,
	rotateDyadic,
	transposeMonadic,
} from './motions/lateral.js';
import {
	takeDyadic,
	dropDyadic,
	filterDyadic,
	makeFilterWithLabel,
} from './motions/vertical.js';
import { fnExprLabel } from './fn-label.js';

// ── assignAnimation / accessAnimation ────────────────────────────────────
const assignAnimation: AnimateStep = blackBox;
const accessAnimation: AnimateStep = blackBox;

// ── animateMonadic ────────────────────────────────────────────────────────
// Exhaustive over every FnExpr['kind']. Build fails if a kind is added to
// FnExpr without a corresponding arm here (Rule F).
export function animateMonadic(fn: FnExpr): AnimateStep {
	switch (fn.kind) {
		// Arithmetic
		case 'add':                    return blackBox;
		case 'sub':                    return blackBox;
		case 'mul':                    return blackBox;
		case 'div':                    return blackBox;
		case 'pow':                    return blackBox;
		case 'root':                   return blackBox;
		case 'mod':                    return blackBox;
		case 'min':                    return blackBox;
		case 'max':                    return blackBox;
		case 'floor':                  return blackBox;
		case 'ceil':                   return blackBox;
		case 'abs':                    return blackBox;
		case 'neg':                    return blackBox;
		// Comparison
		case 'eq':                     return blackBox;
		case 'ne':                     return blackBox;
		case 'lt':                     return blackBox;
		case 'le':                     return blackBox;
		case 'gt':                     return blackBox;
		case 'ge':                     return blackBox;
		case 'match':                  return blackBox;
		case 'not-match':              return blackBox;
		// Logical
		case 'and':                    return blackBox;
		case 'or':                     return blackBox;
		case 'not':                    return blackBox;
		case 'span':                   return blackBox;
		// Shape / structural
		case 'reverse':                return reverseMonadic;
		case 'rotate':                 return reverseMonadic; // monadic ⌽ = reverse
		case 'reshape':                return blackBox;
		case 'deshape':                return blackBox;
		case 'transpose':              return transposeMonadic;
		case 'length':                 return blackBox;
		case 'shape':                  return blackBox;
		case 'rank-of':                return blackBox; // ≢ base primitive — NOT the rank 2-modifier
		case 'take':                   return blackBox;
		case 'drop':                   return blackBox;
		case 'select':                 return blackBox;
		case 'pick':                   return blackBox;
		case 'first':                  return blackBox;
		case 'last':                   return blackBox;
		case 'enclose':                return blackBox;
		case 'merge':                  return blackBox;
		case 'join-to':                return blackBox;
		case 'pair':                   return blackBox;
		case 'solo':                   return blackBox;
		case 'range':                  return blackBox;
		case 'sort-up':                return sortUpMonadic;
		case 'sort-down':              return sortDownMonadic;
		case 'grade-up':               return blackBox;
		case 'grade-down':             return blackBox;
		case 'group':                  return blackBox;
		case 'index-of':               return blackBox;
		case 'progressive-index-of':   return blackBox;
		case 'unique':                 return blackBox;
		case 'mark-firsts':            return blackBox;
		case 'find':                   return blackBox;
		case 'member':                 return blackBox;
		case 'left-id':                return blackBox;
		case 'right-id':               return blackBox;
		// 1-modifier applications
		case 'fold':                   return blackBox;
		case 'fold-from':              return blackBox;
		case 'scan':                   return blackBox;
		case 'each':                   return blackBox;
		case 'cells':                  return blackBox;
		case 'table':                  return blackBox;
		case 'self':                   return blackBox;
		case 'const':                  return blackBox;
		// 2-modifier applications
		case 'compose':                return blackBox;
		case 'over':                   return blackBox;
		case 'bind-left':              return blackBox;
		case 'bind-right':             return blackBox;
		case 'before':
			// (F⊸G) X — when G is 'select', this is the filter motion with a
			// per-cell predicate label derived from F. The bind glyphs (⊸ / ⟜)
			// are the higher-order plumbing that applies F across the whole
			// array; per cell the comparison is just F itself, so strip the
			// bind from the badge label.
			return fn.g.kind === 'select'
				? makeFilterWithLabel(fnExprLabel(fn.f).replace(/[⊸⟜]/g, ''))
				: blackBox;
		case 'after':                  return blackBox;
		case 'under':                  return blackBox;
		case 'choose':                 return blackBox;
		case 'rank':                   return blackBox; // F⎉K — 2-modifier
		case 'depth':                  return blackBox;
		case 'repeat':                 return blackBox;
		case 'valences':               return blackBox;
		case 'catch':                  return blackBox;
		// Trains
		case 'atop':                   return blackBox;
		case 'fork':                   return blackBox;
		// Lambdas
		case 'lambda':                 return blackBox;
		// Resolved names
		case 'opaque':                 return blackBox;
		default:                       return assertNever(fn);
	}
}

// ── animateDyadic ─────────────────────────────────────────────────────────
// Same exhaustiveness requirement as animateMonadic (Rule F).
export function animateDyadic(fn: FnExpr): AnimateStep {
	switch (fn.kind) {
		// Arithmetic
		case 'add':                    return blackBox;
		case 'sub':                    return blackBox;
		case 'mul':                    return blackBox;
		case 'div':                    return blackBox;
		case 'pow':                    return blackBox;
		case 'root':                   return blackBox;
		case 'mod':                    return blackBox;
		case 'min':                    return blackBox;
		case 'max':                    return blackBox;
		case 'floor':                  return blackBox;
		case 'ceil':                   return blackBox;
		case 'abs':                    return blackBox;
		case 'neg':                    return blackBox;
		// Comparison
		case 'eq':                     return blackBox;
		case 'ne':                     return blackBox;
		case 'lt':                     return blackBox;
		case 'le':                     return blackBox;
		case 'gt':                     return blackBox;
		case 'ge':                     return blackBox;
		case 'match':                  return blackBox;
		case 'not-match':              return blackBox;
		// Logical
		case 'and':                    return blackBox;
		case 'or':                     return blackBox;
		case 'not':                    return blackBox;
		case 'span':                   return blackBox;
		// Shape / structural
		case 'reverse':                return rotateDyadic; // W⌽X = rotate X by W (dyadic reverse = rotate)
		case 'rotate':                 return rotateDyadic;
		case 'reshape':                return blackBox;
		case 'deshape':                return blackBox;
		case 'transpose':              return blackBox; // no standard dyadic transpose in our subset
		case 'length':                 return blackBox;
		case 'shape':                  return blackBox;
		case 'rank-of':                return blackBox;
		case 'take':                   return takeDyadic;
		case 'drop':                   return dropDyadic;
		case 'select':                 return filterDyadic; // TODO: clarify — M/X filter is wired here; ⊏ pick-by-index would be a separate motion
		case 'pick':                   return blackBox;
		case 'first':                  return blackBox;
		case 'last':                   return blackBox;
		case 'enclose':                return blackBox;
		case 'merge':                  return blackBox;
		case 'join-to':                return blackBox;
		case 'pair':                   return blackBox;
		case 'solo':                   return blackBox;
		case 'range':                  return blackBox;
		case 'sort-up':                return blackBox; // no dyadic sort-up
		case 'sort-down':              return blackBox; // no dyadic sort-down
		case 'grade-up':               return blackBox;
		case 'grade-down':             return blackBox;
		case 'group':                  return blackBox;
		case 'index-of':               return blackBox;
		case 'progressive-index-of':   return blackBox;
		case 'unique':                 return blackBox;
		case 'mark-firsts':            return blackBox;
		case 'find':                   return blackBox;
		case 'member':                 return blackBox;
		case 'left-id':                return blackBox;
		case 'right-id':               return blackBox;
		// 1-modifier applications
		case 'fold':                   return blackBox;
		case 'fold-from':              return blackBox;
		case 'scan':                   return blackBox;
		case 'each':                   return blackBox;
		case 'cells':                  return blackBox;
		case 'table':                  return blackBox;
		case 'self':                   return blackBox;
		case 'const':                  return blackBox;
		// 2-modifier applications
		case 'compose':                return blackBox;
		case 'over':                   return blackBox;
		case 'bind-left':              return blackBox;
		case 'bind-right':             return blackBox;
		case 'before':                 return blackBox;
		case 'after':                  return blackBox;
		case 'under':                  return blackBox;
		case 'choose':                 return blackBox;
		case 'rank':                   return blackBox;
		case 'depth':                  return blackBox;
		case 'repeat':                 return blackBox;
		case 'valences':               return blackBox;
		case 'catch':                  return blackBox;
		// Trains
		case 'atop':                   return blackBox;
		case 'fork':                   return blackBox;
		// Lambdas
		case 'lambda':                 return blackBox;
		// Resolved names
		case 'opaque':                 return blackBox;
		default:                       return assertNever(fn);
	}
}

// ── animateStep ───────────────────────────────────────────────────────────
// Outer dispatch by Step kind. Returns the AnimateStep for this step.
// Exhaustive with assertNever default (Rule F).
export function animateStep(step: Step): AnimateStep {
	switch (step.kind) {
		case 'monadic':  return animateMonadic(step.fn);
		case 'dyadic':   return animateDyadic(step.fn);
		case 'assign':   return assignAnimation;
		case 'access':   return accessAnimation;
		default:         return assertNever(step);
	}
}
