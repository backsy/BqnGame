<script lang="ts">
	import { onMount } from 'svelte';
	import Editor, { type EditorApi } from '$lib/components/Editor.svelte';
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';
	import { BqnClient } from '$lib/bqn/client';

	let editor: EditorApi | undefined = $state();
	let output = $state<{ kind: 'idle' } | { kind: 'ok'; value: string } | { kind: 'error'; message: string }>({
		kind: 'idle'
	});
	let running = $state(false);

	let client = $state.raw<BqnClient | undefined>(undefined);

	onMount(() => {
		client = new BqnClient();
		return () => {
			client?.destroy();
			client = undefined;
		};
	});

	function insert(glyph: string) {
		editor?.insert(glyph);
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

<div class="app">
	<section class="editor" aria-label="code editor">
		<Editor onready={(api) => (editor = api)} />
	</section>

	<section class="output" aria-label="output" aria-live="polite">
		<pre class="bqn text" class:err={output.kind === 'error'}>{
			output.kind === 'idle' ? '(tap run to evaluate)' :
			output.kind === 'ok' ? output.value :
			`error: ${output.message}`
		}</pre>
		<button type="button" class="run" onclick={run} disabled={running || !client}>
			{running ? '…' : '▶ run'}
		</button>
	</section>

	<GlyphPalette oninsert={insert} />
</div>

<style>
	.app {
		display: grid;
		grid-template-rows: 1fr auto auto;
		height: 100dvh;
		background: var(--bg);
	}

	.editor {
		display: flex;
		min-height: 0;
		padding: 0.75rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
	}

	.output {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		max-height: 25vh;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid #2a2a2a;
		background: #0e0e0e;
		color: #bbb;
		font-size: 0.95rem;
	}
	.output .text {
		flex: 1;
		min-width: 0;
		margin: 0;
		max-height: 100%;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.output .text.err {
		color: #f28a8a;
	}
	.run {
		flex: 0 0 auto;
		align-self: flex-start;
		padding: 0.35rem 0.75rem;
		border: 1px solid #2a6a2a;
		border-radius: 0.375rem;
		background: #173d17;
		color: #d7f0d7;
		font-size: 0.9rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
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
