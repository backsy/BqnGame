// Framework-free bracket around the state → visual handoff.
//
// withSnapshot(spec, body) flows:
//   prepare  — snapshot pre-commit DOM (rects + ghost overlay), hide live viz
//   commit   — await spec.commit() (state mutation + DOM settle happen here)
//   assemble — read spec.newCells() and build the Snapshot
//   body     — run the animation with the assembled Snapshot
//   finally  — reveal live viz + remove ghost (idempotent, runs on throw too)
//
// No Svelte imports. The caller provides:
//   - spec.commit(): may be async (Svelte callers include await tick() inside)
//   - spec.newCells(): thunk called after commit resolves; returns settled cells

import type { Cell, CellId, Committed, Prepared, Snapshot, SnapshotSpec } from './types';

// ─── internal helpers ────────────────────────────────────────────

function prepare(
	vizRoot: HTMLElement,
	oldCells: ReadonlyArray<Cell>
): Prepared {
	const vizRect = vizRoot.getBoundingClientRect();

	// Collect pre-commit bounding rects via data-cell-id attributes.
	const oldRects = new Map<CellId, DOMRect>();
	for (const cell of oldCells) {
		const el = vizRoot.querySelector<HTMLElement>(`[data-cell-id="${cell.id}"]`);
		if (el) oldRects.set(cell.id as CellId, el.getBoundingClientRect());
	}

	// Clone the live viz as a fixed overlay parked at viewport coords.
	// This is the visual stand-in the user sees while the animation runs.
	const ghost = vizRoot.cloneNode(true) as HTMLElement;
	Object.assign(ghost.style, {
		position: 'fixed',
		left: `${vizRect.left}px`,
		top: `${vizRect.top}px`,
		width: `${vizRect.width}px`,
		height: `${vizRect.height}px`,
		margin: '0',
		zIndex: '20',
		pointerEvents: 'none'
	});
	document.body.appendChild(ghost);

	// Map old cell ids → their clones inside the ghost (rank-1 only).
	const ghostNodes = new Map<CellId, HTMLElement>();
	const ghostWraps = Array.from(
		ghost.querySelectorAll<HTMLElement>('[data-cell-id]')
	);
	for (const wrap of ghostWraps) {
		const raw = parseInt(wrap.dataset.cellId ?? '', 10);
		if (!Number.isNaN(raw)) ghostNodes.set(raw as CellId, wrap);
	}

	// Hide live viz behind the ghost immediately.
	vizRoot.style.visibility = 'hidden';

	return { vizRoot, oldCells, oldRects, ghost, ghostNodes };
}

function assemble(committed: Committed): Snapshot {
	const { prepared, newCells } = committed;
	const { vizRoot, oldCells, oldRects, ghost, ghostNodes } = prepared;

	let revealed = false;
	const reveal = () => {
		if (revealed) return;
		revealed = true;
		vizRoot.style.visibility = '';
	};

	const getLiveNode = (id: CellId): HTMLElement | null =>
		vizRoot.querySelector<HTMLElement>(`[data-cell-id="${id}"]`);

	const getGhostNode = (id: CellId): HTMLElement | null =>
		ghostNodes.get(id) ?? null;

	return {
		oldCells,
		cells: newCells,
		oldRects,
		getLiveNode,
		ghost,
		getGhostNode,
		liveViz: vizRoot,
		reveal,
		// Alias so existing animation callers using revealLive keep working.
		revealLive: reveal
	};
}

// ─── public API ──────────────────────────────────────────────────

export async function withSnapshot(
	spec: SnapshotSpec,
	body: (snap: Snapshot) => Promise<void>
): Promise<void> {
	const { vizRoot, oldCells, commit: doCommit, newCells: getNewCells } = spec;

	// Phase 1: capture pre-commit DOM state.
	const prepared = prepare(vizRoot, oldCells);

	// Phase 2: commit state. Caller may return a Promise to allow DOM
	// settlement (e.g. Svelte callers include "await tick()" in the closure).
	// Promise.resolve() wraps both void and Promise<void> returns.
	await Promise.resolve(doCommit());

	// Phase 3: read post-commit cells and assemble the animation-facing type.
	const committed: Committed = { prepared, newCells: getNewCells() };
	const snap = assemble(committed);

	try {
		await body(snap);
	} finally {
		// Idempotent cleanup: always reveal live viz and dispose ghost.
		snap.reveal();
		if (snap.ghost.parentNode) snap.ghost.remove();
	}
}
