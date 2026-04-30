<!--
  Animated row for rank-1 lists. The animation shape is selected by
  the parent via the `op` prop:

    'reverse' — each cell lifts off the row, arcs over the others,
                and lands in its mirrored position. Built so the
                player physically sees pairs swapping in mid-air.

    null      — straight-line FLIP (used when ids change but the
                operation isn't one we have a custom motion for yet).

  Cell identity is owned by the parent; we just key the each on
  cell.id and let Svelte feed our animation function the from/to
  bounding rects so we can compute the arc.
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
		op?: string | null;
	}
	let { cells, max = 12, op = null }: Props = $props();

	const ARC_PEAK = 56;

	type AnimArgs = { from: DOMRect; to: DOMRect };

	function arcMotion(_node: Element, { from, to }: AnimArgs) {
		const dx = from.left - to.left;
		const dy = from.top - to.top;
		// eslint-disable-next-line no-console
		console.log('[anim] arcMotion', { dx, dy });
		return {
			duration: 900,
			easing: (t: number) => t,
			css: (t: number) => {
				const tx = dx * (1 - t);
				const ty = dy * (1 - t) - ARC_PEAK * Math.sin(t * Math.PI);
				return `transform: translate(${tx}px, ${ty}px); z-index: 10;`;
			}
		};
	}

	function swapAnim(node: Element, args: AnimArgs, params: { op: string | null }) {
		// eslint-disable-next-line no-console
		console.log('[anim] swapAnim called, op=', params.op, 'from-to dx=', args.from.left - args.to.left);
		if (params.op === 'reverse') return arcMotion(node, args);
		return flip(node, args, { duration: 280 });
	}
</script>

<div class="row">
	{#each cells as cell (cell.id)}
		<div class="wrap" animate:swapAnim={{ op }}>
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
		/* Give the arc enough headroom so cells don't get clipped on
		   their way over each other. */
		padding-top: 64px;
		margin-top: -64px;
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
