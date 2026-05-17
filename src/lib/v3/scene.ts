// v3 scene model — the single source of truth for what's on screen.
//
// Mirrors BQN's actual type system (atom vs array of any rank), not the
// visual categories (scalar / vec / mat / box) those map onto. A boxed
// value is just a rank-0 array; a higher-rank array is the same type as
// a vec with a longer shape. Visual rendering decides how each gets
// drawn; the type system says only what the value IS.

/** SVG-coordinate rectangle defining the scene's coordinate space. */
export type ViewBox = {
	x: number;
	y: number;
	w: number;
	h: number;
};

/**
 * The atom values BQN supports as scalar contents. Numbers for now;
 * characters and strings widen this union when they land. The widening
 * is a deliberate type-only change with no structural fallout.
 */
export type AtomValue = number;

/**
 * A drawable cell.
 *
 * Geometry (`id`, `x`, `y`, `w`, `h`) is always present. The content is
 * either an atom (when `inner === null`) or a nested Scene (when
 * `inner !== null`). When `inner` is non-null, `value` is unused — the
 * renderer draws `inner` recursively. The `id` is stable across the
 * snapshots of a primitive / step so cell-to-cell correspondence is
 * unambiguous during tweens.
 */
export type Cell = {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	value: AtomValue;
	inner: Scene | null;
};

/**
 * Scene = the visual state of one BQN value at a moment in time.
 *
 *   atom  — a bare atom (BQN number / char). `atom.inner` MUST be null.
 *   array — a BQN array of any rank. `shape.length === rank` and
 *           `product(shape) === cells.length`. Each cell is either an
 *           atom (inner null) or a nested array (inner non-null).
 *
 * Both variants carry a `viewBox` in SVG coordinate space.
 */
export type Scene =
	| { kind: 'atom'; viewBox: ViewBox; atom: Cell }
	| {
			kind: 'array';
			viewBox: ViewBox;
			shape: readonly number[];
			cells: Cell[];
			/** Degrees the whole scene is rotated (around the cells' bbox
			 *  centre at render time). Default 0. */
			rotation: number;
	  };

/** Exhaustiveness helper for `switch (scene.kind)` dispatch. */
export function assertNever(x: never): never {
	throw new Error(`unhandled Scene variant: ${JSON.stringify(x)}`);
}
