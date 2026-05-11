<script lang="ts">
	import { onMount } from 'svelte';
	import { play } from '$lib/animations/v2/index.js';
	import { trajectoryFrom } from '$lib/animations/v2/index.js';
	import type { Stage, BqnValue, Trajectory, TrajectoryError } from '$lib/animations/v2/index.js';

	function isTrajectoryError(v: Trajectory | TrajectoryError): v is TrajectoryError {
		return 'kind' in v;
	}

	// ── renderBqnValue ───────────────────────────────────────────────────────
	// Produces an HTMLElement representing a BqnValue. Lives here, not in v2/,
	// because it creates DOM (platform + framework coupling is fine in the route).
	function renderBqnValue(value: BqnValue): HTMLElement {
		switch (value.kind) {
			case 'number': {
				const bar = document.createElement('div');
				bar.className = 'bar';
				const h = Math.max(4, Math.abs(value.value) * 20);
				bar.style.cssText = `height:${h}px;width:24px;background:#7c6af7;border-radius:3px;display:inline-block;margin:2px;vertical-align:bottom;`;
				bar.title = String(value.value);
				return bar;
			}
			case 'array': {
				// number-array → row of bars; other arrays → placeholder
				const isNumberArray = value.shape.length === 1 && value.data.every(v => v.kind === 'number');
				if (isNumberArray) {
					const row = document.createElement('div');
					row.className = 'row';
					row.style.cssText = 'display:flex;align-items:flex-end;gap:4px;padding:8px;';
					for (const item of value.data) {
						row.appendChild(renderBqnValue(item));
					}
					return row;
				}
				// nested-array placeholder
				const ph = document.createElement('div');
				ph.className = 'placeholder';
				ph.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ph.textContent = '[array]';
				return ph;
			}
			case 'char': {
				const ch = document.createElement('div');
				ch.className = 'placeholder';
				ch.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ch.textContent = `'${value.value}'`;
				return ch;
			}
			case 'fn':
			case 'namespace': {
				const ph = document.createElement('div');
				ph.className = 'placeholder';
				ph.style.cssText = 'padding:8px;color:#888;font-family:monospace;';
				ph.textContent = value.kind === 'fn' ? '{fn}' : '{ns}';
				return ph;
			}
		}
	}

	// ── Hardcoded Trajectory ─────────────────────────────────────────────────
	// Three monadic steps:  ⌽[1,2,3] → [3,2,1]  ∧[3,2,1] → [1,2,3]  ↕[1,2,3] → [0,1,2]
	// Results are supplied by the caller; the animation engine trusts them.
	const start: BqnValue = {
		kind: 'array',
		shape: [3],
		data: [
			{ kind: 'number', value: 1 },
			{ kind: 'number', value: 2 },
			{ kind: 'number', value: 3 },
		],
	};

	const reversed: BqnValue = {
		kind: 'array',
		shape: [3],
		data: [
			{ kind: 'number', value: 3 },
			{ kind: 'number', value: 2 },
			{ kind: 'number', value: 1 },
		],
	};

	const sorted: BqnValue = {
		kind: 'array',
		shape: [3],
		data: [
			{ kind: 'number', value: 1 },
			{ kind: 'number', value: 2 },
			{ kind: 'number', value: 3 },
		],
	};

	const ranged: BqnValue = {
		kind: 'array',
		shape: [3],
		data: [
			{ kind: 'number', value: 0 },
			{ kind: 'number', value: 1 },
			{ kind: 'number', value: 2 },
		],
	};

	const trajectoryResult = trajectoryFrom(start, [
		{ kind: 'monadic', fn: { kind: 'reverse' },  result: reversed },
		{ kind: 'monadic', fn: { kind: 'sort-up' },  result: sorted  },
		{ kind: 'monadic', fn: { kind: 'range' },    result: ranged  },
	]);

	if (isTrajectoryError(trajectoryResult)) {
		throw new Error(`Harness trajectory error: ${trajectoryResult.kind}`);
	}

	const trajectory: Trajectory = trajectoryResult;

	// ── Stage implementation ──────────────────────────────────────────────────
	// Lives here (Rule B). Imports Stage type from v2; implementation is Svelte-aware.
	//
	// prepare puts the new element directly into the visible container as an
	// absolutely-positioned overlay (opacity:0). This is what lets blackBox's
	// phase-3 emerge animation actually be visible — if prepared lived off-
	// screen until commit, phase 3 would animate an invisible element.
	let containerEl: HTMLElement;
	let currentEl: HTMLElement;

	function buildStage(): Stage {
		return {
			get current(): HTMLElement {
				return currentEl;
			},
			async prepare(value: BqnValue): Promise<HTMLElement> {
				const el = renderBqnValue(value);
				el.style.position = 'absolute';
				el.style.left = '0';
				el.style.bottom = '0';
				el.style.opacity = '0';
				containerEl.appendChild(el);
				return el;
			},
			commit(prepared: HTMLElement): void {
				// Drop the staging styles; prepared resumes natural flex placement.
				prepared.style.position = '';
				prepared.style.left = '';
				prepared.style.bottom = '';
				prepared.style.opacity = '';
				// Remove every other child (the previous current and any stragglers).
				for (const child of Array.from(containerEl.children)) {
					if (child !== prepared) containerEl.removeChild(child);
				}
				currentEl = prepared;
			},
		};
	}

	let stage: Stage | null = null;
	let playing = false;
	let done = false;

	onMount(() => {
		// Render initial value into the container.
		const initial = renderBqnValue(start);
		containerEl.appendChild(initial);
		currentEl = initial;
		stage = buildStage();
	});

	async function handlePlay() {
		if (!stage || playing) return;
		playing = true;
		done = false;
		await play(trajectory, stage);
		playing = false;
		done = true;
	}
</script>

<svelte:head>
	<title>v2 Animation Harness</title>
</svelte:head>

<main style="padding:2rem;font-family:sans-serif;background:#0d0d1a;min-height:100vh;color:#e0e0ff;">
	<h1 style="font-size:1.2rem;margin-bottom:1rem;color:#a89cf7;">v2 Animation Harness</h1>

	<p style="font-size:0.85rem;color:#888;margin-bottom:1.5rem;">
		Trajectory: <code>[1,2,3]</code> → ⌽ reverse → ∧ sort-up → ↕ range
	</p>

	<!-- Stage container — position:relative so absolutely-positioned prepared
	     elements and the blackBox label overlap correctly. overflow:hidden so
	     pre-emerge offset (transform x:-40px) is clipped, not visible. -->
	<div
		bind:this={containerEl}
		style="position:relative;min-height:80px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:1rem;display:flex;align-items:flex-end;overflow:hidden;"
	></div>

	<button
		on:click={handlePlay}
		disabled={playing}
		style="padding:0.5rem 1.5rem;background:#7c6af7;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer;opacity:{playing ? 0.5 : 1};"
	>
		{#if playing}
			Playing…
		{:else if done}
			Play again
		{:else}
			Play
		{/if}
	</button>
</main>
