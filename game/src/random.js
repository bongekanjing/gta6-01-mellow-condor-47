// A tiny deterministic generator, so the same seed builds the same city and the same traffic on
// every run: the entry's two runs must write the same bytes, and the screenshots must be repeatable.

/**
 * mulberry32: a 32-bit generator with a full 2^32 period, small and fast enough to seed the whole
 * city from one number.
 */
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded generator with the helpers the city builder asks for most. */
export function makeRng(seed) {
  const next = makeRandom(seed);
  return {
    next,
    /** A float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** A whole number in [min, max]. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** One element of a list. */
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}

/** Clamps v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** The length of a 2D vector. */
export function length(x, y) {
  return Math.hypot(x, y);
}

/** Normalises a 2D vector, returning a zero vector when it has no length. */
export function normalize(x, y) {
  const len = Math.hypot(x, y);
  return len > 1e-6 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

/** The shortest signed difference between two angles, in [-PI, PI]. */
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Moves an angle toward a target angle by at most maxStep radians. */
export function turnToward(from, to, maxStep) {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
