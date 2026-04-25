<script lang="ts">
	import { onMount } from 'svelte';
	import Editor, { type EditorApi } from '$lib/components/Editor.svelte';
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';
	import { BqnClient } from '$lib/bqn/client';

	let editor: EditorApi | undefined = $state();
	let paletteOpen = $state(false);
	let appHeight = $state('100dvh');

	let output = $state<{ kind: 'idle' } | { kind: 'ok'; value: string } | { kind: 'error'; message: string }>(
		{ kind: 'idle' }
	);
	let running = $state(false);

	let client = $state.raw<BqnClient | undefined>(undefined);

	onMount(() => {
		client = new BqnClient();

		// Track the visual viewport so the app frame fits exactly above the
		// soft keyboard when it's up. Without this, the OS keyboard would
		// cover the output strip and palette toggle.
		const vv = window.visualViewport;
		const update = () => {
			if (!vv) return;
			appHeight = `${vv.height}px`;
		};
		update();
		vv?.addEventListener('resize', update);
		vv?.addEventListener('scroll', update);

		return () => {
			client?.destroy();
			client = undefined;
			vv?.removeEventListener('resize', update);
			vv?.removeEventListener('scroll', update);
		};
	});

	function insert(glyph: string) {
		editor?.insert(glyph);
	}

	function insertBackslash() {
		paletteOpen = false;
		editor?.insert('\\');
		editor?.focus();
	}

	function onEditorFocus() {
		paletteOpen = false;
	}

	function onPaletteToggle(next: boolean) {
		paletteOpen = next;
		if (next) editor?.blur();
	}

	async function run() {
		if (!client || !editor || running) return;
		running = true;
		const source = editor.value();
		const response = await client.eval(source);
		if (response.kind === 'ok') {
			output = { kind: 'ok', value: response.value };
		} else {
			output = { kind: 'error', message: response.message };
		}
		running = false;
	}
</script>

<div class="app" style="height: {appHeight};">
	<section class="editor" aria-label="code editor">
		<Editor onready={(api) => (editor = api)} onfocus={onEditorFocus} />
	</section>

	<GlyphPalette oninsert={insert} open={paletteOpen} onToggle={onPaletteToggle} />

	{#if output.kind !== 'idle'}
		<section class="bottom" aria-label="output" aria-live="polite">
			<pre class="bqn text" class:err={output.kind === 'error'}>{
				output.kind === 'ok' ? output.value : `error: ${output.message}`
			}</pre>
		</section>
	{/if}

	<section class="lowest" aria-label="controls">
		<button
			type="button"
			class="ctrl glyphs"
			class:active={paletteOpen}
			aria-expanded={paletteOpen}
			onclick={() => onPaletteToggle(!paletteOpen)}
		>glyphs</button>
		<button
			type="button"
			class="ctrl run"
			onclick={run}
			disabled={running || !client}
		>
			{running ? '…' : '▶ run'}
		</button>
		<button
			type="button"
			class="ctrl bs bqn"
			onclick={insertBackslash}
			aria-label="insert backslash"
		>\</button>
	</section>
</div>

<style>
	.app {
		display: grid;
		grid-template-rows: 1fr auto auto;
		background: var(--bg);
		overflow: hidden;
		/* Match iOS keyboard animation so .app height changes track the
		   keyboard sliding rather than jumping when visualViewport fires. */
		transition: height 0.25s cubic-bezier(0.42, 0, 0.58, 1);
	}

	.editor {
		display: flex;
		min-height: 0;
		padding: 0.75rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
	}

	.bottom {
		padding: 0.4rem 0.75rem 0;
	}
	.bottom .text {
		margin: 0;
		max-height: 5rem;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		color: #777;
		font-size: 0.95rem;
	}
	.bottom .text.err {
		color: #d08a8a;
	}

	.lowest {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
	}
	.lowest .glyphs {
		margin-right: auto;
	}

	.ctrl {
		padding: 0.35rem 0.7rem;
		border-radius: 0.375rem;
		font-size: 0.85rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		flex: 0 0 auto;
	}
	.glyphs {
		font-family: var(--font-sans);
		border: 1px solid #2a2a2a;
		background: #1a1a1a;
		color: #ccc;
	}
	.glyphs:active {
		background: #232323;
	}
	.glyphs.active {
		background: #2a2a2a;
		color: #eee;
		border-color: #444;
	}
	.bs {
		border: 1px solid #2c4365;
		background: #1d2f44;
		color: #a9c7e6;
		min-width: 2.5rem;
	}
	.bs:active {
		background: #294262;
		transform: scale(0.96);
	}
	.run {
		border: 1px solid #2a6a2a;
		background: #173d17;
		color: #d7f0d7;
		font-size: 0.9rem;
	}
	.run:active {
		background: #225722;
		transform: scale(0.96);
	}
	.run:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
