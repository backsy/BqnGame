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
				row.appendChild(el);
				cellsOut.push({ id: `${prefix}.cell${i}`, el, naturalRect: cellRect });
			}
			return row;
		}
		if (value.shape.length === 2) {
			const [R, C] = value.shape;
			const cellW = 28;
			const cellH = BAR_MAX_HEIGHT; // simplest: every grid cell sized large
			const gridW = C * cellW + (C - 1) * ROW_GAP + 2 * ROW_PADDING;
			const gridH = R * cellH + (R - 1) * ROW_GAP + 2 * ROW_PADDING;
			const grid = document.createElement('div');
			grid.className = `row bqn-matrix`;
			setRect(grid, rect(cx, cy, gridW, gridH));
			const topEdge = cy - gridH / 2 + ROW_PADDING;
			const leftEdge = cx - gridW / 2 + ROW_PADDING;
			for (let r = 0; r < R; r++) {
				for (let c = 0; c < C; c++) {
					const item = value.data[r * C + c];
					const cellH_i = item.kind === 'number' ? barHeight(item.value) : BAR_BASE_HEIGHT;
					const cellCx = leftEdge + cellW / 2 + c * (cellW + ROW_GAP);
					const cellBaselineY = topEdge + (r + 1) * cellH + r * ROW_GAP;
					const cellCy = cellBaselineY - cellH_i / 2;
					const cellRect = rect(cellCx, cellCy, BAR_WIDTH, cellH_i);
					const el = makeMockElement(`${prefix}.cell${r}_${c}`, cellRect).el;
					grid.appendChild(el);
					cellsOut.push({ id: `${prefix}.cell${r}_${c}`, el, naturalRect: cellRect });
				}
			}
			return grid;
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
		const tx = parseTx(el.style.transform);
		const ty = parseTy(el.style.transform);
		const w = r.right - r.left;
		const h = r.bottom - r.top;
		const left = r.left + tx;
		const top = r.top + ty;
		return {
			left, top, right: left + w, bottom: top + h,
			width: w, height: h, x: left, y: top, toJSON: () => ({}),
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
