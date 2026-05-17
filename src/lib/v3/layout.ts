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
		const h = barHeight(v.value);
		// Positive bars grow up from the baseline; negative bars grow down.
		return v.value < 0
			? { width: BAR_WIDTH, above: 0, below: h }
			: { width: BAR_WIDTH, above: h, below: 0 };
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
			// Mat = array of rows. Each row is treated like a vec with its
			// OWN frame; the mat then has a second outer frame around the
			// row frames. So a mat has 1 (outer) + R (per-row) frames,
			// matching the visual of "array of arrays." Widths and heights
			// are computed with all PADDING + GAP contributions counted.
			const [R, C] = v.shape;
			let maxRowFrameW = 0;
			let totalRowFramesH = 0;
			let bottomRowBelow = 0;
			for (let r = 0; r < R; r++) {
				let rowInnerW = 0;
				let rowAbove = 0;
				let rowBelow = 0;
				for (let c = 0; c < C; c++) {
					const d = child[r * C + c];
					rowInnerW += d.width;
					if (d.above > rowAbove) rowAbove = d.above;
					if (d.below > rowBelow) rowBelow = d.below;
				}
				rowInnerW += Math.max(0, C - 1) * GAP;
				const rowFrameW = rowInnerW + 2 * PADDING;
				const rowFrameH = rowAbove + rowBelow + 2 * PADDING;
				if (rowFrameW > maxRowFrameW) maxRowFrameW = rowFrameW;
				totalRowFramesH += rowFrameH;
				if (r === R - 1) bottomRowBelow = rowBelow;
			}
			totalRowFramesH += Math.max(0, R - 1) * GAP;
			const bottomRowFrameBelow = bottomRowBelow + PADDING;
			return {
				width: maxRowFrameW + 2 * PADDING,
				above: totalRowFramesH - bottomRowFrameBelow + PADDING,
				below: bottomRowFrameBelow + PADDING,
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
		const h = barHeight(v.value);
		const cell: Cell = {
			id: idPath,
			x: contentX,
			y: v.value < 0 ? baselineY : baselineY - h,
			w: BAR_WIDTH,
			h,
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
				const h = barHeight(inner.value);
				cells.push({
					id: cellPath,
					x: cursorX,
					y: inner.value < 0 ? baselineY : baselineY - h,
					w: BAR_WIDTH,
					h,
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
		// rank-2: each row is treated like its own vec — gets its own
		// frame at render time. Cells inside a row sit inside that row's
		// frame's padding. Row baselines stack with PADDING above & below
		// each row's content + GAP between row frames.
		const [R, C] = v.shape;
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
			// row r baseline = row r+1's frame-top y - GAP - row r's
			//                  PADDING (frame-bottom inside) - row r below
			rowBaseline[r] =
				rowBaseline[r + 1]
				- rowAbove[r + 1] - PADDING   // up to row r+1's frame top
				- GAP                          // gap between row frames
				- PADDING                      // down through row r's frame bottom padding
				- rowBelow[r];                 // to row r's baseline
		}
		for (let r = 0; r < R; r++) {
			// Cells in a row sit inside both the outer frame's PADDING
			// (contentX is outer-frame.left) AND the row frame's PADDING.
			let cursorX = contentX + 2 * PADDING;
			const rb = rowBaseline[r];
			for (let cc = 0; cc < C; cc++) {
				const inner = v.data[r * C + cc];
				const d = child[r * C + cc];
				const cellPath = `${idPath}.${r}.${cc}`;
				if (inner.kind === 'number') {
					const h = barHeight(inner.value);
					cells.push({
						id: cellPath,
						x: cursorX,
						y: inner.value < 0 ? rb : rb - h,
						w: BAR_WIDTH,
						h,
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
