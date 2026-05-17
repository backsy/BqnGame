// v3 layout — pure projection from a BQN value to a Scene.
//
// Visual constants match v2-harness's makeBar 1:1 so scalars look the
// same here as they do in v2 and the game. This module deals only in
// geometry (where rectangles sit, how tall they are); the renderer in
// the harness .svelte picks colours from `value` at draw time.

import type { BqnStructuredValue } from '$lib/bqn/protocol';
import type { Cell, Scene, ViewBox } from './scene';

// ── Bar geometry ──────────────────────────────────────────────────────────
// Copied from v2-harness makeBar constants. Same magnitudes, same rhythm.
export const BAR_WIDTH = 24;
export const BAR_HEIGHT_BASE = 18;
export const BAR_HEIGHT_PER_UNIT = 8;
export const BAR_HEIGHT_MAX = 140;

// ── Container layout ──────────────────────────────────────────────────────
// PADDING sits inside an array's outline, between the outline and the
// cells. GAP separates adjacent cells in a vec or row.
export const PADDING = 8;
export const GAP = 4;

// Top-level value is centred vertically in the viewBox: its frame
// (or just the bar for an atom) is positioned so its centre lands on
// the viewBox's centre. baselineY is computed per-value from its
// above/below dims; there's no fixed fraction.

export function barHeight(value: number): number {
	return Math.min(
		BAR_HEIGHT_MAX,
		Math.abs(value) * BAR_HEIGHT_PER_UNIT + BAR_HEIGHT_BASE,
	);
}

// ── valueDims ─────────────────────────────────────────────────────────────
// Walk a BQN value and report how much screen space its rendering needs,
// split into width and above/below-baseline extents. Recursive: a
// nested rank-0 box adds 2×PADDING to each dimension; a vec adds gaps and
// the bounding-box rule. Used by the parent to allocate cell positions.
type ValueDims = { width: number; above: number; below: number };

function valueDims(v: BqnStructuredValue): ValueDims {
	if (v.kind === 'number') {
		return { width: BAR_WIDTH, above: barHeight(v.value), below: 0 };
	}
	if (v.kind === 'array') {
		const child = v.data.map(valueDims);
		if (v.shape.length === 0) {
			const c = child[0];
			return {
				width: c.width + 2 * PADDING,
				above: c.above + PADDING,
				below: c.below + PADDING,
			};
		}
		if (v.shape.length === 1) {
			const inner = child.reduce((s, c) => s + c.width, 0)
				+ Math.max(0, child.length - 1) * GAP;
			const maxAbove = child.reduce((m, c) => Math.max(m, c.above), 0);
			const maxBelow = child.reduce((m, c) => Math.max(m, c.below), 0);
			return {
				width: inner + 2 * PADDING,
				above: maxAbove + PADDING,
				below: maxBelow + PADDING,
			};
		}
		if (v.shape.length === 2) {
			// Each row of the mat is treated like a vec: cells bottom-aligned
			// to that row's baseline, varying heights stick up above. Rows
			// stack vertically with GAP between. The anchor baseline of the
			// whole mat is the bottom row's baseline; everything above is
			// "above," and only the bottom row's `below` contributes to
			// matBelow.
			const [R, C] = v.shape;
			let maxRowWidth = 0;
			let total = 0;
			let bottomBelow = 0;
			for (let r = 0; r < R; r++) {
				let rowW = 0;
				let rowAbove = 0;
				let rowBelow = 0;
				for (let c = 0; c < C; c++) {
					const d = child[r * C + c];
					rowW += d.width;
					if (d.above > rowAbove) rowAbove = d.above;
					if (d.below > rowBelow) rowBelow = d.below;
				}
				rowW += Math.max(0, C - 1) * GAP;
				if (rowW > maxRowWidth) maxRowWidth = rowW;
				total += rowAbove + rowBelow;
				if (r === R - 1) bottomBelow = rowBelow;
			}
			total += Math.max(0, R - 1) * GAP;
			return {
				width: maxRowWidth + 2 * PADDING,
				above: total - bottomBelow + PADDING,
				below: bottomBelow + PADDING,
			};
		}
		throw new Error(`rank ${v.shape.length} layout not yet implemented`);
	}
	throw new Error(`kind '${v.kind}' layout not yet implemented`);
}

// ── layoutValue ───────────────────────────────────────────────────────────
// Recursive layout. `contentX` is the left edge of this value's content
// area in absolute viewBox coordinates. `baselineY` is where bar bottoms
// sit. Returns a Scene with every cell positioned in absolute coords.
function layoutValue(
	v: BqnStructuredValue,
	idPath: string,
	contentX: number,
	baselineY: number,
	viewBox: ViewBox,
): Scene {
	if (v.kind === 'number') {
		const cell: Cell = {
			id: idPath,
			x: contentX,
			y: baselineY - barHeight(v.value),
			w: BAR_WIDTH,
			h: barHeight(v.value),
			value: v.value,
			inner: null,
		};
		return { kind: 'atom', viewBox, atom: cell };
	}
	if (v.kind === 'array') {
		return layoutArray(v, idPath, contentX, baselineY, viewBox);
	}
	throw new Error(`kind '${v.kind}' layout not yet implemented`);
}

function layoutArray(
	v: BqnStructuredValue & { kind: 'array' },
	idPath: string,
	contentX: number,
	baselineY: number,
	viewBox: ViewBox,
): Scene {
	const child = v.data.map(valueDims);
	const cells: Cell[] = [];

	if (v.shape.length === 0) {
		const c = child[0];
		const inner = v.data[0];
		const cellPath = `${idPath}.0`;
		const innerScene = layoutValue(
			inner,
			cellPath,
			contentX + PADDING,
			baselineY,
			viewBox,
		);
		cells.push({
			id: cellPath,
			x: contentX + PADDING,
			y: baselineY - c.above,
			w: c.width,
			h: c.above + c.below,
			value: 0,
			inner: innerScene,
		});
	} else if (v.shape.length === 1) {
		let cursorX = contentX + PADDING;
		for (let i = 0; i < v.data.length; i++) {
			const inner = v.data[i];
			const c = child[i];
			const cellPath = `${idPath}.${i}`;
			if (inner.kind === 'number') {
				cells.push({
					id: cellPath,
					x: cursorX,
					y: baselineY - barHeight(inner.value),
					w: BAR_WIDTH,
					h: barHeight(inner.value),
					value: inner.value,
					inner: null,
				});
			} else {
				const innerScene = layoutValue(
					inner,
					cellPath,
					cursorX,
					baselineY,
					viewBox,
				);
				cells.push({
					id: cellPath,
					x: cursorX,
					y: baselineY - c.above,
					w: c.width,
					h: c.above + c.below,
					value: 0,
					inner: innerScene,
				});
			}
			cursorX += c.width + GAP;
		}
	} else if (v.shape.length === 2) {
		// rank-2: rows stack vertically, each row is a vec-style line of
		// cells anchored to that row's own baseline. Bottom row's baseline
		// is `baselineY` (the caller's anchor). Higher rows are computed
		// going upward.
		const [R, C] = v.shape;
		// Pre-compute per-row dims so row baselines stack correctly.
		const rowAbove: number[] = [];
		const rowBelow: number[] = [];
		for (let r = 0; r < R; r++) {
			let a = 0;
			let b = 0;
			for (let cc = 0; cc < C; cc++) {
				const d = child[r * C + cc];
				if (d.above > a) a = d.above;
				if (d.below > b) b = d.below;
			}
			rowAbove.push(a);
			rowBelow.push(b);
		}
		const rowBaseline: number[] = new Array(R);
		rowBaseline[R - 1] = baselineY;
		for (let r = R - 2; r >= 0; r--) {
			// row r baseline = row r+1 top - GAP - row r below
			//              = (row r+1 baseline - row r+1 above) - GAP - row r below
			rowBaseline[r] =
				rowBaseline[r + 1] - rowAbove[r + 1] - GAP - rowBelow[r];
		}
		for (let r = 0; r < R; r++) {
			let cursorX = contentX + PADDING;
			const rb = rowBaseline[r];
			for (let cc = 0; cc < C; cc++) {
				const inner = v.data[r * C + cc];
				const d = child[r * C + cc];
				const cellPath = `${idPath}.${r}.${cc}`;
				if (inner.kind === 'number') {
					cells.push({
						id: cellPath,
						x: cursorX,
						y: rb - barHeight(inner.value),
						w: BAR_WIDTH,
						h: barHeight(inner.value),
						value: inner.value,
						inner: null,
					});
				} else {
					const innerScene = layoutValue(
						inner,
						cellPath,
						cursorX,
						rb,
						viewBox,
					);
					cells.push({
						id: cellPath,
						x: cursorX,
						y: rb - d.above,
						w: d.width,
						h: d.above + d.below,
						value: 0,
						inner: innerScene,
					});
				}
				cursorX += d.width + GAP;
			}
		}
	} else {
		throw new Error(`rank ${v.shape.length} layout not yet implemented`);
	}

	return { kind: 'array', viewBox, shape: v.shape, cells };
}

// ── bqnValueToScene ───────────────────────────────────────────────────────
// Public entry. Position the value centered horizontally in the viewBox,
// with bar bottoms anchored to a baseline at BASELINE_FRAC of viewBox
// height.
export function bqnValueToScene(
	value: BqnStructuredValue,
	viewBox: ViewBox,
): Scene {
	if (value.kind === 'char' || value.kind === 'fn' || value.kind === 'namespace') {
		throw new Error(`bqnValueToScene: '${value.kind}' not implemented yet`);
	}
	const dims = valueDims(value);
	// Centre the outermost frame in the viewBox both ways. The frame's
	// vertical extent runs from (baselineY - dims.above) to
	// (baselineY + dims.below); its centre is baselineY + (below - above)/2.
	// Setting baselineY = vbCy + (above - below)/2 makes the centre land on
	// viewBox centre.
	const vbCx = viewBox.x + viewBox.w / 2;
	const vbCy = viewBox.y + viewBox.h / 2;
	const contentX = vbCx - dims.width / 2;
	const baselineY = vbCy + (dims.above - dims.below) / 2;
	return layoutValue(value, 'root', contentX, baselineY, viewBox);
}
