// Seeded RNG (mulberry32) + helpers. Deterministic per ?seed=N so screenshots
// and self-tests reproduce exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// Shortest signed angle difference in degrees, in (-180, 180].
export function angDiff(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return d;
}
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;
