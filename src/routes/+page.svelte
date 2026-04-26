<script lang="ts">
	import { onMount } from 'svelte';
	import ValueViz from '$lib/components/ValueViz.svelte';
	import { levels } from '$lib/learn/levels';
	import { evalRaw, valueMatches } from '$lib/bqn/eval';

	let levelIndex = $state(0);
	let history = $state<string[]>([]); // accumulated rune.expr strings

	const level = $derived(levels[levelIndex]);

	const stateExpr = $derived(
		history.reduce((acc, runeExpr) => `(${runeExpr}) (${acc})`, level.start)
	);

	let currentValue = $state<unknown>(null);
	let targetValue = $state<unknown>(null);
	let solved = $state(false);

	$effect(() => {
		try {
			currentValue = evalRaw(stateExpr);
		} catch {
			currentValue = null;
		}
		try {
			targetValue = evalRaw(level.target);
		} catch {
			targetValue = null;
		}
		solved = valueMatches(stateExpr, level.target);
	});

	function applyRune(expr: string) {
		if (solved) return;
		history = [...history, expr];
	}

	function undo() {
		history = history.slice(0, -1);
	}

	function reset() {
		history = [];
	}

	function nextLevel() {
		if (levelIndex < levels.length - 1) {
			levelIndex += 1;
			history = [];
		}
	}

	let appHeight = $state('100dvh');
	onMount(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => (appHeight = `${vv.height}px`);
		update();
		vv.addEventListener('resize', update);
		return () => vv.removeEventListener('resize', update);
	});
</script>

<div class="game" style="height: {appHeight};">
	<header class="head">
		<span class="lvl">Level {level.id}</span>
		<a class="link" href="{import.meta.env.BASE_URL || ''}sandbox/">sandbox →</a>
	</header>

	<section class="board">
		<div class="cell">
			<div class="cap">goal</div>
			<div class="viz"><ValueViz value={targetValue} /></div>
		</div>
		<div class="cell now">
			<div class="cap">now</div>
			<div class="viz"><ValueViz value={currentValue} /></div>
		</div>
	</section>

	{#if solved}
		<section class="solved">
			<span class="check">✓</span>
			<button type="button" class="next" onclick={nextLevel}>next level →</button>
		</section>
	{:else}
		<section class="runes">
			{#each level.runes as r}
				<button type="button" class="rune bqn" onclick={() => applyRune(r.expr)}>
					{r.glyph}
				</button>
			{/each}
		</section>
	{/if}

	<section class="actions">
		<button type="button" onclick={undo} disabled={history.length === 0}>undo</button>
		<button type="button" onclick={reset} disabled={history.length === 0}>reset</button>
		<span class="moves">{history.length} {history.length === 1 ? 'move' : 'moves'}</span>
	</section>
</div>

<style>
	.game {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		padding-top: calc(1rem + env(safe-area-inset-top));
		padding-bottom: calc(1rem + env(safe-area-inset-bottom));
		background: var(--bg);
		overflow: auto;
	}
	.board {
		flex: 1 0 auto;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.lvl {
		color: #aaa;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.link {
		color: #6a8aaa;
		font-size: 0.85rem;
		text-decoration: none;
	}
	.board {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		justify-content: center;
		align-items: center;
		min-height: 0;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.cap {
		color: #777;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	.viz {
		display: flex;
		align-items: flex-end;
		min-height: 80px;
	}
	.now .viz {
		filter: drop-shadow(0 0 8px rgba(95, 204, 95, 0.15));
	}

	.solved {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem;
	}
	.check {
		color: #5fcc5f;
		font-size: 1.5rem;
	}
	.next {
		all: unset;
		padding: 0.5rem 1rem;
		background: #173d17;
		border: 1px solid #2a6a2a;
		color: #d7f0d7;
		border-radius: 0.4rem;
		font-size: 1rem;
		cursor: pointer;
	}

	.runes {
		display: flex;
		gap: 0.4rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.rune {
		all: unset;
		padding: 0.6rem 0.9rem;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		color: #eee;
		border-radius: 0.4rem;
		font-size: 1.4rem;
		min-width: 3rem;
		text-align: center;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.rune:active {
		background: #2a2a2a;
		transform: scale(0.96);
	}
	.rune:disabled {
		opacity: 0.5;
	}

	.actions {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.6rem;
	}
	.actions button {
		all: unset;
		padding: 0.4rem 0.8rem;
		border: 1px solid #2a2a2a;
		background: transparent;
		color: #aaa;
		border-radius: 0.4rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.actions button:active {
		background: #1a1a1a;
	}
	.actions button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.moves {
		color: #555;
		font-size: 0.8rem;
	}
</style>
