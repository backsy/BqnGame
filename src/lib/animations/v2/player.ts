import type { BqnValue } from './value.js';
import { assertNever } from './value.js';
import type { Step } from './step.js';
import type { Trajectory } from './trajectory.js';
import type { Stage } from './stage.js';
import { animateStep } from './animate.js';

export function resultOf(step: Step): BqnValue {
	switch (step.kind) {
		case 'monadic': return step.result;
		case 'dyadic':  return step.result;
		case 'access':  return step.result;
		case 'assign':  return step.value;
		default:        return assertNever(step);
	}
}

export async function play(t: Trajectory, stage: Stage): Promise<void> {
	for (const step of t.steps) {
		const beforeRoot = stage.current;
		const afterValue = resultOf(step);
		const afterRoot = await stage.prepare(afterValue);
		await animateStep(step)(step, beforeRoot, afterRoot);
		stage.commit(afterRoot);
	}
}
