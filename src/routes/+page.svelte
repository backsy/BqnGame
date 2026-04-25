<script lang="ts">
	import { onMount } from 'svelte';
	import Editor, { type EditorApi } from '$lib/components/Editor.svelte';
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';
	import { BqnClient } from '$lib/bqn/client';
	import { MNEMONICS } from '$lib/bqn/keymap';
	import { primitiveByGlyph } from '$lib/primitives';

	// Flat catalog of every \X mnemonic for the long-press list. Skip the
	// literal-backslash escape (\\ → \) since it'd just be noise.
	const MNEMONIC_LIST = Array.from(MNEMONICS)
		.filter(([key, glyph]) => key !== '\\' && glyph !== '\\')
		.map(([key, glyph]) => ({
			key,
			glyph,
			label: primitiveByGlyph.get(glyph)?.label ?? ''
		}));

	let editor: EditorApi | undefined = $state();
	let paletteOpen = $state(false);
	let mnemonicListOpen = $state(false);
	let bsPressTimer: ReturnType<typeof setTimeout> | undefined;
	let bsDidLongPress = false;
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
		if (bsDidLongPress) {
			bsDidLongPress = false;
			return;
		}
		paletteOpen = false;
		editor?.insert('\\');
		editor?.focus();
	}

	function startBsPress() {
		bsDidLongPress = false;
		clearTimeout(bsPressTimer);
		bsPressTimer = setTimeout(() => {
			bsDidLongPress = true;
			paletteOpen = false;
			editor?.blur();
			mnemonicListOpen = true;
		}, 350);
	}

	function endBsPress() {
		clearTimeout(bsPressTimer);
	}

	function pickMnemonic(glyph: string) {
		mnemonicListOpen = false;
		editor?.insert(glyph);
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

	<section class="bottom" aria-label="output and controls" aria-live="polite">
		<pre class="bqn text" class:err={output.kind === 'error'}>{
			output.kind === 'idle' ? '' :
			output.kind === 'ok' ? output.value :
			`error: ${output.message}`
		}</pre>
		<button
			type="button"
			class="ctrl run"
			onclick={run}
			disabled={running || !client}
		>
			{running ? '…' : '▶ run'}
		</button>
	</section>

	<section class="lowest" aria-label="palette and shortcut">
		<button
			type="button"
			class="ctrl glyphs"
			class:active={paletteOpen}
			aria-expanded={paletteOpen}
			onclick={() => onPaletteToggle(!paletteOpen)}
		>glyphs</button>
		<button
			type="button"
			class="ctrl bs bqn"
			onclick={insertBackslash}
			onpointerdown={startBsPress}
			onpointerup={endBsPress}
			onpointercancel={endBsPress}
			onpointerleave={endBsPress}
			oncontextmenu={(e) => e.preventDefault()}
			aria-label="insert backslash; long-press for mnemonic list"
		>\</button>
	</section>
</div>

{#if mnemonicListOpen}
	<div
		class="overlay"
		role="dialog"
		aria-modal="true"
		aria-label="slash-mnemonic shortcuts"
		onpointerdown={() => (mnemonicListOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (mnemonicListOpen = false)}
		tabindex="-1"
	>
		<div class="mnemonic-list" onpointerdown={(e) => e.stopPropagation()} role="presentation">
			<div class="mnemonic-title">slash mnemonics</div>
			<div class="mnemonic-rows">
				{#each MNEMONIC_LIST as entry (entry.key)}
					<button
						type="button"
						class="mnemonic-row"
						onclick={() => pickMnemonic(entry.glyph)}
					>
						<span class="m-glyph bqn">{entry.glyph}</span>
						<span class="m-label">{entry.label}</span>
						<span class="m-key bqn">\{entry.key}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

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
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem 0.2rem;
	}
	.bottom .text {
		flex: 1;
		min-width: 0;
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
		justify-content: space-between;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.75rem calc(0.4rem + env(safe-area-inset-bottom));
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

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 100;
	}
	.mnemonic-list {
		background: #1a1a1a;
		border: 1px solid #3a3a3a;
		border-radius: 0.75rem;
		width: min(28rem, 100%);
		max-height: min(70vh, 32rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.mnemonic-title {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #888;
		text-align: center;
		padding: 0.75rem;
		border-bottom: 1px solid #2a2a2a;
	}
	.mnemonic-rows {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.mnemonic-row {
		all: unset;
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.85rem;
		cursor: pointer;
		border-bottom: 1px solid #1f1f1f;
		color: #ddd;
		font-size: 0.9rem;
	}
	.mnemonic-row:last-child {
		border-bottom: none;
	}
	.mnemonic-row:active {
		background: #252525;
	}
	.m-glyph {
		font-size: 1.35rem;
		text-align: center;
		color: #eee;
	}
	.m-label {
		color: #aaa;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.m-key {
		color: #8ab0ce;
		font-size: 0.95rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid #2c4365;
		border-radius: 0.25rem;
		background: #15212e;
	}
</style>
