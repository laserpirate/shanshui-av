// Seeds for the derelict world. Nothing here keeps state between chunks: every draw comes from
// mulberry32(hash(seed, chunk, stream)), and every field is a pure function of (seed, x), so any
// chunk regenerates identically whatever order chunks are made in.

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// string seed -> 32 bit (FNV-1a, then a final avalanche)
export function seedInt(s) {
  let h = 0x811C9DC5;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return fmix(h);
}
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
}
// hash(seed, a, b, ...) -> 32 bit
export function hash(seed, ...ns) {
  let h = seed >>> 0;
  for (const n of ns) h = fmix(h ^ Math.imul((n | 0) + 0x9E3779B9, 0x27D4EB2D));
  return h;
}
// hash -> [0, 1)
export const hash01 = (seed, ...ns) => hash(seed, ...ns) / 4294967296;
// a fresh generator for one chunk and one stream (layer), so a change in one kit never shifts another
export const rngFor = (seed, chunk, stream) => mulberry32(hash(seed, chunk, stream));

// 1D value noise in [0, 1], smooth, lattice spacing 1
export function noise1(seed, x) {
  const i = Math.floor(x), f = x - i;
  const a = hash01(seed, i), b = hash01(seed, i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
export function fbm1(seed, x, oct = 3) {
  let s = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { s += amp * noise1(seed + o * 1013, x); tot += amp; x *= 2.03; amp *= 0.5; }
  return s / tot;
}
// 2D value noise in [0, 1]
export function noise2(seed, x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash01(seed, i, j), b = hash01(seed, i + 1, j), c = hash01(seed, i, j + 1), d = hash01(seed, i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
