<!--
  Inline SVG diagrams for BQN modifiers, showing how operands and arguments
  combine. Hand-drawn to match the spirit of the diagrams at
  https://mlochbaum.github.io/BQN/doc/primitive.html — boxes for operand
  applications, lines for data flow, 𝕨/𝕩 labels at inputs.

  Each diagram is fixed-size 200x220 viewBox, scales to container width.
  Only the most common modifiers have diagrams; the rest fall back to text.
-->

<script lang="ts">
	interface Props {
		glyph: string;
	}
	let { glyph }: Props = $props();
</script>

{#snippet head()}
	<defs>
		<marker
			id="arrowhead"
			markerWidth="8"
			markerHeight="8"
			refX="7"
			refY="4"
			orient="auto"
			markerUnits="strokeWidth"
		>
			<polygon points="0 0, 8 4, 0 8" fill="#8aa3c2" />
		</marker>
	</defs>
{/snippet}

{#if glyph === '∘'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="55" y="22" class="arg">𝕨</text>
		<text x="145" y="22" class="arg">𝕩</text>
		<line x1="55" y1="30" x2="80" y2="60" />
		<line x1="145" y1="30" x2="120" y2="60" />
		<rect x="70" y="60" width="60" height="40" class="op" />
		<text x="100" y="86" class="opname">𝔾</text>
		<line x1="100" y1="100" x2="100" y2="125" class="arrow" />
		<rect x="70" y="130" width="60" height="40" class="op" />
		<text x="100" y="156" class="opname">𝔽</text>
		<line x1="100" y1="170" x2="100" y2="195" class="arrow" />
	</svg>
{:else if glyph === '○'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="40" y="22" class="arg">𝕨</text>
		<text x="160" y="22" class="arg">𝕩</text>
		<line x1="40" y1="30" x2="40" y2="50" />
		<line x1="160" y1="30" x2="160" y2="50" />
		<rect x="10" y="50" width="60" height="40" class="op" />
		<text x="40" y="76" class="opname">𝔾</text>
		<rect x="130" y="50" width="60" height="40" class="op" />
		<text x="160" y="76" class="opname">𝔾</text>
		<line x1="40" y1="90" x2="80" y2="130" />
		<line x1="160" y1="90" x2="120" y2="130" />
		<rect x="70" y="130" width="60" height="40" class="op" />
		<text x="100" y="156" class="opname">𝔽</text>
		<line x1="100" y1="170" x2="100" y2="195" class="arrow" />
	</svg>
{:else if glyph === '⊸'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="55" y="22" class="arg">𝕨</text>
		<text x="145" y="22" class="arg">𝕩</text>
		<line x1="55" y1="30" x2="55" y2="50" />
		<line x1="145" y1="30" x2="145" y2="125" />
		<rect x="25" y="50" width="60" height="40" class="op" />
		<text x="55" y="76" class="opname">𝔽</text>
		<line x1="55" y1="90" x2="80" y2="130" />
		<line x1="145" y1="125" x2="120" y2="130" />
		<rect x="70" y="130" width="60" height="40" class="op" />
		<text x="100" y="156" class="opname">𝔾</text>
		<line x1="100" y1="170" x2="100" y2="195" class="arrow" />
	</svg>
{:else if glyph === '⟜'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="55" y="22" class="arg">𝕨</text>
		<text x="145" y="22" class="arg">𝕩</text>
		<line x1="55" y1="30" x2="55" y2="125" />
		<line x1="145" y1="30" x2="145" y2="50" />
		<rect x="115" y="50" width="60" height="40" class="op" />
		<text x="145" y="76" class="opname">𝔾</text>
		<line x1="55" y1="125" x2="80" y2="130" />
		<line x1="145" y1="90" x2="120" y2="130" />
		<rect x="70" y="130" width="60" height="40" class="op" />
		<text x="100" y="156" class="opname">𝔽</text>
		<line x1="100" y1="170" x2="100" y2="195" class="arrow" />
	</svg>
{:else if glyph === '˜'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="55" y="22" class="arg">𝕨</text>
		<text x="145" y="22" class="arg">𝕩</text>
		<path d="M 55 30 C 55 70, 145 70, 145 100" fill="none" />
		<path d="M 145 30 C 145 70, 55 70, 55 100" fill="none" />
		<line x1="55" y1="100" x2="80" y2="130" />
		<line x1="145" y1="100" x2="120" y2="130" />
		<rect x="70" y="130" width="60" height="40" class="op" />
		<text x="100" y="156" class="opname">𝔽</text>
		<line x1="100" y1="170" x2="100" y2="195" class="arrow" />
	</svg>
{:else if glyph === '˙'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="55" y="22" class="arg">𝕨</text>
		<text x="145" y="22" class="arg">𝕩</text>
		<line x1="55" y1="30" x2="55" y2="115" class="dim" />
		<line x1="145" y1="30" x2="145" y2="115" class="dim" />
		<text x="100" y="80" class="note">ignored</text>
		<rect x="70" y="120" width="60" height="40" class="op" />
		<text x="100" y="146" class="opname">𝕗</text>
		<line x1="100" y1="160" x2="100" y2="195" class="arrow" />
	</svg>
{:else if glyph === '¨'}
	<svg class="diagram" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
		{@render head()}
		<text x="100" y="22" class="arg">𝕩 (a list)</text>
		<line x1="60" y1="32" x2="60" y2="80" />
		<line x1="100" y1="32" x2="100" y2="80" />
		<line x1="140" y1="32" x2="140" y2="80" />
		<rect x="40" y="80" width="40" height="34" class="op" />
		<text x="60" y="103" class="opname">𝔽</text>
		<rect x="80" y="80" width="40" height="34" class="op" />
		<text x="100" y="103" class="opname">𝔽</text>
		<rect x="120" y="80" width="40" height="34" class="op" />
		<text x="140" y="103" class="opname">𝔽</text>
		<line x1="60" y1="114" x2="60" y2="155" class="arrow" />
		<line x1="100" y1="114" x2="100" y2="155" class="arrow" />
		<line x1="140" y1="114" x2="140" y2="155" class="arrow" />
		<text x="100" y="190" class="note">→ list of results</text>
	</svg>
{/if}

<style>
	.diagram {
		width: 100%;
		max-width: 14rem;
		display: block;
		margin: 0.25rem auto;
	}
	.diagram :global(line),
	.diagram :global(path) {
		stroke: #8aa3c2;
		stroke-width: 1.5;
		fill: none;
	}
	.diagram :global(.arrow) {
		marker-end: url(#arrowhead);
	}
	.diagram :global(.dim) {
		stroke-dasharray: 3 3;
		opacity: 0.4;
	}
	.diagram :global(rect.op) {
		fill: #1d2f44;
		stroke: #2c4365;
		stroke-width: 1;
		rx: 6;
	}
	.diagram :global(text) {
		font-family: 'BQN386', monospace;
		fill: #e8e8e8;
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.diagram :global(.opname) {
		font-size: 22px;
	}
	.diagram :global(.arg) {
		font-size: 18px;
		fill: #cfcfcf;
	}
	.diagram :global(.note) {
		font-size: 11px;
		fill: #888;
		font-family: system-ui, sans-serif;
	}
</style>
