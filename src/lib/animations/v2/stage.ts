import type { BqnValue } from './value.js';
import type { Step } from './step.js';

// HTMLElement is a TS lib type — not a browser-runtime import (Rule I).
// Implementations of Stage live outside v2/ in later phases.

export type Stage = {
	readonly current: HTMLElement;
	prepare(value: BqnValue): Promise<HTMLElement>;
	commit(prepared: HTMLElement): void;
};

export type AnimateStep = (
	step: Step,
	beforeRoot: HTMLElement,
	afterRoot: HTMLElement
) => Promise<void>;
