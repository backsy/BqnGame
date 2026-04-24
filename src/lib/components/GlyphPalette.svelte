<script lang="ts">
	import {
		primitives,
		actions,
		kindLabels,
		type PrimKind,
		type Primitive
	} from '$lib/primitives';

	interface Props {
		onselect: (tile: Primitive) => void;
	}

	let { onselect }: Props = $props();

	let activeKind = $state<PrimKind>('fn');

	const kinds: PrimKind[] = ['fn', 'mod1', 'mod2', 'sym'];
</script>

<section class="palette" aria-label="BQN glyph palette">
	<div class="tabs" role="tablist" aria-label="primitive kind">
		{#each kinds as kind}
			<button
				type="button"
				role="tab"
				aria-selected={activeKind === kind}
				class="tab bqn"
				class:active={activeKind === kind}
				onclick={() => (activeKind = kind)}
			>
				{kindLabels[kind]}
			</button>
		{/each}
	</div>

	<div class="grid" role="tabpanel">
		{#each primitives[activeKind] as p (p.glyph)}
			<button
				type="button"
				class="tile bqn"
				title={p.label}
				aria-label={p.label}
				onclick={() => onselect(p)}
			>
				{p.glyph}
			</button>
		{/each}
	</div>

	<div class="actions">
		{#each actions as p (p.glyph)}
			<button
				type="button"
				class="tile bqn action"
				class:destructive={p.action === 'backspace'}
				title={p.label}
				aria-label={p.label}
				onclick={() => onselect(p)}
			>
				{p.glyph}
			</button>
		{/each}
	</div>
</section>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom));
		background: #0c0c0c;
		border-top: 1px solid #2a2a2a;
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
	}
	.tab {
		flex: 1;
		padding: 0.4rem 0;
		border: 1px solid #2a2a2a;
		border-radius: 0.375rem;
		background: transparent;
		color: #888;
		font-size: 1rem;
		cursor: pointer;
	}
	.tab.active {
		background: #1e1e1e;
		color: #eee;
		border-color: #444;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.35rem;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.35rem;
	}
	.actions .tile {
		flex: 0 0 auto;
		width: calc((100% - 6 * 0.35rem) / 7);
	}
	.tile {
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border: 1px solid #2a2a2a;
		border-radius: 0.4rem;
		background: #1a1a1a;
		color: #eee;
		font-size: 1.35rem;
		line-height: 1;
		cursor: pointer;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.tile:active {
		background: #2a2a2a;
		transform: scale(0.94);
	}
	.tile.action {
		background: #1d2f44;
		color: #a9c7e6;
		border-color: #2c4365;
	}
	.tile.action:active {
		background: #294262;
	}
	.tile.action.destructive {
		background: #3a1f1f;
		color: #e8a8a8;
		border-color: #5a2f2f;
	}
	.tile.action.destructive:active {
		background: #522c2c;
	}
</style>
