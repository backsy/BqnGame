// Scene builder: turn a v2 BqnValue into a synthetic DOM with the same
// structural layout the harness's renderBqnValue produces, plus mocked
// getBoundingClientRect on every cell so the motion's measurements have
// real numbers to work with. No jsdom layout, no CSS — purely geometric.

import type { BqnValue } from '../value';
import type { Rect } from '../geometry';
import { compile, run } from '../../../bqn/vendor/bqn.js';
import type { BqnStructuredValue } from '../../../bqn/protocol';
import { makeMockElement, type SceneElement } from './overlap-harness';

export const BAR_WIDTH = 24;
export const BAR_BASE_HEIGHT = 18;
export const BAR_PER_UNIT = 8;
export const BAR_MAX_HEIGHT = 140;
export const ROW_GAP = 4;
export const ROW_PADDING = 8;
export const CRATE_SIZE = 56;
export const CHAR_BAR_HEIGHT = 32;

export function barHeight(value: number): number {
	return Math.min(BAR_MAX_HEIGHT, Math.abs(value) * BAR_PER_UNIT + BAR_BASE_HEIGHT);
}

// Render a BqnValue into an HTMLElement subtree placed with its bounding
// rect CENTRED at (cx, cy) on screen. Returns the root element and a flat
// list of cell SceneElements (each with a mocked rect) the harness can
// hand to assertNoOverlapAcross.
export function buildSceneFor(
	value: BqnValue,
	cx: number,
	cy: number,
	prefix: string,
): { root: HTMLElement; cells: SceneElement[] } {
	const cells: SceneElement[] = [];
	const root = renderValue(value, cx, cy, prefix, cells, 0);
	return { root, cells };
}

function renderValue(
	value: BqnValue,
	cx: number,
	cy: number,
	prefix: string,
	cellsOut: SceneElement[],
	depth: number,
): HTMLElement {
	if (value.kind === 'number' || value.kind === 'char') {
		// Wrap a single bar in a row container so layout matches the harness.
		const h = value.kind === 'number' ? barHeight(value.value) : CHAR_BAR_HEIGHT;
		const rowW = BAR_WIDTH + 2 * ROW_PADDING;
		const rowH = h + 2 * ROW_PADDING;
		const row = document.createElement('div');
		row.className = 'row';
		setRect(row, rect(cx, cy, rowW, rowH));
		// Bar inside, aligned to row centre.
		const bar = makeMockElement(`${prefix}.bar`, rect(cx, cy, BAR_WIDTH, h)).el;
		bar.className = 'bar';
		row.appendChild(bar);
		cellsOut.push({ id: `${prefix}.bar`, el: bar, naturalRect: rect(cx, cy, BAR_WIDTH, h) });
		return row;
	}
	if (value.kind === 'array') {
		if (value.shape.length === 0) {
			// Rank-0 box: row > crate
			const rowW = CRATE_SIZE + 2 * ROW_PADDING;
			const rowH = CRATE_SIZE + 2 * ROW_PADDING;
			const row = document.createElement('div');
			row.className = 'row';
			setRect(row, rect(cx, cy, rowW, rowH));
			const crateRect = rect(cx, cy, CRATE_SIZE, CRATE_SIZE);
			const crate = makeMockElement(`${prefix}.crate`, crateRect).el;
			crate.className = 'bqn-box';
			const content = document.createElement('div');
			content.className = 'bqn-box-content';
			crate.appendChild(content);
			row.appendChild(crate);
			cellsOut.push({ id: `${prefix}.crate`, el: crate, naturalRect: crateRect });
			return row;
		}
		if (value.shape.length === 1) {
			const n = value.data.length;
			const cellH = Math.max(
				...value.data.map(v => v.kind === 'number' ? barHeight(v.value) :
					(v.kind === 'array' && v.shape.length === 0) ? CRATE_SIZE :
					BAR_BASE_HEIGHT),
				BAR_BASE_HEIGHT,
			);
			const rowW = n * BAR_WIDTH + (n - 1) * ROW_GAP + 2 * ROW_PADDING;
			const rowH = cellH + 2 * ROW_PADDING;
			const row = document.createElement('div');
			row.className = `row bqn-vector`;
			setRect(row, rect(cx, cy, rowW, rowH));
			// Place children left to right, aligned to row's bottom (flex-end).
			const leftEdge = cx - rowW / 2 + ROW_PADDING;
			const baseline = cy + cellH / 2; // bottom of cells, since flex-end
			for (let i = 0; i < n; i++) {
				const item = value.data[i];
				const cellCx = leftEdge + BAR_WIDTH / 2 + i * (BAR_WIDTH + ROW_GAP);
				const cellH_i = item.kind === 'number' ? barHeight(item.value) :
					(item.kind === 'array' && item.shape.length === 0) ? CRATE_SIZE :
					BAR_BASE_HEIGHT;
				const cellCy = baseline - cellH_i / 2;
				const cellRect = rect(cellCx, cellCy, BAR_WIDTH, cellH_i);
				const el = makeMockElement(`${prefix}.cell${i}`, cellRect).el;
				el.className = 'bar';
				row.appendChild(el);
				cellsOut.push({ id: `${prefix}.cell${i}`, el, naturalRect: cellRect });
			}
			return row;
		}
		if (value.shape.length === 2) {
			const [R, C] = value.shape;
			// Each row of the matrix is its own rank-1 vector container
			// (.bqn-vector — same bracket/outline decoration as a plain
			// vector). Rows stack vertically inside the outer .bqn-matrix
			// frame. Cells within a row are bars at their natural heights;
			// uniform cell widths keep column alignment across rows.
			const cellH = Math.max(
				...value.data.map(v =>
					v.kind === 'number' ? barHeight(v.value) :
					(v.kind === 'array' && v.shape.length === 0) ? CRATE_SIZE :
					BAR_BASE_HEIGHT,
				),
				BAR_BASE_HEIGHT,
			);
			const innerRowW = C * BAR_WIDTH + (C - 1) * ROW_GAP + 2 * ROW_PADDING;
			const innerRowH = cellH + 2 * ROW_PADDING;
			const gridW = innerRowW + 2 * ROW_PADDING;
			const gridH = R * innerRowH + (R - 1) * ROW_GAP + 2 * ROW_PADDING;
			const grid = document.createElement('div');
			grid.className = 'row bqn-matrix';
			setRect(grid, rect(cx, cy, gridW, gridH));
			const outerTopEdge = cy - gridH / 2 + ROW_PADDING;
			const outerLeftEdge = cx - gridW / 2 + ROW_PADDING;
			for (let r = 0; r < R; r++) {
				const rowCx = outerLeftEdge + innerRowW / 2;
				const rowCy = outerTopEdge + innerRowH / 2 + r * (innerRowH + ROW_GAP);
				const innerRow = document.createElement('div');
				innerRow.className = 'row bqn-vector';
				setRect(innerRow, rect(rowCx, rowCy, innerRowW, innerRowH));
				grid.appendChild(innerRow);

				const cellsLeftEdge = rowCx - innerRowW / 2 + ROW_PADDING;
				const cellsBaselineY = rowCy + cellH / 2; // flex-end bottom
				for (let c = 0; c < C; c++) {
					const item = value.data[r * C + c];
					const cellH_i = item.kind === 'number' ? barHeight(item.value) :
						(item.kind === 'array' && item.shape.length === 0) ? CRATE_SIZE :
						BAR_BASE_HEIGHT;
					const cellCx = cellsLeftEdge + BAR_WIDTH / 2 + c * (BAR_WIDTH + ROW_GAP);
					const cellCy = cellsBaselineY - cellH_i / 2;
					const cellRect = rect(cellCx, cellCy, BAR_WIDTH, cellH_i);
					const el = makeMockElement(`${prefix}.cell${r}_${c}`, cellRect).el;
					el.className = 'bar';
					innerRow.appendChild(el);
					cellsOut.push({ id: `${prefix}.cell${r}_${c}`, el, naturalRect: cellRect });
				}
			}
			return grid;
		}
		// Rank ≥ 3 — render as a row of D crates along the major axis,
		// each crate containing a rank-(N-1) sub-rendering. This is the
		// "array of arrays inside boxes" structure the user asked for —
		// the box visual is the same crate as < (enclose). Cells (bars)
		// remain leaves at the bottom level, marked with class 'bar' so
		// leafBars walkers can find them across the nested DOM.
		if (value.shape.length >= 3) {
			const [D, ...innerShape] = value.shape;
			const innerSize = innerShape.reduce((a, b) => a * b, 1);
			// Lay out D inner-shape sub-values side by side.
			// Each sub-value is rendered recursively at a temporary
			// centre; we then size the outer container to fit them all.
			const subs: { el: HTMLElement; w: number; h: number }[] = [];
			for (let d = 0; d < D; d++) {
				const sub: BqnValue = {
					kind: 'array',
					shape: innerShape,
					data: value.data.slice(d * innerSize, (d + 1) * innerSize),
				};
				// Render the sub at origin; we'll reposition by setting
				// inline styles when we know the layout.
				const subEl = renderValue(sub, 0, 0, `${prefix}.${d}`, [], depth + 1);
				const r = subEl.getBoundingClientRect();
				subs.push({ el: subEl, w: r.width, h: r.height });
			}
			const CRATE_PAD = 14;
			const maxSubW = subs.reduce((m, s) => Math.max(m, s.w), 0);
			const maxSubH = subs.reduce((m, s) => Math.max(m, s.h), 0);
			const crateW = maxSubW + 2 * CRATE_PAD;
			const crateH = maxSubH + 2 * CRATE_PAD;
			const outerW = D * crateW + (D - 1) * ROW_GAP + 2 * ROW_PADDING;
			const outerH = crateH + 2 * ROW_PADDING;
			const outer = document.createElement('div');
			outer.className = 'row bqn-vector';
			setRect(outer, rect(cx, cy, outerW, outerH));
			const leftEdge = cx - outerW / 2 + ROW_PADDING;
			for (let d = 0; d < D; d++) {
				const crateCx = leftEdge + crateW / 2 + d * (crateW + ROW_GAP);
				const crateCy = cy;
				const crate = document.createElement('div');
				crate.className = 'bqn-box';
				setRect(crate, rect(crateCx, crateCy, crateW, crateH));
				outer.appendChild(crate);
				// Re-render the d-th sub at the crate's centre and append.
				const sub: BqnValue = {
					kind: 'array',
					shape: innerShape,
					data: value.data.slice(d * innerSize, (d + 1) * innerSize),
				};
				const subEl = renderValue(sub, crateCx, crateCy, `${prefix}.${d}`, cellsOut, depth + 1);
				crate.appendChild(subEl);
			}
			void subs; // first pass only used for sizing
			return outer;
		}
	}
	// Placeholder for unsupported (fn, namespace).
	const ph = document.createElement('div');
	ph.className = 'placeholder';
	setRect(ph, rect(cx, cy, BAR_WIDTH, BAR_BASE_HEIGHT));
	void depth;
	return ph;
}

function rect(cx: number, cy: number, w: number, h: number): Rect {
	return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

function setRect(el: HTMLElement, r: Rect): void {
	el.getBoundingClientRect = () => {
		// Start from natural rect + own inline translate (mock doesn't
		// distinguish translateX/Y notation — we cover the common forms).
		const tx = parseTx(el.style.transform);
		const ty = parseTy(el.style.transform);
		const w = r.right - r.left;
		const h = r.bottom - r.top;
		let cur: Rect = {
			left: r.left + tx,
			top: r.top + ty,
			right: r.left + tx + w,
			bottom: r.top + ty + h,
		};
		// Walk ancestor chain and apply each ancestor's inline rotation.
		// In a real browser, getBoundingClientRect respects all ancestor
		// transforms automatically. In jsdom the mock has to do it
		// itself, otherwise production code that measures cells after a
		// parent rotation (e.g. reverse measuring after Phase 1) sees
		// the un-rotated natural rect and the motion mis-computes its
		// targets.
		let parent: HTMLElement | null = el.parentElement;
		while (parent) {
			const rot = parseRotateDeg(parent.style.transform);
			if (rot !== 0) {
				const pRect = parent.getBoundingClientRect();
				const pcx = (pRect.left + pRect.right) / 2;
				const pcy = (pRect.top + pRect.bottom) / 2;
				cur = rotateAxisAlignedRect(cur, pcx, pcy, rot);
			}
			parent = parent.parentElement;
		}
		const w2 = cur.right - cur.left;
		const h2 = cur.bottom - cur.top;
		return {
			left: cur.left, top: cur.top, right: cur.right, bottom: cur.bottom,
			width: w2, height: h2, x: cur.left, y: cur.top, toJSON: () => ({}),
		} as DOMRect;
	};
}

function parseTx(t: string): number {
	const m = t.match(/translate(?:X|3d)?\(\s*([-0-9.]+)px/);
	return m ? parseFloat(m[1]) : 0;
}
function parseTy(t: string): number {
	const my = t.match(/translateY\(\s*([-0-9.]+)px/);
	if (my) return parseFloat(my[1]);
	const m = t.match(/translate(?:3d)?\(\s*[-0-9.]+px\s*,\s*([-0-9.]+)px/);
	return m ? parseFloat(m[1]) : 0;
}
function parseRotateDeg(t: string): number {
	const m = t.match(/rotate(?:Z)?\(\s*([-0-9.]+)deg/);
	return m ? parseFloat(m[1]) : 0;
}
// Rotate an axis-aligned rect around an arbitrary point. For non-axis-
// aligned rotations the result is the AABB of the rotated rect — that's
// what getBoundingClientRect would return in a real browser. The
// special-case for ±180° avoids floating-point noise in the common case.
function rotateAxisAlignedRect(r: Rect, cx: number, cy: number, deg: number): Rect {
	const d = ((deg % 360) + 360) % 360;
	if (Math.abs(d - 180) < 1e-6) {
		return {
			left: 2 * cx - r.right,
			right: 2 * cx - r.left,
			top: 2 * cy - r.bottom,
			bottom: 2 * cy - r.top,
		};
	}
	if (d < 1e-6 || Math.abs(d - 360) < 1e-6) return r;
	const rad = (deg * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const corners = [
		[r.left, r.top],
		[r.right, r.top],
		[r.left, r.bottom],
		[r.right, r.bottom],
	];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [px, py] of corners) {
		const dx = px - cx;
		const dy = py - cy;
		const nx = cx + dx * cos - dy * sin;
		const ny = cy + dx * sin + dy * cos;
		if (nx < minX) minX = nx;
		if (nx > maxX) maxX = nx;
		if (ny < minY) minY = ny;
		if (ny > maxY) maxY = ny;
	}
	return { left: minX, right: maxX, top: minY, bottom: maxY };
}

// ── BQN evaluation ───────────────────────────────────────────────────────
// Tests use the real interpreter directly (the worker is for the browser).
// Same structurize logic as the worker.

function structurize(v: unknown): BqnStructuredValue {
	if (typeof v === 'number') return { kind: 'number', value: v };
	if (typeof v === 'string') return { kind: 'char', value: v };
	if (Array.isArray(v)) {
		const arr = v as unknown[] & { sh?: number[] };
		const shape = Array.isArray(arr.sh) ? [...arr.sh] : [arr.length];
		return { kind: 'array', shape, data: arr.map(structurize) };
	}
	if (typeof v === 'function') return { kind: 'fn' };
	return { kind: 'namespace' };
}

export function fromStructured(s: BqnStructuredValue): BqnValue {
	switch (s.kind) {
		case 'number': return { kind: 'number', value: s.value };
		case 'char':   return { kind: 'char',   value: s.value };
		case 'array':  return { kind: 'array',  shape: s.shape, data: s.data.map(fromStructured) };
		case 'fn':     return { kind: 'fn',     def: { kind: 'opaque', name: '{fn}', resolved: { kind: 'add' } } };
		case 'namespace': return { kind: 'namespace', entries: new Map() };
	}
}

export function evalBqn(source: string): BqnValue {
	return fromStructured(structurize(run(...compile(source))));
}
