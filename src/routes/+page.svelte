<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { scale, fly } from 'svelte/transition';
	import { backOut, cubicOut } from 'svelte/easing';
	import { base } from '$app/paths';
	import ValueViz from '$lib/components/ValueViz.svelte';
	import AnimatedRow from '$lib/components/AnimatedRow.svelte';
	import { getAnimation, type Cell } from '$lib/animations';
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

			// N⊸↑: preserve ids of the first N cells, drop the rest. The
			// take animation needs the dropped cells' DOM during its drop
			// phase, so it commits AFTER measuring; by the time this
			// effect runs the kept cells will keep their nodes (Svelte
			// matches by id) and the dropped wraps will unmount.
			const takeMatch = justTapped?.match(/^(\d+)⊸↑$/);
			if (takeMatch) {
				const n = parseInt(takeMatch[1], 10);
				if (cur.length === n && cells.length >= n) {
					const kept = cells.slice(0, n);
					cells = kept.map((c, i) => ({ id: c.id, value: cur[i] }));
					return;
				}
			}

			// N⊸↓: preserve ids of cells from index N onward, drop the
			// first N. Same id-preservation rationale as ↑.
			const dropMatch = justTapped?.match(/^(\d+)⊸↓$/);
			if (dropMatch) {
				const n = parseInt(dropMatch[1], 10);
				if (cells.length >= n && cur.length === cells.length - n) {
					const survivors = cells.slice(n);
					cells = survivors.map((c, i) => ({ id: c.id, value: cur[i] }));
					return;
				}
			}

			cells = cur.map((value) => ({ id: nextCellId++, value }));
		});
	});

	async function applyRune(expr: string) {
		if (solved || animating) return;

		const animFn = getAnimation(expr);
		if (animFn && isSimpleRow(currentValue)) {
			// Capture old cell positions before any state mutation. The
			// animation decides when to commit (FLIP-only animations call
			// commit() immediately; animations that need the OLD DOM run
			// pre-commit work first).
			const oldRects = new Map<number, DOMRect>();
			for (const cell of cells) {
				const node = cellNodes.get(cell.id);
				if (node) oldRects.set(cell.id, node.getBoundingClientRect());
			}

			animating = true;
			let committed = false;
			const commit = async () => {
				if (committed) return;
				committed = true;
				history = [...history, expr];
				await tick();
			};

			try {
				await animFn({
					cells,
					getNode: (id) => cellNodes.get(id) ?? null,
					oldRects,
					commit
				});
				if (!committed) await commit();
			} catch (err) {
				console.error('animation failed', err);
				if (!committed) await commit();
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
		<button type="button" class="lvl-btn" onclick={jumpToLevel} aria-label="Jump to level">
			<span class="lvl-mark">№</span><span class="lvl-num">{level.id}</span>
		</button>
		<span class="head-right">
			<button type="button" class="link link-btn" onclick={resetProgress}>reset</button>
			<a class="link" href="{base}/sandbox/">sandbox →</a>
		</span>
	</header>

	<section class="middle board">
		<div class="cell goal">
			<div class="viz ghost" class:filled={solved}>
				<ValueViz value={targetValue} max={vizMax} />
			</div>
		</div>
		<div class="cell now" class:winning={solved}>
			<div class="viz">
				{#if cells.length > 0}
					<AnimatedRow {cells} max={vizMax} {setNode} />
				{:else}
					<ValueViz value={currentValue} max={vizMax} />
				{/if}
			</div>
		</div>
	</section>

	<section class="actions" aria-label="actions">
		<button
			type="button"
			class="ha bqn"
			onclick={undo}
			disabled={history.length === 0}
			aria-label="undo"
		>↶</button>
		<button
			type="button"
			class="ha bqn"
			onclick={reset}
			disabled={history.length === 0}
			aria-label="reset attempt"
		>↺</button>
		{#if history.length > 0}
			<span class="moves" aria-label="{history.length} moves">{history.length}</span>
		{/if}
	</section>

	<div class="bottom-shell">
	{#if solved}
		{#if isLastLevel}
			<section class="solved finale">
				<div
					class="stamp finale-stamp"
					in:scale={{ duration: 520, start: 0.2, opacity: 0, easing: backOut }}
				>
					<svg viewBox="0 0 56 56" class="stamp-svg" aria-hidden="true">
						<circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" stroke-width="2" />
						<path
							d="M16 29 L24 37 L40 19"
							fill="none"
							stroke="currentColor"
							stroke-width="3.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<button
					type="button"
					class="next big"
					onclick={resetProgress}
					in:fly={{ y: 18, duration: 380, delay: 460, easing: cubicOut }}
					aria-label="start over"
				>↻</button>
			</section>
		{:else}
			<section class="solved">
				<div
					class="stamp"
					in:scale={{ duration: 480, start: 0.2, opacity: 0, easing: backOut }}
				>
					<svg viewBox="0 0 56 56" class="stamp-svg" aria-hidden="true">
						<circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" stroke-width="2" />
						<path
							d="M16 29 L24 37 L40 19"
							fill="none"
							stroke="currentColor"
							stroke-width="3.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				{#if history.length > 0}
					<div class="history-strip" aria-hidden="true">
						{#each history as expr, i (i)}
							{@const rune = level.runes.find((r) => r.expr === expr)}
							{#if rune}
								<span
									class="hist-glyph bqn"
									in:scale={{
										duration: 240,
										delay: 220 + i * 45,
										start: 0.2,
										opacity: 0,
										easing: backOut
									}}
								>{rune.glyph}</span>
							{/if}
						{/each}
					</div>
				{/if}
				<button
					type="button"
					class="next big"
					onclick={nextLevel}
					in:fly={{ y: 18, duration: 380, delay: 460, easing: cubicOut }}
					aria-label="next level"
				>→</button>
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
</div>

<style>
	.game {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
	}
	.middle {
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: auto;
		padding: 0.5rem 1rem;
		min-height: 0;
		flex: 0 1 auto;
	}
	.runes,
	.solved {
		padding: 0.75rem 1rem;
		padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
	}

	.bottom-shell {
		display: flex;
		flex-direction: column;
		flex: 0 0 auto;
	}

	.lvl-btn {
		all: unset;
		display: inline-flex;
		align-items: baseline;
		gap: 0.2rem;
		flex: 0 0 auto;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		font-family: var(--font-display);
	}
	.lvl-mark {
		font-style: italic;
		font-size: 1rem;
		color: #6c8a6c;
		line-height: 1;
	}
	.lvl-num {
		font-size: 1.25rem;
		font-weight: 500;
		color: #ddd;
		line-height: 1;
		font-feature-settings: 'lnum' 1;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 1rem;
		/* margin-top: auto pushes actions + bottom-shell to the viewport
		   bottom; whatever space is left above grows/shrinks to absorb
		   bottom-shell's size changes, so the puzzle box never moves. */
		margin-top: auto;
	}
	.ha {
		all: unset;
		display: inline-grid;
		place-items: center;
		min-width: 2.5rem;
		min-height: 2.2rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid #2a2a2a;
		color: #aaa;
		border-radius: 0.4rem;
		font-size: 1.3rem;
		line-height: 1;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.ha:active {
		background: #1a1a1a;
		transform: scale(0.96);
	}
	.ha:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.moves {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 0.95rem;
		color: #6a7a6a;
		margin-left: 0.4rem;
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
		gap: 4.5rem;
		align-items: center;
	}
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.viz {
		display: flex;
		align-items: flex-end;
		min-height: 50px;
	}

	/* Goal cell: outlined "blueprint" — bars become dashed silhouettes,
	   chars become dashed slots. On solve, the spec fills in: each bar
	   pours from the bottom (staggered left→right) and chars settle into
	   their filled state. The fill is a ::after layer scaled vertically
	   so the gradient can transition smoothly (gradients can't tween
	   directly). */
	.ghost :global(.bar) {
		position: relative;
		overflow: hidden;
		background: transparent !important;
		border: 1.5px dashed rgba(95, 204, 95, 0.55);
		box-shadow: none;
		transition: border-color 450ms ease, box-shadow 600ms ease;
	}
	.ghost :global(.bar)::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, #2a6a2a, #5fcc5f);
		transform: scaleY(0);
		transform-origin: bottom;
		transition: transform 700ms cubic-bezier(0.34, 1.4, 0.64, 1);
		z-index: 0;
	}
	.ghost :global(.bar .num) {
		position: relative;
		z-index: 1;
		color: rgba(95, 204, 95, 0.78);
		text-shadow: none;
		font-weight: 500;
		transition: color 380ms ease 200ms, text-shadow 380ms ease 200ms;
	}
	.ghost :global(.char) {
		background: transparent;
		border: 1.5px dashed rgba(169, 199, 230, 0.55);
		color: rgba(169, 199, 230, 0.85);
		transition:
			background-color 500ms ease,
			border-color 500ms ease,
			color 400ms ease;
	}
	.ghost :global(.grid),
	.ghost :global(.row),
	.ghost :global(.stack) {
		opacity: 0.95;
	}

	.ghost.filled :global(.bar) {
		border-color: rgba(95, 204, 95, 0);
		box-shadow: 0 0 8px rgba(95, 204, 95, 0.4);
	}
	.ghost.filled :global(.bar)::after {
		transform: scaleY(1);
	}
	.ghost.filled :global(.bar .num) {
		color: #f0fff0;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
	}
	.ghost.filled :global(.char) {
		background-color: #15212e;
		border-color: #2c4365;
		border-style: solid;
		color: #a9c7e6;
	}
	.ghost.filled :global(.grid),
	.ghost.filled :global(.row),
	.ghost.filled :global(.stack) {
		opacity: 1;
	}

	/* Stagger the fill so the wave reads from left → right. Enumerated
	   up to 12 — typical row size; ValueViz already truncates beyond. */
	.ghost.filled :global(.row > .bar:nth-child(1))::after,
	.ghost.filled :global(.stack > .bar:nth-child(1))::after { transition-delay: 80ms; }
	.ghost.filled :global(.row > .bar:nth-child(2))::after,
	.ghost.filled :global(.stack > .bar:nth-child(2))::after { transition-delay: 130ms; }
	.ghost.filled :global(.row > .bar:nth-child(3))::after,
	.ghost.filled :global(.stack > .bar:nth-child(3))::after { transition-delay: 180ms; }
	.ghost.filled :global(.row > .bar:nth-child(4))::after,
	.ghost.filled :global(.stack > .bar:nth-child(4))::after { transition-delay: 230ms; }
	.ghost.filled :global(.row > .bar:nth-child(5))::after,
	.ghost.filled :global(.stack > .bar:nth-child(5))::after { transition-delay: 280ms; }
	.ghost.filled :global(.row > .bar:nth-child(6))::after,
	.ghost.filled :global(.stack > .bar:nth-child(6))::after { transition-delay: 330ms; }
	.ghost.filled :global(.row > .bar:nth-child(7))::after,
	.ghost.filled :global(.stack > .bar:nth-child(7))::after { transition-delay: 380ms; }
	.ghost.filled :global(.row > .bar:nth-child(8))::after,
	.ghost.filled :global(.stack > .bar:nth-child(8))::after { transition-delay: 430ms; }
	.ghost.filled :global(.row > .bar:nth-child(9))::after,
	.ghost.filled :global(.stack > .bar:nth-child(9))::after { transition-delay: 480ms; }
	.ghost.filled :global(.row > .bar:nth-child(10))::after,
	.ghost.filled :global(.stack > .bar:nth-child(10))::after { transition-delay: 530ms; }
	.ghost.filled :global(.row > .bar:nth-child(11))::after,
	.ghost.filled :global(.stack > .bar:nth-child(11))::after { transition-delay: 580ms; }
	.ghost.filled :global(.row > .bar:nth-child(12))::after,
	.ghost.filled :global(.stack > .bar:nth-child(12))::after { transition-delay: 630ms; }

	@media (prefers-reduced-motion: reduce) {
		.ghost :global(.bar),
		.ghost :global(.bar)::after,
		.ghost :global(.bar .num),
		.ghost :global(.char) {
			transition-duration: 0.001ms !important;
			transition-delay: 0ms !important;
		}
	}

	.now .viz {
		filter: drop-shadow(0 0 10px rgba(95, 204, 95, 0.18));
	}
	.now.winning .viz {
		animation: solvedPulse 1.5s ease-in-out infinite;
	}
	@keyframes solvedPulse {
		0%,
		100% {
			filter: drop-shadow(0 0 12px rgba(95, 204, 95, 0.35));
		}
		50% {
			filter: drop-shadow(0 0 22px rgba(95, 204, 95, 0.65));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.now.winning .viz {
			animation: none;
			filter: drop-shadow(0 0 14px rgba(95, 204, 95, 0.45));
		}
	}

	.solved {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 0.65rem;
	}
	.finale {
		text-align: center;
	}

	.stamp {
		width: 68px;
		height: 68px;
		display: grid;
		place-items: center;
		color: var(--accent);
		filter: drop-shadow(0 0 14px var(--accent-soft));
	}
	.finale-stamp {
		width: 84px;
		height: 84px;
	}
	.stamp-svg {
		width: 100%;
		height: 100%;
	}

	.history-strip {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem 0.4rem;
		max-width: min(28rem, 100%);
		font-family: var(--font-bqn);
	}
	.hist-glyph {
		display: inline-block;
		font-size: 1.15rem;
		color: #8aa3c2;
		line-height: 1;
		opacity: 0.85;
	}

	.next {
		all: unset;
		display: inline-grid;
		place-items: center;
		padding: 0.55rem 1.1rem;
		background: var(--accent-deep);
		border: 1px solid #2a6a2a;
		color: #d7f0d7;
		border-radius: 0.45rem;
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.next.big {
		min-width: 4.2rem;
		min-height: 2.6rem;
		font-size: 1.7rem;
		box-shadow: 0 0 0 1px rgba(95, 204, 95, 0.08), 0 6px 22px -10px rgba(95, 204, 95, 0.55);
	}
	.next:active {
		background: #225722;
		transform: scale(0.97);
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
