<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import Editor, { type EditorApi } from '$lib/components/Editor.svelte';
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';
	import GlyphSearch from '$lib/components/GlyphSearch.svelte';
	import { BqnClient } from '$lib/bqn/client';
	import { levels } from '$lib/learn/levels';

	const LEVEL_KEY = 'bqngame-level';
	const HISTORY_KEY = 'bqngame-history';

	let editor: EditorApi | undefined = $state();
	let paletteOpen = $state(false);
	let searchOpen = $state(false);
	let appHeight = $state('100dvh');
	let keyboardUp = $state(false);

	let output = $state<{ kind: 'idle' } | { kind: 'ok'; value: string } | { kind: 'error'; message: string }>(
		{ kind: 'idle' }
	);
	let running = $state(false);

	let client = $state.raw<BqnClient | undefined>(undefined);

	onMount(() => {
		client = new BqnClient();

		const vv = window.visualViewport;
		const update = () => {
			if (!vv) return;
			appHeight = `${vv.height}px`;
			keyboardUp = window.innerHeight - vv.height > 100;
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

	function openSearch() {
		paletteOpen = false;
		editor?.blur();
		searchOpen = true;
	}

	function onEditorFocus() {
		paletteOpen = false;
	}

	function onPaletteToggle(next: boolean) {
		paletteOpen = next;
		if (next) editor?.blur();
	}

	function chooseLevel() {
		const ans = prompt(`Jump to level (1–${levels.length})`);
		if (ans === null) return;
		const n = parseInt(ans, 10);
		if (Number.isNaN(n) || n < 1 || n > levels.length) return;
		try {
			localStorage.setItem(LEVEL_KEY, String(n - 1));
			localStorage.removeItem(HISTORY_KEY);
		} catch {
			// localStorage disabled; nothing to do
		}
		window.location.href = `${base}/`;
	}

	function exportMoves() {
		const lvlRaw = (() => {
			try {
				return localStorage.getItem(LEVEL_KEY);
			} catch {
				return null;
			}
		})();
		const histRaw = (() => {
			try {
				return localStorage.getItem(HISTORY_KEY);
			} catch {
				return null;
			}
		})();
		const idx = (() => {
			const n = parseInt(lvlRaw ?? '0', 10);
			return Number.isFinite(n) && n >= 0 && n < levels.length ? n : 0;
		})();
		const hist: string[] = (() => {
			try {
				const p = histRaw == null ? [] : JSON.parse(histRaw);
				return Array.isArray(p) && p.every((s) => typeof s === 'string') ? p : [];
			} catch {
				return [];
			}
		})();
		const lvl = levels[idx];
		const finalExpr = hist.reduce(
			(acc, runeExpr) => `(${runeExpr}) (${acc})`,
			lvl.start
		);
		const lines = [
			`Level ${lvl.id}`,
			`start:  ${lvl.start}`,
			`target: ${lvl.target}`,
			`moves (${hist.length}):`,
			...hist.map((expr, i) => `  ${i + 1}. (${expr})`),
			`final expression:`,
			`  ${finalExpr}`
		];
		const text = lines.join('\n');
		// Replace editor contents so the user can read / run / share it.
		editor?.setValue(text);
		navigator.clipboard?.writeText(text).catch(() => {});
	}

	async function forceUpdate() {
		try {
			if ('serviceWorker' in navigator) {
				const regs = await navigator.serviceWorker.getRegistrations();
				await Promise.all(regs.map((r) => r.unregister()));
			}
			if ('caches' in window) {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			}
		} catch {
			// best-effort; reload anyway
		}
		// Bypass HTTP cache too. true is non-standard but iOS Safari respects it.
		(location as Location & { reload(force?: boolean): void }).reload(true);
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

<div class="app" class:keyboard-up={keyboardUp} style="height: {appHeight};">
	<section class="editor" aria-label="code editor">
		<Editor onready={(api) => (editor = api)} onfocus={onEditorFocus} />
		{#if output.kind !== 'idle'}
			<pre class="output-inline bqn" class:err={output.kind === 'error'}>{
				output.kind === 'ok' ? output.value : `error: ${output.message}`
			}</pre>
		{/if}
	</section>

	<GlyphPalette oninsert={insert} open={paletteOpen} onToggle={onPaletteToggle} />

	<section class="debug" aria-label="debug">
		<button type="button" class="dbg" onclick={chooseLevel}>level…</button>
		<button type="button" class="dbg" onclick={exportMoves}>export moves</button>
		<button type="button" class="dbg" onclick={forceUpdate}>force update</button>
	</section>

	<section class="lowest" aria-label="controls">
		<a class="link" href="{base}/">← game</a>
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
			class="ctrl search"
			onclick={openSearch}
			aria-label="search glyphs by name"
		>
			<svg
				viewBox="0 0 24 24"
				width="22"
				height="22"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="10.5" cy="10.5" r="6.5" />
				<line x1="15" y1="15" x2="20" y2="20" />
			</svg>
		</button>
		<button
			type="button"
			class="ctrl bs bqn"
			onclick={insertBackslash}
			aria-label="insert backslash for mnemonic shortcut"
		>\</button>
	</section>
</div>

<GlyphSearch
	open={searchOpen}
	oninsert={insert}
	onclose={() => (searchOpen = false)}
/>

<style>
	.app {
		display: grid;
		grid-template-rows: 1fr auto auto auto;
		background: var(--bg);
		overflow: hidden;
	}
	.debug {
		display: flex;
		gap: 0.5rem;
		padding: 0 0.75rem;
	}
	.dbg {
		all: unset;
		font-size: 0.75rem;
		color: #888;
		border: 1px dashed #333;
		border-radius: 0.3rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.dbg:active {
		background: #1a1a1a;
	}

	.editor {
		display: flex;
		flex-direction: column;
		min-height: 0;
		margin: 0.75rem;
		margin-top: calc(0.75rem + env(safe-area-inset-top));
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 0.5rem;
		overflow: auto;
	}
	.output-inline {
		margin: 0;
		padding: 0 0.75rem 0.75rem;
		color: #777;
		font-size: 1.1rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.output-inline.err {
		color: #d08a8a;
	}

	.lowest {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem calc(0.4rem + env(safe-area-inset-bottom));
	}
	.keyboard-up .lowest {
		padding-bottom: 0.4rem;
	}
	.link {
		color: #6a8aaa;
		font-size: 0.85rem;
		text-decoration: none;
		margin-right: auto;
	}

	.ctrl {
		padding: 0.55rem 0.9rem;
		border-radius: 0.4rem;
		font-size: 1rem;
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
		min-width: 3rem;
		font-size: 1.35rem;
		line-height: 1;
	}
	.bs:active {
		background: #294262;
		transform: scale(0.96);
	}
	.search {
		border: 1px solid #2a2a2a;
		background: #1a1a1a;
		color: #ccc;
		min-width: 3rem;
		display: inline-grid;
		place-items: center;
	}
	.search:active {
		background: #232323;
		transform: scale(0.96);
	}
	.run {
		border: 1px solid #2a6a2a;
		background: #173d17;
		color: #d7f0d7;
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
