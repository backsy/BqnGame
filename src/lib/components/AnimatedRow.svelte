<!--
  Renders a rank-1 list as a row of cells (bars for numbers, square
  tiles for chars), animating each cell's position via animate:flip
  when its stable id moves between renders. The parent decides which
  cell carries which id; that's how a permutation rune like ⌽ tells
  this component "the cell that was on the right is now on the left,
  please slide it across."
-->

<script lang="ts">
	import { flip } from 'svelte/animate';

	interface Cell {
		id: number;
		value: number | string;
	}

	interface Props {
		cells: Cell[];
		max?: number;
	}
	let { cells, max = 12 }: Props = $props();
</script>

<div class="row">
	{#each cells as cell (cell.id)}
		<div class="wrap" animate:flip={{ duration: 320 }}>
			{#if typeof cell.value === 'number'}
				<div
					class="bar"
					style="height: {Math.min(Math.max(cell.value, 0), max) * (60 / max) + 18}px"
				>
					<span class="num">{cell.value}</span>
				</div>
			{:else}
				<div class="char bqn">{cell.value}</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.row {
		display: flex;
		align-items: flex-end;
		gap: 0.25rem;
	}
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
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
</style>
