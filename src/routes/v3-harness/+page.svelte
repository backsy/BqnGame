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
	import type { Scene, ViewBox } from '$lib/v3/scene';
	import { reverseAnimation } from '$lib/v3/steps/reverse';
	import { tween, linear } from '$lib/v3/tween';
	import SceneNode from '$lib/v3/SceneNode.svelte';

	type Starter = { label: string; source: string };

	type Family =
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
	const VB_H = 280;
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
		{ label: '2‿10⥊↕20',          source: '2‿10⥊↕20' },
		{ label: '<2‿2⥊3‿1‿4‿1',     source: '<2‿2⥊3‿1‿4‿1' },
		{ label: '⟨3‿1, 4‿1‿5⟩',     source: '⟨3‿1, 4‿1‿5⟩' },
		{ label: '⟨1‿2, 3‿4, 5‿6⟩',  source: '⟨1‿2, 3‿4, 5‿6⟩' },
		// The 2×4 mat that motivated dynamic bar scaling. Keep as a
		// rhythm check: 0s should look substantial, 8 shouldn't dominate.
		{ label: '2‿4⥊0‿0‿¯1‿8‿5‿0‿¯6‿0', source: '2‿4⥊0‿0‿¯1‿8‿5‿0‿¯6‿0' },
		// ── Ellipsis test cases ──────────────────────────────────────
		// Each pushes a different axis past its budget so the fit-based
		// ellipsis fires visibly. `↕N` is BQN's range 0..N-1.
		{ label: '↕30',               source: '↕30' },              // rank-1 width: …
		{ label: '15‿3⥊↕45',         source: '15‿3⥊↕45' },          // rank-2 many rows: ⋮
		{ label: '2‿30⥊↕60',         source: '2‿30⥊↕60' },          // rank-2 wide rows: … per row
		{ label: '⟨↕30, 1‿2‿3⟩',     source: '⟨↕30, 1‿2‿3⟩' },      // recursive: inner vec ellipsizes inside its share
		{ label: '20‿15⥊↕300',       source: '20‿15⥊↕300' },        // both axes overflow: ⋮ + …
	];

	const FAMILIES: Array<{ key: Family; label: string; color: string; btnColor: string }> = [
		{ key: 'lateral',      label: 'Lateral',      color: '#7c6af7', btnColor: '#e0e0ff' },
		{ key: 'vertical',     label: 'Vertical',     color: '#5fcc5f', btnColor: '#e0e0ff' },
		{ key: 'sizing',       label: 'Sizing',       color: '#f7a86a', btnColor: '#e0e0ff' },
		{ key: 'merging',      label: 'Merging',      color: '#6af7d8', btnColor: '#e0e0ff' },
		{ key: 'distributing', label: 'Distributing', color: '#d86af7', btnColor: '#e0e0ff' },
		{ key: 'comparison',   label: 'Comparison',   color: '#f76a8a', btnColor: '#e0e0ff' },
		{ key: 'structural',   label: 'Structural',   color: '#f7e16a', btnColor: '#e0e0ff' },
	];

	// Ops are added as their animations get wired. Each `kind` corresponds
	// to a self-contained step file under `$lib/v3/steps/`.
	const OPS: OpDesc[] = [
		{ label: '⌽', family: 'lateral', kind: 'reverse' },
	];

	const SPEED_CHOICES: number[] = [0.25, 0.5, 1, 2];

	// ── Reactive state ────────────────────────────────────────────────────────
	let selectedStarterIdx = 0;
	let playing = false;
	let busy = false;
	let statusMsg = '';
	let speed = 1;
	let worker: BqnWorkerClient | null = null;
	let history: History = emptyHistory();
	// A primitive-preview overrides the history-derived scene while it's
	// playing and afterwards (until the user picks another starter). This
	// stays out of history — per CLAUDE.md, primitives don't enter it.
	let displayScene: Scene | null = null;
	let primitiveBusy = false;
	// Animation cancellation. `activeGen` is bumped any time a new
	// starter is picked or a new animation begins; in-flight tween
	// loops check their own captured generation against this and bail
	// out (and stop writing `displayScene`) when stale. `activeCancel`
	// resolves the current rAF tween early so we don't waste frames.
	let activeGen = 0;
	let activeCancel: (() => void) | null = null;
	// The scene the renderer reads. displayScene wins when present;
	// otherwise it derives from history.cursor.
	$: scene = displayScene ?? current(history)?.scene ?? null;
	// The BQN source string corresponding to the current history entry.
	// Shown above the SVG so the player sees the expression that produced
	// what they're looking at. Goes null when history is empty.
	$: sourceLine = current(history)?.source ?? null;

	let familyOpen: Record<Family, boolean> = {
		lateral: true,
		vertical: false,
		sizing: false,
		merging: false,
		distributing: false,
		comparison: false,
		structural: false,
	};

	onMount(() => {
		worker = new BqnWorkerClient();
		// Mount the last starter (the render-test counterexample) so the
		// failing input is visible immediately for inspection.
		void mountStarter(STARTERS.length - 1);
	});

	onDestroy(() => {
		worker?.destroy();
		worker = null;
	});

	function toggleFamily(key: Family): void {
		familyOpen[key] = !familyOpen[key];
		familyOpen = familyOpen;
	}

	function cancelActiveAnimation(): void {
		activeGen++;
		if (activeCancel) {
			activeCancel();
			activeCancel = null;
		}
		primitiveBusy = false;
	}

	async function mountStarter(idx: number): Promise<void> {
		// Stop any in-flight animation before we swap the scene, so its
		// onFrame callbacks don't overwrite the new starter's scene.
		cancelActiveAnimation();
		selectedStarterIdx = idx;
		statusMsg = '';
		// Clicking a starter resets any in-flight primitive preview — the
		// user is back to the history-derived scene.
		displayScene = null;
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

	async function runOpAnimation(snapshots: Scene[]): Promise<void> {
		if (primitiveBusy) return;
		// No-op animation (single snapshot): nothing to tween. Showing
		// the snapshot and returning keeps the button available.
		if (snapshots.length < 2) {
			displayScene = snapshots[0] ?? displayScene;
			return;
		}
		const myGen = ++activeGen;
		primitiveBusy = true;
		statusMsg = '';
		try {
			const totalMs = 1600 / speed;
			const segments = snapshots.length - 1;
			const segmentMs = totalMs / segments;
			for (let i = 0; i < segments; i++) {
				if (myGen !== activeGen) return;
				const handle = tween({
					from: snapshots[i],
					to: snapshots[i + 1],
					durationMs: segmentMs,
					easing: linear,
					onFrame: (s) => {
						if (myGen === activeGen) displayScene = s;
					},
				});
				activeCancel = handle.cancel;
				const r = await handle.promise;
				if (myGen !== activeGen) return;
				activeCancel = null;
				if (r === 'cancelled') return;
			}
			displayScene = snapshots[snapshots.length - 1];
		} catch (e) {
			statusMsg = `op error: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			if (myGen === activeGen) {
				primitiveBusy = false;
				activeCancel = null;
			}
		}
	}

	function handleOp(op: OpDesc): void {
		const startScene = scene;
		if (!startScene) return;
		if (op.kind === 'reverse') {
			void runOpAnimation(reverseAnimation(startScene));
			return;
		}
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

	<!-- Source line. Shows the BQN expression that produced the resting
	     Scene under the cursor. During a primitive preview the expression
	     stays the same (previews don't enter history), so this is always
	     coherent with what history says is "current". -->
	<div
		style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1.05rem;color:#e0e0ff;background:#0d0d1a;border:1px solid #333;border-bottom:none;border-top-left-radius:8px;border-top-right-radius:8px;padding:0.5rem 0.75rem;min-height:1.6rem;letter-spacing:0.01em;display:flex;align-items:center;gap:0.5rem;"
	>
		<span style="font-size:0.7rem;color:#7c6af7;text-transform:uppercase;letter-spacing:0.08em;">BQN</span>
		<span style="white-space:pre;overflow-x:auto;">{sourceLine ?? ''}</span>
	</div>

	<!-- Animation window. Panel's content box has aspect 400:280 (=viewBox)
	     so the SVG fills it exactly — visible panel inner === SVG element
	     box === viewBox in userspace coords. `overflow:hidden` makes the
	     viewBox the actual clip rect; nothing can render beyond. Width
	     responds to viewport (uniform scale, aspect preserved). The pink
	     outline marks the canvas edge for visual verification. -->
	<div
		style="position:relative;aspect-ratio:{VB_W} / {VB_H};box-sizing:border-box;background:#1a1a2e;border:1px solid #333;border-bottom-left-radius:8px;border-bottom-right-radius:8px;margin-bottom:1rem;"
	>
		<svg
			viewBox="0 0 {VB_W} {VB_H}"
			preserveAspectRatio="xMidYMid meet"
			style="display:block;overflow:hidden;width:100%;height:100%;"
			role="img"
			aria-label="animation window"
		>
			{#if scene}
				<SceneNode {scene} />
			{/if}
			<!-- Permanent canvas-edge marker. Drawn at viewBox edge with stroke
			     offset 1 unit inward so the full 2-unit stroke lies inside the
			     clip rect and renders visibly. -->
			<rect
				x="1"
				y="1"
				width={VB_W - 2}
				height={VB_H - 2}
				fill="none"
				stroke="#ff2bd6"
				stroke-width="2"
				pointer-events="none"
			/>
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
								disabled={playing || primitiveBusy || busy}
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
