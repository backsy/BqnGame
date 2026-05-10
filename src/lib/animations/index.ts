// Controller. The single entry point that the +page.svelte hooks into.
// Maps each rune expression to the right pure animation, builds the
// inputs the animation expects from the Snapshot, and runs it.
//
// State is already committed by the time dispatchAnimation is called
// (see applyRune in +page.svelte). Animations are pure functions and
// never see history, never call commit, never know what a "cell" is.

import type { Cell, Snapshot } from './types';
export type { Cell, Snapshot } from './types';

import { reverse, type ReverseItem } from './reverse';
import { sort, type SortItem } from './sort';
import { range, type RangeItem } from './range';
import { broadcast, type BroadcastItem } from './broadcast';
import { scan, type ScanItem } from './scan';
import { fold } from './fold';
import { filter, type FilterItem } from './filter';
import { join, type JoinExisting, type JoinNew } from './join';
import { take } from './take';
import { drop } from './drop';
import { pick } from './pick';
import { length } from './length';
import { reshape, type ReshapeItem } from './reshape';
import { transpose, type TransposeItem } from './transpose';
import { deshape, type DeshapeItem } from './deshape';
import { tables } from './tables';
import { windows } from './windows';

// ─────────────────────────── helpers ────────────────────────────

function ghostBarHeight(ghost: HTMLElement | null): number {
	if (!ghost) return NaN;
	const bar = ghost.querySelector('.bar') as HTMLElement | null;
	if (!bar) return NaN;
	return parseFloat(bar.style.height);
}

function liveBarHeight(live: HTMLElement | null): number {
	if (!live) return NaN;
	const bar = live.querySelector('.bar') as HTMLElement | null;
	if (!bar) return NaN;
	return parseFloat(bar.style.height);
}

function findGhostBars(ghost: HTMLElement): HTMLElement[] {
	const grid = ghost.querySelector(':scope > .grid');
	if (grid) return Array.from(grid.children) as HTMLElement[];
	return [];
}

function findLiveGridChildren(viz: HTMLElement): HTMLElement[] {
	const grid = viz.querySelector(':scope > .grid');
	if (!grid) return [];
	return Array.from(grid.children) as HTMLElement[];
}

function findLiveScalarBar(viz: HTMLElement): HTMLElement | null {
	return viz.querySelector(':scope > .bar') as HTMLElement | null;
}

function readVizMaxFromBar(bar: HTMLElement | null, value: number): number {
	if (!bar) return Math.max(Math.abs(value), 4);
	const h = parseFloat(bar.style.height);
	if (isNaN(h) || h <= 18 || value === 0) return Math.max(Math.abs(value), 4);
	return (Math.abs(value) * 60) / (h - 18);
}

const PREDICATE_FN: Record<string, (a: number, n: number) => boolean> = {
	'<': (a, n) => a < n,
	'>': (a, n) => a > n,
	'=': (a, n) => a === n
};

// ──────────────────────────── runners ───────────────────────────

async function runReverse(snap: Snapshot): Promise<void> {
	snap.revealLive();
	snap.ghost.remove();
	const items: ReverseItem[] = [];
	for (const cell of snap.cells) {
		const node = snap.getLiveNode(cell.id);
		const oldRect = snap.oldRects.get(cell.id);
		if (!node || !oldRect) continue;
		items.push({ node, oldRect, newRect: node.getBoundingClientRect() });
	}
	await reverse(items);
}

async function runSort(snap: Snapshot): Promise<void> {
	snap.revealLive();
	snap.ghost.remove();
	const items: SortItem[] = [];
	for (let i = 0; i < snap.cells.length; i++) {
		const cell = snap.cells[i];
		const node = snap.getLiveNode(cell.id);
		const oldRect = snap.oldRects.get(cell.id);
		if (!node || !oldRect) continue;
		items.push({
			node,
			oldRect,
			newRect: node.getBoundingClientRect(),
			staggerIndex: i
		});
	}
	await sort(items);
}

async function runRange(snap: Snapshot): Promise<void> {
	snap.revealLive();
	snap.ghost.remove();
	const items: RangeItem[] = [];
	for (const cell of snap.cells) {
		const node = snap.getLiveNode(cell.id);
		if (node) items.push({ node });
	}
	await range(items);
}

async function runBroadcast(snap: Snapshot, label: string): Promise<void> {
	// Row case: same-length pre/post (cell tracker preserved ids).
	if (
		snap.oldCells.length > 0 &&
		snap.cells.length === snap.oldCells.length
	) {
		snap.revealLive();
		snap.ghost.remove();
		const items: BroadcastItem[] = [];
		for (let i = 0; i < snap.cells.length; i++) {
			const cell = snap.cells[i];
			const liveWrap = snap.getLiveNode(cell.id);
			if (!liveWrap) continue;
			const liveBar = liveWrap.querySelector('.bar') as HTMLElement | null;
			if (!liveBar) continue;
			const ghostWrap = snap.getGhostNode(cell.id);
			const ghostBar = ghostWrap?.querySelector(
				'.bar'
			) as HTMLElement | null;
			const oldH = ghostBar ? parseFloat(ghostBar.style.height) : NaN;
			const newH = parseFloat(liveBar.style.height);
			if (isNaN(oldH) || isNaN(newH)) continue;
			items.push({ anchor: liveWrap, bar: liveBar, oldH, newH });
		}
		await broadcast(items, label);
		return;
	}

	// Scalar case: ValueViz renders a single bar inside .viz.
	const liveBar = findLiveScalarBar(snap.liveViz);
	const ghostBar = findLiveScalarBar(snap.ghost);
	if (!liveBar || !ghostBar) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const oldH = parseFloat(ghostBar.style.height);
	const newH = parseFloat(liveBar.style.height);
	if (isNaN(oldH) || isNaN(newH)) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	const vizRect = snap.liveViz.getBoundingClientRect();
	const barRect = liveBar.getBoundingClientRect();
	const badgeLeftPx = barRect.left + barRect.width / 2 - vizRect.left;
	const badgeTopPx = barRect.top - vizRect.top - 30;

	snap.revealLive();
	snap.ghost.remove();

	await broadcast(
		[
			{
				anchor: snap.liveViz,
				bar: liveBar,
				oldH,
				newH,
				badgeLeftPx,
				badgeTopPx
			}
		],
		label
	);
}

async function runScan(snap: Snapshot, operator: string): Promise<void> {
	// Same-length pre/post; ids preserved by the cell tracker.
	snap.revealLive();
	snap.ghost.remove();

	if (snap.oldCells.length !== snap.cells.length) return;
	const oldVals = snap.oldCells.map((c) => c.value);
	const newVals = snap.cells.map((c) => c.value);
	if (
		!oldVals.every((v): v is number => typeof v === 'number') ||
		!newVals.every((v): v is number => typeof v === 'number')
	)
		return;

	const items: ScanItem[] = [];
	for (let i = 0; i < snap.cells.length; i++) {
		const cell = snap.cells[i];
		const wrap = snap.getLiveNode(cell.id);
		if (!wrap) continue;
		const bar = wrap.querySelector('.bar') as HTMLElement | null;
		const num = bar?.querySelector('.num') as HTMLElement | null;
		if (!bar) continue;
		items.push({
			wrap,
			bar,
			num,
			oldValue: oldVals[i],
			newValue: newVals[i]
		});
	}

	const visualMax = Math.max(
		...oldVals.map(Math.abs),
		...newVals.map(Math.abs),
		4
	);
	const valToH = (v: number) =>
		Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

	await scan(items, operator, valToH);
}

async function runFold(snap: Snapshot, operator: string): Promise<void> {
	if (snap.oldCells.length < 2) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const values = snap.oldCells.map((c) => c.value);
	if (!values.every((v): v is number => typeof v === 'number')) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	// Collect ghost wraps in order.
	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	// visualMax: max abs across all intermediates.
	let acc = values[0];
	const intermediates: number[] = [acc];
	const op: Record<string, (a: number, b: number) => number> = {
		'+': (a, b) => a + b,
		'-': (a, b) => a - b,
		'×': (a, b) => a * b,
		'÷': (a, b) => a / b,
		'⌈': (a, b) => Math.max(a, b),
		'⌊': (a, b) => Math.min(a, b)
	};
	for (let i = 1; i < values.length; i++) {
		acc = op[operator](acc, values[i]);
		intermediates.push(acc);
	}
	const visualMax = Math.max(
		...intermediates.map(Math.abs),
		...values.map(Math.abs),
		4
	);

	// Where the post-commit scalar bar will be centered.
	const liveBar = findLiveScalarBar(snap.liveViz);
	const vizRect = snap.liveViz.getBoundingClientRect();
	const liveBarRect = liveBar?.getBoundingClientRect();
	const scalarCenterX = liveBarRect
		? liveBarRect.left + liveBarRect.width / 2
		: vizRect.left + vizRect.width / 2;
	const scalarCenterY = liveBarRect
		? liveBarRect.top + liveBarRect.height / 2
		: vizRect.top + vizRect.height / 2;

	await fold({
		ghostWraps,
		values,
		operator,
		visualMax,
		scalarCenterX,
		scalarCenterY
	});

	snap.revealLive();
	snap.ghost.remove();
}

async function runFilter(
	snap: Snapshot,
	operator: string,
	n: number
): Promise<void> {
	const pred = PREDICATE_FN[operator];
	if (!pred || snap.oldCells.length === 0) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const verdicts = snap.oldCells.map((c) =>
		typeof c.value === 'number' ? pred(c.value as number, n) : false
	);

	const items: FilterItem[] = [];
	for (let i = 0; i < snap.oldCells.length; i++) {
		const oldCell = snap.oldCells[i];
		const ghostWrap = snap.getGhostNode(oldCell.id);
		if (!ghostWrap) continue;
		const passes = verdicts[i];
		const oldRect = snap.oldRects.get(oldCell.id);
		// Live wrap is the one with the same id (preserved by cell
		// tracker for passers).
		const liveWrap = passes ? snap.getLiveNode(oldCell.id) : null;
		const newRect = liveWrap?.getBoundingClientRect();
		items.push({
			wrap: ghostWrap,
			passes,
			oldRect,
			newRect
		});
	}

	await filter(items, `${operator}${n}`);
	snap.revealLive();
	snap.ghost.remove();
}

async function runJoin(
	snap: Snapshot,
	direction: 'append' | 'prepend' | 'self'
): Promise<void> {
	snap.revealLive();
	snap.ghost.remove();
	if (snap.cells.length <= snap.oldCells.length) return;

	const addedCount = snap.cells.length - snap.oldCells.length;
	const isPrepend = direction === 'prepend';
	const newRange = isPrepend
		? { from: 0, to: addedCount }
		: { from: snap.oldCells.length, to: snap.cells.length };
	const slideDirection: 'left' | 'right' = isPrepend ? 'left' : 'right';

	const existing: JoinExisting[] = [];
	const added: JoinNew[] = [];

	// Existing cells: ids preserved at the start (append/self) or end
	// (prepend) of the post-commit cells array.
	for (let i = 0; i < snap.oldCells.length; i++) {
		const oldCell = snap.oldCells[i];
		const liveWrap = snap.getLiveNode(oldCell.id);
		const oldRect = snap.oldRects.get(oldCell.id);
		if (!liveWrap || !oldRect) continue;
		existing.push({
			wrap: liveWrap,
			oldRect,
			newRect: liveWrap.getBoundingClientRect()
		});
	}

	let cascadeIdx = 0;
	for (let i = newRange.from; i < newRange.to; i++) {
		const cell = snap.cells[i];
		const wrap = snap.getLiveNode(cell.id);
		if (!wrap) {
			cascadeIdx++;
			continue;
		}
		added.push({ wrap, cascadeIndex: cascadeIdx });
		cascadeIdx++;
	}

	await join(existing, added, slideDirection);
}

async function runTake(snap: Snapshot, n: number): Promise<void> {
	if (snap.oldCells.length < n) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	// keptOldRects: pre-commit (pre-lift) ghost positions.
	const keptOldRects: DOMRect[] = [];
	for (let i = 0; i < n; i++) {
		const r = snap.oldRects.get(snap.oldCells[i].id);
		if (!r) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		keptOldRects.push(r);
	}

	// keptTargetRects: post-commit (live) positions for the kept wraps.
	const keptTargetRects: DOMRect[] = [];
	for (let i = 0; i < n; i++) {
		const live = snap.getLiveNode(snap.oldCells[i].id);
		if (!live) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		keptTargetRects.push(live.getBoundingClientRect());
	}

	await take({ ghostWraps, n, keptOldRects, keptTargetRects });

	snap.revealLive();
	snap.ghost.remove();
}

async function runDrop(snap: Snapshot, n: number): Promise<void> {
	if (snap.oldCells.length < n) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	const survivorOldRects: DOMRect[] = [];
	for (let i = n; i < snap.oldCells.length; i++) {
		const r = snap.oldRects.get(snap.oldCells[i].id);
		if (!r) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		survivorOldRects.push(r);
	}

	const survivorTargetRects: DOMRect[] = [];
	for (let i = n; i < snap.oldCells.length; i++) {
		const live = snap.getLiveNode(snap.oldCells[i].id);
		if (!live) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		survivorTargetRects.push(live.getBoundingClientRect());
	}

	await drop({ ghostWraps, n, survivorOldRects, survivorTargetRects });

	snap.revealLive();
	snap.ghost.remove();
}

async function runPick(snap: Snapshot, index: number): Promise<void> {
	if (
		snap.oldCells.length === 0 ||
		index < 0 ||
		index >= snap.oldCells.length
	) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	const liveBar = findLiveScalarBar(snap.liveViz);
	const vizRect = snap.liveViz.getBoundingClientRect();
	const liveBarRect = liveBar?.getBoundingClientRect();
	const scalarCenterX = liveBarRect
		? liveBarRect.left + liveBarRect.width / 2
		: vizRect.left + vizRect.width / 2;
	const scalarCenterY = liveBarRect
		? liveBarRect.top + liveBarRect.height / 2
		: vizRect.top + vizRect.height / 2;

	await pick({
		ghostWraps,
		keptIndex: index,
		scalarCenterX,
		scalarCenterY
	});
	snap.revealLive();
	snap.ghost.remove();
}

async function runLength(snap: Snapshot): Promise<void> {
	if (snap.oldCells.length === 0) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	// Reveal live early so the scalar bar exists and we can fade it in.
	snap.revealLive();
	const liveScalarBar = findLiveScalarBar(snap.liveViz);

	await length({ ghostWraps, liveScalarBar });

	snap.ghost.remove();
}

async function runReshape(
	snap: Snapshot,
	rows: number,
	cols: number
): Promise<void> {
	if (snap.oldCells.length !== rows * cols) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	// Read target rects from the live grid (briefly reveal viz to
	// measure, since it's hidden behind ghost).
	snap.revealLive();
	const liveGridChildren = findLiveGridChildren(snap.liveViz);
	const targetRects = liveGridChildren.map((el) => el.getBoundingClientRect());
	if (targetRects.length !== rows * cols) {
		snap.ghost.remove();
		return;
	}

	const items: ReshapeItem[] = ghostWraps.map((ghostWrap, i) => ({
		ghostWrap,
		targetRect: targetRects[i]
	}));

	// Re-hide live during the animation; ghost is what the user sees.
	snap.liveViz.style.visibility = 'hidden';
	await reshape(items);
	snap.liveViz.style.visibility = '';

	snap.ghost.remove();
}

async function runTranspose(snap: Snapshot): Promise<void> {
	const ghostCells = findGhostBars(snap.ghost);
	if (ghostCells.length === 0) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	// Read pre-grid shape from the ghost grid's grid-template-columns.
	const ghostGrid = snap.ghost.querySelector(':scope > .grid') as HTMLElement | null;
	if (!ghostGrid) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const colsMatch = ghostGrid.style.gridTemplateColumns.match(/repeat\((\d+),/);
	if (!colsMatch) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const cols = parseInt(colsMatch[1], 10);
	const total = ghostCells.length;
	if (total % cols !== 0) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const rows = total / cols;

	// Read target rects from live grid.
	snap.revealLive();
	const liveCells = findLiveGridChildren(snap.liveViz);
	const targetRects = liveCells.map((el) => el.getBoundingClientRect());
	if (targetRects.length !== total) {
		snap.ghost.remove();
		return;
	}

	const items: TransposeItem[] = ghostCells.map((ghostCell, i) => {
		const r = Math.floor(i / cols);
		const c = i % cols;
		const newFlat = c * rows + r;
		return {
			ghostCell,
			targetRect: targetRects[newFlat],
			staggerKey: Math.abs(r - c)
		};
	});

	snap.liveViz.style.visibility = 'hidden';
	await transpose(items);
	snap.liveViz.style.visibility = '';
	snap.ghost.remove();
}

async function runDeshape(snap: Snapshot): Promise<void> {
	const ghostCells = findGhostBars(snap.ghost);
	if (ghostCells.length === 0) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	// Post-commit is a 1D row.
	snap.revealLive();
	const targetRects: DOMRect[] = [];
	for (const cell of snap.cells) {
		const liveWrap = snap.getLiveNode(cell.id);
		if (!liveWrap) {
			snap.ghost.remove();
			return;
		}
		targetRects.push(liveWrap.getBoundingClientRect());
	}
	if (targetRects.length !== ghostCells.length) {
		snap.ghost.remove();
		return;
	}

	const items: DeshapeItem[] = ghostCells.map((ghostCell, i) => ({
		ghostCell,
		targetRect: targetRects[i]
	}));

	snap.liveViz.style.visibility = 'hidden';
	await deshape(items);
	snap.liveViz.style.visibility = '';
	snap.ghost.remove();
}

async function runTables(
	snap: Snapshot,
	operator: string
): Promise<void> {
	if (snap.oldCells.length < 2) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}
	const xs = snap.oldCells.map((c) => c.value);
	if (!xs.every((v): v is number => typeof v === 'number')) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}

	// Reveal live to get the post-commit grid; tables() animation
	// re-hides during animation as needed.
	snap.revealLive();
	const liveGrid = snap.liveViz.querySelector(
		':scope > .grid'
	) as HTMLElement | null;
	if (!liveGrid) {
		snap.ghost.remove();
		return;
	}

	snap.liveViz.style.visibility = 'hidden';
	await tables({ ghostWraps, xs, operator, liveGrid });
	snap.liveViz.style.visibility = '';
	snap.ghost.remove();
}

async function runWindows(snap: Snapshot, n: number): Promise<void> {
	if (snap.oldCells.length < n) {
		snap.revealLive();
		snap.ghost.remove();
		return;
	}

	const ghostWraps: HTMLElement[] = [];
	for (const cell of snap.oldCells) {
		const w = snap.getGhostNode(cell.id);
		if (!w) {
			snap.revealLive();
			snap.ghost.remove();
			return;
		}
		ghostWraps.push(w);
	}
	const xs = snap.oldCells.map((c) => c.value);

	snap.revealLive();
	const liveGrid = snap.liveViz.querySelector(
		':scope > .grid'
	) as HTMLElement | null;
	if (!liveGrid) {
		snap.ghost.remove();
		return;
	}

	snap.liveViz.style.visibility = 'hidden';
	await windows({ ghostWraps, xs, N: n, liveGrid });
	snap.liveViz.style.visibility = '';
	snap.ghost.remove();
}

// ──────────────────────────── dispatch ──────────────────────────

const TAKE_RE = /^(\d+)⊸↑$/;
const DROP_RE = /^(\d+)⊸↓$/;
const BCAST_DYAD_RE = /^([+\-×÷=<>⋆])⟜(\d+)$/;
const BCAST_MOD_RE = /^(\d+)⊸\|$/;
const BCAST_LEFT_POW_RE = /^(\d+)⊸([⋆√])$/;
const BCAST_SELF_RE = /^([+\-×])˜$/;
const FOLD_RE = /^([+\-×÷⌈⌊])´$/;
const SCAN_RE = /^([+\-×÷⌈⌊])`$/;
const FILTER_RE = /^\(([=<>])⟜(\d+)\)⊸\/$/;
const RESHAPE_RE = /^(\d+)‿(\d+)⊸⥊$/;
const PICK_RE = /^(\d+)⊸⊑$/;
const TABLE_SELF_RE = /^([+\-×÷⌈⌊=<>])⌜˜$/;
const WINDOWS_RE = /^(\d+)⊸↕$/;

export async function dispatchAnimation(
	expr: string,
	snap: Snapshot
): Promise<void> {
	// Direct matches.
	if (expr === '⌽') return runReverse(snap);
	if (expr === '∧' || expr === '∨') return runSort(snap);
	if (expr === '↕') return runRange(snap);
	if (expr === '⊑') return runPick(snap, 0);
	if (expr === '≠') return runLength(snap);
	if (expr === '⍉') return runTranspose(snap);
	if (expr === '⥊') return runDeshape(snap);
	if (expr === '∾˜') return runJoin(snap, 'self');
	if (expr === '√') return runBroadcast(snap, '√');

	// Regex matches — order matters: check ⋆⟜N before BCAST_DYAD if we
	// ever route them differently. Currently both go through broadcast.
	let m: RegExpExecArray | null;

	if ((m = BCAST_DYAD_RE.exec(expr))) return runBroadcast(snap, `${m[1]}${m[2]}`);
	if ((m = BCAST_MOD_RE.exec(expr))) return runBroadcast(snap, `${m[1]}|`);
	if ((m = BCAST_LEFT_POW_RE.exec(expr)))
		return runBroadcast(snap, `${m[1]}${m[2]}`);
	if ((m = BCAST_SELF_RE.exec(expr))) return runBroadcast(snap, `${m[1]}˜`);
	if ((m = FOLD_RE.exec(expr))) return runFold(snap, m[1]);
	if ((m = SCAN_RE.exec(expr))) return runScan(snap, m[1]);
	if ((m = FILTER_RE.exec(expr)))
		return runFilter(snap, m[1], parseInt(m[2], 10));
	if ((m = RESHAPE_RE.exec(expr)))
		return runReshape(snap, parseInt(m[1], 10), parseInt(m[2], 10));
	if ((m = TAKE_RE.exec(expr))) return runTake(snap, parseInt(m[1], 10));
	if ((m = DROP_RE.exec(expr))) return runDrop(snap, parseInt(m[1], 10));
	if ((m = PICK_RE.exec(expr))) return runPick(snap, parseInt(m[1], 10));
	if ((m = TABLE_SELF_RE.exec(expr))) return runTables(snap, m[1]);
	if ((m = WINDOWS_RE.exec(expr))) return runWindows(snap, parseInt(m[1], 10));

	if (expr.startsWith('∾⟜')) return runJoin(snap, 'append');
	if (expr.endsWith('⊸∾')) return runJoin(snap, 'prepend');

	// No animation registered — clean up the controller's overlay.
	snap.revealLive();
	snap.ghost.remove();
}

/** True iff the expr has any animation registered. The controller in
 *  +page.svelte uses this to decide whether to set up the ghost +
 *  hide-live machinery. If not, it just commits and returns. */
export function hasAnimation(expr: string): boolean {
	if (
		expr === '⌽' ||
		expr === '∧' ||
		expr === '∨' ||
		expr === '↕' ||
		expr === '⊑' ||
		expr === '≠' ||
		expr === '⍉' ||
		expr === '⥊' ||
		expr === '∾˜' ||
		expr === '√'
	)
		return true;
	if (BCAST_DYAD_RE.test(expr)) return true;
	if (BCAST_MOD_RE.test(expr)) return true;
	if (BCAST_LEFT_POW_RE.test(expr)) return true;
	if (BCAST_SELF_RE.test(expr)) return true;
	if (FOLD_RE.test(expr)) return true;
	if (SCAN_RE.test(expr)) return true;
	if (FILTER_RE.test(expr)) return true;
	if (RESHAPE_RE.test(expr)) return true;
	if (TAKE_RE.test(expr)) return true;
	if (DROP_RE.test(expr)) return true;
	if (PICK_RE.test(expr)) return true;
	if (TABLE_SELF_RE.test(expr)) return true;
	if (WINDOWS_RE.test(expr)) return true;
	if (expr.startsWith('∾⟜')) return true;
	if (expr.endsWith('⊸∾')) return true;
	return false;
}
