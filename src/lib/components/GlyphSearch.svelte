<script lang="ts">
	import { onMount } from 'svelte';
	import { primitives } from '$lib/primitives';
	import { GLYPH_TO_MNEMONIC } from '$lib/bqn/keymap';

	interface Props {
		open: boolean;
		oninsert: (glyph: string) => void;
		onclose: () => void;
	}
	let { open, oninsert, onclose }: Props = $props();

	type Item = { glyph: string; label: string; shortcut: string };

	const ALL: Item[] = [
		...primitives.fn,
		...primitives.mod1,
		...primitives.mod2,
		...primitives.sym
	]
		.filter((p) => GLYPH_TO_MNEMONIC.has(p.glyph) || /[a-zA-Z]/.test(p.label))
		.map((p) => {
			const k = GLYPH_TO_MNEMONIC.get(p.glyph);
			return { glyph: p.glyph, label: p.label, shortcut: k ? `\\${k}` : '' };
		});

	let query = $state('');
	let inputEl: HTMLInputElement | undefined = $state();
	let viewportHeight = $state('100dvh');

	onMount(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => (viewportHeight = `${vv.height}px`);
		update();
		vv.addEventListener('resize', update);
		vv.addEventListener('scroll', update);
		return () => {
			vv.removeEventListener('resize', update);
			vv.removeEventListener('scroll', update);
		};
	});

	let filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return ALL;
		return ALL.filter(
			(x) => x.label.toLowerCase().includes(q) || x.shortcut.toLowerCase().includes(q)
		);
	});

	$effect(() => {
		if (open && inputEl) inputEl.focus();
		if (!open) query = '';
	});

	function pick(g: string) {
		oninsert(g);
		onclose();
	}
</script>

{#if open}
	<div
		class="overlay"
		role="dialog"
		aria-modal="true"
		aria-label="search glyphs"
		onclick={onclose}
		onkeydown={(e) => e.key === 'Escape' && onclose()}
		tabindex="-1"
		style="height: {viewportHeight};"
	>
		<div class="modal" onclick={(e) => e.stopPropagation()} role="presentation">
			<input
				bind:this={inputEl}
				bind:value={query}
				type="text"
				inputmode="search"
				autocapitalize="off"
				autocomplete="off"
				autocorrect="off"
				spellcheck="false"
				placeholder="search by name…"
				class="search-input"
			/>
			<div class="rows" role="list">
				{#each filtered as item (item.glyph)}
					<button type="button" class="row" onclick={() => pick(item.glyph)}>
						<span class="g bqn">{item.glyph}</span>
						<span class="l">{item.label}</span>
						{#if item.shortcut}
							<span class="k bqn">{item.shortcut}</span>
						{/if}
					</button>
				{/each}
				{#if filtered.length === 0}
					<div class="empty">no matches</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		/* height set inline from visualViewport so the modal sits
		   above the soft keyboard rather than being covered by it */
		background: rgba(0, 0, 0, 0.65);
		display: grid;
		place-items: start center;
		padding: 1rem;
		box-sizing: border-box;
		z-index: 200;
	}
	.modal {
		width: min(28rem, 100%);
		max-height: calc(100% - 2rem);
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
		border: 1px solid #3a3a3a;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.search-input {
		flex: 0 0 auto;
		padding: 0.7rem 0.85rem;
		background: #141414;
		border: none;
		border-bottom: 1px solid #2a2a2a;
		color: #eee;
		font: inherit;
		font-size: 1rem;
		outline: none;
	}
	.search-input::placeholder {
		color: #666;
	}
	.rows {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.row {
		all: unset;
		display: grid;
		grid-template-columns: 2rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.35rem 0.85rem;
		cursor: pointer;
		box-sizing: border-box;
	}
	.row:active {
		background: #2a2a2a;
	}
	.row .g {
		font-size: 1.5rem;
		line-height: 1;
		color: #eee;
		text-align: center;
	}
	.row .l {
		font-size: 0.95rem;
		color: #ddd;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		text-align: left;
	}
	.row .k {
		font-size: 0.85rem;
		color: #8ab0ce;
		padding: 0.1rem 0.4rem;
		border: 1px solid #2c4365;
		border-radius: 0.25rem;
		background: #15212e;
		white-space: nowrap;
	}
	.empty {
		padding: 1rem;
		text-align: center;
		color: #777;
		font-size: 0.9rem;
	}
</style>
