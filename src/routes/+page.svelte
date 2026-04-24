<script lang="ts">
	import Editor, { type EditorApi } from '$lib/components/Editor.svelte';
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';

	let editor: EditorApi | undefined = $state();
	let output = $state('(no output yet — palette inserts glyphs at the cursor)');

	function insert(glyph: string) {
		editor?.insert(glyph);
	}
</script>

<div class="app">
	<section class="editor" aria-label="code editor">
		<Editor onready={(api) => (editor = api)} />
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
		background: var(--bg);
	}

	.editor {
		display: flex;
		min-height: 0;
		padding: 0.75rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
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
