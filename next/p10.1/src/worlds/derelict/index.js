// The derelict world: a post-industrial, abandoned airport and drowned megacity edge.
// World interface (see DECISIONS.md, "Worlds"):
//   meta                 name, height, chunk width, layers (back to front), how seeds work
//   init(seed)           -> state
//   generate(state, c)   -> elements of chunk c: [{id, layer, depth, x, canv}], back to front
// Every chunk is a pure function of (seed, c): generating chunk 40, then 3, then 40 again gives the
// same strings, so scrolling back reproduces the landscape and no memory cap changes what you see.
import { seedInt, mulberry32, noise2 } from './rng.js';
import { plan, CW } from './planner.js';
import { far } from './far.js';
import { midfar } from './midfar.js';
import { mid } from './mid.js';
import { ground } from './ground.js';
import { near } from './near.js';

const KITS = [far, midfar, mid, ground, near];

export const meta = {
  name: 'derelict',
  height: 800 / 1.142,              // same frame as shanshui, so framing and Arch D math are shared
  chunk: CW,
  layers: ['far', 'midfar', 'mid', 'ground', 'near'],   // depth 1 to 5 in the tile's depth channel
  seeds: 'mulberry32(hash(seed, chunk, layer)); planner from seeded noise, chunk-local',
};

export function init(seed) { return { seed: String(seed), s: seedInt(seed) }; }

// element id: unique per (chunk, layer), stable across regenerations
export const elementId = (c, layer) => c * 8 + layer + 1;

export function generate(state, c) {
  const p = plan(state.s, c);
  const out = [];
  for (let k = 0; k < KITS.length; k++) {
    const canv = KITS[k](state.s, p);
    if (canv) out.push({ id: elementId(c, k), layer: meta.layers[k], depth: k + 1, x: p.x0 + CW / 2, y: 0, c, canv, tag: meta.layers[k] });
  }
  return out;
}

// paint order across chunks: back layer first, then left to right
export const paintOrder = (a, b) => a.depth - b.depth || a.c - b.c;

// paper grain for this world: a seeded 512 x 512 texture with upstream's tone (warm, 235 to 255),
// so palettes with paper "tint" or "grain" treat both worlds the same way
export function paperTexture(state) {
  const reso = 512, data = new Uint8ClampedArray(reso * reso * 4);
  const r = mulberry32(state.s ^ 0xBA9E);
  for (let j = 0; j < reso; j++) for (let i = 0; i < reso; i++) {
    // tileable noise: sample a torus
    const n = (noise2(state.s, i * 0.1 % 51.2, j * 0.1 % 51.2) + noise2(state.s ^ 7, i * 0.37 % 51.8, j * 0.37 % 51.8) * 0.5) / 1.5;
    const c = 245 + n * 10 - r() * 20;
    const k = (j * reso + i) * 4;
    data[k] = c; data[k + 1] = c * 0.95; data[k + 2] = c * 0.85; data[k + 3] = 255;
  }
  return { w: reso, h: reso, data };
}
