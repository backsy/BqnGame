<script lang="ts">
	import {
		primitives,
		actions,
		tabs,
		type TabKey,
		type Primitive
	} from '$lib/primitives';
	import ModifierDiagram from './ModifierDiagram.svelte';

	interface Props {
		onselect: (tile: Primitive) => void;
	}

	let { onselect }: Props = $props();

	let activeTab = $state<TabKey>('fn');
	const COLS = 7;
	const LONG_PRESS_MS = 400;

	let activePrimitives = $derived.by(() => {
		const tab = tabs.find((t) => t.key === activeTab)!;
		return tab.kinds.flatMap((k) => primitives[k]);
	});

	let spacers = $derived.by(() => {
		const n = activePrimitives.length;
		const total = Math.ceil((n + actions.length) / COLS) * COLS;
		return total - n - actions.length;
	});

	let helpTarget = $state<Primitive | null>(null);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let didLongPress = false;

	function kindName(p: Primitive): string {
		if (p.category === 'action') return 'Action';
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
		onselect(p);
	}
</script>

<section class="palette" aria-label="BQN glyph palette">
	<div class="tabs" role="tablist" aria-label="primitive kind">
		{#each tabs as tab}
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === tab.key}
				class="tab bqn"
				class:active={activeTab === tab.key}
				onclick={() => (activeTab = tab.key)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="grid" role="tabpanel">
		{#each activePrimitives as p (p.glyph)}
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
		{#each { length: spacers } as _, i (i)}
			<div class="spacer" aria-hidden="true"></div>
		{/each}
		{#each actions as p (p.glyph)}
			<button
				type="button"
				class="tile bqn action"
				class:destructive={p.action === 'backspace'}
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
	</div>
</section>

{#if helpTarget}
	<div
		class="help-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="help-label"
		onpointerdown={() => (helpTarget = null)}
		onkeydown={(e) => e.key === 'Escape' && (helpTarget = null)}
		tabindex="-1"
	>
		<div
			class="help-card"
			onpointerdown={(e) => e.stopPropagation()}
			role="presentation"
		>
			<div class="help-glyph bqn">{helpTarget.glyph}</div>
			<div class="help-kind">{kindName(helpTarget)}</div>
			<div class="help-label" id="help-label">{helpTarget.label}</div>
			{#if helpTarget.kind === 'mod1' || helpTarget.kind === 'mod2'}
				<ModifierDiagram glyph={helpTarget.glyph} />
			{/if}
			{#if helpTarget.examples?.length}
				<div class="help-examples" role="list">
					{#each helpTarget.examples as ex}
						<div class="help-example" role="listitem">
							<code class="help-src bqn">{ex.source}</code>
							<span class="help-arrow">→</span>
							<code class="help-result bqn">{ex.result}</code>
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
					onselect(target);
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
	.spacer {
		aspect-ratio: 1;
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
		touch-action: manipulation;
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

	.help-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 100;
	}
	.help-card {
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
	.help-examples {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.4rem;
		padding: 0.5rem 0.75rem;
		background: #101010;
		border-radius: 0.375rem;
		border: 1px solid #2a2a2a;
	}
	.help-example {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
	}
	.help-src {
		color: #cfcfcf;
		text-align: right;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.help-arrow {
		color: #666;
		font-size: 0.85rem;
	}
	.help-result {
		color: #9fd99f;
		white-space: pre-wrap;
		word-break: break-word;
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
