// Geometric helpers + invariant checks for motions. Every "in-place" motion
// (one where the result should sit at the input's screen position) can use
// `assertCellsAlign` at start time to verify the renderer didn't drift —
// if before- and after- cell centres don't agree, the user sees the result
// pop into a different location than the input occupied. That's the
// continuity rule, and it's something we want LOUD, not silent.
//
// Motions that intentionally move things (lateral, distributing, etc.)
// don't need this check. It's for the family where the static post-commit
// position is supposed to equal the pre-commit position.

const ALIGN_TOLERANCE_PX = 2;

export type RectCenter = { cx: number; cy: number };

export function centerOf(el: HTMLElement): RectCenter {
	const r = el.getBoundingClientRect();
	return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/**
 * For a motion where the result cell is supposed to occupy the same screen
 * slot as the input cell, verify that the rendered positions actually
 * agree. If they don't, throw with concrete coordinates — the renderer
 * has put the after-cell somewhere unexpected and the motion would
 * otherwise quietly produce an off-screen-correct end state.
 *
 * `name` shows up in the error so the failing motion is identifiable.
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
