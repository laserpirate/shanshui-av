// Planner: what goes where, per chunk, from the seed alone (the role of upstream's planmtx, but
// chunk-local: plan(c) reads only hashes and noise at c and its neighbours, never a running state).
//   density   0..1 smooth field along the scroll: quiet stretches (open flooded runway, haze) between
//             dense passages
//   passage   the kind of dense passage this chunk belongs to (runs of 5 to 9 chunks)
//   landmarks rare recurring pieces, at most one per slot, with minimum spacing by construction
import { hash01, fbm1 } from './rng.js';

export const CW = 512;                      // chunk width, world px (= tile width)
export const Y = {                          // the vertical grammar, world px (frame is 700.5 tall)
  horizon: 420,                             // far base, seawall
  midfar: 464,                              // terminal halls, hangars, tank farms
  mid: 516,                                 // landmarks
  apron: 548,                               // apron, fence, carts, stilt houses
  runway0: 592, runway1: 632,               // runway band
  pipes: 668,                               // pipes and ducts
  bottom: 700.5,
};

export const PASSAGES = ['terminal', 'tanks', 'kampung', 'hangars', 'port'];

// slot landmarks: in each run of `slot` chunks there is at most one, at a hashed offset kept
// `edge` chunks away from both slot ends, so two of a kind are always at least 2 * edge apart
const LANDMARKS = [
  { type: 'tower', id: 11, slot: 23, edge: 4, prob: 0.92 },
  { type: 'airliner', id: 12, slot: 13, edge: 2, prob: 0.8 },
  { type: 'parking', id: 13, slot: 17, edge: 3, prob: 0.7 },
  { type: 'radar', id: 14, slot: 9, edge: 1, prob: 0.6 },
];

function slotHit(s, lm, c) {
  const k = Math.floor(c / lm.slot);
  if (hash01(s, lm.id + 100, k) >= lm.prob) return null;
  const off = lm.edge + Math.floor(hash01(s, lm.id, k) * (lm.slot - 2 * lm.edge));
  if (c !== k * lm.slot + off) return null;
  return { type: lm.type, u: 0.2 + 0.6 * hash01(s, lm.id + 200, k), v: hash01(s, lm.id + 300, k) };
}

export function density(s, c) {
  const d = fbm1(s ^ 0xD15E, c * 0.105, 3);
  return Math.max(0, Math.min(1, (d - 0.3) / 0.42));
}
export function passageOf(s, c) {
  const shift = Math.floor(hash01(s, 71) * 7);
  const k = Math.floor((c + shift) / 7);
  return PASSAGES[Math.floor(hash01(s, 72, k) * PASSAGES.length)];
}

const cache = new Map();
export function plan(s, c) {
  const key = s + ':' + c;
  let p = cache.get(key);
  if (p) return p;
  const dens = density(s, c);
  const quiet = dens < 0.22;
  const passage = quiet ? 'open' : passageOf(s, c);
  // landmarks, higher in the list wins over its neighbours (one landmark per three chunks)
  const landmarks = [];
  for (const lm of LANDMARKS) {
    const hit = slotHit(s, lm, c);
    if (!hit) continue;
    let blocked = false;
    for (const hi of LANDMARKS) {
      if (hi === lm) break;
      for (let d = -1; d <= 1 && !blocked; d++) if (slotHit(s, hi, c + d)) blocked = true;
    }
    if (!blocked) landmarks.push(hit);
  }
  // radar dishes only away from quiet stretches
  p = { c, x0: c * CW, x1: (c + 1) * CW, dens, quiet, passage, landmarks: landmarks.filter(l => l.type !== 'radar' || !quiet) };
  cache.set(key, p);
  if (cache.size > 4000) cache.delete(cache.keys().next().value);
  return p;
}
