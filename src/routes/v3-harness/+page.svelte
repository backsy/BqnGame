<script lang="ts">
	// v3 harness — static-render slice.
	//
	// Click a starter → worker evaluates its BQN source → bqnValueToScene
	// turns the result into a Scene → SVG renders the cells. No animation,
	// no primitive panel UI, no history navigation yet — just the static
	// round-trip from BQN source through the substrate to pixels.
	//
	// The substrate at $lib/v3 owns the data shapes and pure projections;
	// this .svelte owns the chrome and the (currently inert) op picker.

	import { onMount, onDestroy } from 'svelte';
	import { BqnWorkerClient } from '$lib/bqn/worker-client';
	import type { History } from '$lib/v3/history';
	import { emptyHistory, current, reset } from '$lib/v3/history';
	import { bqnValueToScene } from '$lib/v3/layout';
	import { flattenScene, formatAtomLabel } from '$lib/v3/render';
	import type { RenderPrim } from '$lib/v3/render';
	import type { ViewBox } from '$lib/v3/scene';

	type Starter = { label: string; source: string };

	type Family =
		| 'primitives'
		| 'lateral'
		| 'vertical'
		| 'sizing'
		| 'merging'
		| 'distributing'
		| 'comparison'
		| 'structural';

	type OpDesc = { label: string; family: Family; kind: string };

	// Fixed viewBox for the SVG window. All cell coords are in these units;
	// the browser scales to the wrapper's pixel size.
	const VB_W = 400;
	const VB_H = 220;
	const VIEW_BOX: ViewBox = { x: 0, y: 0, w: VB_W, h: VB_H };

	// Real BQN literals. `¯` (U+00AF) is BQN's negative-number prefix;
	// `<` is Enclose (rank-0 box around the next value); `‿` (U+203F) is
	// stranding (list literal). Labels = source so the button reads as
	// real BQN.
	const STARTERS: Starter[] = [
		{ label: '3',                  source: '3' },
		{ label: '¯3',                 source: '¯3' },
		{ label: '8',                  source: '8' },
		{ label: '1÷2',                source: '1÷2' },
		{ label: '<5',                 source: '<5' },
		{ label: '<<5',                source: '<<5' },
		{ label: '3‿1‿4‿1‿5',         source: '3‿1‿4‿1‿5' },
		{ label: '¯3‿1‿¯2‿4',         source: '¯3‿1‿¯2‿4' },
		{ label: '<3‿1‿4',            source: '<3‿1‿4' },
		{ label: '2‿3⥊3‿1‿4‿1‿5‿9',  source: '2‿3⥊3‿1‿4‿1‿5‿9' },
		{ label: '3‿3⥊↕9',            source: '3‿3⥊↕9' },
		{ label: '<2‿2⥊3‿1‿4‿1',     source: '<2‿2⥊3‿1‿4‿1' },
	];

	const FAMILIES: Array<{ key: Family; label: string; color: string; btnColor: string }> = [
		{ key: 'primitives',   label: 'Primitives',   color: '#9af7c2', btnColor: '#e0ffe6' },
		{ key: 'lateral',      label: 'Lateral',      color: '#7c6af7', btnColor: '#e0e0ff' },
		{ key: 'vertical',     label: 'Vertical',     color: '#5fcc5f', btnColor: '#e0e0ff' },
		{ key: 'sizing',       label: 'Sizing',       color: '#f7a86a', btnColor: '#e0e0ff' },
		{ key: 'merging',      label: 'Merging',      color: '#6af7d8', btnColor: '#e0e0ff' },
		{ key: 'distributing', label: 'Distributing', color: '#d86af7', btnColor: '#e0e0ff' },
		{ key: 'comparison',   label: 'Comparison',   color: '#f76a8a', btnColor: '#e0e0ff' },
		{ key: 'structural',   label: 'Structural',   color: '#f7e16a', btnColor: '#e0e0ff' },
	];

	// Empty: ops are added as their animations get wired.
	const OPS: OpDesc[] = [];

	const SPEED_CHOICES: number[] = [0.25, 0.5, 1, 2];

	// ── Reactive state ────────────────────────────────────────────────────────
	let selectedStarterIdx = 0;
	let playing = false;
	let busy = false;
	let statusMsg = '';
	let speed = 1;
	let worker: BqnWorkerClient | null = null;
	let history: History = emptyHistory();
	// The scene is a pure derivation of history.cursor; no other state
	// feeds rendering. flattenScene then turns it into a flat list of
	// SVG primitive descriptions the template loop draws.
	$: scene = current(history)?.scene ?? null;
	$: prims = (scene ? flattenScene(scene) : []) satisfies RenderPrim[];

	let familyOpen: Record<Family, boolean> = {
		primitives: true,
		lateral: false,
		vertical: false,
		sizing: false,
		merging: false,
		distributing: false,
		comparison: false,
		structural: true,
	};

	onMount(() => {
		worker = new BqnWorkerClient();
		// Mount the first starter so the canvas is not empty on first paint.
		void mountStarter(0);
	});

	onDestroy(() => {
		worker?.destroy();
		worker = null;
	});

	function toggleFamily(key: Family): void {
		familyOpen[key] = !familyOpen[key];
		familyOpen = familyOpen;
	}

	async function mountStarter(idx: number): Promise<void> {
		selectedStarterIdx = idx;
		statusMsg = '';
		if (!worker) return;
		busy = true;
		try {
			history = await reset(
				worker,
				STARTERS[idx].source,
				(v) => bqnValueToScene(v, VIEW_BOX),
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			statusMsg = `error: ${msg}`;
		} finally {
			busy = false;
		}
	}

	function handleOp(op: OpDesc): void {
		statusMsg = `${op.kind} not wired yet`;
	}

	function handleReset(): void {
		void mountStarter(selectedStarterIdx);
	}

	function setSpeed(s: number): void {
		speed = s;
	}
</script>

<svelte:head>
	<title>v3 Animation Harness</title>
</svelte:head>

<main style="padding:1rem 1rem 200px;font-family:sans-serif;background:#0d0d1a;min-height:100dvh;color:#e0e0ff;max-width:480px;margin:0 auto;">
	<div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.6rem;margin-bottom:1rem;">
		<h1 style="font-size:1.1rem;margin:0;color:#a89cf7;">v3 Animation Harness</h1>
		<span
			title="State→render→SVG architecture (renderer + animations not yet wired)"
			style="font-size:0.7rem;color:#a89cf7;background:rgba(168,156,247,0.12);padding:0.18rem 0.5rem;border-radius:10px;border:1px solid rgba(168,156,247,0.3);letter-spacing:0.02em;"
		>
			frame · empty
		</span>
	</div>

	<!-- Starter picker -->
	<section style="margin-bottom:1rem;">
		<div style="font-size:0.75rem;color:#888;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.05em;">Starter</div>
		<div style="display:flex;flex-wrap:wrap;gap:6px;">
			{#each STARTERS as starter, i}
				<button
					on:click={() => mountStarter(i)}
					disabled={playing}
					style="padding:0.3rem 0.6rem;font-size:0.8rem;background:{selectedStarterIdx === i ? '#7c6af7' : '#1a1a2e'};color:#e0e0ff;border:{selectedStarterIdx === i ? '1px solid #7c6af7' : '1px solid #333'};border-radius:5px;cursor:pointer;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"
				>
					{starter.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Animation window: empty SVG with fixed viewBox.
	     This is where future rendering will land. Nothing inside yet. -->
	<div
		style="position:relative;min-height:320px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:1rem;display:flex;align-items:center;justify-content:center;"
	>
		<svg
			viewBox="0 0 {VB_W} {VB_H}"
			width="100%"
			style="display:block;overflow:visible;"
			role="img"
			aria-label="animation window"
		>
			{#each prims as p, i (i)}
				{#if p.kind === 'frame'}
					<!-- Array outline. Rank-0 boxes get a thicker, more
					     saturated stroke plus a faint lavender fill tint so
					     they read distinctly at a glance against plain
					     (rank ≥ 1) array outlines. -->
					<rect
						x={p.x}
						y={p.y}
						width={p.w}
						height={p.h}
						rx="3"
						ry="3"
						fill={p.rank0 ? 'rgba(168, 156, 247, 0.10)' : 'none'}
						stroke={p.rank0 ? 'rgba(168, 156, 247, 0.85)' : 'rgba(140, 140, 200, 0.4)'}
						stroke-width={p.rank0 ? 2 : 1}
					/>
				{:else if p.kind === 'bar'}
					<!-- Atom cell: colored rect by sign + numeric label. -->
					<rect
						x={p.x}
						y={p.y}
						width={p.w}
						height={p.h}
						rx="3"
						ry="3"
						fill={p.value < 0 ? '#f76a6a' : '#7c6af7'}
					/>
					<!-- Label sits at the "tip" of the bar (the end away from the
					     baseline): top for positive bars, bottom for negative. -->
					<text
						x={p.x + p.w / 2}
						y={p.value < 0 ? p.y + p.h - 16 : p.y + 4}
						text-anchor="middle"
						dominant-baseline="hanging"
						font-family="system-ui, -apple-system, sans-serif"
						font-size="12"
						font-weight="600"
						fill="#f0fff0"
					>{formatAtomLabel(p.value)}</text>
				{/if}
			{/each}
		</svg>
	</div>

	{#if statusMsg}
		<p style="font-size:0.8rem;color:#f7a86a;margin-bottom:0.8rem;">{statusMsg}</p>
	{/if}

	<!-- Op picker — families present, op buttons grow in as animations are wired. -->
	{#each FAMILIES as fam}
		{@const ops = OPS.filter(op => op.family === fam.key)}
		<section style="margin-bottom:0.5rem;">
			<button
				on:click={() => toggleFamily(fam.key)}
				style="background:transparent;border:none;color:{fam.color};font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;padding:0.2rem 0;margin-bottom:0.3rem;cursor:pointer;display:flex;align-items:center;gap:0.4rem;width:100%;text-align:left;font-family:inherit;"
			>
				<span style="opacity:0.65;width:0.8rem;display:inline-block;">{familyOpen[fam.key] ? '▾' : '▸'}</span>
				<span>{fam.label}</span>
				<span style="opacity:0.45;font-size:0.7rem;">{ops.length}</span>
			</button>
			{#if familyOpen[fam.key]}
				<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:0.5rem;">
					{#if ops.length === 0}
						<span style="font-size:0.75rem;color:#555;font-style:italic;">no ops wired yet</span>
					{:else}
						{#each ops as op}
							<button
								on:click={() => handleOp(op)}
								disabled={playing}
								style="padding:0.4rem 0.8rem;font-size:1.2rem;background:#1a1a2e;color:{fam.btnColor};border:1px solid {fam.color};border-radius:5px;cursor:pointer;font-family:monospace;min-width:2.5rem;"
								title={op.kind}
							>
								{op.label}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</section>
	{/each}

	<!-- Speed + reset row -->
	<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
		<button
			on:click={handleReset}
			disabled={playing}
			style="padding:0.4rem 1.2rem;background:#333;color:#e0e0ff;border:1px solid #555;border-radius:6px;font-size:0.9rem;cursor:pointer;"
		>
			Reset
		</button>

		<div style="display:flex;align-items:center;gap:6px;">
			<span style="font-size:0.75rem;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Speed</span>
			{#each SPEED_CHOICES as s}
				<button
					on:click={() => setSpeed(s)}
					disabled={playing}
					style="padding:0.25rem 0.55rem;font-size:0.8rem;background:{speed === s ? '#7c6af7' : '#1a1a2e'};color:#e0e0ff;border:1px solid {speed === s ? '#7c6af7' : '#333'};border-radius:5px;cursor:pointer;"
				>
					{s}x
				</button>
			{/each}
		</div>
	</div>

	{#if playing}
		<span style="margin-left:0.8rem;font-size:0.85rem;color:#7c6af7;">animating…</span>
	{/if}
</main>

<style>
	/* Match v2-harness: override the app-wide overflow lock so the page
	   scrolls naturally on mobile. */
	:global(html),
	:global(body) {
		overflow: auto !important;
		height: auto !important;
	}
</style>
