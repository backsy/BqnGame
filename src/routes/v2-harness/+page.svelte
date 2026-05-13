<script lang="ts">
	import { onMount } from 'svelte';
	import { play, trajectoryFrom, fnExprLabel, assertNever, setAnimationSpeed, getAnimationSpeed } from '$lib/animations/v2/index.js';
	import type { Stage, BqnValue, Trajectory, TrajectoryError, FnExpr } from '$lib/animations/v2/index.js';
	import { motionCoverage } from '$lib/animations/v2/coverage.js';

	const coverage = motionCoverage();

	// ── Small in-harness evaluator ───────────────────────────────────────────
	// NOT in v2/. Handles only the operations the harness wires up.
	// Throws for unsupported combinations; the harness won't call those.

	// Pick a binary op function for the operand of a fold/scan modifier.
	// Returns null when the operand isn't one of the simple arithmetic
	// primitives covered by the merging motion family — caller surfaces a
	// clean error message.
	function pickMergeBinOp(kind: string): ((a: number, b: number) => number) | null {
		switch (kind) {
			case 'add': return (a, b) => a + b;
			case 'sub': return (a, b) => a - b;
			case 'mul': return (a, b) => a * b;
			case 'div': return (a, b) => a / b;
			case 'mod': return (a, b) => (a === 0 ? b : ((b % a) + a) % a);
			case 'min': return (a, b) => Math.min(a, b);
			case 'max': return (a, b) => Math.max(a, b);
			default:    return null;
		}
	}

	// BQN-correct sort: sorts the MAJOR-axis cells. For a vector, that's
	// the individual elements; for a matrix, the rows (compared lex).
	function sortMajorAxis(arr: BqnValue, ascending: boolean): BqnValue {
		if (arr.kind !== 'array') return arr;
		if (arr.shape.length === 1) {
			const indexed = arr.data.map((v, i) => ({ v, i }));
			indexed.sort((a, b) => {
				if (a.v.kind === 'number' && b.v.kind === 'number') {
					return ascending ? a.v.value - b.v.value : b.v.value - a.v.value;
				}
				return 0;
			});
			return { kind: 'array', shape: arr.shape, data: indexed.map(x => x.v) };
		}
		const [majorDim, ...subShape] = arr.shape;
		const sliceSize = subShape.reduce((a, b) => a * b, 1);
		const slices: BqnValue[][] = [];
		for (let i = 0; i < majorDim; i++) {
			slices.push(arr.data.slice(i * sliceSize, (i + 1) * sliceSize));
		}
		slices.sort((a, b) => {
			for (let i = 0; i < sliceSize; i++) {
				const aItem = a[i];
				const bItem = b[i];
				const av = aItem.kind === 'number' ? aItem.value : 0;
				const bv = bItem.kind === 'number' ? bItem.value : 0;
				if (av !== bv) return ascending ? av - bv : bv - av;
			}
			return 0;
		});
		const result: BqnValue[] = [];
		for (const slice of slices) result.push(...slice);
		return { kind: 'array', shape: arr.shape, data: result };
	}

	function evalStep(
		input: BqnValue,
		fn: FnExpr,
		arity: 'monadic' | 'dyadic',
		w?: BqnValue,
	): BqnValue {
		switch (fn.kind) {
			case 'reverse': {
				if (arity === 'monadic') {
					if (input.kind !== 'array') throw new Error('reverse: expected array');
					// BQN ⌽ on rank>=1 reverses along the MAJOR axis: for a
					// matrix the rows swap, columns within each row stay.
					// For a vector it is just element reversal.
					const [majorDim, ...subShape] = input.shape;
					const sliceSize = subShape.reduce((a, b) => a * b, 1);
					const reversed: BqnValue[] = new Array(input.data.length);
					for (let i = 0; i < majorDim; i++) {
						const src = (majorDim - 1 - i) * sliceSize;
						const dst = i * sliceSize;
						for (let j = 0; j < sliceSize; j++) reversed[dst + j] = input.data[src + j];
					}
					return { kind: 'array', shape: input.shape, data: reversed };
				}
				// dyadic: W⌽X = rotate X by W along the major axis. Vector for now.
				if (w === undefined || w.kind !== 'number') throw new Error('rotate: expected numeric W');
				if (input.kind !== 'array' || input.shape.length !== 1)
					throw new Error('rotate: expected 1D array');
				const n = input.data.length;
				const r = ((w.value % n) + n) % n;
				const rotated = [...input.data.slice(r), ...input.data.slice(0, r)];
				return { kind: 'array', shape: input.shape, data: rotated };
			}
			case 'rotate': {
				if (arity === 'monadic') {
					// monadic rotate = reverse in BQN
					if (input.kind !== 'array') throw new Error('rotate: expected array');
					return { kind: 'array', shape: input.shape, data: [...input.data].reverse() };
				}
				if (w === undefined || w.kind !== 'number') throw new Error('rotate: expected numeric W');
				if (input.kind !== 'array' || input.shape.length !== 1)
					throw new Error('rotate: expected 1D array');
				const n = input.data.length;
				const r = ((w.value % n) + n) % n;
				const rotated = [...input.data.slice(r), ...input.data.slice(0, r)];
				return { kind: 'array', shape: input.shape, data: rotated };
			}
			case 'sort-up': {
				if (arity !== 'monadic') throw new Error('sort-up: monadic only');
				if (input.kind !== 'array') throw new Error('sort-up: expected array');
				return sortMajorAxis(input, true);
			}
			case 'sort-down': {
				if (arity !== 'monadic') throw new Error('sort-down: monadic only');
				if (input.kind !== 'array') throw new Error('sort-down: expected array');
				return sortMajorAxis(input, false);
			}
			case 'transpose': {
				if (arity !== 'monadic') throw new Error('transpose: monadic only');
				if (input.kind !== 'array' || input.shape.length !== 2)
					throw new Error('transpose: expected 2D array');
				const [rows, cols] = input.shape;
				const newData = new Array<BqnValue>(rows * cols);
				for (let r = 0; r < rows; r++) {
					for (let c = 0; c < cols; c++) {
						newData[c * rows + r] = input.data[r * cols + c];
					}
				}
				return { kind: 'array', shape: [cols, rows], data: newData };
			}
			// distributing group — scalar → many
			case 'range': {
				if (arity !== 'monadic') throw new Error('range: monadic only');
				if (input.kind !== 'number') throw new Error('range: expected number');
				const n = Math.floor(input.value);
				return {
					kind: 'array',
					shape: [n],
					data: Array.from({ length: n }, (_, i) => ({ kind: 'number' as const, value: i })),
				};
			}
			case 'enclose': {
				if (arity !== 'monadic') throw new Error('enclose: monadic only');
				// <x in BQN normally wraps any value in a length-1 unit
				// array with shape ⟨⟩ (rank 0). For the harness we render it
				// as a single-element 1D row so the distributing motion has
				// a measurable target cell.
				return { kind: 'array', shape: [1], data: [input] };
			}
			case 'add':
			case 'sub':
			case 'mul':
			case 'div':
			case 'pow':
			case 'mod':
			case 'min':
			case 'max': {
				if (arity !== 'dyadic') throw new Error(`${fn.kind}: dyadic only`);
				if (w === undefined) throw new Error(`${fn.kind}: expected w`);
				// Apply preserves BQN's W F X order — never swap operands.
				// Modulus is W|X with the result having sign of W and lying
				// in [0, |W|); ((x % w) + w) % w handles negative cases.
				const apply = (wv: number, xv: number): number => {
					switch (fn.kind) {
						case 'add': return wv + xv;
						case 'sub': return wv - xv;
						case 'mul': return wv * xv;
						case 'div': return wv / xv;
						case 'pow': return Math.pow(wv, xv);
						case 'mod': return wv === 0 ? xv : ((xv % wv) + wv) % wv;
						case 'min': return Math.min(wv, xv);
						case 'max': return Math.max(wv, xv);
					}
				};
				// Scalar+array broadcast (either direction). Both directions
				// preserve BQN's W F X ordering — only which side carries the
				// array changes.
				if (w.kind === 'number' && input.kind === 'array') {
					const wv = w.value;
					return {
						kind: 'array',
						shape: input.shape,
						data: input.data.map(v =>
							v.kind === 'number'
								? { kind: 'number' as const, value: apply(wv, v.value) }
								: v,
						),
					};
				}
				if (w.kind === 'array' && input.kind === 'number') {
					const xv = input.value;
					return {
						kind: 'array',
						shape: w.shape,
						data: w.data.map(v =>
							v.kind === 'number'
								? { kind: 'number' as const, value: apply(v.value, xv) }
								: v,
						),
					};
				}
				throw new Error(`${fn.kind}: expected one scalar and one array`);
			}
			case 'neg':
			case 'abs':
			case 'floor':
			case 'ceil': {
				if (arity !== 'monadic') throw new Error(`${fn.kind}: monadic only`);
				if (input.kind !== 'array') throw new Error(`${fn.kind}: expected array`);
				const apply = (xv: number): number => {
					switch (fn.kind) {
						case 'neg': return -xv;
						case 'abs': return Math.abs(xv);
						case 'floor': return Math.floor(xv);
						case 'ceil': return Math.ceil(xv);
					}
				};
				return {
					kind: 'array',
					shape: input.shape,
					data: input.data.map(v =>
						v.kind === 'number'
							? { kind: 'number' as const, value: apply(v.value) }
							: v,
					),
				};
			}
			case 'fold': {
				if (arity !== 'monadic') throw new Error('fold: monadic only');
				if (input.kind !== 'array') throw new Error('fold: expected array');
				// Supported operand set mirrors the merging motion family:
				// add, sub, mul, div, mod, min, max. Pow is omitted because
				// the visual gets noisy fast.
				const binOp = pickMergeBinOp(fn.over.kind);
				if (binOp === null) {
					throw new Error(`fold: unsupported operand "${fn.over.kind}" — supported: add, sub, mul, div, mod, min, max`);
				}
				// Right-fold semantics:
				//   F´[a b c d] ≡ a F (b F (c F d))
				// Computed from the right: acc = data[N-1], then for
				// i from N-2 down to 0, acc = binOp(data[i], acc). For
				// commutative ops (+, ×, ⌊, ⌈) this is identical to a
				// left-fold; for non-commutative (-, ÷, |) the direction is
				// load-bearing.
				const nums: number[] = [];
				for (const v of input.data) {
					if (v.kind !== 'number') throw new Error('fold: non-numeric element');
					nums.push(v.value);
				}
				if (nums.length === 0) throw new Error('fold: empty array (no identity wired)');
				let acc = nums[nums.length - 1];
				for (let i = nums.length - 2; i >= 0; i--) {
					acc = binOp(nums[i], acc);
				}
				return { kind: 'number', value: acc };
			}
			case 'scan': {
				if (arity !== 'monadic') throw new Error('scan: monadic only');
				if (input.kind !== 'array' || input.shape.length !== 1) {
					throw new Error('scan: expected 1D array');
				}
				const binOp = pickMergeBinOp(fn.over.kind);
				if (binOp === null) {
					throw new Error(`scan: unsupported operand "${fn.over.kind}" — supported: add, sub, mul, div, mod, min, max`);
				}
				const nums: number[] = [];
				for (const v of input.data) {
					if (v.kind !== 'number') throw new Error('scan: non-numeric element');
					nums.push(v.value);
				}
				// BQN F` is LEFT-to-right associative:
				//   result[0] = data[0]
				//   result[i] = binOp(result[i-1], data[i])
				const out: BqnValue[] = [];
				if (nums.length > 0) {
					let acc = nums[0];
					out.push({ kind: 'number', value: acc });
					for (let i = 1; i < nums.length; i++) {
						acc = binOp(acc, nums[i]);
						out.push({ kind: 'number', value: acc });
					}
				}
				return { kind: 'array', shape: [nums.length], data: out };
			}
			case 'take': {
				if (arity !== 'dyadic') throw new Error('take: dyadic only');
				if (w === undefined || w.kind !== 'number') throw new Error('take: expected numeric w');
				if (input.kind !== 'array' || input.shape.length !== 1) throw new Error('take: expected 1D array');
				const n = w.value;
				if (!Number.isInteger(n) || n < 0) throw new Error('take: expected non-negative integer w');
				if (n > input.data.length) throw new Error('take: n exceeds array length (fill not modelled)');
				return { kind: 'array', shape: [n], data: input.data.slice(0, n) };
			}
			case 'drop': {
				if (arity !== 'dyadic') throw new Error('drop: dyadic only');
				if (w === undefined || w.kind !== 'number') throw new Error('drop: expected numeric w');
				if (input.kind !== 'array' || input.shape.length !== 1) throw new Error('drop: expected 1D array');
				const n = w.value;
				if (!Number.isInteger(n) || n < 0) throw new Error('drop: expected non-negative integer w');
				if (n > input.data.length) throw new Error('drop: n exceeds array length');
				const rest = input.data.slice(n);
				return { kind: 'array', shape: [rest.length], data: rest };
			}
			case 'select': {
				// Wired as the BQN filter operation M/X: w is a 0/1 mask of the
				// same length as input.data. Each input cell whose mask entry is
				// 1 is kept; 0 cells are discarded.
				if (arity !== 'dyadic') throw new Error('select (M/X): dyadic only');
				if (w === undefined || w.kind !== 'array' || w.shape.length !== 1)
					throw new Error('select (M/X): expected 1D mask');
				if (input.kind !== 'array' || input.shape.length !== 1)
					throw new Error('select (M/X): expected 1D array');
				if (w.data.length !== input.data.length)
					throw new Error(`select (M/X): mask length ${w.data.length} does not match x length ${input.data.length}`);
				const kept: BqnValue[] = [];
				for (let i = 0; i < w.data.length; i++) {
					const m = w.data[i];
					if (m.kind !== 'number' || (m.value !== 0 && m.value !== 1))
						throw new Error('select (M/X): mask entries must be 0 or 1');
					if (m.value === 1) kept.push(input.data[i]);
				}
				return { kind: 'array', shape: [kept.length], data: kept };
			}
			case 'bind-left': {
				return evalStep(input, fn.of, 'dyadic', fn.left);
			}
			case 'bind-right': {
				// (F⟜N) X ≡ X F N — dyadic call with w = X, x = N.
				return evalStep(fn.right, fn.of, 'dyadic', input);
			}
			case 'before': {
				// (F⊸G) X ≡ (F X) G X — apply F monadically to X, then call G
				// dyadically with the result as W and X as X.
				if (arity !== 'monadic') throw new Error('before: monadic only');
				const mask = evalStep(input, fn.f, 'monadic');
				return evalStep(input, fn.g, 'dyadic', mask);
			}
			case 'gt': {
				// Dyadic W > X with scalar-array broadcasting. Returns a 0/1
				// array shaped like the array argument; or a 0/1 scalar when
				// both args are scalar.
				if (arity !== 'dyadic') throw new Error('gt: dyadic only');
				if (w === undefined) throw new Error('gt: expected w');
				if (w.kind === 'number' && input.kind === 'number') {
					return { kind: 'number', value: w.value > input.value ? 1 : 0 };
				}
				if (w.kind === 'array' && input.kind === 'number') {
					const xv = input.value;
					const data: BqnValue[] = w.data.map(v => {
						if (v.kind !== 'number') throw new Error('gt: non-numeric element');
						return { kind: 'number' as const, value: v.value > xv ? 1 : 0 };
					});
					return { kind: 'array', shape: w.shape, data };
				}
				if (w.kind === 'number' && input.kind === 'array') {
					const wv = w.value;
					const data: BqnValue[] = input.data.map(v => {
						if (v.kind !== 'number') throw new Error('gt: non-numeric element');
						return { kind: 'number' as const, value: wv > v.value ? 1 : 0 };
					});
					return { kind: 'array', shape: input.shape, data };
				}
				throw new Error('gt: unsupported argument shapes');
			}
			default:
				throw new Error(`evalStep: unsupported fn kind "${fn.kind}" in harness`);
		}
	}

	// ── renderBqnValue ───────────────────────────────────────────────────────
	// Produces an HTMLElement representing a BqnValue.
	// For 2D arrays: renders as a grid of bars so transpose is visually meaningful.

	// Bar size scaling — match the game's pattern: linear in abs(value), with a
	// base height that's tall enough to fit the numeric label.
	const BAR_HEIGHT_BASE = 18;
	const BAR_HEIGHT_PER_UNIT = 8;
	const BAR_HEIGHT_MAX = 140;

	function barHeight(value: number): number {
		return Math.min(BAR_HEIGHT_MAX, Math.abs(value) * BAR_HEIGHT_PER_UNIT + BAR_HEIGHT_BASE);
	}

	function makeBar(value: number, width = 24, fontSize = '0.85rem'): HTMLElement {
		const bar = document.createElement('div');
		bar.className = 'bar';
		const h = barHeight(value);
		const color = value < 0 ? '#f76a6a' : '#7c6af7';
		bar.style.cssText = [
			`height:${h}px`,
			`width:${width}px`,
			`background:${color}`,
			'border-radius:3px',
			'display:grid',
			'place-items:start center',
			'padding-top:0.18rem',
			'box-shadow:0 0 8px rgba(124, 106, 247, 0.22)',
		].join(';');
		const num = document.createElement('span');
		num.style.cssText = [
			'color:#f0fff0',
			`font-size:${fontSize}`,
			'font-weight:600',
			'text-shadow:0 0 4px rgba(0, 0, 0, 0.6)',
			'font-family:system-ui, -apple-system, sans-serif',
			'line-height:1',
		].join(';');
		num.textContent = String(value);
		bar.appendChild(num);
		return bar;
	}

	function renderBqnValue(value: BqnValue): HTMLElement {
		switch (value.kind) {
			case 'number': {
				return makeBar(value.value);
			}
			case 'array': {
				const is1D = value.shape.length === 1 && value.data.every(v => v.kind === 'number');
				const is2D = value.shape.length === 2 && value.data.every(v => v.kind === 'number');

				if (is1D) {
					const row = document.createElement('div');
					row.className = 'row';
					row.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
					for (const item of value.data) {
						row.appendChild(renderBqnValue(item));
					}
					return row;
				}

				if (is2D) {
					const [rows, cols] = value.shape;
					const grid = document.createElement('div');
					grid.className = 'row';
					// align-items:end so bars sit on a baseline within each row
					// instead of stretching to the top of their grid cell.
					grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},28px);gap:4px;padding:8px;align-items:end;`;
					for (let r = 0; r < rows; r++) {
						for (let c = 0; c < cols; c++) {
							const v = value.data[r * cols + c];
							const val = v.kind === 'number' ? v.value : 0;
							grid.appendChild(makeBar(val, 24, '0.75rem'));
						}
					}
					return grid;
				}

				const ph = document.createElement('div');
				ph.className = 'placeholder';
				ph.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ph.textContent = `[array shape=${value.shape.join('×')}]`;
				return ph;
			}
			case 'char': {
				const ch = document.createElement('div');
				ch.className = 'placeholder';
				ch.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ch.textContent = `'${value.value}'`;
				return ch;
			}
			case 'fn':
			case 'namespace': {
				const ph = document.createElement('div');
				ph.className = 'placeholder';
				ph.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ph.textContent = value.kind === 'fn' ? '{fn}' : '{ns}';
				return ph;
			}
			default:
				return assertNever(value);
		}
	}

	// ── Starter values ───────────────────────────────────────────────────────

	type Starter = { label: string; value: BqnValue };

	function mkArr(data: number[]): BqnValue {
		return { kind: 'array', shape: [data.length], data: data.map(v => ({ kind: 'number', value: v })) };
	}

	function mk2D(rows: number, cols: number, data: number[]): BqnValue {
		return { kind: 'array', shape: [rows, cols], data: data.map(v => ({ kind: 'number', value: v })) };
	}

	function mkNum(v: number): BqnValue {
		return { kind: 'number', value: v };
	}

	const STARTERS: Starter[] = [
		{ label: '[3 1 4 1 5]', value: mkArr([3, 1, 4, 1, 5]) },
		{ label: '[9 2 6 5 3]', value: mkArr([9, 2, 6, 5, 3]) },
		{ label: '[1 2 3 4 5 6]', value: mkArr([1, 2, 3, 4, 5, 6]) },
		{ label: '2×3 grid', value: mk2D(2, 3, [1, 2, 3, 4, 5, 6]) },
		{ label: '[-3 1 -2 4]', value: mkArr([-3, 1, -2, 4]) },
		// Scalar starters — the distributing family (↕, <) needs a single
		// number as input. Each ↕N can be reached by mounting the matching
		// scalar then tapping ↕.
		{ label: '3', value: mkNum(3) },
		{ label: '5', value: mkNum(5) },
		{ label: '8', value: mkNum(8) },
	];

	// ── Op descriptors ───────────────────────────────────────────────────────

	type Family = 'lateral' | 'vertical' | 'sizing' | 'merging' | 'distributing' | 'blackBox';

	type OpDesc = {
		label: string;
		fn: FnExpr;
		arity: 'monadic' | 'dyadic';
		w?: BqnValue;
		family: Family;
	};

	// Section ordering + accent colour per family. Buttons in each section
	// pick up the colour for their border; the family header also uses it.
	// Black-box gets a muted accent because it's the "no hand-tuned motion"
	// catch-all, not a phase.
	const FAMILIES: Array<{ key: Family; label: string; color: string; btnColor: string }> = [
		{ key: 'lateral',      label: 'Lateral',      color: '#7c6af7', btnColor: '#e0e0ff' },
		{ key: 'vertical',     label: 'Vertical',     color: '#5fcc5f', btnColor: '#e0e0ff' },
		{ key: 'merging',      label: 'Merging',      color: '#6af7d8', btnColor: '#e0e0ff' },
		{ key: 'sizing',       label: 'Sizing',       color: '#f7a86a', btnColor: '#e0e0ff' },
		{ key: 'distributing', label: 'Distributing', color: '#d86af7', btnColor: '#e0e0ff' },
		{ key: 'blackBox',     label: 'Black-box',    color: '#555',    btnColor: '#a0a0b0' },
	];

	// Collapsed by default — the page already runs out of vertical room on
	// a phone with all sections open. Distributing (newest family) starts
	// open so a fresh visit has something to tap; user can toggle any.
	let familyOpen: Record<Family, boolean> = {
		lateral: false,
		vertical: false,
		sizing: false,
		merging: false,
		distributing: true,
		blackBox: false,
	};

	function toggleFamily(key: Family): void {
		familyOpen[key] = !familyOpen[key];
	}

	const W2: BqnValue = { kind: 'number', value: 2 };

	// Strip the bind-plumbing glyphs (⊸ / ⟜) from a label produced by
	// fnExprLabel so buttons read in their natural BQN form: `2⊸↑` → `2↑`,
	// `>⟜2` → `>2`. The plumbing only exists so we can call dyadic ops with
	// one argument at the rune layer (see CLAUDE.md invariant 6).
	function stripBindPlumbing(s: string): string {
		return s.replace(/⊸/g, '').replace(/⟜/g, '');
	}

	// (>2)/X — keep elements of X that are greater than 2. As a real BQN
	// expression this is `(>⟜2)⊸/`, i.e. `before` with f = `>⟜2` (bind-right
	// gt by 2) and g = `/` (select / filter). The animation engine sees the
	// 'before' kind and renders the predicate `fnExprLabel(f)` = ">⟜2" on
	// every cell during Phase 1 of the filter motion.
	const GT2_PRED: FnExpr = {
		kind: 'bind-right',
		right: { kind: 'number', value: 2 },
		of: { kind: 'gt' },
	};
	const FILTER_GT2: FnExpr = {
		kind: 'before',
		f: GT2_PRED,
		g: { kind: 'select' },
	};

	const TAKE2: FnExpr = { kind: 'bind-left', left: W2, of: { kind: 'take' } };
	const DROP2: FnExpr = { kind: 'bind-left', left: W2, of: { kind: 'drop' } };

	// Non-commutative arithmetic in BQN reads `W F X` — so `2-X` means
	// "two minus X" and flips sign when X > 2. To get the more intuitive
	// "subtract 2 from each cell" / "divide each by 2", bind the scalar
	// on the RIGHT (`-⟜2`, `÷⟜2`); the stripped label reads `-2`, `÷2`
	// and the per-cell op becomes `cell - 2` / `cell ÷ 2`.
	const SUB_BY2: FnExpr = { kind: 'bind-right', right: W2, of: { kind: 'sub' } };
	const DIV_BY2: FnExpr = { kind: 'bind-right', right: W2, of: { kind: 'div' } };

	const OPS: OpDesc[] = [
		// lateral group
		{ label: fnExprLabel({ kind: 'reverse' }),   fn: { kind: 'reverse' },   arity: 'monadic', family: 'lateral' },
		{ label: fnExprLabel({ kind: 'sort-up' }),   fn: { kind: 'sort-up' },   arity: 'monadic', family: 'lateral' },
		{ label: fnExprLabel({ kind: 'sort-down' }), fn: { kind: 'sort-down' }, arity: 'monadic', family: 'lateral' },
		{ label: `2${fnExprLabel({ kind: 'rotate' })}`, fn: { kind: 'rotate' }, arity: 'dyadic', w: W2, family: 'lateral' },
		{ label: fnExprLabel({ kind: 'transpose' }), fn: { kind: 'transpose' }, arity: 'monadic', family: 'lateral' },
		// vertical group
		{ label: stripBindPlumbing(fnExprLabel(TAKE2)), fn: TAKE2, arity: 'monadic', family: 'vertical' },
		{ label: stripBindPlumbing(fnExprLabel(DROP2)), fn: DROP2, arity: 'monadic', family: 'vertical' },
		{ label: `(>2)/`, fn: FILTER_GT2, arity: 'monadic', family: 'vertical' },
		// sizing group — per-cell arithmetic. Non-commutative ops appear in
		// BOTH bind-left and bind-right forms because operand order is
		// load-bearing in BQN: `2-X` is "two minus each cell" (flips sign
		// when X > 2); `X-2` written `-⟜2` is "subtract 2 from each cell".
		// Tap them back-to-back and the badge position + colour-flip make
		// the difference visible.
		{ label: `2${fnExprLabel({ kind: 'add' })}`, fn: { kind: 'add' }, arity: 'dyadic', w: W2, family: 'sizing' },
		{ label: `2${fnExprLabel({ kind: 'sub' })}`, fn: { kind: 'sub' }, arity: 'dyadic', w: W2, family: 'sizing' },
		{ label: stripBindPlumbing(fnExprLabel(SUB_BY2)), fn: SUB_BY2, arity: 'monadic', family: 'sizing' },
		{ label: `2${fnExprLabel({ kind: 'mul' })}`, fn: { kind: 'mul' }, arity: 'dyadic', w: W2, family: 'sizing' },
		{ label: `2${fnExprLabel({ kind: 'div' })}`, fn: { kind: 'div' }, arity: 'dyadic', w: W2, family: 'sizing' },
		{ label: stripBindPlumbing(fnExprLabel(DIV_BY2)), fn: DIV_BY2, arity: 'monadic', family: 'sizing' },
		{ label: `3${fnExprLabel({ kind: 'mod' })}`, fn: { kind: 'mod' }, arity: 'dyadic', w: { kind: 'number', value: 3 }, family: 'sizing' },
		// monadic per-cell
		{ label: fnExprLabel({ kind: 'neg' }), fn: { kind: 'neg' }, arity: 'monadic', family: 'sizing' },
		{ label: fnExprLabel({ kind: 'abs' }), fn: { kind: 'abs' }, arity: 'monadic', family: 'sizing' },
		// merging group — fold (F´) and scan (F`). The label comes straight
		// from fnExprLabel which renders e.g. `{ kind: 'fold', over: add }`
		// as `+´`. Right-fold direction is enforced in the evaluator and the
		// motion; non-commutative ops show their associativity through the
		// rightmost-pair-first merge sequence.
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'add' } }), fn: { kind: 'fold', over: { kind: 'add' } }, arity: 'monadic', family: 'merging' },
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'sub' } }), fn: { kind: 'fold', over: { kind: 'sub' } }, arity: 'monadic', family: 'merging' },
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'mul' } }), fn: { kind: 'fold', over: { kind: 'mul' } }, arity: 'monadic', family: 'merging' },
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'max' } }), fn: { kind: 'fold', over: { kind: 'max' } }, arity: 'monadic', family: 'merging' },
		{ label: fnExprLabel({ kind: 'scan', over: { kind: 'add' } }), fn: { kind: 'scan', over: { kind: 'add' } }, arity: 'monadic', family: 'merging' },
		{ label: fnExprLabel({ kind: 'scan', over: { kind: 'sub' } }), fn: { kind: 'scan', over: { kind: 'sub' } }, arity: 'monadic', family: 'merging' },
		{ label: fnExprLabel({ kind: 'scan', over: { kind: 'max' } }), fn: { kind: 'scan', over: { kind: 'max' } }, arity: 'monadic', family: 'merging' },
		// distributing group — one cell spreads to many. ↕N counts out N
		// indices (needs a scalar starter); <x wraps a scalar in a length-1
		// array (also scalar input).
		{ label: fnExprLabel({ kind: 'range' }),   fn: { kind: 'range' },   arity: 'monadic', family: 'distributing' },
		{ label: fnExprLabel({ kind: 'enclose' }), fn: { kind: 'enclose' }, arity: 'monadic', family: 'distributing' },
		// blackBox group (currently empty — every wired op has a hand-tuned motion)
	];

	// ── Stage implementation ──────────────────────────────────────────────────
	// Lives here (Rule B). Stage type from v2; implementation is Svelte-aware.

	let containerEl: HTMLElement;
	let currentEl: HTMLElement;

	function buildStage(): Stage {
		return {
			get current(): HTMLElement {
				return currentEl;
			},
			async prepare(value: BqnValue): Promise<HTMLElement> {
				const el = renderBqnValue(value);
				// Position the prepared element at the container's natural
				// centred location, NOT overlaid on currentEl. For shape-
				// changing operations (transpose 2×3 → 3×2, reshape, etc.)
				// the prepared has a different size than currentEl, and the
				// post-commit flex layout will centre it differently from
				// currentEl's position. Centring it the same way now (50%/
				// 50%/translate(-50%,-50%)) means the cell positions
				// measured here are the SAME positions the cells will live
				// at after commit. No teleport on handoff.
				el.style.position = 'absolute';
				el.style.top = '50%';
				el.style.left = '50%';
				el.style.transform = 'translate(-50%, -50%)';
				el.style.opacity = '0';
				containerEl.appendChild(el);
				return el;
			},
			commit(prepared: HTMLElement): void {
				prepared.style.position = '';
				prepared.style.top = '';
				prepared.style.left = '';
				prepared.style.bottom = '';
				prepared.style.transform = '';
				prepared.style.opacity = '';
				for (const child of Array.from(containerEl.children)) {
					if (child !== prepared) containerEl.removeChild(child);
				}
				currentEl = prepared;
			},
		};
	}

	// ── Reactive state ───────────────────────────────────────────────────────

	let stage: Stage | null = null;
	let playing = false;
	let selectedStarterIdx = 0;
	let currentValue: BqnValue = STARTERS[0].value;
	let statusMsg = '';
	let speed = getAnimationSpeed();

	const SPEED_CHOICES: number[] = [0.5, 1, 2];

	function setSpeed(s: number): void {
		speed = s;
		setAnimationSpeed(s);
	}

	function mountStarter(idx: number): void {
		selectedStarterIdx = idx;
		currentValue = STARTERS[idx].value;
		if (!stage) return;
		const el = renderBqnValue(currentValue);
		// Remove all existing children from container.
		while (containerEl.firstChild) containerEl.removeChild(containerEl.firstChild);
		containerEl.appendChild(el);
		currentEl = el;
		statusMsg = '';
	}

	async function handleOp(op: OpDesc): Promise<void> {
		if (!stage || playing) return;

		const fn: FnExpr = op.fn;

		// Unwrap monadic bind-{left,right} wrappers to the inner dyadic
		// operation so the v2 engine dispatches on the operation kind
		// (take / drop / sub / div ...) rather than on the bind wrapper,
		// which routes to blackBox. Other monadic wrappers (notably
		// 'before') keep their outer kind so animateMonadic can route them.
		//
		// bind-left  (N⊸F):  W = N (bound), X = currentValue.
		// bind-right (F⟜N):  W = currentValue, X = N (bound).
		let arity: 'monadic' | 'dyadic' = op.arity;
		let w: BqnValue | undefined = op.w;
		let xForStep: BqnValue = currentValue;
		let fnForStep: FnExpr = fn;
		if (arity === 'monadic' && fn.kind === 'bind-left') {
			fnForStep = fn.of;
			w = fn.left;
			arity = 'dyadic';
		} else if (arity === 'monadic' && fn.kind === 'bind-right') {
			fnForStep = fn.of;
			w = currentValue;
			xForStep = fn.right;
			arity = 'dyadic';
		}

		let result: BqnValue;
		try {
			result = evalStep(xForStep, fnForStep, arity, w);
		} catch (e) {
			statusMsg = `Cannot apply to current value: ${String(e)}`;
			return;
		}

		let traj: Trajectory | TrajectoryError;
		if (arity === 'monadic') {
			traj = trajectoryFrom(currentValue, [
				{ kind: 'monadic', fn: fnForStep, result },
			]);
		} else {
			if (w === undefined) {
				statusMsg = 'Dyadic op missing w';
				return;
			}
			traj = trajectoryFrom(currentValue, [
				{ kind: 'dyadic', fn: fnForStep, w, x: xForStep, result },
			]);
		}

		if ('kind' in traj) {
			statusMsg = `Trajectory error: ${traj.kind}`;
			return;
		}

		playing = true;
		statusMsg = '';
		await play(traj, stage);
		currentValue = result;
		playing = false;
	}

	function handleReset(): void {
		if (playing) return;
		mountStarter(selectedStarterIdx);
	}

	onMount(() => {
		const initial = renderBqnValue(currentValue);
		containerEl.appendChild(initial);
		currentEl = initial;
		stage = buildStage();
	});
</script>

<svelte:head>
	<title>v2 Animation Harness</title>
</svelte:head>

<main style="padding:1rem;font-family:sans-serif;background:#0d0d1a;min-height:100vh;color:#e0e0ff;max-width:480px;margin:0 auto;">
	<div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.6rem;margin-bottom:1rem;">
		<h1 style="font-size:1.1rem;margin:0;color:#a89cf7;">v2 Animation Harness</h1>
		<span
			title="FnExpr kinds with at least one hand-tuned motion (vs blackBox)"
			style="font-size:0.7rem;color:#a89cf7;background:rgba(168,156,247,0.12);padding:0.18rem 0.5rem;border-radius:10px;font-variant-numeric:tabular-nums;border:1px solid rgba(168,156,247,0.3);letter-spacing:0.02em;"
		>
			{coverage.animated}/{coverage.total} · {coverage.percent}%
		</span>
	</div>

	<!-- Starter picker -->
	<section style="margin-bottom:1rem;">
		<div style="font-size:0.75rem;color:#888;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.05em;">Starter</div>
		<div style="display:flex;flex-wrap:wrap;gap:6px;">
			{#each STARTERS as starter, i}
				<button
					on:click={() => mountStarter(i)}
					disabled={playing}
					style="padding:0.3rem 0.6rem;font-size:0.8rem;background:{selectedStarterIdx === i ? '#7c6af7' : '#1a1a2e'};color:#e0e0ff;border:{selectedStarterIdx === i ? '1px solid #7c6af7' : '1px solid #333'};border-radius:5px;cursor:pointer;"
				>
					{starter.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Stage container — tall enough for wheel-rotation reverse, where
	     right-half bars arc UP and left-half bars arc DOWN by their distance
	     from the row centre. Row is centred both vertically (align-items)
	     and horizontally (justify-content) so the wheel has equal room on
	     all sides. -->
	<div
		bind:this={containerEl}
		style="position:relative;min-height:320px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:1rem;display:flex;align-items:center;justify-content:center;overflow:hidden;"
	></div>

	{#if statusMsg}
		<p style="font-size:0.8rem;color:#f76a6a;margin-bottom:0.8rem;">{statusMsg}</p>
	{/if}

	<!-- Operation picker: collapsible per-family sections. Each header is a
	     toggle; the body shows the family's buttons when open. -->
	{#each FAMILIES as fam}
		{@const ops = OPS.filter(op => op.family === fam.key)}
		<section style="margin-bottom:0.5rem;">
			<button
				on:click={() => toggleFamily(fam.key)}
				style="background:transparent;border:none;color:{fam.color};font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;padding:0.2rem 0;margin-bottom:0.3rem;cursor:pointer;display:flex;align-items:center;gap:0.4rem;width:100%;text-align:left;font-family:inherit;"
			>
				<span style="opacity:0.65;width:0.8rem;display:inline-block;">{familyOpen[fam.key] ? '▾' : '▸'}</span>
				<span>{fam.label}</span>
				<span style="opacity:0.45;font-size:0.7rem;">{ops.length}</span>
			</button>
			{#if familyOpen[fam.key]}
				<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:0.5rem;">
					{#each ops as op}
						<button
							on:click={() => handleOp(op)}
							disabled={playing}
							style="padding:0.4rem 0.8rem;font-size:1.2rem;background:#1a1a2e;color:{fam.btnColor};border:1px solid {fam.color};border-radius:5px;cursor:pointer;font-family:monospace;min-width:2.5rem;"
							title={op.fn.kind}
						>
							{op.label}
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/each}

	<!-- Speed + reset row -->
	<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
		<button
			on:click={handleReset}
			disabled={playing}
			style="padding:0.4rem 1.2rem;background:#333;color:#e0e0ff;border:1px solid #555;border-radius:6px;font-size:0.9rem;cursor:pointer;"
		>
			Reset
		</button>

		<div style="display:flex;align-items:center;gap:6px;">
			<span style="font-size:0.75rem;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Speed</span>
			{#each SPEED_CHOICES as s}
				<button
					on:click={() => setSpeed(s)}
					disabled={playing}
					style="padding:0.25rem 0.55rem;font-size:0.8rem;background:{speed === s ? '#7c6af7' : '#1a1a2e'};color:#e0e0ff;border:1px solid {speed === s ? '#7c6af7' : '#333'};border-radius:5px;cursor:pointer;"
				>
					{s}x
				</button>
			{/each}
		</div>
	</div>

	{#if playing}
		<span style="margin-left:0.8rem;font-size:0.85rem;color:#7c6af7;">animating…</span>
	{/if}
</main>
