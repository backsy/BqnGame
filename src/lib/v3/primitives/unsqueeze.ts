// unsqueeze primitive — tear down the stage by RE-LAYING OUT FROM DATA.
//
// Spec (paraphrased from user):
//   "No data should carry over so unsqueeze can figure out from data
//    what it should be. Squeeze normalizes centers so rotate is always
//    clean. Unsqueeze denormalizes — pure function of the data it sees."
//
// Mechanism:
//   1) Walk the current Scene in VISUAL order at each level, reading
//      each cell's value (atoms) and recursing into wrappers. This
//      yields a `BqnStructuredValue` — the reconstructed BQN value at
//      its currently-displayed positions. If `rotate` permuted top-level
//      cells, the reconstruction reflects that permutation.
//   2) Call `bqnValueToScene` on the reconstructed value — fresh,
//      canonical layout for whatever value the Scene now represents.
//      The new Scene's cells sit where `bqnValueToScene` would put them
//      from scratch; row baselines, cell heights, frames, all recomputed
//      from the data. No information from squeeze leaks through.
//   3) Overlay the IDs from the squeezed Scene (visited in visual order
//      at every level) onto the fresh layout's cells (visited in source
//      order). This keeps the tween a smooth lerp between adjacent
//      snapshots — the cell visually at the top of the squeezed Scene
//      remains the cell at the top of the fresh layout, so its `<g>`
//      element interpolates positions / sizes rather than disappearing.

import { bqnValueToScene, sceneToBqnValue } from '../layout';
import type { Cell, Scene } from '../scene';
import type { Primitive, PrimitiveResult } from './index';

export type UnsqueezeParams = Record<string, never>;

// IdTree mirrors the Scene's cell tree but holds only stable cell ids.
// The list at each level is in VISUAL order (the same order
// `sceneToBqnValue` reads cells in), so it lines up element-for-element
// with the source-order cells of the freshly-laid-out Scene built from
// the same reconstructed value.
type IdNode = { id: string; children: IdNode[] };

function collectVisualIds(scene: Scene): IdNode[] {
	if (scene.kind === 'atom') {
		return [{ id: scene.atom.id, children: [] }];
	}
	let sorted: Cell[];
	if (scene.shape.length === 1) {
		sorted = [...scene.cells].sort(
			(a, b) => (a.x + a.w / 2) - (b.x + b.w / 2),
		);
	} else if (scene.shape.length === 2) {
		sorted = [...scene.cells].sort(
			(a, b) => (a.y + a.h / 2) - (b.y + b.h / 2),
		);
	} else {
		sorted = [...scene.cells];
	}
	return sorted.map((c) => ({
		id: c.id,
		children: c.inner === null ? [] : collectVisualIds(c.inner),
	}));
}

function applyIds(scene: Scene, ids: IdNode[]): Scene {
	if (scene.kind === 'atom') {
		return { ...scene, atom: { ...scene.atom, id: ids[0].id } };
	}
	const newCells = scene.cells.map((c, i) => {
		const node = ids[i];
		return {
			...c,
			id: node.id,
			inner: c.inner === null ? null : applyIds(c.inner, node.children),
		};
	});
	return { ...scene, cells: newCells };
}

export const unsqueeze: Primitive<UnsqueezeParams> = (
	fromScene,
): PrimitiveResult => {
	const value = sceneToBqnValue(fromScene);
	const fresh = bqnValueToScene(value, fromScene.viewBox);
	const visualIds = collectVisualIds(fromScene);
	const to = applyIds(fresh, visualIds);
	return { snapshots: [fromScene, to], toScene: to };
};
