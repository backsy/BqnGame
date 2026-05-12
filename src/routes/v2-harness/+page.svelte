<script lang="ts">
	import { onMount } from 'svelte';
	import { play, trajectoryFrom, fnExprLabel, assertNever } from '$lib/animations/v2/index.js';
	import type { Stage, BqnValue, Trajectory, TrajectoryError, FnExpr } from '$lib/animations/v2/index.js';

	// ── Small in-harness evaluator ───────────────────────────────────────────
	// NOT in v2/. Handles only the operations the harness wires up.
	// Throws for unsupported combinations; the harness won't call those.

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
					return { kind: 'array', shape: input.shape, data: [...input.data].reverse() };
				}
				// dyadic: W⌽X = rotate X by W
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
				const indexed = input.data.map((v, i) => ({ v, i }));
				indexed.sort((a, b) => {
					if (a.v.kind === 'number' && b.v.kind === 'number') return a.v.value - b.v.value;
					return 0;
				});
				return { kind: 'array', shape: input.shape, data: indexed.map(x => x.v) };
			}
			case 'sort-down': {
				if (arity !== 'monadic') throw new Error('sort-down: monadic only');
				if (input.kind !== 'array') throw new Error('sort-down: expected array');
				const indexed = input.data.map((v, i) => ({ v, i }));
				indexed.sort((a, b) => {
					if (a.v.kind === 'number' && b.v.kind === 'number') return b.v.value - a.v.value;
					return 0;
				});
				return { kind: 'array', shape: input.shape, data: indexed.map(x => x.v) };
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
			// blackBox group — results that are obviously computable
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
			case 'add': {
				if (arity !== 'dyadic') throw new Error('add: dyadic only');
				if (w === undefined || w.kind !== 'number' || input.kind !== 'array')
					throw new Error('add: expected number w and array x');
				const wValue = w.value;
				return {
					kind: 'array',
					shape: input.shape,
					data: input.data.map(v =>
						v.kind === 'number'
							? { kind: 'number' as const, value: v.value + wValue }
							: v,
					),
				};
			}
			case 'fold': {
				if (arity !== 'monadic') throw new Error('fold: monadic only');
				// Only support +´ here
				if (fn.over.kind !== 'add') throw new Error('fold: only +´ supported in harness');
				if (input.kind !== 'array') throw new Error('fold: expected array');
				const sum = input.data.reduce((acc, v) => {
					if (v.kind !== 'number') throw new Error('fold: non-numeric element');
					return acc + v.value;
				}, 0);
				return { kind: 'number', value: sum };
			}
			case 'take': {
				// harness: 3⊸↑ — bind-left case won't reach here directly;
				// the harness drives take with a bound-left fn
				throw new Error('take: use bind-left wrapper in harness');
			}
			case 'bind-left': {
				if (fn.left.kind !== 'number') throw new Error('bind-left: expected number left');
				return evalStep(input, fn.of, 'dyadic', fn.left);
			}
			default:
				throw new Error(`evalStep: unsupported fn kind "${fn.kind}" in harness`);
		}
	}

	// ── renderBqnValue ───────────────────────────────────────────────────────
	// Produces an HTMLElement representing a BqnValue.
	// For 2D arrays: renders as a grid of bars so transpose is visually meaningful.

	function renderBqnValue(value: BqnValue): HTMLElement {
		switch (value.kind) {
			case 'number': {
				const bar = document.createElement('div');
				bar.className = 'bar';
				const h = Math.max(4, Math.abs(value.value) * 20);
				const color = value.value < 0 ? '#f76a6a' : '#7c6af7';
				bar.style.cssText = `height:${h}px;width:24px;background:${color};border-radius:3px;display:inline-block;margin:2px;vertical-align:bottom;`;
				bar.title = String(value.value);
				return bar;
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
					grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},28px);gap:4px;padding:8px;`;
					for (let r = 0; r < rows; r++) {
						for (let c = 0; c < cols; c++) {
							const cell = document.createElement('div');
							const v = value.data[r * cols + c];
							const val = v.kind === 'number' ? v.value : 0;
							const h = Math.max(4, Math.abs(val) * 14);
							const color = val < 0 ? '#f76a6a' : '#7c6af7';
							cell.className = 'bar';
							cell.style.cssText = `height:${h}px;width:24px;background:${color};border-radius:3px;`;
							cell.title = String(val);
							grid.appendChild(cell);
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

	const STARTERS: Starter[] = [
		{ label: '[3 1 4 1 5]', value: mkArr([3, 1, 4, 1, 5]) },
		{ label: '[9 2 6 5 3]', value: mkArr([9, 2, 6, 5, 3]) },
		{ label: '[1 2 3 4 5 6]', value: mkArr([1, 2, 3, 4, 5, 6]) },
		{ label: '2×3 grid', value: mk2D(2, 3, [1, 2, 3, 4, 5, 6]) },
		{ label: '[-3 1 -2 4]', value: mkArr([-3, 1, -2, 4]) },
	];

	// ── Op descriptors ───────────────────────────────────────────────────────

	type OpDesc = {
		label: string;
		fn: FnExpr;
		arity: 'monadic' | 'dyadic';
		w?: BqnValue;
		family: 'lateral' | 'blackBox';
	};

	const W2: BqnValue = { kind: 'number', value: 2 };

	const OPS: OpDesc[] = [
		// lateral group
		{ label: fnExprLabel({ kind: 'reverse' }),   fn: { kind: 'reverse' },   arity: 'monadic', family: 'lateral' },
		{ label: fnExprLabel({ kind: 'sort-up' }),   fn: { kind: 'sort-up' },   arity: 'monadic', family: 'lateral' },
		{ label: fnExprLabel({ kind: 'sort-down' }), fn: { kind: 'sort-down' }, arity: 'monadic', family: 'lateral' },
		{ label: `2${fnExprLabel({ kind: 'rotate' })}`, fn: { kind: 'rotate' }, arity: 'dyadic', w: W2, family: 'lateral' },
		{ label: fnExprLabel({ kind: 'transpose' }), fn: { kind: 'transpose' }, arity: 'monadic', family: 'lateral' },
		// blackBox group
		{ label: fnExprLabel({ kind: 'range' }),     fn: { kind: 'range' },     arity: 'monadic', family: 'blackBox' },
		{
			label: `+${fnExprLabel({ kind: 'fold', over: { kind: 'add' } })}`,
			fn: { kind: 'fold', over: { kind: 'add' } },
			arity: 'monadic',
			family: 'blackBox',
		},
		{
			label: `3${fnExprLabel({ kind: 'take' })}`,
			fn: { kind: 'bind-left', left: { kind: 'number', value: 3 }, of: { kind: 'take' } },
			arity: 'monadic',
			family: 'blackBox',
		},
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
				el.style.position = 'absolute';
				el.style.left = '0';
				el.style.bottom = '0';
				el.style.opacity = '0';
				containerEl.appendChild(el);
				return el;
			},
			commit(prepared: HTMLElement): void {
				prepared.style.position = '';
				prepared.style.left = '';
				prepared.style.bottom = '';
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

		let result: BqnValue;
		try {
			result = evalStep(currentValue, op.fn, op.arity, op.w);
		} catch (e) {
			statusMsg = `Cannot apply to current value: ${String(e)}`;
			return;
		}

		let traj: Trajectory | TrajectoryError;
		if (op.arity === 'monadic') {
			traj = trajectoryFrom(currentValue, [
				{ kind: 'monadic', fn: op.fn, result },
			]);
		} else {
			if (op.w === undefined) {
				statusMsg = 'Dyadic op missing w';
				return;
			}
			traj = trajectoryFrom(currentValue, [
				{ kind: 'dyadic', fn: op.fn, w: op.w, x: currentValue, result },
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
	<h1 style="font-size:1.1rem;margin-bottom:1rem;color:#a89cf7;">v2 Animation Harness</h1>

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

	<!-- Stage container -->
	<div
		bind:this={containerEl}
		style="position:relative;min-height:80px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:1rem;display:flex;align-items:flex-end;overflow:hidden;"
	></div>

	{#if statusMsg}
		<p style="font-size:0.8rem;color:#f76a6a;margin-bottom:0.8rem;">{statusMsg}</p>
	{/if}

	<!-- Operation picker: lateral group -->
	<section style="margin-bottom:0.8rem;">
		<div style="font-size:0.75rem;color:#7c6af7;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.05em;">Lateral</div>
		<div style="display:flex;flex-wrap:wrap;gap:6px;">
			{#each OPS.filter(op => op.family === 'lateral') as op}
				<button
					on:click={() => handleOp(op)}
					disabled={playing}
					style="padding:0.4rem 0.8rem;font-size:1.2rem;background:#1a1a2e;color:#e0e0ff;border:1px solid #7c6af7;border-radius:5px;cursor:pointer;font-family:monospace;min-width:2.5rem;"
					title={op.fn.kind}
				>
					{op.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Operation picker: blackBox group -->
	<section style="margin-bottom:1rem;">
		<div style="font-size:0.75rem;color:#555;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.05em;">Black-box</div>
		<div style="display:flex;flex-wrap:wrap;gap:6px;">
			{#each OPS.filter(op => op.family === 'blackBox') as op}
				<button
					on:click={() => handleOp(op)}
					disabled={playing}
					style="padding:0.4rem 0.8rem;font-size:1.2rem;background:#1a1a2e;color:#a0a0b0;border:1px solid #333;border-radius:5px;cursor:pointer;font-family:monospace;min-width:2.5rem;"
					title={op.fn.kind}
				>
					{op.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Reset -->
	<button
		on:click={handleReset}
		disabled={playing}
		style="padding:0.4rem 1.2rem;background:#333;color:#e0e0ff;border:1px solid #555;border-radius:6px;font-size:0.9rem;cursor:pointer;"
	>
		Reset
	</button>

	{#if playing}
		<span style="margin-left:0.8rem;font-size:0.85rem;color:#7c6af7;">animating…</span>
	{/if}
</main>
