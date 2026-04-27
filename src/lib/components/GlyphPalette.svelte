<script lang="ts">
	import { slide } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import {
		paletteSections,
		primitiveByGlyph,
		type Primitive
	} from '$lib/primitives';
	import { GLYPH_TO_MNEMONIC } from '$lib/bqn/keymap';
	import ModifierDiagram from './ModifierDiagram.svelte';

	interface Props {
		oninsert: (glyph: string) => void;
		open: boolean;
		onToggle: (next: boolean) => void;
	}

	let { oninsert, open, onToggle }: Props = $props();

	const LONG_PRESS_MS = 400;
	const KEYBOARD_MS = 250;

	let helpTarget = $state<Primitive | null>(null);
	let helpHistory = $state<Primitive[]>([]);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let didLongPress = false;

	function navigateTo(p: Primitive) {
		if (helpTarget && helpTarget !== p) helpHistory = [...helpHistory, helpTarget];
		helpTarget = p;
	}

	function back() {
		const prev = helpHistory.at(-1);
		if (!prev) return;
		helpHistory = helpHistory.slice(0, -1);
		helpTarget = prev;
	}

	function closeHelp() {
		helpTarget = null;
		helpHistory = [];
	}

	function kindName(p: Primitive): string {
		if (p.kind === 'fn') return 'Function';
		if (p.kind === 'mod1') return '1-Modifier';
		if (p.kind === 'mod2') return '2-Modifier';
		if (p.kind === 'sym') return 'Syntax';
		return '';
	}

	function startPress(p: Primitive) {
		didLongPress = false;
		clearTimeout(pressTimer);
		pressTimer = setTimeout(() => {
			didLongPress = true;
			helpTarget = p;
			helpHistory = [];
		}, LONG_PRESS_MS);
	}

	function endPress() {
		clearTimeout(pressTimer);
	}

	function handleClick(p: Primitive) {
		if (didLongPress) {
			didLongPress = false;
			return;
		}
		oninsert(p.glyph);
	}
</script>

<section class="palette" aria-label="BQN glyph palette">
	{#if open}
		<div
			class="grid-wrapper"
			transition:slide={{ duration: KEYBOARD_MS, easing: cubicInOut }}
		>
			<div class="grid">
				{#each paletteSections as section}
					{#if section.primitives.length > 0}
						<div class="section-header">{section.label}</div>
						{#each section.primitives as p (p.glyph)}
							<button
								type="button"
								class="tile bqn"
								aria-label={p.label}
								onclick={() => handleClick(p)}
								onpointerdown={() => startPress(p)}
								onpointerup={endPress}
								onpointercancel={endPress}
								onpointerleave={endPress}
								oncontextmenu={(e) => e.preventDefault()}
							>
								{p.glyph}
							</button>
						{/each}
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</section>

{#if helpTarget}
	<div
		class="help-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="help-label"
		onpointerdown={closeHelp}
		onkeydown={(e) => e.key === 'Escape' && closeHelp()}
		tabindex="-1"
	>
		<div
			class="help-card"
			onpointerdown={(e) => e.stopPropagation()}
			role="presentation"
		>
			{#if helpHistory.length > 0}
				<button
					type="button"
					class="help-back"
					aria-label="back"
					onclick={back}
				>← back</button>
			{/if}
			<div class="help-glyph bqn">{helpTarget.glyph}</div>
			<div class="help-kind">{kindName(helpTarget)}</div>
			<div class="help-label" id="help-label">{helpTarget.label}</div>
			{#if GLYPH_TO_MNEMONIC.has(helpTarget.glyph)}
				<div class="help-shortcut bqn">\{GLYPH_TO_MNEMONIC.get(helpTarget.glyph)}</div>
			{/if}
			{#if helpTarget.kind === 'mod1' || helpTarget.kind === 'mod2'}
				<ModifierDiagram glyph={helpTarget.glyph} />
			{/if}
			{#if helpTarget.examples?.length}
				<div class="help-examples" role="list">
					{#each helpTarget.examples as ex}
						<div class="help-example" role="listitem">
							<code class="help-src bqn">
								{#each Array.from(ex.source) as c, i (i)}
									{@const linked = primitiveByGlyph.get(c)}
									{#if linked && linked !== helpTarget}
										<button
											type="button"
											class="srcglyph"
											aria-label={linked.label}
											onclick={() => navigateTo(linked)}
										>{c}</button>
									{:else}
										<span>{c}</span>
									{/if}
								{/each}
							</code>
							<span class="help-arrow">→</span>
							<code class="help-result bqn">
								{#each Array.from(ex.result) as c, i (i)}
									{@const linked = primitiveByGlyph.get(c)}
									{#if linked && linked !== helpTarget}
										<button
											type="button"
											class="srcglyph"
											aria-label={linked.label}
											onclick={() => navigateTo(linked)}
										>{c}</button>
									{:else}
										<span>{c}</span>
									{/if}
								{/each}
							</code>
						</div>
					{/each}
				</div>
			{/if}
			<button
				type="button"
				class="help-insert bqn"
				onclick={() => {
					const target = helpTarget!;
					helpTarget = null;
					oninsert(target.glyph);
				}}
			>
				insert {helpTarget.glyph}
			</button>
		</div>
	</div>
{/if}

<style>
	.palette {
		display: flex;
		flex-direction: column;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.grid-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 45vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.5rem 0.75rem;
		background: #0c0c0c;
		border-top: 1px solid #2a2a2a;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.35rem;
	}
	.section-header {
		grid-column: 1 / -1;
		font-family: var(--font-sans);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #777;
		padding: 0.5rem 0 0.1rem;
		border-bottom: 1px solid #1d1d1d;
		margin-bottom: 0.1rem;
	}
	.section-header:first-child {
		padding-top: 0;
	}

	.tile {
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border: 1px solid #2a2a2a;
		border-radius: 0.4rem;
		background: #1a1a1a;
		color: #eee;
		font-size: 1.9rem;
		line-height: 1;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}
	.tile:active {
		background: #2a2a2a;
		transform: scale(0.94);
	}

	.help-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 100;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.help-card {
		position: relative;
		background: #1a1a1a;
		border: 1px solid #3a3a3a;
		border-radius: 0.75rem;
		padding: 1.25rem 1.5rem 1rem;
		width: min(22rem, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}
	.help-back {
		position: absolute;
		top: 0.55rem;
		left: 0.65rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid #3a3a3a;
		border-radius: 0.3rem;
		background: #232323;
		color: #bbb;
		font-size: 0.85rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.help-back:active {
		background: #2e2e2e;
	}
	.help-glyph {
		font-size: 3.5rem;
		line-height: 1;
		color: #eee;
	}
	.help-kind {
		font-size: 0.8rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.help-label {
		font-size: 1rem;
		color: #ddd;
		text-align: center;
	}
	.help-shortcut {
		font-size: 0.95rem;
		color: #8ab0ce;
		padding: 0.15rem 0.55rem;
		border: 1px solid #2c4365;
		border-radius: 0.3rem;
		background: #15212e;
	}
	.help-examples {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.4rem;
		padding: 0.65rem 0.85rem;
		background: #101010;
		border-radius: 0.375rem;
		border: 1px solid #2a2a2a;
	}
	.help-example {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.2rem;
	}
	.help-src {
		color: #cfcfcf;
		text-align: right;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.help-arrow {
		color: #666;
		font-size: 1rem;
	}
	.help-result {
		color: #9fd99f;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.srcglyph {
		all: unset;
		cursor: pointer;
		border-radius: 3px;
		padding: 0 1px;
		transition: background-color 0.08s;
	}
	.srcglyph:active {
		background: rgba(255, 255, 255, 0.12);
	}
	@media (hover: hover) {
		.srcglyph:hover {
			background: rgba(255, 255, 255, 0.07);
		}
	}
	.help-insert {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid #2a6a2a;
		border-radius: 0.375rem;
		background: #173d17;
		color: #d7f0d7;
		font-size: 0.95rem;
		cursor: pointer;
	}
	.help-insert:active {
		background: #225722;
	}
</style>
