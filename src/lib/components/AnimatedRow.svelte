<!--
  Renders a rank-1 list as a row of cells (bars for numbers, square
  tiles for chars). Cell identity is owned by the parent — each cell
  carries a stable id that survives operations like ⌽. The id is
  rendered as data-cell-id on each .wrap element so withSnapshot can
  query live DOM positions without a Map callback mechanism.
-->

<script lang="ts">
	import type { Cell } from '$lib/animations';

	interface Props {
		cells: Cell[];
		max?: number;
	}
	let { cells, max = 12 }: Props = $props();
</script>

<div class="row">
	{#each cells as cell (cell.id)}
		<div class="wrap" data-cell-id="{cell.id}">
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
		/* Allow lifting cells above their flex track without disturbing
		   layout. Motion animations transform within this. */
		will-change: transform;
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
