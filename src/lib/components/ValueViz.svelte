<!--
  Visualises a BQN value as bars / tiles / grids based on its shape and
  type. Used by the game to show start, current, and target states.
  Values:
    number → vertical bar with height proportional to value
    char (single JS string) → square tile with the character
    rank-1 array → row of cells (recursive on each element)
    rank-2 array → grid (one row of cells per outer-axis index)
    other → text fallback
-->

<script lang="ts">
	import Self from './ValueViz.svelte';

	interface Props {
		value: unknown;
		max?: number; // value-axis cap for bar height scaling
	}
	let { value, max = 12 }: Props = $props();

	function isArray(v: unknown): v is unknown[] & { sh?: number[] } {
		return Array.isArray(v);
	}

	function shape(v: unknown): number[] {
		if (isArray(v)) return (v as { sh?: number[] }).sh ?? [v.length];
		return [];
	}
</script>

{#if typeof value === 'number'}
	<div class="bar" style="height: {Math.min(Math.max(value, 0), max) * (60 / max) + 18}px">
		<span class="num">{value}</span>
	</div>
{:else if typeof value === 'string'}
	<div class="char bqn">{value}</div>
{:else if isArray(value) && shape(value).length === 1}
	{@const allArrays = value.length > 0 && value.every((v) => Array.isArray(v))}
	{#if allArrays}
		<div class="stack">
			{#each value as item}
				<Self {max} value={item} />
			{/each}
		</div>
	{:else}
		<div class="row">
			{#each value as item}
				<Self {max} value={item} />
			{/each}
		</div>
	{/if}
{:else if isArray(value) && shape(value).length === 2}
	{@const sh = shape(value)}
	<div class="grid" style="grid-template-columns: repeat({sh[1]}, auto)">
		{#each value as item}
			<Self {max} value={item} />
		{/each}
	</div>
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
	.other {
		color: #999;
		font-family: monospace;
		font-size: 0.85rem;
	}
</style>
