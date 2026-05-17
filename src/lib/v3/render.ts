// v3 render helpers.
//
// The harness uses a recursive SceneNode.svelte component to walk the
// Scene tree directly — no flat flatten pass. This module just exposes
// shared utilities: the rank colour palette, atom-label formatting.

// ── Rainbow palette indexed by rank (cool → warm) ──────────────────────────
export const RANK_RGB: ReadonlyArray<string> = [
	'168, 156, 247', // 0 — unit (lavender)
	'90, 156, 247',  // 1 — list (blue)
	'106, 247, 216', // 2 — table (cyan)
	'95, 204, 95',   // 3 — green
	'247, 225, 106', // 4 — yellow
	'247, 168, 106', // 5 — orange
	'247, 106, 106', // 6+ — red (clamp)
];

export function rankRgb(rank: number): string {
	return RANK_RGB[Math.max(0, Math.min(rank, RANK_RGB.length - 1))];
}

// ── formatAtomLabel ──────────────────────────────────────────────────────
// Display an atom value as BQN-form text.
//   • integers → `3`, `¯3`
//   • non-integers → reduced fraction `n/d` (e.g. 0.5 → `1/2`, ¯0.333 → `¯1/3`)
//   • non-finite values (Infinity, NaN) → their JS string
// Non-integers that can't be matched to a fraction within a small
// denominator fall back to the decimal string — covers irrationals etc.

function gcd(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b !== 0) {
		const t = b;
		b = a % b;
		a = t;
	}
	return a;
}

const FRACTION_MAX_DENOM = 100;
const FRACTION_TOL = 1e-10;

export function formatAtomLabel(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	if (Number.isInteger(value)) {
		return value < 0 ? '¯' + (-value) : String(value);
	}
	const sign = value < 0 ? '¯' : '';
	const abs = Math.abs(value);
	for (let d = 1; d <= FRACTION_MAX_DENOM; d++) {
		const n = Math.round(abs * d);
		if (n > 0 && Math.abs(abs - n / d) < FRACTION_TOL) {
			const g = gcd(n, d);
			return sign + (n / g) + '/' + (d / g);
		}
	}
	return sign + abs.toString();
}
