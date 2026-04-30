<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { base } from '$app/paths';
	import ValueViz from '$lib/components/ValueViz.svelte';
	import AnimatedRow from '$lib/components/AnimatedRow.svelte';
	import { animations, type Cell } from '$lib/animations';
	import { levels } from '$lib/learn/levels';
	import { evalRaw, valueMatches } from '$lib/bqn/eval';

	let levelIndex = $state(0);
	let history = $state<string[]>([]); // accumulated rune.expr strings

	const STORAGE_KEY = 'bqngame-level';
	const HISTORY_KEY = 'bqngame-history';

	const level = $derived(levels[levelIndex]);

	const stateExpr = $derived(
		history.reduce((acc, runeExpr) => `(${runeExpr}) (${acc})`, level.start)
	);

	const currentValue = $derived.by(() => {
		try {
			return evalRaw(stateExpr);
		} catch {
			return null;
		}
	});
	const targetValue = $derived.by(() => {
		try {
			return evalRaw(level.target);
		} catch {
			return null;
		}
	});
	const solved = $derived(valueMatches(stateExpr, level.target));

	function findMaxNum(v: unknown): number {
		if (typeof v === 'number') return Math.abs(v);
		if (Array.isArray(v) && v.length > 0) return Math.max(...v.map(findMaxNum));
		return 0;
	}
	const vizMax = $derived(
		Math.max(findMaxNum(currentValue), findMaxNum(targetValue), 4)
	);

	const isLastLevel = $derived(levelIndex === levels.length - 1);

	// Cell tracking with stable ids, so animations can identify which
	// DOM element corresponds to which logical value across reorders.
	let cells = $state<Cell[]>([]);
	let nextCellId = 1;
	let lastHistoryLen = 0;
	let lastLevelIndex = -1;
	let animating = $state(false);
	const cellNodes = new Map<number, HTMLElement>();

	function setNode(id: number, node: HTMLElement | null) {
		if (node) cellNodes.set(id, node);
		else cellNodes.delete(id);
	}

	function isSimpleRow(v: unknown): v is (number | string)[] {
		if (!Array.isArray(v)) return false;
		const sh = (v as { sh?: number[] }).sh;
		if (sh && sh.length !== 1) return false;
		return v.every((x) => typeof x === 'number' || typeof x === 'string');
	}

	$effect(() => {
		const histLen = history.length;
		const lvl = levelIndex;
		untrack(() => {
			const cur = currentValue;
			const levelChanged = lvl !== lastLevelIndex;
			const justTapped = !levelChanged && histLen > lastHistoryLen
				? history[histLen - 1]
				: null;
			lastHistoryLen = histLen;
			lastLevelIndex = lvl;

			if (!isSimpleRow(cur)) {
				cells = [];
				return;
			}

			// ⌽: preserve ids, reverse the cell order, refresh values.
			if (justTapped === '⌽' && cells.length === cur.length) {
				const reversed = cells.slice().reverse();
				cells = reversed.map((c, i) => ({ id: c.id, value: cur[i] }));
				return;
			}

			cells = cur.map((value) => ({ id: nextCellId++, value }));
		});
	});

	async function applyRune(expr: string) {
		if (solved || animating) return;

		const animFn = animations[expr];
		if (animFn && isSimpleRow(currentValue)) {
			// Capture old cell positions before mutating history. The cell
			// tracker effect will then commit the new cells; we await the
			// DOM tick and run the animation against new positions.
			const oldRects = new Map<number, DOMRect>();
			for (const cell of cells) {
				const node = cellNodes.get(cell.id);
				if (node) oldRects.set(cell.id, node.getBoundingClientRect());
			}

			animating = true;
			history = [...history, expr];
			await tick();

			try {
				await animFn({
					cells,
					getNode: (id) => cellNodes.get(id) ?? null,
					oldRects
				});
			} catch (err) {
				console.error('animation failed', err);
			} finally {
				animating = false;
			}
			return;
		}

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

	function resetProgress() {
		levelIndex = 0;
		history = [];
	}

	function jumpToLevel() {
		const ans = prompt(`Jump to level (1–${levels.length})`, String(level.id));
		if (ans === null) return;
		const n = parseInt(ans, 10);
		if (Number.isNaN(n) || n < 1 || n > levels.length) return;
		levelIndex = n - 1;
		history = [];
	}

	let appHeight = $state('100dvh');
	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved !== null) {
			const n = parseInt(saved, 10);
			if (!Number.isNaN(n) && n >= 0 && n < levels.length) {
				levelIndex = n;
			}
		}
		const savedHist = localStorage.getItem(HISTORY_KEY);
		if (savedHist !== null) {
			try {
				const parsed = JSON.parse(savedHist);
				if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
					history = parsed;
				}
			} catch {
				// stale data; ignore
			}
		}
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => (appHeight = `${vv.height}px`);
		update();
		vv.addEventListener('resize', update);
		return () => vv.removeEventListener('resize', update);
	});

	$effect(() => {
		// Persist on every change of levelIndex / history.
		try {
			localStorage.setItem(STORAGE_KEY, String(levelIndex));
			localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
		} catch {
			// localStorage may be disabled (private mode); silently ignore.
		}
	});
</script>

<div class="game" style="height: {appHeight};">
	<header class="head">
		<button type="button" class="lvl lvl-btn" onclick={jumpToLevel}>Level {level.id}</button>
		<span class="head-right">
			<button type="button" class="link link-btn" onclick={resetProgress}>reset</button>
			<a class="link" href="{base}/sandbox/">sandbox →</a>
		</span>
	</header>

	<section class="middle board">
		<div class="cell">
			<div class="cap">goal</div>
			<div class="viz"><ValueViz value={targetValue} max={vizMax} /></div>
		</div>
		<div class="cell now">
			<div class="cap">now</div>
			<div class="viz">
				{#if cells.length > 0}
					<AnimatedRow {cells} max={vizMax} {setNode} />
				{:else}
					<ValueViz value={currentValue} max={vizMax} />
				{/if}
			</div>
		</div>
	</section>

	<section class="actions">
		<button type="button" class="ha" onclick={undo} disabled={history.length === 0}>undo</button>
		<button type="button" class="ha" onclick={reset} disabled={history.length === 0}>reset</button>
		<span class="moves">{history.length} {history.length === 1 ? 'move' : 'moves'}</span>
	</section>

	{#if solved}
		{#if isLastLevel}
			<section class="solved finale">
				<span class="finale-msg">
					🎉 you finished all {levels.length} levels — that's all there is for now!
				</span>
				<button type="button" class="next" onclick={resetProgress}>start over</button>
			</section>
		{:else}
			<section class="solved">
				<span class="check">✓</span>
				<button type="button" class="next" onclick={nextLevel}>next level →</button>
			</section>
		{/if}
	{:else}
		<section class="runes">
			{#each level.runes as r}
				<button
					type="button"
					class="rune bqn"
					onclick={() => applyRune(r.expr)}
					disabled={animating}
				>
					{r.glyph}
				</button>
			{/each}
		</section>
	{/if}
</div>

<style>
	.game {
		display: grid;
		grid-template-rows: auto 1fr auto auto;
		background: var(--bg);
		overflow: hidden;
	}
	.head {
		padding: 0.75rem 1rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
	}
	.middle {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		overflow: auto;
		padding: 0.5rem 1rem;
		min-height: 0;
	}
	.runes,
	.solved {
		padding: 0.75rem 1rem;
		padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
	}
	.lvl {
		color: #aaa;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		flex: 0 0 auto;
	}
	.lvl-btn {
		all: unset;
		color: #aaa;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		flex: 0 0 auto;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 1rem;
	}
	.ha {
		all: unset;
		padding: 0.4rem 0.85rem;
		border: 1px solid #2a2a2a;
		background: transparent;
		color: #aaa;
		border-radius: 0.4rem;
		font-size: 0.9rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.ha:active {
		background: #1a1a1a;
	}
	.ha:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.moves {
		color: #555;
		font-size: 0.8rem;
		margin-left: 0.3rem;
	}
	.link {
		color: #6a8aaa;
		font-size: 0.85rem;
		text-decoration: none;
		flex: 0 0 auto;
	}
	.head-right {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	.link-btn {
		all: unset;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.board {
		display: flex;
		flex-direction: column;
		/* Big gap between goal and now so the reverse-arc (peak ~60px)
		   doesn't overshoot into the goal row. */
		gap: 4.5rem;
		align-items: center;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
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
		min-height: 50px;
	}
	.now .viz {
		filter: drop-shadow(0 0 8px rgba(95, 204, 95, 0.15));
	}

	.solved {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.75rem;
	}
	.finale {
		flex-direction: column;
		gap: 0.6rem;
		text-align: center;
	}
	.finale-msg {
		color: #d7f0d7;
		font-size: 1rem;
		line-height: 1.4;
		max-width: 28rem;
	}
	.check {
		color: #5fcc5f;
		font-size: 1.5rem;
	}
	.next {
		all: unset;
		padding: 0.6rem 0.9rem;
		background: #173d17;
		border: 1px solid #2a6a2a;
		color: #d7f0d7;
		border-radius: 0.4rem;
		font-size: 1.4rem;
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
		font-family: var(--font-bqn);
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

</style>
