<!--
  Renders a rank-1 list as a row of cells (bars for numbers, square
  tiles for chars), animating each cell's position via animate:flip
  when its stable id moves between renders. The parent decides which
  cell carries which id; that's how a permutation rune like ⌽ tells
  this component "the cell that was on the right is now on the left,
  please slide it across."

  When `arcs` is non-empty, an SVG overlay draws curved arcs between
  the paired cell indices (e.g. for ⌽ that's 0↔n-1, 1↔n-2, …) so the
  player sees *which* cells are getting swapped rather than just a
  blur of motion. The parent shows the arcs for ~700ms around the
  swap, then clears them.
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
		// Pairs of indices to draw arcs between (purely visual, doesn't
		// affect cell layout). Cleared by the parent after the animation.
		arcs?: [number, number][];
	}
	let { cells, max = 12, arcs = [] }: Props = $props();

	const CELL_W = 30; // matches .bar / .char width
	const GAP = 4; // 0.25rem at 16px root
	const STEP = CELL_W + GAP;
	const ARC_H = 28; // peak rise of the arc
	const PAD_X = 6; // svg horizontal padding so caps aren't clipped

	function cellCenter(i: number) {
		return PAD_X + i * STEP + CELL_W / 2;
	}

	const svgWidth = $derived(
		cells.length === 0 ? 0 : 2 * PAD_X + cells.length * CELL_W + (cells.length - 1) * GAP
	);
	const svgHeight = ARC_H + 8;
</script>

<div class="rowwrap">
	{#if arcs.length > 0 && cells.length > 1}
		<svg
			class="arcs"
			width={svgWidth}
			height={svgHeight}
			viewBox="0 0 {svgWidth} {svgHeight}"
			aria-hidden="true"
		>
			{#each arcs as [a, b] (`${a}-${b}`)}
				{@const ax = cellCenter(a)}
				{@const bx = cellCenter(b)}
				{@const mx = (ax + bx) / 2}
				<path
					class="arc"
					d="M {ax} {svgHeight} Q {mx} {svgHeight - ARC_H} {bx} {svgHeight}"
					fill="none"
				/>
			{/each}
		</svg>
	{/if}
	<div class="row">
		{#each cells as cell (cell.id)}
			<div class="wrap" animate:flip={{ duration: 480 }}>
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
</div>

<style>
	.rowwrap {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}
	.arcs {
		display: block;
		overflow: visible;
		animation: arc-fade 720ms ease-out forwards;
	}
	.arc {
		stroke: #5fcc5f;
		stroke-width: 2;
		stroke-linecap: round;
	}
	@keyframes arc-fade {
		0% {
			opacity: 0;
		}
		25% {
			opacity: 1;
		}
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
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
