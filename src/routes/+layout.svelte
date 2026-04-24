<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { base } from '$app/paths';

	let { children } = $props();

	onMount(() => {
		if (!dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'module' });
		}
	});
</script>

{@render children()}
