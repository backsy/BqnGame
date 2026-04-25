<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import { basicSetup } from 'codemirror';
	import { MNEMONICS } from '$lib/bqn/keymap';

	interface Props {
		initial?: string;
		onchange?: (source: string) => void;
		onready?: (api: EditorApi) => void;
	}

	export interface EditorApi {
		insert: (text: string) => void;
		value: () => string;
		focus: () => void;
	}

	let { initial = '', onchange, onready }: Props = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;

	onMount(() => {
		const state = EditorState.create({
			doc: initial,
			extensions: [
				basicSetup,
				EditorView.lineWrapping,
				EditorView.contentAttributes.of({
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
					selection: { anchor: from + text.length }
				});
				if (wasFocused) view.focus();
			},
			value() {
				return view?.state.doc.toString() ?? '';
			},
			focus() {
				view?.focus();
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
