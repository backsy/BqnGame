<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState, type Extension } from '@codemirror/state';
	import {
		EditorView,
		ViewPlugin,
		drawSelection,
		highlightActiveLine,
		keymap,
		tooltips
	} from '@codemirror/view';
	import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
	import {
		autocompletion,
		completionKeymap,
		startCompletion,
		type CompletionContext,
		type CompletionResult
	} from '@codemirror/autocomplete';
	import { MNEMONICS } from '$lib/bqn/keymap';
	import { primitiveByGlyph } from '$lib/primitives';

	// Each completion's label is the human name (so typing "rev" finds
	// ⌽ Reverse). apply is a function so we can extend the replacement
	// range back over a literal `\` that the user inserted via the \
	// button — the matchBefore regex only captures letters, so without
	// this hook the \ would survive selection.
	const GLYPH_COMPLETIONS = Array.from(MNEMONICS)
		.filter(([k, g]) => k !== '\\' && g !== '\\')
		.map(([key, glyph]) => {
			const p = primitiveByGlyph.get(glyph);
			return {
				label: p?.label ?? glyph,
				apply: (view: EditorView, _c: unknown, from: number, to: number) => {
					let realFrom = from;
					if (
						realFrom > 0 &&
						view.state.doc.sliceString(realFrom - 1, realFrom) === '\\'
					) {
						realFrom -= 1;
					}
					view.dispatch({
						changes: { from: realFrom, to, insert: glyph },
						selection: { anchor: realFrom + glyph.length },
						userEvent: 'input.complete'
					});
				}
			};
		});

	const KEY_FOR_GLYPH = new Map<string, string>();
	for (const [key, glyph] of MNEMONICS) {
		if (key === '\\' || glyph === '\\') continue;
		if (!KEY_FOR_GLYPH.has(glyph)) KEY_FOR_GLYPH.set(glyph, `\\${key}`);
	}

	// Match any word at the cursor; if non-empty (or invoked explicitly
	// via Tab/startCompletion) return the full glyph list and let the
	// dropdown filter by user-typed letters against the labels.
	function glyphCompletionSource(context: CompletionContext): CompletionResult | null {
		const word = context.matchBefore(/[A-Za-z]*/);
		if (!word) return null;
		if (word.from === word.to && !context.explicit) return null;
		return {
			from: word.from,
			filter: true,
			options: GLYPH_COMPLETIONS,
			validFor: /^[A-Za-z]*$/
		};
	}

	// Slash-prefix input method. Intercept the `\` keydown so it never
	// lands as text; either the next key resolves to a glyph via
	// MNEMONICS, or after a timeout we open the autocomplete dropdown
	// for name-based search. Pattern adapted from mechanize-systems/
	// bqnpad — same dead-key behaviour the upstream playground uses.
	function glyphInputMethod(): Extension {
		const PROMPT_MS = 800;
		let pendingTimer: ReturnType<typeof setTimeout> | null = null;
		let pendingState: EditorState | null = null;
		let cmView: EditorView | null = null;

		const reset = () => {
			if (pendingTimer) clearTimeout(pendingTimer);
			pendingTimer = null;
			pendingState = null;
		};

		const schedule = (state: EditorState) => {
			reset();
			pendingState = state;
			pendingTimer = setTimeout(() => {
				pendingTimer = null;
				const at = pendingState;
				pendingState = null;
				if (cmView && at === cmView.state) startCompletion(cmView);
			}, PROMPT_MS);
		};

		const lifecycle = ViewPlugin.fromClass(
			class {
				constructor(v: EditorView) {
					cmView = v;
				}
				destroy() {
					reset();
					cmView = null;
				}
			}
		);

		const events = EditorView.domEventHandlers({
			keydown(ev, view) {
				if (['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) return false;

				// Start dead-key sequence on \
				if (pendingTimer == null && ev.key === '\\') {
					ev.preventDefault();
					schedule(view.state);
					return true;
				}

				// Resolve mnemonic on next keystroke
				if (pendingTimer != null && pendingState === view.state) {
					reset();
					let key = ev.key;
					if (ev.shiftKey && key.length === 1) key = key.toUpperCase();
					const glyph = MNEMONICS.get(key);
					if (glyph === undefined) return false;
					ev.preventDefault();
					const { from, to } = view.state.selection.main;
					view.dispatch({
						changes: { from, to, insert: glyph },
						selection: { anchor: from + glyph.length },
						userEvent: 'input.type'
					});
					return true;
				}

				return false;
			}
		});

		return [lifecycle, events];
	}

	interface Props {
		initial?: string;
		onchange?: (source: string) => void;
		onready?: (api: EditorApi) => void;
		onfocus?: () => void;
	}

	export interface EditorApi {
		insert: (text: string) => void;
		value: () => string;
		focus: () => void;
		blur: () => void;
	}

	let { initial = '', onchange, onready, onfocus }: Props = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;

	onMount(() => {
		const state = EditorState.create({
			doc: initial,
			extensions: [
				history(),
				drawSelection(),
				highlightActiveLine(),
				EditorState.allowMultipleSelections.of(true),
				EditorView.lineWrapping,
				glyphInputMethod(),
				autocompletion({
					override: [glyphCompletionSource],
					activateOnTyping: false,
					maxRenderedOptions: 80,
					addToOptions: [
						{
							render: (completion) => {
								const span = document.createElement('span');
								span.className = 'cmb-glyph bqn';
								span.textContent = completion.apply as string;
								return span;
							},
							position: 5
						},
						{
							render: (completion) => {
								const key = KEY_FOR_GLYPH.get(completion.apply as string);
								if (!key) return null;
								const span = document.createElement('span');
								span.className = 'cmb-key bqn';
								span.textContent = key;
								return span;
							},
							position: 90
						}
					]
				}),
				tooltips({ parent: document.body, position: 'absolute' }),
				keymap.of([
					{ key: 'Tab', run: (v) => (startCompletion(v), true) },
					...defaultKeymap,
					...historyKeymap,
					...completionKeymap
				]),
				EditorView.contentAttributes.of({
					inputmode: 'text',
					enterkeyhint: 'enter',
					autocapitalize: 'off',
					autocomplete: 'off',
					autocorrect: 'off',
					spellcheck: 'false'
				}),
				EditorView.updateListener.of((v) => {
					if (v.docChanged) onchange?.(v.state.doc.toString());
				}),
				EditorView.domEventHandlers({
					focus: () => {
						onfocus?.();
						return false;
					}
				}),
				EditorView.theme(
					{
						'&': {
							height: '100%',
							fontSize: '1.1rem',
							background: '#141414',
							border: '1px solid #2a2a2a',
							borderRadius: '0.5rem',
							color: '#eee'
						},
						'.cm-scroller': {
							fontFamily: 'var(--font-bqn)',
							lineHeight: '1.5'
						},
						'.cm-content': {
							caretColor: '#eee',
							padding: '0.75rem 0'
						},
						'.cm-gutters': {
							background: '#141414',
							color: '#555',
							border: 'none'
						},
						'.cm-activeLine': { background: 'transparent' },
						'.cm-activeLineGutter': { background: 'transparent' },
						'&.cm-focused': { outline: 'none' },
						'&.cm-focused .cm-cursor': { borderLeftColor: '#eee' },
						'.cm-selectionBackground, ::selection': { background: '#2a4d7a !important' }
					},
					{ dark: true }
				)
			]
		});

		view = new EditorView({ state, parent: host });

		const api: EditorApi = {
			insert(text) {
				if (!view) return;
				const wasFocused = view.hasFocus;
				const { from, to } = view.state.selection.main;
				view.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length },
					userEvent: 'input.type'
				});
				if (wasFocused) view.focus();
				// Open the glyph search dropdown after a programmatic
				// insertion — the keydown-driven dead-key flow doesn't
				// fire for inserts dispatched through the API.
				if (view) startCompletion(view);
			},
			value() {
				return view?.state.doc.toString() ?? '';
			},
			focus() {
				view?.focus();
			},
			blur() {
				view?.contentDOM.blur();
			}
		};

		onready?.(api);

		return () => {
			view?.destroy();
			view = undefined;
		};
	});
</script>

<div bind:this={host} class="host"></div>

<style>
	.host {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
	.host :global(.cm-editor) {
		height: 100%;
	}
</style>
