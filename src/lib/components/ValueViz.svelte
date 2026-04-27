<!--
  Visualises a BQN value as bars / tiles / grids based on its shape and
  type. Used by the game to show start, current, and target states.
  Values:
    null/undefined → red ✕ (evaluation error)
    number → vertical bar with height proportional to value
    char (single JS string) → square tile with the character
    rank-1 array → row of cells (recursive on each element)
    rank-2 array → grid (one row of cells per outer-axis index)
    rank ≥ 3, oversized arrays, tiny/non-finite numbers → compact placeholder
-->

<script lang="ts">
	import Self from './ValueViz.svelte';

	interface Props {
		value: unknown;
		max?: number; // value-axis cap for bar height scaling
	}
	let { value, max = 12 }: Props = $props();

	const MAX_ROW_ITEMS = 24;
	const MAX_GRID_CELLS = 64;

	function isArray(v: unknown): v is unknown[] & { sh?: number[] } {
		return Array.isArray(v);
	}

	function shape(v: unknown): number[] {
		if (isArray(v)) return (v as { sh?: number[] }).sh ?? [v.length];
		return [];
	}

	// Numbers can stretch the layout: long decimals from repeated division,
	// big factorials, ±∞ from divide-by-zero. Squash to something legible.
	function formatNum(n: number): string {
		if (Number.isNaN(n)) return '?';
		if (n === Infinity) return '∞';
		if (n === -Infinity) return '-∞';
		if (n === 0) return '0';
		const abs = Math.abs(n);
		if (abs < 0.1) return '…';
		if (Number.isInteger(n)) {
			const s = String(n);
			return s.length > 5 ? n.toExponential(0).replace('+', '') : s;
		}
		const fixed = n.toFixed(2).replace(/\.?0+$/, '');
		return fixed.length > 5 ? '…' : fixed;
	}
</script>

{#if value === null || value === undefined}
	<div class="err" title="invalid">✕</div>
{:else if typeof value === 'number'}
	<div class="bar" style="height: {Math.min(Math.max(value, 0), max) * (60 / max) + 18}px">
		<span class="num">{formatNum(value)}</span>
	</div>
{:else if typeof value === 'string'}
	<div class="char bqn">{value}</div>
{:else if isArray(value) && shape(value).length === 1}
	{@const items = value}
	{@const truncated = items.length > MAX_ROW_ITEMS}
	{@const shown = truncated ? items.slice(0, MAX_ROW_ITEMS) : items}
	{@const allArrays = shown.length > 0 && shown.every((v) => Array.isArray(v))}
	{#if allArrays}
		<div class="stack">
			{#each shown as item}
				<Self {max} value={item} />
			{/each}
			{#if truncated}<div class="dots" title="{items.length} items">…</div>{/if}
		</div>
	{:else}
		<div class="row">
			{#each shown as item}
				<Self {max} value={item} />
			{/each}
			{#if truncated}<div class="dots" title="{items.length} items">…</div>{/if}
		</div>
	{/if}
{:else if isArray(value) && shape(value).length === 2}
	{@const sh = shape(value)}
	{#if sh[0] * sh[1] > MAX_GRID_CELLS}
		<div class="big" title="shape {sh.join('×')}">{sh.join('×')} …</div>
	{:else}
		<div class="grid" style="grid-template-columns: repeat({sh[1]}, auto)">
			{#each value as item}
				<Self {max} value={item} />
			{/each}
		</div>
	{/if}
{:else if isArray(value) && shape(value).length > 2}
	{@const sh = shape(value)}
	<div class="big" title="rank {sh.length}: {sh.join('×')}">{sh.join('×')} …</div>
{:else}
	<div class="other">{String(value)}</div>
{/if}

<style>
	.bar {
		width: 30px;
		min-height: 18px;
		background: linear-gradient(to top, #2a6a2a, #5fcc5f);
		border-radius: 0.3rem 0.3rem 0 0;
		display: grid;
		place-items: start center;
		padding-top: 0.2rem;
		box-shadow: 0 0 8px rgba(95, 204, 95, 0.2);
	}
	.bar .num {
		color: #f0fff0;
		font-size: 0.85rem;
		font-weight: 600;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
	}
	.char {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		background: #15212e;
		border: 1px solid #2c4365;
		border-radius: 0.3rem;
		color: #a9c7e6;
		font-size: 1.2rem;
	}
	.row {
		display: flex;
		align-items: flex-end;
		gap: 0.25rem;
	}
	.stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
	}
	.grid {
		display: grid;
		gap: 0.25rem;
	}
	.dots {
		align-self: center;
		color: #888;
		font-size: 1.1rem;
		padding: 0 0.2rem;
	}
	.err {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		color: #e25555;
		font-size: 1.4rem;
		font-weight: 700;
		text-shadow: 0 0 6px rgba(226, 85, 85, 0.4);
	}
	.big {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.5rem;
		background: #1a2030;
		border: 1px solid #2c4365;
		border-radius: 0.3rem;
		color: #a9c7e6;
		font-family: monospace;
		font-size: 0.85rem;
	}
	.other {
		color: #999;
		font-family: monospace;
		font-size: 0.85rem;
	}
</style>
