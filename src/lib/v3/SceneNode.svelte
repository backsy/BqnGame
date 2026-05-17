<script lang="ts">
	// Recursive Scene renderer.
	//
	// One Scene node = one `<g rotate(rot, cx, cy)>` group wrapping that
	// node's frame rect and its children. Each child gets a counter-
	// rotation `<g rotate(-rot, cellCx, cellCy)>` around its own centre
	// — so children stay upright AS UNITS regardless of the parent's
	// rotation. For a wrapper cell the counter-rotation wraps the whole
	// recursive render of its sub-Scene; the sub-Scene's internals never
	// reorder, they just translate to the parent's rotated position.
	//
	// Atom Scenes never rotate (no rotation field); they render just the
	// bar+label.

	import type { Cell, Scene } from './scene';
	import { PADDING } from './layout';
	import { formatAtomLabel, rankRgb } from './render';

	export let scene: Scene;

	function bboxOfCells(cells: Cell[]): {
		x: number;
		y: number;
		w: number;
		h: number;
	} {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const c of cells) {
			if (c.x < minX) minX = c.x;
			if (c.y < minY) minY = c.y;
			if (c.x + c.w > maxX) maxX = c.x + c.w;
			if (c.y + c.h > maxY) maxY = c.y + c.h;
		}
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}
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
	{@const rot = scene.rotation}
	{@const bbox = bboxOfCells(scene.cells)}
	{@const fx = bbox.x - PADDING}
	{@const fy = bbox.y - PADDING}
	{@const fw = bbox.w + 2 * PADDING}
	{@const fh = bbox.h + 2 * PADDING}
	{@const cx = fx + fw / 2}
	{@const cy = fy + fh / 2}
	{@const rgb = rankRgb(scene.shape.length)}
	<g transform="rotate({rot} {cx} {cy})">
		<rect
			x={fx}
			y={fy}
			width={fw}
			height={fh}
			rx="3"
			ry="3"
			fill="none"
			stroke="rgba({rgb}, 0.85)"
			stroke-width="1.5"
		/>
		{#each scene.cells as c (c.id)}
			{@const cellCx = c.x + c.w / 2}
			{@const cellCy = c.y + c.h / 2}
			<g transform="rotate({-rot} {cellCx} {cellCy})">
				{#if c.inner === null}
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
			</g>
		{/each}
	</g>
{/if}
