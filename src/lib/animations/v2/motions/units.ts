// Shared visual units and timings for motions.
//
// UNIT_SIZE — the side length (px) of the unit square cell. Cells shrink
// down to this dimension during transitions so that geometric operations
// (rotation around centre, etc.) behave uniformly regardless of the
// individual values being represented.
export const UNIT_SIZE = 24;

// Default durations (seconds) for the generic primitives. Each is the
// natural time for that beat in any motion that uses it.
export const SHRINK_DURATION = 0.3;
export const STRETCH_DURATION = 0.3;
export const ROTATE_DURATION = 0.85;
