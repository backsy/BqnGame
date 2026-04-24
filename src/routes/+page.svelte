<script lang="ts">
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';

	let source = $state('');
	let output = $state('(no output yet — palette inserts glyphs at the end)');

	function insert(glyph: string) {
		source += glyph;
	}
</script>

<div class="app">
	<section class="editor" aria-label="code editor">
		<textarea
			readonly
			class="bqn"
			placeholder="tap glyphs below to build an expression"
			value={source}
		></textarea>
	</section>

	<section class="output bqn" aria-label="output">
		<pre>{output}</pre>
	</section>

	<GlyphPalette oninsert={insert} />
</div>

<style>
	.app {
		display: grid;
		grid-template-rows: 1fr auto auto;
		height: 100dvh;
		min-height: 100vh;
		background: var(--bg);
	}

	.editor {
		display: flex;
		min-height: 0;
		padding: 0.75rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
	}
	textarea {
		flex: 1;
		resize: none;
		border: 1px solid #2a2a2a;
		border-radius: 0.5rem;
		background: #141414;
		color: #eee;
		font-size: 1.1rem;
		padding: 0.75rem;
		line-height: 1.5;
		outline: none;
	}
	textarea::placeholder {
		color: #555;
	}

	.output {
		max-height: 25vh;
		overflow: auto;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid #2a2a2a;
		background: #0e0e0e;
		color: #bbb;
		font-size: 0.9rem;
	}
	.output pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
