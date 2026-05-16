// v3 history — REPL-grade undo/redo. Every entry is the result of one
// valid BQN expression evaluated by the worker.
//
// Pure helpers operate on the History value (cursor moves, structural
// edits). The impure operations (`reset`, `apply`) wrap the pure helpers
// and call the worker; they take a `toScene` projection from the caller
// so this module stays layout-agnostic — the bqnValueToScene authoring
// happens elsewhere when the user specs the rendering.

import type { BqnStructuredValue } from '$lib/bqn/protocol';
import type { BqnWorkerClient } from '$lib/bqn/worker-client';
import type { Scene } from './scene';

/** One step in the REPL: BQN source, evaluated value, projected scene. */
export type HistoryEntry = {
	source: string;
	value: BqnStructuredValue;
	scene: Scene;
};

/**
 * Ordered list of entries plus a cursor.
 *
 *   cursor === -1            when `entries.length === 0`
 *   cursor in [0, length-1]  otherwise
 */
export type History = {
	entries: HistoryEntry[];
	cursor: number;
};

/** A History with no entries. */
export function emptyHistory(): History {
	return { entries: [], cursor: -1 };
}

/** Pure: returns the entry under the cursor, or `null` if empty. */
export function current(h: History): HistoryEntry | null {
	if (h.cursor < 0) return null;
	return h.entries[h.cursor] ?? null;
}

/**
 * Pure: discards the forward tail (entries strictly after `cursor`),
 * appends `entry`, advances the cursor to the new tip. This is the
 * truncate-on-write rule — standard REPL semantics, not git.
 */
export function pushEntry(h: History, entry: HistoryEntry): History {
	const kept = h.entries.slice(0, h.cursor + 1);
	const entries = [...kept, entry];
	return { entries, cursor: entries.length - 1 };
}

/** Pure: cursor moves back one if possible; identity at the start. */
export function undo(h: History): History {
	if (h.cursor <= 0) return h;
	return { entries: h.entries, cursor: h.cursor - 1 };
}

/** Pure: cursor moves forward one if possible; identity at the tip. */
export function redo(h: History): History {
	if (h.cursor >= h.entries.length - 1) return h;
	return { entries: h.entries, cursor: h.cursor + 1 };
}

/**
 * Pure: move cursor to `i`. Out-of-range throws — clamp at the call
 * site when that's the intended behaviour.
 */
export function jumpTo(h: History, i: number): History {
	if (h.entries.length === 0) {
		throw new Error('jumpTo on empty history');
	}
	if (i < 0 || i >= h.entries.length) {
		throw new Error(
			`jumpTo(${i}) out of [0, ${h.entries.length - 1}]`,
		);
	}
	return { entries: h.entries, cursor: i };
}

/**
 * Impure: evaluate `source` in the worker; return a History with a
 * single entry (cursor at 0). Used by starter buttons.
 *
 * `toScene` is the projection from BQN value to Scene; supplied by the
 * caller so this module stays free of layout concerns.
 */
export async function reset(
	worker: BqnWorkerClient,
	source: string,
	toScene: (v: BqnStructuredValue) => Scene,
): Promise<History> {
	const value = await worker.evalStructured(source);
	const scene = toScene(value);
	return { entries: [{ source, value, scene }], cursor: 0 };
}

/**
 * Impure: evaluate `source`, append a new entry under truncate-on-write
 * semantics. Used by op buttons.
 */
export async function apply(
	worker: BqnWorkerClient,
	h: History,
	source: string,
	toScene: (v: BqnStructuredValue) => Scene,
): Promise<History> {
	const value = await worker.evalStructured(source);
	const scene = toScene(value);
	return pushEntry(h, { source, value, scene });
}
