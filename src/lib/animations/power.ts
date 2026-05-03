// ⋆⟜N power: a literal multiplication chain. The player has to *see*
// power = repeated self-multiplication, so the bar duplicates into N
// copies side by side, × symbols drop between every pair, the player
// reads "x × x × x" for a beat, and then the chain collapses
// left-to-right — each merge multiplies the running product into the
// leftmost bar, which leaps up one power level.
//
// Square (⋆⟜2): 2 bars, 1 ×, 1 merge. Cube (⋆⟜3): 3 bars, 2 ×s, 2
// merges. Fourth (⋆⟜4): 4 bars, 3 ×s, 3 merges. The merge count is
// the whole point — one leap per multiplication.
//
// Two paths share this animation:
//   - Scalar: ValueViz renders one bar inside .cell.now .viz. Clones
//     are position: fixed in viewport coords, extending right of the
//     source bar. Source bar stays put.
//   - Row: each cell is a wrap > bar in AnimatedRow. Going horizontal
//     would overlap neighbours, so per-cell we go vertical: ghosts
//     stack ABOVE the source bar, × badges between, top-to-bottom
//     collapse with the source absorbing each clone in turn.

import { animate } from 'motion';
import type { AnimationFn } from './types';

const BAR_WIDTH = 30;
const CLONE_GAP = 14; // px between bars in the scalar chain
const ROW_VERTICAL_STEP = 16; // px between stacked ghosts in the row case
const SETUP_HOLD_MS = 700;
const FINAL_HOLD_MS = 320;

const formatNum = (n: number) =>
	Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PILL_BASE: Record<string, string> = {
	background: '#5fcc5f',
	color: '#0a0a0a',
	borderRadius: '12px',
	fontFamily: "'BQN386', ui-monospace, monospace",
	fontWeight: '700',
	lineHeight: '1',
	zIndex: '15',
	pointerEvents: 'none',
	boxShadow: '0 0 12px rgba(95, 204, 95, 0.55)',
	whiteSpace: 'nowrap'
};

export function power(exponent: number): AnimationFn {
	return async (ctx) => {
		if (exponent < 2) {
			await ctx.commit();
			return;
		}
		if (ctx.cells.length === 0) {
			await powerScalar(exponent, ctx.commit);
		} else {
			await powerRow(exponent, ctx);
		}
	};
}

// ───────────────────────────── scalar ─────────────────────────────

async function powerScalar(N: number, commit: () => Promise<unknown>) {
	const viz = document.querySelector(
		'.cell.now .viz'
	) as HTMLElement | null;
	const source = viz?.querySelector(':scope > .bar') as HTMLElement | null;
	if (!viz || !source) {
		await commit();
		return;
	}
	const num = source.querySelector('.num') as HTMLElement | null;
	const x = parseFloat(num?.textContent ?? '');
	if (isNaN(x)) {
		await commit();
		return;
	}

	// Heights for every intermediate power, kept under the same vizMax
	// so the leaps stay in scale across the whole animation.
	const visualMax = Math.max(
		...Array.from({ length: N }, (_, k) => Math.abs(x ** (k + 1))),
		4
	);
	const valToH = (v: number) =>
		Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

	source.style.height = `${valToH(x)}px`;
	void document.body.offsetHeight;

	const sRect = source.getBoundingClientRect();
	const STEP = BAR_WIDTH + CLONE_GAP;

	// Phase 1: clones materialize to the right of the source.
	const clones: HTMLElement[] = [];
	for (let k = 1; k < N; k++) {
		const clone = source.cloneNode(true) as HTMLElement;
		const left = sRect.right + CLONE_GAP + (k - 1) * STEP;
		Object.assign(clone.style, {
			position: 'fixed',
			left: `${left}px`,
			top: `${sRect.top}px`,
			width: `${sRect.width}px`,
			height: `${valToH(x)}px`,
			margin: '0',
			opacity: '0',
			transform: 'scale(0.5)',
			pointerEvents: 'none',
			zIndex: '15'
		});
		const cloneNum = clone.querySelector('.num') as HTMLElement | null;
		if (cloneNum) cloneNum.textContent = formatNum(x);
		document.body.appendChild(clone);
		clones.push(clone);
	}
	await Promise.all(
		clones.map((c, i) =>
			animate(
				c,
				{ opacity: [0, 1], scale: [0.5, 1.1, 1] },
				{ duration: 0.36, delay: i * 0.09, ease: [0.34, 1.56, 0.64, 1] }
			).finished
		)
	);

	// Phase 2: × badges drop between consecutive bars.
	const allBars = [source, ...clones];
	const opBadges: HTMLElement[] = [];
	for (let k = 0; k < N - 1; k++) {
		const a = allBars[k].getBoundingClientRect();
		const b = allBars[k + 1].getBoundingClientRect();
		const midX = (a.right + b.left) / 2;
		const midY = a.top + a.height / 2;
		const badge = document.createElement('div');
		badge.textContent = '×';
		Object.assign(badge.style, PILL_BASE, {
			position: 'fixed',
			left: `${midX}px`,
			top: `${midY}px`,
			width: '24px',
			height: '24px',
			display: 'grid',
			placeItems: 'center',
			fontSize: '1.05rem',
			transform: 'translate(-50%, -50%) scale(0)',
			opacity: '0'
		});
		document.body.appendChild(badge);
		opBadges.push(badge);
	}
	await Promise.all(
		opBadges.map((b, i) =>
			animate(
				b,
				{
					opacity: [0, 1],
					transform: [
						'translate(-50%, -50%) scale(0)',
						'translate(-50%, -50%) scale(1.25)',
						'translate(-50%, -50%) scale(1)'
					]
				},
				{ duration: 0.32, delay: i * 0.06, ease: [0.34, 1.56, 0.64, 1] }
			).finished
		)
	);

	// Phase 3: hold so the player reads the chain.
	await delay(SETUP_HOLD_MS);

	// Phase 4: sequential collapse left-to-right.
	let acc = x;
	for (let step = 0; step < N - 1; step++) {
		const newAcc = acc * x;
		const fromH = valToH(acc);
		const toH = valToH(newAcc);

		const tasks: Promise<unknown>[] = [];

		// × pulse-then-fade.
		const opBadge = opBadges[step];
		if (opBadge) {
			tasks.push(
				animate(
					opBadge,
					{
						opacity: [1, 1, 0],
						transform: [
							'translate(-50%, -50%) scale(1)',
							'translate(-50%, -50%) scale(1.5)',
							'translate(-50%, -50%) scale(0.5)'
						]
					},
					{ duration: 0.5, ease: [0.5, 0, 0.7, 1] }
				).finished
			);
		}

		// The right clone slides into the source bar's position and fades.
		const rightClone = clones[step];
		if (rightClone) {
			const cRect = rightClone.getBoundingClientRect();
			const dx = sRect.left - cRect.left;
			tasks.push(
				animate(
					rightClone,
					{ x: dx, opacity: [1, 0], scale: [1, 0.4] },
					{ duration: 0.5, ease: [0.5, 0, 0.7, 1] }
				).finished
			);
		}

		// Source bar height leaps; .num snaps mid-animation.
		setTimeout(() => {
			if (num) num.textContent = formatNum(newAcc);
		}, 280);
		tasks.push(
			animate(
				source,
				{ height: [`${fromH}px`, `${toH}px`] },
				{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }
			).finished
		);

		await Promise.all(tasks);
		acc = newAcc;
		await delay(140);
	}

	await delay(FINAL_HOLD_MS);
	await commit();

	for (const c of clones) c.remove();
	for (const b of opBadges) b.remove();
}

// ────────────────────────────── row ──────────────────────────────

async function powerRow(
	N: number,
	{
		cells,
		getNode,
		commit
	}: { cells: { id: number; value: number | string }[]; getNode: (id: number) => HTMLElement | null; commit: () => Promise<unknown> }
) {
	type Item = {
		wrap: HTMLElement;
		bar: HTMLElement;
		num: HTMLElement | null;
		x: number;
	};
	const items: Item[] = [];
	for (const cell of cells) {
		if (typeof cell.value !== 'number') continue;
		const wrap = getNode(cell.id);
		if (!wrap) continue;
		const bar = wrap.querySelector('.bar') as HTMLElement | null;
		if (!bar) continue;
		const num = bar.querySelector('.num') as HTMLElement | null;
		items.push({ wrap, bar, num, x: cell.value });
	}
	if (items.length === 0) {
		await commit();
		return;
	}

	const visualMax = Math.max(
		...items.flatMap((it) =>
			Array.from({ length: N }, (_, k) => Math.abs(it.x ** (k + 1)))
		),
		4
	);
	const valToH = (v: number) =>
		Math.min(Math.max(v, 0), visualMax) * (60 / visualMax) + 18;

	for (const it of items) {
		it.bar.style.height = `${valToH(it.x)}px`;
	}
	void document.body.offsetHeight;

	// Per cell, build a vertical stack ABOVE the source bar:
	//   ghost[N-2]
	//   × badge
	//   ghost[N-3]
	//   × badge
	//   ...
	//   × badge
	//   source
	// Heights of ghosts = source height (they show x). Stack in viewport
	// coords with position: fixed so .viz width changes don't disturb.
	type Stack = {
		item: Item;
		ghosts: HTMLElement[];
		ops: HTMLElement[];
	};
	const stacks: Stack[] = [];

	for (const it of items) {
		const sRect = it.bar.getBoundingClientRect();
		const ghosts: HTMLElement[] = [];
		const ops: HTMLElement[] = [];

		// Spawn N-1 ghost bars positioned bottom-up above the source.
		// Ghost k (0-indexed) sits at (k+1)-th level from the bottom
		// (level 0 is source). Each ghost's bottom = source.top - k * (sRect.height + ROW_VERTICAL_STEP).
		for (let k = 0; k < N - 1; k++) {
			const ghost = it.bar.cloneNode(true) as HTMLElement;
			const ghostNum = ghost.querySelector('.num') as HTMLElement | null;
			if (ghostNum) ghostNum.textContent = formatNum(it.x);
			const ghostBottom =
				sRect.top - ROW_VERTICAL_STEP - k * (sRect.height + ROW_VERTICAL_STEP);
			Object.assign(ghost.style, {
				position: 'fixed',
				left: `${sRect.left}px`,
				top: `${ghostBottom - sRect.height}px`,
				width: `${sRect.width}px`,
				height: `${sRect.height}px`,
				margin: '0',
				opacity: '0',
				transform: 'scale(0.6)',
				pointerEvents: 'none',
				zIndex: '14'
			});
			document.body.appendChild(ghost);
			ghosts.push(ghost);

			// × badge sits between ghost[k] and the bar/ghost below it.
			const badge = document.createElement('div');
			badge.textContent = '×';
			const opY =
				k === 0
					? sRect.top - ROW_VERTICAL_STEP / 2
					: sRect.top -
						k * (sRect.height + ROW_VERTICAL_STEP) -
						ROW_VERTICAL_STEP / 2;
			Object.assign(badge.style, PILL_BASE, {
				position: 'fixed',
				left: `${sRect.left + sRect.width / 2}px`,
				top: `${opY}px`,
				width: '20px',
				height: '20px',
				display: 'grid',
				placeItems: 'center',
				fontSize: '0.85rem',
				transform: 'translate(-50%, -50%) scale(0)',
				opacity: '0'
			});
			document.body.appendChild(badge);
			ops.push(badge);
		}
		stacks.push({ item: it, ghosts, ops });
	}

	// Phase 1: ghosts and ×s fade in together (per stack, with stagger
	// so each cell builds its own chain visibly).
	const setupTasks: Promise<unknown>[] = [];
	for (const s of stacks) {
		for (let k = 0; k < s.ghosts.length; k++) {
			setupTasks.push(
				animate(
					s.ghosts[k],
					{ opacity: [0, 1], scale: [0.6, 1.05, 1] },
					{ duration: 0.32, delay: k * 0.08, ease: [0.34, 1.56, 0.64, 1] }
				).finished
			);
			setupTasks.push(
				animate(
					s.ops[k],
					{
						opacity: [0, 1],
						transform: [
							'translate(-50%, -50%) scale(0)',
							'translate(-50%, -50%) scale(1.25)',
							'translate(-50%, -50%) scale(1)'
						]
					},
					{ duration: 0.28, delay: k * 0.08 + 0.04 }
				).finished
			);
		}
	}
	await Promise.all(setupTasks);
	await delay(SETUP_HOLD_MS);

	// Phase 2: top-down collapse per stack (in parallel across cells).
	// Each step: topmost remaining ghost falls into the bar/ghost below
	// it, × pulses-and-fades, source bar leaps up one power.
	for (let step = 0; step < N - 1; step++) {
		const stepTasks: Promise<unknown>[] = [];
		for (const s of stacks) {
			const ghostIdx = s.ghosts.length - 1 - step;
			const opIdx = s.ghosts.length - 1 - step;
			const ghost = s.ghosts[ghostIdx];
			const op = s.ops[opIdx];
			const it = s.item;

			const fromH = valToH(it.x ** (step + 1));
			const toH = valToH(it.x ** (step + 2));

			// × pulses then fades.
			if (op) {
				stepTasks.push(
					animate(
						op,
						{
							opacity: [1, 1, 0],
							transform: [
								'translate(-50%, -50%) scale(1)',
								'translate(-50%, -50%) scale(1.5)',
								'translate(-50%, -50%) scale(0.5)'
							]
						},
						{ duration: 0.5, ease: [0.5, 0, 0.7, 1] }
					).finished
				);
			}

			// Topmost ghost slides DOWN into the bar (source) and fades.
			if (ghost) {
				const gRect = ghost.getBoundingClientRect();
				const bRect = it.bar.getBoundingClientRect();
				const dy = bRect.top - gRect.top;
				stepTasks.push(
					animate(
						ghost,
						{ y: dy, opacity: [1, 0], scale: [1, 0.4] },
						{ duration: 0.5, ease: [0.5, 0, 0.7, 1] }
					).finished
				);
			}

			// Source bar leaps; .num snaps mid-animation.
			setTimeout(() => {
				if (it.num) it.num.textContent = formatNum(it.x ** (step + 2));
			}, 280);
			stepTasks.push(
				animate(
					it.bar,
					{ height: [`${fromH}px`, `${toH}px`] },
					{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }
				).finished
			);
		}
		await Promise.all(stepTasks);
		await delay(120);
	}

	await delay(FINAL_HOLD_MS);
	await commit();

	for (const s of stacks) {
		for (const g of s.ghosts) g.remove();
		for (const o of s.ops) o.remove();
	}
}
