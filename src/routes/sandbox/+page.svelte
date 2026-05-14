<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import Editor, { type EditorApi } from '$lib/components/Editor.svelte';
	import GlyphPalette from '$lib/components/GlyphPalette.svelte';
	import GlyphSearch from '$lib/components/GlyphSearch.svelte';
	import { BqnClient } from '$lib/bqn/client';
	import { levels } from '$lib/learn/levels';

	const LEVEL_KEY = 'bqngame-level';
	const HISTORY_KEY = 'bqngame-history';
	const TRANSCRIPT_KEY = 'bqngame-sandbox-transcript';
	const TRANSCRIPT_CAP = 30;

	type Entry =
		| { id: number; expr: string; kind: 'ok'; value: string }
		| { id: number; expr: string; kind: 'error'; message: string };

	let editor: EditorApi | undefined = $state();
	let paletteOpen = $state(false);
	let searchOpen = $state(false);
	let debugOpen = $state(false);
	let appHeight = $state('100dvh');
	let keyboardUp = $state(false);

	let entries = $state<Entry[]>([]);
	let nextEntryId = 1;
	let running = $state(false);

	// Long-press state. We track the entry whose action menu should
	// open if the user holds long enough without scrolling.
	let actionMenu = $state<Entry | null>(null);
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	let pressStart: { x: number; y: number; entryId: number } | null = null;

	let client = $state.raw<BqnClient | undefined>(undefined);

	let transcriptEl: HTMLElement | undefined = $state();

	onMount(() => {
		client = new BqnClient();

		// Restore transcript from localStorage.
		try {
			const raw = localStorage.getItem(TRANSCRIPT_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					entries = parsed.filter(isEntry);
					nextEntryId = Math.max(0, ...entries.map((e) => e.id)) + 1;
				}
			}
		} catch {
			// stale data; ignore
		}

		// Scroll transcript to bottom on first paint so newest is visible.
		tick().then(() => scrollTranscriptToEnd());

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

	function isEntry(x: unknown): x is Entry {
		if (!x || typeof x !== 'object') return false;
		const o = x as Record<string, unknown>;
		if (typeof o.id !== 'number' || typeof o.expr !== 'string') return false;
		if (o.kind === 'ok') return typeof o.value === 'string';
		if (o.kind === 'error') return typeof o.message === 'string';
		return false;
	}

	$effect(() => {
		// Persist entries on every change. JSON-serialize the proxy by
		// reading each field; $state arrays are reactive proxies.
		try {
			const plain = entries.map((e) => ({ ...e }));
			localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(plain));
		} catch {
			// localStorage may be disabled; ignore
		}
	});

	function scrollTranscriptToEnd() {
		if (!transcriptEl) return;
		transcriptEl.scrollTop = transcriptEl.scrollHeight;
	}

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

	function clearTranscript() {
		entries = [];
	}

	async function run() {
		if (!client || !editor || running) return;
		running = true;
		const source = editor.value().trim();

		// Dedupe consecutive identical runs. If the user taps run on the
		// same expression as the last entry (e.g. they're re-checking, or
		// the editor still holds the source from a tweak-and-re-run loop
		// where they didn't actually change anything), don't append a
		// duplicate — just scroll to the existing entry.
		if (
			source &&
			entries.length > 0 &&
			entries[entries.length - 1].expr === source
		) {
			running = false;
			await tick();
			scrollTranscriptToEnd();
			return;
		}

		const response = await client.eval(source);

		const entry: Entry =
			response.kind === 'ok'
				? { id: nextEntryId++, expr: source, kind: 'ok', value: response.value }
				: response.kind === 'error'
					? { id: nextEntryId++, expr: source, kind: 'error', message: response.message }
					: { id: nextEntryId++, expr: source, kind: 'error', message: `unexpected response: ${response.kind}` };

		// Append; cap to last TRANSCRIPT_CAP entries.
		const next = [...entries, entry];
		if (next.length > TRANSCRIPT_CAP) {
			next.splice(0, next.length - TRANSCRIPT_CAP);
		}
		entries = next;

		await tick();
		scrollTranscriptToEnd();

		running = false;
	}

	// ─────────────────── transcript interactions ───────────────────

	const LONG_PRESS_MS = 500;
	const PRESS_MOVE_THRESHOLD_PX = 10;

	function onEntryPointerDown(ev: PointerEvent, entry: Entry) {
		// Only respond to primary button / touch.
		if (ev.button !== 0 && ev.pointerType === 'mouse') return;
		pressStart = { x: ev.clientX, y: ev.clientY, entryId: entry.id };
		clearPressTimer();
		pressTimer = setTimeout(() => {
			pressTimer = null;
			pressStart = null;
			actionMenu = entry;
			// Vibrate on long-press if supported, for tactile feedback.
			navigator.vibrate?.(10);
		}, LONG_PRESS_MS);
	}

	function onEntryPointerMove(ev: PointerEvent) {
		if (!pressStart) return;
		const dx = ev.clientX - pressStart.x;
		const dy = ev.clientY - pressStart.y;
		if (Math.hypot(dx, dy) > PRESS_MOVE_THRESHOLD_PX) {
			// User is scrolling — cancel the long-press.
			clearPressTimer();
			pressStart = null;
		}
	}

	function onEntryPointerUp(_ev: PointerEvent, entry: Entry) {
		const wasPress = pressStart?.entryId === entry.id && pressTimer != null;
		clearPressTimer();
		pressStart = null;
		if (wasPress) {
			// Quick tap: insert the expression at the editor cursor.
			editor?.insert(entry.expr);
			editor?.focus();
		}
	}

	function onEntryPointerCancel() {
		clearPressTimer();
		pressStart = null;
	}

	function clearPressTimer() {
		if (pressTimer != null) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
	}

	async function copyExpr(e: Entry) {
		actionMenu = null;
		try {
			await navigator.clipboard?.writeText(e.expr);
		} catch {
			// no-op
		}
	}

	async function copyResult(e: Entry) {
		actionMenu = null;
		const text = e.kind === 'ok' ? e.value : e.message;
		try {
			await navigator.clipboard?.writeText(text);
		} catch {
			// no-op
		}
	}

	function useResult(e: Entry) {
		actionMenu = null;
		if (e.kind !== 'ok') return;
		editor?.insert(e.value);
		editor?.focus();
	}

	function deleteEntry(e: Entry) {
		actionMenu = null;
		entries = entries.filter((x) => x.id !== e.id);
	}

	function truncateTarget(s: string, n: number = 60): string {
		const oneLine = s.replace(/\s+/g, ' ').trim();
		return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + '…';
	}
</script>

<div class="app" class:keyboard-up={keyboardUp} style="height: {appHeight};">
	<section
		class="transcript"
		bind:this={transcriptEl}
		aria-label="run history"
	>
		{#if entries.length === 0}
			<div class="empty">
				Type below and tap <span class="kbd">▶ run</span>. Past runs appear
				here — tap one to insert it back into the editor, long-press for more
				actions.
			</div>
		{:else}
			{#each entries as entry (entry.id)}
				<div
					class="entry"
					class:err={entry.kind === 'error'}
					role="button"
					tabindex="0"
					onpointerdown={(ev) => onEntryPointerDown(ev, entry)}
					onpointermove={onEntryPointerMove}
					onpointerup={(ev) => onEntryPointerUp(ev, entry)}
					onpointercancel={onEntryPointerCancel}
				>
					<pre class="entry-expr bqn">{entry.expr}</pre>
					<pre class="entry-out bqn" class:err-text={entry.kind === 'error'}>{
						entry.kind === 'ok' ? entry.value : entry.message
					}</pre>
				</div>
			{/each}
		{/if}
	</section>

	<section class="editor" aria-label="code editor">
		<Editor onready={(api) => (editor = api)} onfocus={onEditorFocus} />
	</section>

	<GlyphPalette oninsert={insert} open={paletteOpen} onToggle={onPaletteToggle} />

	<section class="debug" aria-label="debug">
		<button
			type="button"
			class="dbg-toggle"
			aria-expanded={debugOpen}
			onclick={() => (debugOpen = !debugOpen)}
		>debug {debugOpen ? '▾' : '▸'}</button>
		{#if debugOpen}
			<div class="dbg-menu" role="menu">
				<button
					type="button"
					class="dbg-item"
					role="menuitem"
					onclick={() => {
						debugOpen = false;
						chooseLevel();
					}}
				>jump to level…</button>
				<button
					type="button"
					class="dbg-item"
					role="menuitem"
					onclick={() => {
						debugOpen = false;
						exportMoves();
					}}
				>export moves</button>
				<button
					type="button"
					class="dbg-item"
					role="menuitem"
					onclick={() => {
						debugOpen = false;
						clearTranscript();
					}}
				>clear transcript</button>
				<button
					type="button"
					class="dbg-item"
					role="menuitem"
					onclick={() => {
						debugOpen = false;
						forceUpdate();
					}}
				>force update</button>
			</div>
		{/if}
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

{#if actionMenu}
	{@const menu = actionMenu}
	<button
		type="button"
		class="action-backdrop"
		aria-label="dismiss actions"
		onclick={() => (actionMenu = null)}
	></button>
	<div
		class="action-sheet"
		role="dialog"
		tabindex="-1"
		aria-label="entry actions"
	>
			<div class="action-target bqn">{truncateTarget(menu.expr)}</div>
			<button type="button" class="action-btn" onclick={() => copyExpr(menu)}>
				copy expression
			</button>
			<button type="button" class="action-btn" onclick={() => copyResult(menu)}>
				copy {menu.kind === 'ok' ? 'result' : 'error'}
			</button>
			{#if menu.kind === 'ok'}
				<button type="button" class="action-btn" onclick={() => useResult(menu)}>
					paste result as input
				</button>
			{/if}
			<button
				type="button"
				class="action-btn danger"
				onclick={() => deleteEntry(menu)}
			>
				delete
			</button>
		<button
			type="button"
			class="action-btn cancel"
			onclick={() => (actionMenu = null)}
		>
			cancel
		</button>
	</div>
{/if}

<style>
	.app {
		display: grid;
		grid-template-rows: 1fr auto auto auto auto;
		background: var(--bg);
		overflow: hidden;
	}

	.transcript {
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		margin: 0.75rem 0.75rem 0.5rem;
		margin-top: calc(0.75rem + env(safe-area-inset-top));
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.empty {
		margin: auto 0.5rem;
		text-align: center;
		color: #555;
		font-size: 0.9rem;
		line-height: 1.5;
		font-family: var(--font-sans);
	}
	.empty .kbd {
		display: inline-block;
		padding: 0.05rem 0.35rem;
		border: 1px solid #2a6a2a;
		background: #173d17;
		color: #d7f0d7;
		border-radius: 0.3rem;
		font-size: 0.85rem;
	}

	.entry {
		background: #141414;
		border: 1px solid #232323;
		border-left: 2px solid #2a6a2a;
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		-webkit-touch-callout: none;
		user-select: none;
		transition: background 120ms ease;
	}
	.entry:active {
		background: #1a1a1a;
	}
	.entry.err {
		border-left-color: #b04848;
	}
	.entry-expr {
		margin: 0;
		font-size: 1rem;
		line-height: 1.35;
		color: #eee;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: var(--font-bqn);
	}
	.entry-out {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.35;
		color: #888;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 8.5em;
		overflow: hidden;
		font-family: var(--font-bqn);
	}
	.entry-out.err-text {
		color: #d08a8a;
	}

	.editor {
		display: flex;
		flex-direction: column;
		min-height: 90px;
		max-height: 30vh;
		margin: 0 0.75rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 0.5rem;
		overflow: auto;
	}

	.debug {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem 0;
	}
	.dbg-toggle {
		all: unset;
		align-self: flex-start;
		font-size: 0.75rem;
		color: #555;
		border: 1px dashed #333;
		border-radius: 0.3rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.dbg-toggle:active {
		background: #1a1a1a;
	}
	.dbg-menu {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.dbg-item {
		all: unset;
		text-align: center;
		padding: 0.7rem 0.9rem;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		color: #ddd;
		border-radius: 0.4rem;
		font-size: 0.95rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.dbg-item:active {
		background: #232323;
		transform: scale(0.98);
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

	/* Long-press action sheet — bottom-anchored, mobile-native feel.
	 * The backdrop is a real <button> so it's keyboard-focusable and
	 * dismissible without click-event-on-div a11y complaints. The
	 * sheet sits on top of the backdrop in its own fixed layer. */
	.action-backdrop {
		all: unset;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		z-index: 50;
		cursor: pointer;
		animation: fade-in 140ms ease-out;
	}
	.action-sheet {
		position: fixed;
		left: 50%;
		bottom: calc(0.75rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		width: min(420px, calc(100% - 1.5rem));
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 0.6rem;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		z-index: 51;
		animation: slide-up 180ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.action-target {
		font-family: var(--font-bqn);
		font-size: 0.95rem;
		color: #aaa;
		padding: 0.5rem 0.7rem;
		background: #111;
		border: 1px solid #222;
		border-radius: 0.4rem;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.action-btn {
		all: unset;
		padding: 0.85rem 0.9rem;
		text-align: center;
		font-size: 1rem;
		color: #eee;
		background: #232323;
		border: 1px solid #2c2c2c;
		border-radius: 0.4rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.action-btn:active {
		background: #2c2c2c;
	}
	.action-btn.danger {
		color: #e09898;
		background: #2a1818;
		border-color: #4a2828;
	}
	.action-btn.danger:active {
		background: #361e1e;
	}
	.action-btn.cancel {
		color: #999;
		background: transparent;
		border: none;
		margin-top: 0.2rem;
	}
	.action-btn.cancel:active {
		background: #1a1a1a;
	}
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes slide-up {
		from {
			transform: translateX(-50%) translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateX(-50%) translateY(0);
			opacity: 1;
		}
	}
</style>
