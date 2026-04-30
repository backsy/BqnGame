<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { base } from '$app/paths';

	let { children } = $props();

	let waitingWorker = $state<ServiceWorker | null>(null);
	let updateAvailable = $derived(waitingWorker !== null);
	let activating = $state(false);

	onMount(() => {
		if (dev || !('serviceWorker' in navigator)) return;

		let cancelled = false;

		(async () => {
			const reg = await navigator.serviceWorker.register(
				`${base}/service-worker.js`,
				{ type: 'module' }
			);
			if (cancelled) return;

			// A worker may already be waiting if the page was reopened
			// after a new build was published.
			if (reg.waiting && navigator.serviceWorker.controller) {
				waitingWorker = reg.waiting;
			}

			reg.addEventListener('updatefound', () => {
				const newWorker = reg.installing;
				if (!newWorker) return;
				newWorker.addEventListener('statechange', () => {
					if (
						newWorker.state === 'installed' &&
						navigator.serviceWorker.controller
					) {
						waitingWorker = newWorker;
					}
				});
			});

			// Once the new SW takes control, reload so the page itself runs
			// against the fresh assets.
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (activating) location.reload();
			});

			// Poll for updates every time the app comes back to the foreground.
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') reg.update().catch(() => {});
			});
		})().catch(() => {});

		return () => {
			cancelled = true;
		};
	});

	function applyUpdate() {
		if (!waitingWorker) return;
		activating = true;
		waitingWorker.postMessage({ type: 'SKIP_WAITING' });
	}
</script>

{#if updateAvailable}
	<button type="button" class="update-bar" onclick={applyUpdate}>
		new version — tap to update
	</button>
{/if}

{@render children()}

<style>
	.update-bar {
		all: unset;
		position: fixed;
		top: env(safe-area-inset-top, 0);
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		padding: 0.45rem 0.9rem;
		margin-top: 0.3rem;
		background: #173d17;
		border: 1px solid #2a6a2a;
		color: #d7f0d7;
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
	}
	.update-bar:active {
		background: #225722;
		transform: translateX(-50%) scale(0.97);
	}
</style>
