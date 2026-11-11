// The nashua world: the last reach of the Nashua River (Jackson Mills dam to 300 m into the Merrimack) unrolled
// as a section scroll, seen from the river toward one bank, drawn in ink from the data pack.
// World interface (see DECISIONS.md, "Worlds"):
//   meta                     name, height, chunk width, layers, how seeds work
//   init(seed, opts, pack)   -> state   opts: {bank: 'L' | 'R', ve: 1..20}
//   generate(state, c)       -> elements of chunk c: [{id, layer, depth, x, canv, c}], back to front
// Every chunk is a pure function of (pack, chunk, seed, bank, ve). Ink jitter, texture strokes and trees come from
// hashes of (seed, global grid index), never from a running generator, so chunks join exactly and regenerate the same.
// Nothing is placed from the engine's random defaults: no pavilions, towers, boats or invented buildings.
//   depth 1 far      the wide DEM ridges (700 to 1500 m and 1500 to 3000 m from the water edge)
//   depth 2 midfar   bands 300 to 700 m and 120 to 300 m, with their buildings
//   depth 3 mid      band 40 to 120 m, buildings, trees from canopy
//   depth 4 ground   band 0 to 40 m (the bank), buildings, trees, the lot
//   depth 5 near     the bed in section, bridges in section, the dam, pipes at the water line
import { G, PAPER, NONE, pl, lamp, L as LK, brush } from '../derelict/ink.js';
import { seedInt, hash01, mulberry32, hash, noise1, noise2 } from '../derelict/rng.js';
import { HX, YW, VE_DEF, VE_MIN, VE_MAX, xOf, sOf, at, reachW } from './pack.js';

export const CW = 512;
export const meta = {
  name: 'nashua',
  height: 800 / 1.142,
  chunk: CW,
  layers: ['far', 'midfar', 'mid', 'ground', 'near'],
  seeds: 'data pack + hash(seed, layer, global grid index); bank and vertical exaggeration are part of the state',
};
const BOTTOM = 712;

export function init(seed, opts = {}, pack) {
  const bank = opts.bank === 'R' ? 'R' : 'L';
  const ve = Math.max(VE_MIN, Math.min(VE_MAX, +opts.ve || VE_DEF));
  return { seed: String(seed), s: seedInt(seed), bank, side: bank === 'L' ? 1 : -1, ve, VY: HX * ve, pack, W: reachW(pack) };
}
// one element per (chunk, depth layer, piece); pieces keep their order inside a layer, so tiles are unchanged
export const elementId = (c, layer, sub = 0) => c * 64 + layer * 12 + sub + 1;
export const paintOrder = (a, b) => a.depth - b.depth || a.c - b.c || (a.sub || 0) - (b.sub || 0);
// the mode layers (modes json) each piece belongs to
export const MODE_LAYERS = ['terrain', 'water', 'trees', 'landmarks', 'buildings', 'hardscape', 'infrastructure', 'cso', 'interventions', 'walk', 'kodama', 'sections'];

const f1 = v => Math.round(v * 10) / 10;
// band name -> world y at x
function yOf(st, name, x) {
  const s = Math.max(0, Math.min(st.pack.route_len_m, sOf(st.pack, x, st.bank)));
  return YW - at(st.pack, name + '_' + st.bank, s) * st.VY;
}
const sAt = (st, x) => Math.max(0, Math.min(st.pack.route_len_m, sOf(st.pack, x, st.bank)));

// a skyline polyline over [xa, xb], step 4 px, with a hand tremor that is a pure function of x
function skyline(st, name, xa, xb, amp, k) {
  const pts = [];
  const n = Math.max(1, Math.ceil((xb - xa) / 4));
  for (let i = 0; i <= n; i++) {
    const x = xa + (xb - xa) * i / n;
    const tr = (noise1(st.s ^ (0x51 + k), x / 23) - 0.5) * 2 * amp + (noise1(st.s ^ (0x77 + k), x / 7) - 0.5) * amp * 0.5;
    pts.push([x, yOf(st, name, x) + tr]);
  }
  return pts;
}

// one terrain band: paper fill (it hides what is behind), ridge line, texture strokes down the slope, mist at the foot
// value before hue: each band is a wash one step darker than the band behind it (far pale, near dark), so the
// bands separate by value alone; the mist at each foot lifts it back toward paper
const BAND = [
  // name, fill grey, ridge grey, ridge width, stroke grey, stroke alpha, spacing px, stroke length px, tremor, mist
  { name: 'far1', f: 236, g: 200, w: 0.7, sg: 210, sa: 0.3, sp: 18, len: 22, amp: 1.2, mist: 1 },
  { name: 'far0', f: 226, g: 180, w: 0.8, sg: 190, sa: 0.35, sp: 15, len: 26, amp: 1.4, mist: 1 },
  { name: 'band3', f: 214, g: 150, w: 0.9, sg: 160, sa: 0.4, sp: 13, len: 28, amp: 1.5, mist: 0.9 },
  { name: 'band2', f: 201, g: 118, w: 1.1, sg: 130, sa: 0.45, sp: 12, len: 30, amp: 1.6, mist: 0.8 },
  { name: 'band1', f: 188, g: 80, w: 1.4, sg: 95, sa: 0.5, sp: 11, len: 30, amp: 1.7, mist: 0.6 },
  { name: 'band0', f: 174, g: 38, w: 2.0, sg: 55, sa: 0.55, sp: 10, len: 30, amp: 1.8, mist: 0.45 },
];
export const BAND_FILL = Object.fromEntries(BAND.map(b => [b.name, b.f]));
function band(st, B, k, xa, xb) {
  if (xb <= xa) return '';
  const top = skyline(st, B.name, xa, xb, B.amp, k);
  const base = YW + 3;
  let o = pl([[xa - 0.6, base], [xa - 0.6, top[0][1]], ...top, [xb + 0.6, top[top.length - 1][1]], [xb + 0.6, base]], G(B.f, 1), NONE, 0);
  // texture strokes ("cun"): anchored on a global grid, so a stroke belongs to exactly one chunk
  const k0 = Math.ceil(xa / B.sp), k1 = Math.floor((xb - 1e-6) / B.sp);
  for (let q = k0; q <= k1; q++) {
    const h = hash(st.s, 300 + k, q);
    const r = mulberry32(h);
    if (r() < 0.18) continue;
    const x = q * B.sp + (r() - 0.5) * B.sp * 0.8;
    const y = yOf(st, B.name, x);
    const depth = base - y;
    if (depth < 6) continue;
    const slope = (yOf(st, B.name, x + 6) - yOf(st, B.name, x - 6)) / 12;     // + : falls to the right
    const L = Math.min(depth * 0.85, B.len * (0.35 + r() * 0.9));
    const lean = Math.max(-0.9, Math.min(0.9, slope * 1.6)) + (r() - 0.5) * 0.4;
    const y0 = y + 1.5 + r() * Math.min(10, depth * 0.15);
    const p = [[x, y0], [x + lean * L * 0.45 + (r() - 0.5) * 2, y0 + L * 0.5], [x + lean * L * 0.8, y0 + L]];
    o += brush(p, 0.5 + r() * B.w * 0.7, G(B.sg - r() * 20, B.sa * (0.5 + r() * 0.5)), r, { noi: 0.4 });
  }
  // the ridge, a constant-width line so chunks join without a seam
  o += pl(top, NONE, G(B.g, 0.85), B.w);
  // a second, broken ridge stroke on the near bands: the brush lifting off the paper
  if (k >= 4) {
    const seg = [];
    for (const p of top) {
      const on = noise1(st.s ^ (0x91 + k), p[0] / 37) > 0.42;
      if (on) seg.push([p[0], p[1] + 1.2]);
      else if (seg.length) { if (seg.length > 2) o += pl(seg.splice(0), NONE, G(B.g - 20, 0.6), B.w * 0.7); else seg.length = 0; }
    }
    if (seg.length > 2) o += pl(seg, NONE, G(B.g - 20, 0.6), B.w * 0.7);
  }
  // mist at the foot: stacked translucent paper bands toward the water line
  if (B.mist > 0) for (let i = 0; i < 4; i++) {
    const y = base - (4 - i) * 14 * B.mist - 4;
    o += pl([[xa - 0.6, y], [xb + 0.6, y], [xb + 0.6, base], [xa - 0.6, base]], G(255, 0.13 * B.mist), NONE, 0);
  }
  return o;
}

// trees on a band from the canopy share: global 6 px grid, so 3 m per slot; fixed ink size, not to scale
function trees(st, bandIdx, k, xa, xb, tone, size) {
  let o = '';
  const name = 'band' + bandIdx, cname = 'canopy' + bandIdx + '_' + st.bank;
  const sp = 6;
  for (let q = Math.ceil(xa / sp); q <= Math.floor((xb - 1e-6) / sp); q++) {
    const r = mulberry32(hash(st.s, 500 + bandIdx, q));
    const x = q * sp + (r() - 0.5) * sp;
    const s = sAt(st, x);
    const p = at(st.pack, cname, s) * 0.62;
    if (r() > p) continue;
    const y = yOf(st, name, x) + r() * 6;
    const h = size * (0.6 + r() * 0.7);
    if (r() < 0.3) o += pine(x, y, h, tone, r); else o += leafy(x, y, h, tone, r);
  }
  return o;
}
function leafy(x, y, h, tone, r) {
  let o = '';
  const lean = (r() - 0.5) * h * 0.15;
  o += brush([[x, y], [x + lean * 0.5, y - h * 0.5], [x + lean, y - h * 0.8]], 1 + h * 0.03, G(tone, 0.85), r, { noi: 0.3 });
  const cx = x + lean, cy = y - h * 0.72, rx = h * (0.28 + r() * 0.12), ry = h * (0.3 + r() * 0.1);
  const crown = [];
  for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2, rr = 0.8 + r() * 0.35; crown.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]); }
  o += pl(crown, G(250, 1), G(tone + 30, 0.5), 0.5);
  const n = 6 + (r() * 8 | 0);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()), px = cx + Math.cos(a) * rx * d * 0.85, py = cy + Math.sin(a) * ry * d * 0.85, l = 1.5 + r() * 3;
    o += pl([[px - l, py + l * 0.3], [px, py - 0.4], [px + l, py + l * 0.3]], NONE, G(tone + r() * 30, 0.7), 0.9 + r() * 0.6);
  }
  return o;
}
function pine(x, y, h, tone, r) {
  let o = brush([[x, y], [x, y - h]], 1 + h * 0.025, G(tone, 0.85), r, { noi: 0.2, taper: false });
  const tiers = 4 + (r() * 3 | 0);
  for (let i = 0; i < tiers; i++) {
    const t = 0.25 + i / tiers * 0.72, yy = y - h * t, w = h * 0.32 * (1 - t * 0.7) * (0.8 + r() * 0.4);
    o += pl([[x - w, yy + w * 0.25], [x - w * 0.3, yy - 0.5], [x, yy - 1.5], [x + w * 0.3, yy - 0.5], [x + w, yy + w * 0.25]], G(250, 1), G(tone, 0.75), 1.1);
  }
  return o;
}

// buildings: massing at their base above ws(s), heights x ve; windows as lights by occupancy
const OCC_LIT = [0.3, 0.45, 0.12, 0.35, 0.4, 0.2];
const OCC_KIND = [LK.breathe, LK.steady, LK.flicker, LK.steady, LK.steady, LK.steady];
function buildings(st, bands, x0, x1, tone) {
  let o = '';
  const P = st.pack, VY = st.VY;
  for (const b of P.buildings) {
    if (b[2] !== st.side || !bands.includes(Math.min(3, b[3]))) continue;
    const xm = xOf(P, (b[0] + b[1]) / 2, st.bank);
    if (xm < x0 || xm >= x1) continue;
    let xa = xOf(P, b[0], st.bank), xb = xOf(P, b[1], st.bank);
    if (xa > xb) [xa, xb] = [xb, xa];
    if (xb - xa < 3) { xa = xm - 1.5; xb = xm + 1.5; }
    const base = YW - Math.max(-0.5, b[4]) * VY, top = base - b[5] * VY;
    const r = mulberry32(hash(st.s, 700, Math.round(b[0] * 10), b[2]));
    const tn = tone(b[3]);
    o += pl([[xa, base + 2], [xa, top], [xb, top], [xb, base + 2]], G([226, 234, 241, 246][Math.min(3, b[3])], 1), G(tn, 0.85), b[3] <= 1 ? 1.1 : 0.7);
    o += pl([[xa - 0.8, top], [xb + 0.8, top]], NONE, G(tn - 20, 0.9), b[3] <= 1 ? 1.8 : 1);
    // floors every 3.5 m, windows every 3 m
    const fh = 3.5 * VY, ww = Math.max(2, 3 * HX);
    if (fh >= 8 && xb - xa >= 6) {
      const floors = Math.max(1, Math.floor(b[5] / 3.5));
      const cols = Math.max(1, Math.floor((xb - xa - 2) / ww));
      for (let f = 0; f < floors; f++) {
        const yf = base - (f + 0.55) * fh;
        if (f > 0 && b[3] <= 2) o += pl([[xa + 1, base - f * fh], [xb - 1, base - f * fh]], NONE, G(tn + 40, 0.35), 0.4);
        for (let cI = 0; cI < cols; cI++) {
          const wx = xa + 1 + (cI + 0.5) * (xb - xa - 2) / cols;
          if (b[3] <= 2) o += pl([[wx - 0.8, yf - Math.min(5, fh * 0.2)], [wx + 0.8, yf - Math.min(5, fh * 0.2)], [wx + 0.8, yf + Math.min(5, fh * 0.2)], [wx - 0.8, yf + Math.min(5, fh * 0.2)]], G(tn + 20, 0.55), NONE, 0);
          if (r() < OCC_LIT[b[6]]) o += lamp(wx, yf, b[3] <= 1 ? 1.4 : 1.0, OCC_KIND[b[6]], r(), 0.6 + r() * 0.35);
        }
      }
    }
  }
  return o;
}

// the bed in section below the water: hatched poche, solid line where measured, dashed where estimated
function bed(st, xa, xb) {
  if (xb <= xa) return '';
  const P = st.pack, VY = st.VY;
  const n = Math.max(1, Math.ceil((xb - xa) / 4)), pts = [];
  for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n; pts.push([x, YW - at(P, 'bed', sAt(st, x)) * VY]); }
  let o = pl([[xa - 0.6, BOTTOM], ...pts.map(p => [p[0], p[1]]), [xb + 0.6, BOTTOM]], G(236, 1), NONE, 0);
  // hatch: 45 degree strokes from the bed line down, on a global 7 px grid
  for (let q = Math.ceil(xa / 7); q <= Math.floor((xb - 1e-6) / 7); q++) {
    const x = q * 7, y = YW - at(P, 'bed', sAt(st, x)) * VY + 2, l = BOTTOM - y;
    o += pl([[x, y], [x - l, y + l]], NONE, G(90, 0.55), 0.7);
  }
  // bed line: measured solid, estimated dashed (dash on the global x grid)
  const run = [];
  const flush = (meas) => { if (run.length > 1) o += pl(run.splice(0), NONE, G(25, 0.95), meas ? 2.4 : 1.6); else run.length = 0; };
  let prev = null;
  for (const p of pts) {
    const meas = P.A.bed_measured[Math.max(0, Math.min(P.n - 1, Math.round(sAt(st, p[0]) / P.ds)))] > 0.5;
    const on = meas || ((((p[0] / 16) % 1) + 1) % 1) < 0.62;
    if (prev !== null && (meas !== prev.meas || !on)) flush(prev.meas);
    if (on) run.push(p);
    prev = { meas };
  }
  if (prev) flush(prev.meas);
  return o;
}

// bridges in section where the scroll crosses them: deck, parapets, a pier to the bed (schematic), rail portal
function bridges(st, x0, x1) {
  let o = '';
  const P = st.pack, VY = st.VY;
  for (const b of P.bridges) {
    const x = xOf(P, b.s, st.bank);
    if (x < x0 || x >= x1 || b.deck_h == null) continue;
    const rail = b.kind === 'rail bridge';
    const w = (rail ? 8 : 14) * HX, yd = YW - b.deck_h * VY, th = Math.max(6, 1.2 * VY), yb = YW - at(P, 'bed', b.s) * VY;
    const r = mulberry32(hash(st.s, 900, Math.round(b.s)));
    // pier
    o += pl([[x - 2.5, yd + th], [x - 3.5, yb + 4], [x + 3.5, yb + 4], [x + 2.5, yd + th]], G(150, 1), G(40, 0.9), 0.9);
    // deck slab in section
    o += pl([[x - w / 2, yd], [x + w / 2, yd], [x + w / 2 - 2, yd + th], [x - w / 2 + 2, yd + th], [x - w / 2, yd]], G(55, 1), G(20, 1), 1);
    // parapets 1.1 m
    const ph = Math.max(5, 1.1 * VY);
    o += pl([[x - w / 2 + 1, yd], [x - w / 2 + 1, yd - ph]], NONE, G(30, 0.95), 1.4) + pl([[x + w / 2 - 1, yd], [x + w / 2 - 1, yd - ph]], NONE, G(30, 0.95), 1.4);
    if (rail) {
      const th2 = 6 * VY * 0.5;
      o += pl([[x - w / 2, yd], [x - w / 2, yd - th2], [x + w / 2, yd - th2], [x + w / 2, yd]], NONE, G(35, 0.9), 1.4);
      o += pl([[x - w / 2, yd], [x + w / 2, yd - th2]], NONE, G(60, 0.7), 0.8) + pl([[x + w / 2, yd], [x - w / 2, yd - th2]], NONE, G(60, 0.7), 0.8);
    } else {
      // a lamp post on the parapet
      o += pl([[x + w / 2 - 1, yd - ph], [x + w / 2 - 1, yd - ph - 14]], NONE, G(40, 0.9), 0.8);
      o += lamp(x + w / 2 - 1, yd - ph - 15, 1.6, LK.steady, r(), 0.9);
    }
  }
  return o;
}

// Jackson Mills dam at s = 0: headpond held by the crest gate, ogee spillway, falling water, white water at the toe
function dam(st, x0, x1) {
  const P = st.pack, D = P.dam, VY = st.VY;
  if (!D) return '';
  const xd = xOf(P, 0, st.bank), dir = st.bank === 'L' ? 1 : -1;   // +dir points downstream
  if (xd + 120 < x0 || xd - 120 >= x1) return '';
  if (!(xd >= x0 && xd < x1)) return '';   // anchored in the chunk that holds s = 0
  const X = u => xd + dir * u * HX;
  const ws0 = at(P, 'ws', 0);
  const yHead = YW - (D.headpond_m - ws0) * VY, yCrest = yHead + D.gate_m * VY, yBed = YW - at(P, 'bed', 0) * VY + 6;
  const r = mulberry32(hash(st.s, 950, 0));
  let o = '';
  // headpond (upstream of the reach): water surface with ripples over a pale body
  o += pl([[X(-60), yHead], [X(-3), yHead], [X(-3), yBed], [X(-60), yBed]], G(244, 1), NONE, 0);
  for (let i = 0; i < 9; i++) { const y = yHead + 4 + i * (yBed - yHead) / 10; o += pl([[X(-58 + r() * 8), y], [X(-6 - r() * 10), y]], NONE, G(150, 0.4), 0.6); }
  o += pl([[X(-60), yHead], [X(-3), yHead]], NONE, G(40, 0.9), 1.4);
  // the dam body in section: upstream face, crest, ogee face to the toe
  const face = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; face.push([X(t * 12), yCrest + (yBed - yCrest) * Math.pow(t, 1.85)]); }
  o += pl([[X(-3), yBed + 20], [X(-3), yCrest], ...face, [X(16), yBed + 20]], G(150, 1), G(20, 1), 2.2);
  for (let i = 0; i < 60; i++) { const u = -2.5 + r() * 14, y = yCrest + 4 + r() * (yBed - yCrest); o += pl([[X(u), y], [X(u) + 0.8, y + 0.8]], NONE, G(70, 0.7), 1); }
  // the crest gate, raised: a hinged plate from the crest up to the headpond
  o += pl([[X(-0.4), yCrest], [X(0.6), yHead]], NONE, G(15, 1), 3.2);
  // falling water over the gate and down the face
  for (let k = 0; k < 7; k++) {
    const off = 1.2 + k * 1.3, pts = [[X(0.6), yHead + k * 0.6]];
    for (let i = 1; i <= 12; i++) { const t = i / 12; pts.push([X(t * 12) + dir * off, yCrest + (yBed - yCrest) * Math.pow(t, 1.85) - off * 0.6]); }
    o += pl(pts, NONE, G(255, 0.9), 0.9);
  }
  // white water at the toe
  for (let i = 0; i < 26; i++) {
    const u = 11 + r() * 12, y = YW - 2 - r() * Math.min(28, 1.2 * VY);
    o += pl([[X(u) - 2, y], [X(u), y - 1.5], [X(u) + 2, y]], NONE, G(70 + r() * 80, 0.7), 0.8);
  }
  return o;
}

// pipes at the water line on the bank in view: CSOs and outfalls (diameter x ve, at least 2.5 px)
function pipes(st, x0, x1, which = 'all') {
  let o = '';
  const P = st.pack, VY = st.VY;
  const list = [...(which !== 'outfall' ? P.cso.map(c => ({ ...c, dia_in: null })) : []), ...(which !== 'cso' ? P.outfalls : [])];
  for (const p of list) {
    if (p.side !== st.side) continue;
    const x = xOf(P, p.s, st.bank);
    if (x < x0 || x >= x1) continue;
    const rr = Math.max(2.5, (p.dia_in ? p.dia_in * 0.0254 : 1.2) / 2 * VY), y = YW - rr - 0.3 * VY;
    o += pl([[x - rr * 1.6, y + rr * 1.5], [x - rr * 1.6, y - rr * 1.5], [x + rr * 1.6, y - rr * 1.5], [x + rr * 1.6, y + rr * 1.5]], G(200, 1), G(40, 0.9), 0.8);
    const ring = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; ring.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    o += pl(ring, G(25, 1), G(20, 1), 0.8);
  }
  return o;
}

// design only (the local design pack, morph 50% or more): each observatory as a bracket 6 m over the bank across its
// s range, on the interventions layer
function observatories(st, x0, x1) {
  const P = st.pack;
  if (!P.observatories) return '';
  let o = '';
  for (const ob of P.observatories) {
    if (ob.side !== st.side) continue;
    let xa = xOf(P, ob.s0, st.bank), xb = xOf(P, ob.s1, st.bank);
    if (xa > xb) [xa, xb] = [xb, xa];
    const ca = Math.max(xa, x0), cb = Math.min(xb, x1);
    if (cb <= ca) continue;
    const y = x => YW - (at(P, 'band0_' + st.bank, sAt(st, x)) + 6) * st.VY;
    const pts = []; for (let x = ca; x <= cb + 0.01; x += 6) pts.push([Math.min(x, cb), y(Math.min(x, cb))]);
    o += pl(pts, NONE, G(30, 0.85), 1.4);
    for (const xe of [xa, xb]) if (xe >= x0 && xe < x1) o += pl([[xe, y(xe)], [xe, y(xe) + 4 * st.VY]], NONE, G(30, 0.85), 1.4);
  }
  return o;
}

// the lot: paving lines at the bank's mean height over its s range (left bank only)
function lot(st, x0, x1) {
  const P = st.pack, L = P.lot;
  if (!L || L.side !== st.side) return '';
  let xa = xOf(P, L.s0, st.bank), xb = xOf(P, L.s1, st.bank);
  if (xa > xb) [xa, xb] = [xb, xa];
  xa = Math.max(xa, x0); xb = Math.min(xb, x1);
  if (xb <= xa) return '';
  let o = '';
  for (let i = 0; i < 3; i++) {
    const pts = [];
    for (let x = xa; x <= xb + 0.01; x += 4) pts.push([Math.min(x, xb), YW - at(P, 'mean0_' + st.bank, sAt(st, x)) * st.VY + i * 3]);
    o += pl(pts, NONE, G(70, 0.6), 0.6);
  }
  return o;
}

export function generate(st, c) {
  const x0 = c * CW, x1 = x0 + CW, W = st.W;
  if (x1 < -200 || x0 > W + 200) return [];
  const ta = Math.max(x0, 0), tb = Math.min(x1, W);         // terrain only inside the reach
  // per depth layer, the pieces in paint order, each with its mode layer
  const L = [[], [], [], [], []];
  if (tb > ta) {
    L[0].push(['terrain', band(st, BAND[0], 0, ta, tb)], ['terrain', band(st, BAND[1], 1, ta, tb)]);
    L[1].push(['terrain', band(st, BAND[2], 2, ta, tb)], ['buildings', buildings(st, [3], x0, x1, () => 160)], ['terrain', band(st, BAND[3], 3, ta, tb)], ['buildings', buildings(st, [2], x0, x1, () => 130)]);
    L[2].push(['terrain', band(st, BAND[4], 4, ta, tb)], ['trees', trees(st, 1, 4, ta, tb, 95, 26)], ['buildings', buildings(st, [1], x0, x1, () => 85)]);
    L[3].push(['terrain', band(st, BAND[5], 5, ta, tb)], ['hardscape', lot(st, x0, x1)], ['trees', trees(st, 0, 5, ta, tb, 45, 38)], ['buildings', buildings(st, [0], x0, x1, () => 40)], ['cso', pipes(st, x0, x1, 'cso')], ['infrastructure', pipes(st, x0, x1, 'outfall')], ['interventions', observatories(st, x0, x1)]);
    L[4].push(['terrain', bed(st, ta, tb)]);
  }
  L[4].push(['landmarks', bridges(st, x0, x1)], ['landmarks', dam(st, x0, x1)]);
  const out = [];
  for (let k = 0; k < 5; k++) {
    let sub = 0;
    for (const [layer, canv] of L[k]) {
      if (!canv) continue;
      out.push({ id: elementId(c, k, sub), layer, depth: k + 1, x: x0 + CW / 2, y: 0, c, sub, canv, tag: meta.layers[k] });
      sub++;
    }
  }
  return out;
}

// paper grain: the same tileable seeded texture as the derelict world, so palettes with paper treat all worlds alike
export function paperTexture(state) {
  const reso = 512, data = new Uint8ClampedArray(reso * reso * 4);
  const r = mulberry32(state.s ^ 0xBA9E);
  for (let j = 0; j < reso; j++) for (let i = 0; i < reso; i++) {
    const n = (noise2(state.s, i * 0.1 % 51.2, j * 0.1 % 51.2) + noise2(state.s ^ 7, i * 0.37 % 51.8, j * 0.37 % 51.8) * 0.5) / 1.5;
    const cc = 245 + n * 10 - r() * 20;
    const k = (j * reso + i) * 4;
    data[k] = cc; data[k + 1] = cc * 0.95; data[k + 2] = cc * 0.85; data[k + 3] = 255;
  }
  return { w: reso, h: reso, data };
}
export { hash01, f1 };
