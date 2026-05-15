// Geometric helpers + invariant checks for motions.
//
// THE CORE INVARIANT: no two visible elements may have overlapping screen
// areas at the same time. Centres aligning isn't enough; AREAS aligning
// isn't enough; we need areas STRICTLY DISJOINT (or strictly identical,
// for in-place transformations).
//
// `assertNoOverlap` verifies two rects don't share any pixels.
// `assertCellsAlign` verifies two rects share the same centre (for the
// "input transforms in place" family).
//
// Motions that move elements through space (distributing, lateral) should
// call assertNoOverlap at key beats — start position, park position, etc. —
// to make sure their geometric reasoning hasn't put two boxes on top of
// each other.

const ALIGN_TOLERANCE_PX = 2;

export type RectCenter = { cx: number; cy: number };

export function centerOf(el: HTMLElement): RectCenter {
	const r = el.getBoundingClientRect();
	return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/** Axis-aligned rectangle. */
export type Rect = { left: number; top: number; right: number; bottom: number };

export function rectOf(el: HTMLElement): Rect {
	const r = el.getBoundingClientRect();
	return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/**
 * Rect of an element with a hypothetical (x, y) translation applied. Use to
 * verify a target position BEFORE actually animating the element there.
 */
export function rectAtTranslate(el: HTMLElement, dx: number, dy: number): Rect {
	const r = el.getBoundingClientRect();
	return {
		left: r.left + dx,
		top: r.top + dy,
		right: r.right + dx,
		bottom: r.bottom + dy,
	};
}

/** True if two rects share any interior pixel. Edge touching counts as no overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
	return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Throw if two elements occupy overlapping screen rectangles. Use to verify
 * that placing an element at a target position won't cover another element.
 *
 * Example:
 *   const targetRect = rectAtTranslate(crate, parkXOff, parkYOff);
 *   assertNoOverlap(targetRect, rectOf(inputCell), 'enclose Phase 1 park');
 *
 * `name` shows up in the error so the failing motion phase is identifiable.
 */
export function assertNoOverlap(a: Rect, b: Rect, name: string): void {
	if (rectsOverlap(a, b)) {
		throw new Error(
			`${name}: rectangles overlap on screen. ` +
				`A = [${a.left.toFixed(1)},${a.top.toFixed(1)} → ${a.right.toFixed(1)},${a.bottom.toFixed(1)}]; ` +
				`B = [${b.left.toFixed(1)},${b.top.toFixed(1)} → ${b.right.toFixed(1)},${b.bottom.toFixed(1)}]. ` +
				`Two visible elements MUST NOT share screen area — adjust the motion's ` +
				`positions so the rectangles are strictly disjoint at this phase.`,
		);
	}
}

/**
 * For a motion where the result cell is supposed to occupy the same screen
 * slot as the input cell, verify that the rendered positions actually
 * agree. If they don't, throw with concrete coordinates — the renderer
 * has put the after-cell somewhere unexpected and the motion would
 * otherwise quietly produce an off-screen-correct end state.
 */
export function assertCellsAlign(
	before: HTMLElement,
	after: HTMLElement,
	name: string,
): void {
	const b = centerOf(before);
	const a = centerOf(after);
	const dx = a.cx - b.cx;
	const dy = a.cy - b.cy;
	if (Math.abs(dx) > ALIGN_TOLERANCE_PX || Math.abs(dy) > ALIGN_TOLERANCE_PX) {
		throw new Error(
			`${name}: before-cell centre (${b.cx.toFixed(1)}, ${b.cy.toFixed(1)}) ` +
				`and after-cell centre (${a.cx.toFixed(1)}, ${a.cy.toFixed(1)}) ` +
				`disagree by (${dx.toFixed(1)}, ${dy.toFixed(1)}) px. ` +
				`The renderer is putting the result at a different slot than the input — ` +
				`fix the rendering so cells line up at the same centre, or use an explicit ` +
				`translation motion that lands at the after-cell rect.`,
		);
	}
}
