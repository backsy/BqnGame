<script lang="ts">
	// Recursive Scene renderer. No SVG transforms applied — the scene
	// has no rotation state. Everything that moves does so by having its
	// position field change in data, frame by frame.
	//
	// For each Scene node:
	//   * Atom — render the bar rect + label.
	//   * Array — render the frame rect (rank-coloured), then walk cells:
	//       atomic cell → bar rect + label;
	//       wrapper cell → recurse into the inner scene.

	import type { Scene } from './scene';
	import { formatAtomLabel, rankRgb } from './render';

	export let scene: Scene;
</script>

{#if scene.kind === 'atom'}
	{@const c = scene.atom}
	<rect
		x={c.x}
		y={c.y}
		width={c.w}
		height={c.h}
		rx="3"
		ry="3"
		fill={c.value < 0 ? '#f76a6a' : '#7c6af7'}
	/>
	<text
		x={c.x + c.w / 2}
		y={c.value < 0 ? c.y + c.h - 16 : c.y + 4}
		text-anchor="middle"
		dominant-baseline="hanging"
		font-family="system-ui, -apple-system, sans-serif"
		font-size="12"
		font-weight="600"
		fill="#f0fff0">{formatAtomLabel(c.value)}</text
	>
{:else}
	{@const rgb = rankRgb(scene.shape.length)}
	<rect
		x={scene.frame.x}
		y={scene.frame.y}
		width={scene.frame.w}
		height={scene.frame.h}
		rx="3"
		ry="3"
		fill="none"
		stroke="rgba({rgb}, 0.85)"
		stroke-width="1.5"
	/>
	{#each scene.cells as c (c.id)}
		{#if c.kind === 'ellipsis'}
			<text
				x={c.x + c.w / 2}
				y={c.y + c.h / 2}
				text-anchor="middle"
				dominant-baseline="middle"
				font-family="system-ui, -apple-system, sans-serif"
				font-size="20"
				font-weight="700"
				fill="#a89cf7">{c.w > c.h * 1.5 ? '⋮' : '…'}</text
			>
		{:else if c.inner === null}
			<rect
				x={c.x}
				y={c.y}
				width={c.w}
				height={c.h}
				rx="3"
				ry="3"
				fill={c.value < 0 ? '#f76a6a' : '#7c6af7'}
			/>
			<text
				x={c.x + c.w / 2}
				y={c.value < 0 ? c.y + c.h - 16 : c.y + 4}
				text-anchor="middle"
				dominant-baseline="hanging"
				font-family="system-ui, -apple-system, sans-serif"
				font-size="12"
				font-weight="600"
				fill="#f0fff0">{formatAtomLabel(c.value)}</text
			>
		{:else}
			<svelte:self scene={c.inner} />
		{/if}
	{/each}
{/if}
