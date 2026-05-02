// ⌽ reverse: each cell physically arcs over its neighbours from its
// old position to its mirror position on the other end of the row.
//
// Motion is given a fine-grained keyframe array per axis with linear
// easing. This avoids the "midpoint pause" you get with sparse
// keyframes — Motion would otherwise re-ease between each pair, so a
// 3-keyframe array decelerates twice. With ~16 samples computed from
// a smooth function, linear interpolation between them already reads
// as smooth.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const ARC_PEAK = 60;
const SAMPLES = 16;

export const reverse: AnimationFn = async ({ cells, getNode, oldRects, commit }) => {
	await commit();
	const tasks: Promise<unknown>[] = [];
	for (const cell of cells) {
		const node = getNode(cell.id);
		const oldRect = oldRects.get(cell.id);
		if (!node || !oldRect) continue;
		const newRect = node.getBoundingClientRect();
		const dx = oldRect.left - newRect.left;
		const dy = oldRect.top - newRect.top;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

		const xs: number[] = [];
		const ys: number[] = [];
		for (let i = 0; i <= SAMPLES; i++) {
			const t = i / SAMPLES;
			// Cosine half-cycle for x: zero velocity at start and end,
			// max velocity at the midpoint — same shape as ease-in-out.
			const tEase = (1 - Math.cos(Math.PI * t)) / 2;
			xs.push(dx * (1 - tEase));
			ys.push(dy * (1 - t) - ARC_PEAK * Math.sin(Math.PI * t));
		}

		const a = animate(node, { x: xs, y: ys }, { duration: 0.85, ease: 'linear' });
		tasks.push(a.finished);
	}
	await Promise.all(tasks);
};
