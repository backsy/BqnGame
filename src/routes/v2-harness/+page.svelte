<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { play, trajectoryFrom, fnExprLabel, assertNever, setAnimationSpeed, getAnimationSpeed } from '$lib/animations/v2/index.js';
	import type { Stage, BqnValue, Trajectory, TrajectoryError, FnExpr } from '$lib/animations/v2/index.js';
	import { motionCoverage } from '$lib/animations/v2/coverage.js';
	import { BqnWorkerClient } from '$lib/bqn/worker-client.js';
	import type { BqnStructuredValue } from '$lib/bqn/protocol.js';

	const coverage = motionCoverage();

	// ── BQN evaluation ───────────────────────────────────────────────────────
	// All BQN evaluation happens in a Web Worker that runs the real,
	// unmodified BQN interpreter (src/lib/bqn/vendor/bqn.js). There is NO
	// hand-rolled evaluation in the harness — see CLAUDE.md invariant 3.
	// We build a BQN source string for each op (combining the op's source
	// template with the current value's BQN literal), ship it to the
	// worker, and consume the structured result.

	let bqnWorker: BqnWorkerClient | null = null;

	// Serialise a BqnValue as BQN source so it can be substituted into an
	// op's source template. Mirrors BQN's own literal syntax:
	//   scalar number  →  5  or  ¯5  (high-minus for negatives — BQN's
	//                                  syntax distinct from monadic -)
	//   length-1 vec   →  ⟨5⟩          (strand of one needs explicit list)
	//   1D vector ≥2   →  3‿1‿4‿1‿5    (strand syntax)
	//   2D matrix      →  R‿C⥊flat
	// Strings / nested arrays out of scope; the harness doesn't drive those.
	function bqnLiteral(v: BqnValue): string {
		if (v.kind === 'number') {
			return v.value < 0 ? `¯${Math.abs(v.value)}` : String(v.value);
		}
		if (v.kind === 'char') return `'${v.value}'`;
		if (v.kind === 'array') {
			// Rank-0 box: `<inner` (enclose). Nests naturally for <<5 etc.
			if (v.shape.length === 0 && v.data.length === 1) {
				return `<${bqnLiteral(v.data[0])}`;
			}
			if (v.shape.length === 1) {
				if (v.data.length === 0) return '⟨⟩';
				if (v.data.length === 1) return `⟨${bqnLiteral(v.data[0])}⟩`;
				return v.data.map(bqnLiteral).join('‿');
			}
			if (v.shape.length === 2) {
				const flat = v.data.map(bqnLiteral).join('‿');
				return `${v.shape[0]}‿${v.shape[1]}⥊${flat}`;
			}
		}
		throw new Error(`bqnLiteral: cannot serialize value of kind ${v.kind} with shape ${('shape' in v ? v.shape : 'n/a')}`);
	}

	// Convert the worker's structured snapshot into v2's BqnValue. Shapes are
	// identical for number / char / array; fn and namespace are flattened to
	// opaque placeholders since the harness doesn't expose them interactively.
	function fromStructured(s: BqnStructuredValue): BqnValue {
		switch (s.kind) {
			case 'number': return { kind: 'number', value: s.value };
			case 'char':   return { kind: 'char',   value: s.value };
			case 'array':  return { kind: 'array',  shape: s.shape, data: s.data.map(fromStructured) };
			case 'fn':     return { kind: 'fn',     def: { kind: 'opaque', name: '{fn}', resolved: { kind: 'add' } } };
			case 'namespace': return { kind: 'namespace', entries: new Map() };
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

	const CHAR_BAR_HEIGHT = 32;
	function makeCharBar(ch: string, width = 24, fontSize = '0.95rem'): HTMLElement {
		const bar = document.createElement('div');
		bar.className = 'bar';
		bar.style.cssText = [
			`height:${CHAR_BAR_HEIGHT}px`,
			`width:${width}px`,
			'background:#7c6af7',
			'border-radius:3px',
			'display:grid',
			'place-items:center',
			'box-shadow:0 0 8px rgba(124, 106, 247, 0.22)',
		].join(';');
		const span = document.createElement('span');
		span.style.cssText = [
			'color:#f0fff0',
			`font-size:${fontSize}`,
			'font-weight:600',
			'text-shadow:0 0 4px rgba(0, 0, 0, 0.6)',
			"font-family:'BQN386', ui-monospace, monospace",
			'line-height:1',
		].join(';');
		span.textContent = ch;
		bar.appendChild(span);
		return bar;
	}

	// Crate (rank-0 box). SVG drawing of a sideways wooden crate, with the
	// contents (number, char, nested crate, or scaled inner array) shown
	// over the centre face. Flat head-on, no perspective.
	const CRATE_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
  <defs>
    <linearGradient id="bqnCrateWood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b07f48"/>
      <stop offset="0.5" stop-color="#9b6a39"/>
      <stop offset="1" stop-color="#7d5226"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" fill="url(#bqnCrateWood)" stroke="#3a1f0a" stroke-width="2.4" rx="1.5"/>
  <line x1="22" y1="3" x2="22" y2="61" stroke="#3a1f0a" stroke-width="1.4" opacity="0.7"/>
  <line x1="42" y1="3" x2="42" y2="61" stroke="#3a1f0a" stroke-width="1.4" opacity="0.7"/>
  <rect x="2" y="20" width="60" height="5" fill="#5d3a18" opacity="0.85"/>
  <rect x="2" y="39" width="60" height="5" fill="#5d3a18" opacity="0.85"/>
  <circle cx="6"  cy="6"  r="1.3" fill="#1a0d04"/>
  <circle cx="58" cy="6"  r="1.3" fill="#1a0d04"/>
  <circle cx="6"  cy="58" r="1.3" fill="#1a0d04"/>
  <circle cx="58" cy="58" r="1.3" fill="#1a0d04"/>
</svg>`;

	function makeCrate(inner: BqnValue, size = 56): HTMLElement {
		const crate = document.createElement('div');
		crate.className = 'bqn-box';
		crate.style.cssText = [
			`width:${size}px`,
			`height:${size}px`,
			'position:relative',
			'display:grid',
			'place-items:center',
			'user-select:none',
		].join(';');
		// Crate drawing as the background; contents on top.
		crate.insertAdjacentHTML('afterbegin', CRATE_SVG);

		const labelHolder = document.createElement('div');
		labelHolder.className = 'bqn-box-content';
		labelHolder.style.cssText = [
			'position:relative',
			'z-index:1',
			'display:grid',
			'place-items:center',
		].join(';');

		if (inner.kind === 'number') {
			const label = document.createElement('span');
			label.className = 'bqn-box-label';
			label.style.fontSize = `${Math.max(14, size * 0.38)}px`;
			label.textContent = String(inner.value);
			labelHolder.appendChild(label);
		} else if (inner.kind === 'char') {
			const label = document.createElement('span');
			label.className = 'bqn-box-label';
			label.style.fontSize = `${Math.max(14, size * 0.42)}px`;
			label.style.fontFamily = "'BQN386', ui-monospace, monospace";
			label.textContent = inner.value;
			labelHolder.appendChild(label);
		} else if (inner.kind === 'array' && inner.shape.length === 0 && inner.data.length === 1) {
			labelHolder.appendChild(makeCrate(inner.data[0], Math.round(size * 0.6)));
		} else {
			const innerEl = renderBqnValue(inner);
			innerEl.style.transform = 'scale(0.5)';
			innerEl.style.transformOrigin = 'center';
			labelHolder.appendChild(innerEl);
		}

		crate.appendChild(labelHolder);
		return crate;
	}

	// Render one cell of a rank-≥1 array. Atoms become bars, boxes become small
	// crates, etc. Used as the per-cell dispatcher in the 1D and 2D paths.
	function renderCell(item: BqnValue, barWidth = 24, fontSize = '0.85rem'): HTMLElement {
		if (item.kind === 'number') return makeBar(item.value, barWidth, fontSize);
		if (item.kind === 'char') return makeCharBar(item.value, barWidth, fontSize);
		if (item.kind === 'array' && item.shape.length === 0 && item.data.length === 1) {
			return makeCrate(item.data[0], 36);
		}
		// Fallback for unexpected shapes — small grey bar.
		const ph = document.createElement('div');
		ph.className = 'bar';
		ph.style.cssText = `height:24px;width:${barWidth}px;background:#555;border-radius:3px;`;
		return ph;
	}

	function renderBqnValue(value: BqnValue): HTMLElement {
		switch (value.kind) {
			case 'number': {
				// Wrap the bar in a row container so a scalar renders with the
				// same structure as a 1D array (row > bar). Motions iterate
				// root.children and operate on bars; if the root WERE the bar
				// itself, that iteration would land on the numeric span inside
				// the bar — wrong target, visible as a "floating box" plus a
				// teleport at handoff.
				const row = document.createElement('div');
				row.className = 'row';
				row.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
				row.appendChild(makeBar(value.value));
				return row;
			}
			case 'char': {
				// Same row-wrapping rationale as number — keep the scalar
				// rendering structurally consistent so motions iterate cells.
				const row = document.createElement('div');
				row.className = 'row';
				row.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
				row.appendChild(makeCharBar(value.value));
				return row;
			}
			case 'array': {
				// Rank-0 array (a "box" / unit): wrap the one inner value in a
				// wooden-crate visual. Nested boxes render as nested crates.
				if (value.shape.length === 0) {
					if (value.data.length !== 1) {
						const ph = document.createElement('div');
						ph.className = 'placeholder';
						ph.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
						ph.textContent = `[malformed rank-0]`;
						return ph;
					}
					// Wrap the crate in a row so motions have a consistent
					// .children iteration target (one cell, the crate).
					const row = document.createElement('div');
					row.className = 'row';
					row.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
					row.appendChild(makeCrate(value.data[0]));
					return row;
				}

				// Rank-1 vectors: row of cells. Cells dispatch per-type so
				// vectors can mix numbers, chars, and boxes.
				if (value.shape.length === 1) {
					const row = document.createElement('div');
					row.className = 'row bqn-vector';
					row.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;min-width:24px;min-height:24px;';
					for (const item of value.data) {
						row.appendChild(renderCell(item));
					}
					return row;
				}

				// Rank-2 matrices: each row is its own rank-1 vector
				// container — same .bqn-vector outline as a plain vector —
				// stacked vertically inside the .bqn-matrix frame. Reads as
				// "array of arrays": you see the whole matrix outlined
				// AND every row outlined as its own array.
				if (value.shape.length === 2) {
					const [rows, cols] = value.shape;
					const grid = document.createElement('div');
					grid.className = 'row bqn-matrix';
					grid.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;align-items:start;';
					for (let r = 0; r < rows; r++) {
						const rowEl = document.createElement('div');
						rowEl.className = 'row bqn-vector';
						rowEl.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
						for (let c = 0; c < cols; c++) {
							rowEl.appendChild(renderCell(value.data[r * cols + c], 24, '0.75rem'));
						}
						grid.appendChild(rowEl);
					}
					return grid;
				}

				// Rank ≥ 3: row of D crates along the major axis, each
				// crate containing a rank-(N-1) sub-render. Mirrors the
				// "array of arrays inside boxes" structure — the crate
				// visual matches < (enclose), the same primitive that
				// already wraps single values.
				if (value.shape.length >= 3) {
					const [D, ...innerShape] = value.shape;
					const innerSize = innerShape.reduce((a, b) => a * b, 1);
					const outer = document.createElement('div');
					outer.className = 'row bqn-vector';
					outer.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
					for (let d = 0; d < D; d++) {
						const sub: BqnValue = {
							kind: 'array',
							shape: innerShape,
							data: value.data.slice(d * innerSize, (d + 1) * innerSize),
						};
						const subEl = renderBqnValue(sub);
						const crate = document.createElement('div');
						crate.className = 'bqn-box';
						crate.style.cssText = [
							'position:relative',
							'display:grid',
							'place-items:center',
							'padding:14px',
							'user-select:none',
						].join(';');
						crate.insertAdjacentHTML('afterbegin', CRATE_SVG);
						const labelHolder = document.createElement('div');
						labelHolder.className = 'bqn-box-content';
						labelHolder.style.cssText = 'position:relative;z-index:1;display:grid;place-items:center;';
						labelHolder.appendChild(subEl);
						crate.appendChild(labelHolder);
						outer.appendChild(crate);
					}
					return outer;
				}

				const ph = document.createElement('div');
				ph.className = 'placeholder';
				ph.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ph.textContent = `[array shape=${value.shape.join('×')}]`;
				return ph;
			}
			case 'fn':
			case 'namespace': {
				// Not used interactively in the harness (no functions or
				// namespaces in scope per CLAUDE.md). Fall back to a small
				// text placeholder in case some BQN expression unexpectedly
				// returns one.
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

	function mkBox(inner: BqnValue): BqnValue {
		// Rank-0 array — what < produces. Shape is the empty list ⟨⟩
		// and data holds exactly the wrapped value.
		return { kind: 'array', shape: [], data: [inner] };
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
		// Boxed scalar — what < produces. A rank-0 array containing a
		// number, rendered as the crate visual.
		{ label: '<5', value: mkBox(mkNum(5)) },
	];

	// ── Op descriptors ───────────────────────────────────────────────────────

	type Family = 'lateral' | 'vertical' | 'sizing' | 'merging' | 'distributing' | 'comparison' | 'structural' | 'blackBox';

	type OpDesc = {
		label: string;
		fn: FnExpr;
		arity: 'monadic' | 'dyadic';
		w?: BqnValue;
		family: Family;
		// BQN source FOR THIS OP applied to the current value's literal X.
		// The worker evaluates `source(bqnLiteral(currentValue))` and returns
		// the structured result — the animator does NOT compute this.
		source: (x: string) => string;
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
		{ key: 'comparison',   label: 'Comparison',   color: '#f76a8a', btnColor: '#e0e0ff' },
		{ key: 'structural',   label: 'Structural',   color: '#f7e16a', btnColor: '#e0e0ff' },
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
		distributing: false,
		comparison: false,
		structural: true,
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
		g: { kind: 'replicate' },
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

	// Comparison ops bound on the RIGHT — `>⟜2` reads "X > 2" per cell, so
	// the stripped badge label is ">2". The bind-left forms (`2>`, `2=`, …)
	// are direct dyadic ops with the scalar on the W side. The two are NOT
	// the same operation: `2>X` is `X<2` (true where cell is less than 2)
	// while `X>2` is true where cell is greater than 2.
	const EQ_TO2: FnExpr = { kind: 'bind-right', right: W2, of: { kind: 'eq' } };
	const GT_BY2: FnExpr = { kind: 'bind-right', right: W2, of: { kind: 'gt' } };
	const LT_BY2: FnExpr = { kind: 'bind-right', right: W2, of: { kind: 'lt' } };

	// 1⋈X — pair the scalar 1 with X. Bind-left form so the button reads
	// "1⋈" (operation glyph kept per CLAUDE.md invariant 6; the ⊸ plumbing
	// is stripped). Only meaningful on the scalar starters (3, 5, 8) —
	// otherwise the evaluator throws.
	const PAIR_1: FnExpr = { kind: 'bind-left', left: { kind: 'number', value: 1 }, of: { kind: 'pair' } };

	// Every op's `source` is the BQN syntax that, applied to the current
	// value's literal, expresses the operation. The worker compiles and
	// runs this string with the real BQN interpreter — there is no
	// reimplementation of any operation in the harness.
	const SCAN = '`'; // BQN scan modifier glyph (a literal backtick)
	const OPS: OpDesc[] = [
		// lateral group
		{ label: fnExprLabel({ kind: 'reverse' }),   fn: { kind: 'reverse' },   arity: 'monadic', family: 'lateral',     source: x => `⌽${x}` },
		{ label: fnExprLabel({ kind: 'sort-up' }),   fn: { kind: 'sort-up' },   arity: 'monadic', family: 'lateral',     source: x => `∧${x}` },
		{ label: fnExprLabel({ kind: 'sort-down' }), fn: { kind: 'sort-down' }, arity: 'monadic', family: 'lateral',     source: x => `∨${x}` },
		{ label: `2${fnExprLabel({ kind: 'rotate' })}`, fn: { kind: 'rotate' }, arity: 'dyadic', w: W2, family: 'lateral', source: x => `2⌽${x}` },
		{ label: fnExprLabel({ kind: 'transpose' }), fn: { kind: 'transpose' }, arity: 'monadic', family: 'lateral',     source: x => `⍉${x}` },
		// vertical group
		{ label: stripBindPlumbing(fnExprLabel(TAKE2)), fn: TAKE2, arity: 'monadic', family: 'vertical', source: x => `2↑${x}` },
		{ label: stripBindPlumbing(fnExprLabel(DROP2)), fn: DROP2, arity: 'monadic', family: 'vertical', source: x => `2↓${x}` },
		{ label: `(>2)/`, fn: FILTER_GT2, arity: 'monadic', family: 'vertical', source: x => `(${x}>2)/${x}` },
		// sizing group — per-cell arithmetic. Non-commutative ops appear in
		// BOTH bind-left and bind-right forms because operand order is
		// load-bearing in BQN: `2-X` is "two minus each cell" (flips sign
		// when X > 2); `X-2` written `-⟜2` is "subtract 2 from each cell".
		// Tap them back-to-back and the badge position + colour-flip make
		// the difference visible.
		{ label: `2${fnExprLabel({ kind: 'add' })}`, fn: { kind: 'add' }, arity: 'dyadic', w: W2, family: 'sizing', source: x => `2+${x}` },
		{ label: `2${fnExprLabel({ kind: 'sub' })}`, fn: { kind: 'sub' }, arity: 'dyadic', w: W2, family: 'sizing', source: x => `2-${x}` },
		{ label: stripBindPlumbing(fnExprLabel(SUB_BY2)), fn: SUB_BY2, arity: 'monadic', family: 'sizing', source: x => `${x}-2` },
		{ label: `2${fnExprLabel({ kind: 'mul' })}`, fn: { kind: 'mul' }, arity: 'dyadic', w: W2, family: 'sizing', source: x => `2×${x}` },
		{ label: `2${fnExprLabel({ kind: 'div' })}`, fn: { kind: 'div' }, arity: 'dyadic', w: W2, family: 'sizing', source: x => `2÷${x}` },
		{ label: stripBindPlumbing(fnExprLabel(DIV_BY2)), fn: DIV_BY2, arity: 'monadic', family: 'sizing', source: x => `${x}÷2` },
		{ label: `3${fnExprLabel({ kind: 'mod' })}`, fn: { kind: 'mod' }, arity: 'dyadic', w: { kind: 'number', value: 3 }, family: 'sizing', source: x => `3|${x}` },
		// monadic per-cell
		{ label: fnExprLabel({ kind: 'neg' }), fn: { kind: 'neg' }, arity: 'monadic', family: 'sizing', source: x => `-${x}` },
		{ label: fnExprLabel({ kind: 'abs' }), fn: { kind: 'abs' }, arity: 'monadic', family: 'sizing', source: x => `|${x}` },
		// merging group — fold (F´) and scan (F`).
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'add' } }), fn: { kind: 'fold', over: { kind: 'add' } }, arity: 'monadic', family: 'merging', source: x => `+´${x}` },
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'sub' } }), fn: { kind: 'fold', over: { kind: 'sub' } }, arity: 'monadic', family: 'merging', source: x => `-´${x}` },
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'mul' } }), fn: { kind: 'fold', over: { kind: 'mul' } }, arity: 'monadic', family: 'merging', source: x => `×´${x}` },
		{ label: fnExprLabel({ kind: 'fold', over: { kind: 'max' } }), fn: { kind: 'fold', over: { kind: 'max' } }, arity: 'monadic', family: 'merging', source: x => `⌈´${x}` },
		{ label: fnExprLabel({ kind: 'scan', over: { kind: 'add' } }), fn: { kind: 'scan', over: { kind: 'add' } }, arity: 'monadic', family: 'merging', source: x => `+${SCAN}${x}` },
		{ label: fnExprLabel({ kind: 'scan', over: { kind: 'sub' } }), fn: { kind: 'scan', over: { kind: 'sub' } }, arity: 'monadic', family: 'merging', source: x => `-${SCAN}${x}` },
		{ label: fnExprLabel({ kind: 'scan', over: { kind: 'max' } }), fn: { kind: 'scan', over: { kind: 'max' } }, arity: 'monadic', family: 'merging', source: x => `⌈${SCAN}${x}` },
		// distributing group — one cell spreads to many.
		{ label: fnExprLabel({ kind: 'range' }),   fn: { kind: 'range' },   arity: 'monadic', family: 'distributing', source: x => `↕${x}` },
		{ label: fnExprLabel({ kind: 'enclose' }), fn: { kind: 'enclose' }, arity: 'monadic', family: 'distributing', source: x => `<${x}` },
		// comparison group — per-cell W F X with one scalar side. Bind-left
		// (`2=`, `2>`, `2<`) reads "2 F cell"; bind-right (`=2`, `>2`, `<2`)
		// reads "cell F 2". Operand order matters.
		{ label: `2${fnExprLabel({ kind: 'eq' })}`, fn: { kind: 'eq' }, arity: 'dyadic', w: W2, family: 'comparison', source: x => `2=${x}` },
		{ label: `2${fnExprLabel({ kind: 'gt' })}`, fn: { kind: 'gt' }, arity: 'dyadic', w: W2, family: 'comparison', source: x => `2>${x}` },
		{ label: `2${fnExprLabel({ kind: 'lt' })}`, fn: { kind: 'lt' }, arity: 'dyadic', w: W2, family: 'comparison', source: x => `2<${x}` },
		{ label: stripBindPlumbing(fnExprLabel(EQ_TO2)), fn: EQ_TO2, arity: 'monadic', family: 'comparison', source: x => `${x}=2` },
		{ label: stripBindPlumbing(fnExprLabel(GT_BY2)), fn: GT_BY2, arity: 'monadic', family: 'comparison', source: x => `${x}>2` },
		{ label: stripBindPlumbing(fnExprLabel(LT_BY2)), fn: LT_BY2, arity: 'monadic', family: 'comparison', source: x => `${x}<2` },
		// structural group — extraction (first / solo) and measurement
		// (length / shape / rank-of). All real BQN primitives.
		{ label: fnExprLabel({ kind: 'first' }),   fn: { kind: 'first' },   arity: 'monadic', family: 'structural', source: x => `⊑${x}` },
		{ label: fnExprLabel({ kind: 'length' }),  fn: { kind: 'length' },  arity: 'monadic', family: 'structural', source: x => `≠${x}` },
		{ label: fnExprLabel({ kind: 'shape' }),   fn: { kind: 'shape' },   arity: 'monadic', family: 'structural', source: x => `≢${x}` },
		{ label: fnExprLabel({ kind: 'rank-of' }), fn: { kind: 'rank-of' }, arity: 'monadic', family: 'structural', source: x => `=${x}` },
		{ label: fnExprLabel({ kind: 'solo' }),    fn: { kind: 'solo' },    arity: 'monadic', family: 'structural', source: x => `≍${x}` },
		{ label: stripBindPlumbing(fnExprLabel(PAIR_1)), fn: PAIR_1, arity: 'monadic', family: 'structural', source: x => `1⋈${x}` },
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
				// Mark as preparing: the embossed-box CSS suppresses
				// decoration on prepared elements, so afterRoot's container
				// outline doesn't appear stacked behind / clipping with the
				// still-visible beforeRoot during a motion. commit() clears
				// the attribute so the new currentEl shows its decoration.
				el.dataset.preparing = 'true';
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
				delete prepared.dataset.preparing;
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
		if (!stage || playing || !bqnWorker) return;

		// 1. Ship the BQN source to the worker. The current value is
		//    serialised as a BQN literal and substituted into the op's
		//    source template. The worker compiles and runs the source via
		//    the real BQN interpreter and returns the structured result.
		//    Any divergence between what the animation expects and what
		//    BQN actually produces will surface as a Step / Trajectory
		//    error below — there's no shadow evaluator to disagree with.
		let xLit: string;
		try {
			xLit = bqnLiteral(currentValue);
		} catch (e) {
			statusMsg = `Cannot serialise current value: ${String(e)}`;
			return;
		}
		const src = op.source(xLit);

		playing = true;
		statusMsg = '';

		let result: BqnValue;
		try {
			const structured = await bqnWorker.evalStructured(src);
			result = fromStructured(structured);
		} catch (e) {
			statusMsg = `BQN: ${e instanceof Error ? e.message : String(e)}`;
			playing = false;
			return;
		}

		// 2. Build the animation Step. The fn used for animation dispatch
		//    is the unwrapped form (so animateDyadic sees `sub` etc., not
		//    `bind-left{sub}` which routes to blackBox). bind-{left,right}
		//    unwrap puts the bound side into the right slot:
		//      bind-left  (N⊸F):  W = N (bound), X = currentValue.
		//      bind-right (F⟜N):  W = currentValue, X = N (bound).
		const fn: FnExpr = op.fn;
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

		let traj: Trajectory | TrajectoryError;
		if (arity === 'monadic') {
			traj = trajectoryFrom(currentValue, [
				{ kind: 'monadic', fn: fnForStep, result },
			]);
		} else {
			if (w === undefined) {
				statusMsg = 'Dyadic op missing w';
				playing = false;
				return;
			}
			traj = trajectoryFrom(currentValue, [
				{ kind: 'dyadic', fn: fnForStep, w, x: xForStep, result },
			]);
		}

		if ('kind' in traj) {
			statusMsg = `Trajectory error: ${traj.kind}`;
			playing = false;
			return;
		}

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
		bqnWorker = new BqnWorkerClient();
	});

	onDestroy(() => {
		bqnWorker?.destroy();
		bqnWorker = null;
	});
</script>

<svelte:head>
	<title>v2 Animation Harness</title>
</svelte:head>

<main style="padding:1rem;font-family:sans-serif;background:#0d0d1a;height:100dvh;overflow-y:auto;color:#e0e0ff;max-width:480px;margin:0 auto;">
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
		style="position:relative;min-height:320px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:1rem;display:flex;align-items:center;justify-content:center;overflow:visible;"
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

<style>
	/* Embossed-box decoration on array containers so the user can tell
	   scalar (bare bar) from rank-1 (boxed row of bars) from rank-2
	   (boxed grid of bars). The :not([data-preparing]) guard suppresses
	   the box on the prepared afterRoot during a motion — so during
	   animation only beforeRoot's box is visible, and the box on the
	   new value appears the moment commit() removes the attribute.
	   :global because renderBqnValue creates the elements imperatively
	   outside Svelte's scoped-style hashing. */
	:global(.bqn-vector):not([data-preparing]),
	:global(.bqn-matrix):not([data-preparing]) {
		border: 1px solid rgba(140, 130, 200, 0.28);
		border-radius: 8px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.04),
			0 1px 2px rgba(0, 0, 0, 0.35);
		background: rgba(40, 40, 60, 0.18);
	}

	/* Rank-0 box. The crate drawing comes from an inline SVG inserted as the
	   first child by makeCrate; this rule only handles the label's text
	   styling and the .bqn-box layout container. The SVG is positioned
	   absolute inside, so it fills the box behind the content. */
	:global(.bqn-box-label) {
		color: #fff8e1;
		font-weight: 700;
		font-family: system-ui, -apple-system, sans-serif;
		text-shadow:
			0 1px 1px rgba(0, 0, 0, 0.9),
			0 0 3px rgba(0, 0, 0, 0.6);
		line-height: 1;
	}
</style>
