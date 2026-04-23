<script lang="ts">
	const glyphs = ['⌽', '⍉', '≍', '⊢', '⊣', '↑', '↓', '↕', '∾', '⊏'];
</script>

<main>
	<h1>Hello BQN</h1>
	<p>Mobile-first playground, coming soon.</p>
	<p class="glyphs" aria-label="sample BQN glyphs">
		{#each glyphs as g}<span>{g}</span>{/each}
	</p>
</main>

<style>
	:global(html, body) {
		margin: 0;
		background: #111;
		color: #eee;
		font-family: system-ui, sans-serif;
	}
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 2rem 1.25rem;
	}
	h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem;
	}
	.glyphs {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 2rem;
		font-family: 'BQN386 Unicode', 'DejaVu Sans Mono', monospace;
		margin-top: 2rem;
	}
	.glyphs span {
		display: inline-grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
		background: #222;
	}
</style>
