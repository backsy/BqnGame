<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
	import { basicSetup } from 'codemirror';
	import { MNEMONICS } from '$lib/bqn/keymap';
	import { primitiveByGlyph } from '$lib/primitives';

	// Autocomplete options for the slash-mnemonic dropdown. Each entry's
	// label is the glyph itself (so it shows large in the dropdown), apply
	// inserts the glyph, and detail shows the \X shortcut. info shows the
	// human-readable name on the active row.
	const MNEMONIC_COMPLETIONS = Array.from(MNEMONICS)
		.filter(([key, glyph]) => key !== '\\' && glyph !== '\\')
		.map(([key, glyph]) => ({
			label: glyph,
			apply: glyph,
			detail: `\\${key}`,
			info: primitiveByGlyph.get(glyph)?.label ?? '',
			type: 'text'
		}));

	function bqnMnemonicSource(context: CompletionContext): CompletionResult | null {
		// Trigger as soon as a backslash is the previous character (with
		// optional letter following). Anchor `from` at the backslash so
		// applying replaces `\X` (or just `\`) with the glyph.
		const before = context.state.doc.sliceString(0, context.pos);
		const m = before.match(/\\([A-Za-z`0-9!@#$%^&*()\-_=+~|{}\[\];:'",.<>/? ]?)$/);
		if (!m) return null;
		return {
			from: context.pos - m[0].length,
			options: MNEMONIC_COMPLETIONS,
			validFor: /^\\.?$/
		};
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
				basicSetup,
				EditorView.lineWrapping,
				autocompletion({
					override: [bqnMnemonicSource],
					activateOnTyping: true,
					maxRenderedOptions: 80
				}),
				EditorView.contentAttributes.of({
					// inputmode + enterkeyhint quiet the iOS keyboard
					// accessory toolbar (Previous / Next / Done) on
					// some iOS versions. Native control of this bar is
					// only available in WebView-hosted apps; from
					// Safari we can only hint.
					inputmode: 'text',
					enterkeyhint: 'enter',
					autocapitalize: 'off',
					autocomplete: 'off',
					autocorrect: 'off',
					spellcheck: 'false'
				}),
				// BQN slash-prefix input method: when a character lands
				// immediately after a `\`, replace the pair with the
				// mnemonic glyph instead of inserting the literal letter.
				// Hardware keyboards only — soft keyboard is suppressed
				// above. Double backslash (`\\`) is the escape for a
				// literal backslash.
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
						'.cm-selectionBackground, ::selection': { background: '#2a4d7a !important' },
						'.cm-tooltip': {
							background: '#1a1a1a',
							border: '1px solid #3a3a3a',
							borderRadius: '0.5rem',
							maxHeight: '50vh',
							overflow: 'hidden'
						},
						'.cm-tooltip-autocomplete': {
							fontFamily: 'var(--font-sans)'
						},
						'.cm-tooltip-autocomplete > ul': {
							maxHeight: '40vh',
							fontFamily: 'var(--font-sans)'
						},
						'.cm-tooltip-autocomplete > ul > li': {
							display: 'flex',
							alignItems: 'center',
							gap: '0.6rem',
							padding: '0.45rem 0.7rem',
							color: '#ddd',
							borderBottom: '1px solid #1f1f1f'
						},
						'.cm-tooltip-autocomplete > ul > li[aria-selected]': {
							background: '#2a2a2a',
							color: '#fff'
						},
						'.cm-completionLabel': {
							fontFamily: 'var(--font-bqn)',
							fontSize: '1.4rem',
							flex: '0 0 2rem',
							textAlign: 'center'
						},
						'.cm-completionDetail': {
							fontFamily: 'var(--font-bqn)',
							fontStyle: 'normal',
							color: '#8ab0ce',
							marginLeft: 'auto',
							fontSize: '0.9rem'
						},
						'.cm-completionInfo': {
							background: '#1a1a1a',
							border: '1px solid #3a3a3a',
							borderRadius: '0.5rem',
							padding: '0.5rem 0.75rem',
							color: '#bbb'
						}
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
					selection: { anchor: from + text.length }
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
