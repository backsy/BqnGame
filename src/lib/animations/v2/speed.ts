// Animation speed multiplier — affects every motion that opts in via
// scaled() / scaledMs(). 1 = normal speed, 2 = twice as fast (durations
// halved), 0.5 = half speed (durations doubled).

let multiplier = 1;

export function getAnimationSpeed(): number {
	return multiplier;
}

export function setAnimationSpeed(value: number): void {
	if (!Number.isFinite(value) || value <= 0) return;
	multiplier = value;
}

/** Scale a base duration (seconds) by the current speed multiplier. */
export function scaled(seconds: number): number {
	return seconds / multiplier;
}

/** Scale a base delay (milliseconds) by the current speed multiplier. */
export function scaledMs(ms: number): number {
	return ms / multiplier;
}
