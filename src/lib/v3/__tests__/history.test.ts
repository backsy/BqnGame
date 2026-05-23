// Property tests for the pure REPL history helpers.
//
// The load-bearing invariant: animation duration must not affect
// undo/reset/history correctness. history.ts holds the line by
// keeping every state mutation in a synchronous pure helper that
// depends on nothing but its arguments — no clock, no worker, no
// scheduler. These tests pin that contract so a future refactor
// can't reintroduce time-coupled state by mistake.
//
// The impure wrappers (reset, apply) only sandwich the pure helpers
// with worker.evalStructured + a scene projection; they're tested
// at the integration layer with a fake worker, not here.

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import type { History, HistoryEntry } from '../history';
import {
	current,
	emptyHistory,
	jumpTo,
	pushEntry,
	redo,
	undo,
} from '../history';

// ── arbitraries ───────────────────────────────────────────────────────────

// Helpers never read inside HistoryEntry — they treat it as opaque.
// Build a minimally well-formed entry so tests don't need type casts.
function entry(tag: string): HistoryEntry {
	return {
		source: tag,
		value: { kind: 'number', value: 0 },
		scene: {
			kind: 'atom',
			viewBox: { x: 0, y: 0, w: 1, h: 1 },
			atom: { id: tag, x: 0, y: 0, w: 1, h: 1, value: 0, inner: null },
		},
	};
}

const arbEntry: fc.Arbitrary<HistoryEntry> = fc
	.string({ minLength: 1, maxLength: 5 })
	.map(entry);

// A non-empty history with cursor at some valid index.
const arbNonEmptyHistory: fc.Arbitrary<History> = fc
	.array(arbEntry, { minLength: 1, maxLength: 20 })
	.chain((entries) =>
		fc
			.integer({ min: 0, max: entries.length - 1 })
			.map((cursor) => ({ entries, cursor })),
	);

// ── tests ─────────────────────────────────────────────────────────────────

describe('emptyHistory', () => {
	test('zero entries, cursor at -1', () => {
		const h = emptyHistory();
		expect(h.entries).toEqual([]);
		expect(h.cursor).toBe(-1);
	});
});

describe('current', () => {
	test('returns null on empty history', () => {
		expect(current(emptyHistory())).toBeNull();
	});

	test('returns entries[cursor] for non-empty', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				const e = current(h);
				expect(e).not.toBeNull();
				expect(e).toBe(h.entries[h.cursor]);
			}),
			{ numRuns: 100 },
		);
	});
});

describe('pushEntry', () => {
	test('appending to empty yields one entry at cursor 0', () => {
		const h = pushEntry(emptyHistory(), entry('a'));
		expect(h.entries.length).toBe(1);
		expect(h.cursor).toBe(0);
		expect(h.entries[0].source).toBe('a');
	});

	test('appending at tip extends length by 1 and lands cursor on the new tail', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, arbEntry, (h, e) => {
				const atTip = {
					entries: h.entries,
					cursor: h.entries.length - 1,
				};
				const h2 = pushEntry(atTip, e);
				expect(h2.entries.length).toBe(atTip.entries.length + 1);
				expect(h2.cursor).toBe(h2.entries.length - 1);
				expect(h2.entries[h2.cursor]).toBe(e);
			}),
			{ numRuns: 100 },
		);
	});

	test('truncate-on-write: pushing in the middle drops the forward tail', () => {
		const h: History = {
			entries: [entry('a'), entry('b'), entry('c')],
			cursor: 1,
		};
		const h2 = pushEntry(h, entry('d'));
		expect(h2.entries.map((e) => e.source)).toEqual(['a', 'b', 'd']);
		expect(h2.cursor).toBe(2);
	});

	test('preserves entry identity for everything at or before cursor', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, arbEntry, (h, e) => {
				const h2 = pushEntry(h, e);
				for (let i = 0; i <= h.cursor; i++) {
					expect(h2.entries[i]).toBe(h.entries[i]);
				}
			}),
			{ numRuns: 100 },
		);
	});

	test('does not mutate the input history', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, arbEntry, (h, e) => {
				const lenBefore = h.entries.length;
				const cursorBefore = h.cursor;
				const refsBefore = [...h.entries];
				pushEntry(h, e);
				expect(h.entries.length).toBe(lenBefore);
				expect(h.cursor).toBe(cursorBefore);
				for (let i = 0; i < h.entries.length; i++) {
					expect(h.entries[i]).toBe(refsBefore[i]);
				}
			}),
			{ numRuns: 100 },
		);
	});
});

describe('undo', () => {
	test('identity on empty', () => {
		const h = emptyHistory();
		const h2 = undo(h);
		expect(h2.cursor).toBe(-1);
		expect(h2.entries).toBe(h.entries);
	});

	test('identity at cursor 0', () => {
		const h: History = { entries: [entry('a')], cursor: 0 };
		const h2 = undo(h);
		expect(h2.cursor).toBe(0);
	});

	test('decrements cursor by exactly 1 when cursor > 0', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				if (h.cursor === 0) return;
				const h2 = undo(h);
				expect(h2.cursor).toBe(h.cursor - 1);
				expect(h2.entries).toBe(h.entries);
			}),
			{ numRuns: 100 },
		);
	});

	test('does not mutate the input history', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				const before = { entries: h.entries, cursor: h.cursor };
				undo(h);
				expect(h.entries).toBe(before.entries);
				expect(h.cursor).toBe(before.cursor);
			}),
			{ numRuns: 100 },
		);
	});
});

describe('redo', () => {
	test('identity on empty', () => {
		const h = emptyHistory();
		const h2 = redo(h);
		expect(h2.cursor).toBe(-1);
	});

	test('identity at tip', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				const atTip = {
					entries: h.entries,
					cursor: h.entries.length - 1,
				};
				const h2 = redo(atTip);
				expect(h2.cursor).toBe(atTip.cursor);
			}),
			{ numRuns: 100 },
		);
	});

	test('increments cursor by exactly 1 when below tip', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				if (h.cursor === h.entries.length - 1) return;
				const h2 = redo(h);
				expect(h2.cursor).toBe(h.cursor + 1);
				expect(h2.entries).toBe(h.entries);
			}),
			{ numRuns: 100 },
		);
	});

	test('does not mutate the input history', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				const before = { entries: h.entries, cursor: h.cursor };
				redo(h);
				expect(h.entries).toBe(before.entries);
				expect(h.cursor).toBe(before.cursor);
			}),
			{ numRuns: 100 },
		);
	});
});

describe('jumpTo', () => {
	test('throws on empty history', () => {
		expect(() => jumpTo(emptyHistory(), 0)).toThrowError(/empty/);
	});

	test('throws on negative index', () => {
		const h: History = { entries: [entry('a'), entry('b')], cursor: 0 };
		expect(() => jumpTo(h, -1)).toThrowError(/out of/);
	});

	test('throws on index ≥ length', () => {
		const h: History = { entries: [entry('a'), entry('b')], cursor: 0 };
		expect(() => jumpTo(h, 2)).toThrowError(/out of/);
		expect(() => jumpTo(h, 100)).toThrowError(/out of/);
	});

	test('moves cursor to the given index for every valid i', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				for (let i = 0; i < h.entries.length; i++) {
					const h2 = jumpTo(h, i);
					expect(h2.cursor).toBe(i);
					expect(h2.entries).toBe(h.entries);
				}
			}),
			{ numRuns: 100 },
		);
	});
});

describe('composition (the orthogonality contract)', () => {
	test('undo ∘ pushEntry recovers the prior current() entry', () => {
		// The load-bearing rule: pushEntry commits the new state
		// synchronously, undo recovers the prior state synchronously,
		// in two consecutive function calls with no clock or
		// scheduler between them. If a future refactor sneaks in
		// async state, this composition breaks immediately.
		fc.assert(
			fc.property(arbNonEmptyHistory, arbEntry, (h, e) => {
				const prev = current(h);
				const after = current(undo(pushEntry(h, e)));
				expect(after).toBe(prev);
			}),
			{ numRuns: 100 },
		);
	});

	test('redo ∘ undo is identity when undo actually moves (cursor > 0)', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				if (h.cursor === 0) return;
				const r = redo(undo(h));
				expect(r.cursor).toBe(h.cursor);
				expect(r.entries).toBe(h.entries);
			}),
			{ numRuns: 100 },
		);
	});

	test('undo ∘ redo is identity when redo actually moves (cursor < tip)', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				if (h.cursor === h.entries.length - 1) return;
				const r = undo(redo(h));
				expect(r.cursor).toBe(h.cursor);
				expect(r.entries).toBe(h.entries);
			}),
			{ numRuns: 100 },
		);
	});

	test('jumpTo(h, i) followed by jumpTo(_, j) lands on j', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				const last = h.entries.length - 1;
				for (let i = 0; i <= last; i++) {
					for (let j = 0; j <= last; j++) {
						expect(jumpTo(jumpTo(h, i), j).cursor).toBe(j);
					}
				}
			}),
			{ numRuns: 50 },
		);
	});

	test('repeated undo bottoms out at cursor 0, never -1', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				let cur = h;
				for (let i = 0; i < h.entries.length + 5; i++) {
					cur = undo(cur);
				}
				expect(cur.cursor).toBe(0);
			}),
			{ numRuns: 100 },
		);
	});

	test('repeated redo bottoms out at tip, never beyond', () => {
		fc.assert(
			fc.property(arbNonEmptyHistory, (h) => {
				let cur = h;
				for (let i = 0; i < h.entries.length + 5; i++) {
					cur = redo(cur);
				}
				expect(cur.cursor).toBe(cur.entries.length - 1);
			}),
			{ numRuns: 100 },
		);
	});
});
