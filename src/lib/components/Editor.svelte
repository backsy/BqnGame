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
	type GlyphCompletion = {
		label: string;
		apply: (view: EditorView, c: unknown, from: number, to: number) => void;
		glyph: string;
		shortcut: string;
	};

	const GLYPH_COMPLETIONS: GlyphCompletion[] = Array.from(MNEMONICS)
		.filter(([k, g]) => k !== '\\' && g !== '\\')
		.map(([key, glyph]) => {
			const p = primitiveByGlyph.get(glyph);
			return {
				label: p?.label ?? glyph,
				glyph,
				shortcut: `\\${key}`,
				apply: (view, _c, from, to) => {
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
		openSearch: () => void;
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
								const c = completion as unknown as GlyphCompletion;
								if (!c.glyph || !c.shortcut) return null;
								const row = document.createElement('div');
								row.style.cssText =
									'display:grid;grid-template-columns:1.7rem 1fr auto;align-items:center;gap:0.5rem;width:100%;';

								const g = document.createElement('span');
								g.style.cssText =
									"font-family:'BQN386',ui-monospace,monospace;font-size:1.25rem;line-height:1;text-align:center;color:#eee;";
								g.textContent = c.glyph;

								const l = document.createElement('span');
								l.style.cssText =
									'font-family:system-ui,sans-serif;font-size:0.9rem;line-height:1.25;text-align:left;color:#ddd;white-space:normal;word-break:break-word;min-width:0;';
								l.textContent = c.label;

								const k = document.createElement('span');
								k.style.cssText =
									"font-family:'BQN386',ui-monospace,monospace;font-size:0.85rem;color:#8ab0ce;padding:1px 6px;border:1px solid #2c4365;border-radius:4px;background:#15212e;white-space:nowrap;";
								k.textContent = c.shortcut;

								row.append(g, l, k);
								return row;
							},
							position: 5
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
				// Resolve \X mnemonics that arrive *after* a \ has already
				// landed in the doc (programmatic inserts via the \
				// button bypass keydown). The dead-key path in
				// glyphInputMethod handles typed \ — this picks up the
				// other case by watching for a single-char input where
				// the previous char is \.
				EditorView.inputHandler.of((cmView, from, to, text) => {
					if (text.length !== 1 || from === 0 || from !== to) return false;
					const prev = cmView.state.doc.sliceString(from - 1, from);
					if (prev !== '\\') return false;
					const replacement = MNEMONICS.get(text);
					if (replacement === undefined) return false;
					cmView.dispatch({
						changes: { from: from - 1, to, insert: replacement },
						selection: { anchor: from - 1 + replacement.length },
						userEvent: 'input.type'
					});
					return true;
				}),
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
			},
			value() {
				return view?.state.doc.toString() ?? '';
			},
			focus() {
				view?.focus();
			},
			blur() {
				view?.contentDOM.blur();
			},
			openSearch() {
				if (!view) return;
				view.focus();
				startCompletion(view);
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
