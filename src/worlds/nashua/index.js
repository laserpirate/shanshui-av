// The nashua world: the last reach of the Nashua River (Jackson Mills dam to 300 m into the Merrimack) unrolled
// as a section scroll, seen from the river toward one bank, drawn in ink from the data pack.
// World interface (see DECISIONS.md, "Worlds"):
//   meta                     name, height, chunk width, layers, how seeds work
//   init(seed, opts, pack)   -> state   opts: {bank: 'L' | 'R', ve: 1..20}
//   generate(state, c)       -> elements of chunk c: [{id, layer, depth, x, canv, c}], back to front
// Every chunk is a pure function of (pack, chunk, seed, bank, ve). Ink jitter, texture strokes and trees come from
// hashes of (seed, global grid index), never from a running generator, so chunks join exactly and regenerate the same.
// Nothing is placed from the engine's random defaults: no pavilions, towers, boats, pines or invented buildings.
// Since P6 (ADDENDUM-A, A1) there are no hills: no filled terrain behind the near bank. The buildings are the skyline.
//   depth 1 far      one ridgeline: a thin line of the highest real ground 40 to 700 m behind the water edge, no fill
//   depth 2 midfar   buildings 300 to 700 m and 120 to 300 m from the water edge (pale)
//   depth 3 mid      buildings 40 to 120 m
//   depth 4 ground   the bank (0 to 40 m, filled: the ground we look across at), trees on it from canopy, the lot,
//                    buildings 0 to 40 m (dark), structures on the bank (the dike), pipes at the water line
//   depth 5 near     the bed in section, bridges in section, the dam
import { G, PAPER, NONE, pl, lamp, L as LK, brush } from '../derelict/ink.js';
import { seedInt, hash01, mulberry32, hash, noise1, noise2 } from '../derelict/rng.js';
import { YW, VE_DEF, VE_MIN, VE_MAX, xOf, sOf, at, reachW, hxOf } from './pack.js';

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
  const hx = hxOf(pack);
  return { seed: String(seed), s: seedInt(seed), bank, side: bank === 'L' ? 1 : -1, ve, hx, VY: hx * ve, pack, W: reachW(pack) };
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

// the near bank (band 0, 0 to 40 m from the water edge): the ground we look across at, filled, with its top line.
// A rise or a drop shows only where the ground has one, at its true height x ve. No texture strokes, no mist.
export const BANK = { fill: 214, line: 38, w: 2.0, amp: 1.0 };
function bank(st, xa, xb) {
  if (xb <= xa) return '';
  const top = skyline(st, 'band0', xa, xb, BANK.amp, 5);
  const base = YW + 3;
  let o = pl([[xa - 0.6, base], [xa - 0.6, top[0][1]], ...top, [xb + 0.6, top[top.length - 1][1]], [xb + 0.6, base]], G(BANK.fill, 1), NONE, 0);
  o += pl(top, NONE, G(BANK.line, 0.9), BANK.w);
  return o;
}
// the one ridgeline: the highest real ground 40 to 700 m behind the water edge (bands 1 to 3), a thin line, no fill
export const RIDGE = { grey: 150, w: 0.9, bands: [1, 2, 3] };
export function ridgeH(pack, bk, s) { let h = -Infinity; for (const j of RIDGE.bands) h = Math.max(h, at(pack, 'band' + j + '_' + bk, s)); return h; }
function ridge(st, xa, xb) {
  if (xb <= xa) return '';
  const n = Math.max(1, Math.ceil((xb - xa) / 4)), pts = [];
  for (let i = 0; i <= n; i++) {
    const x = xa + (xb - xa) * i / n;
    pts.push([x, YW - ridgeH(st.pack, st.bank, sAt(st, x)) * st.VY + (noise1(st.s ^ 0x5a, x / 23) - 0.5) * 1.2]);
  }
  return pl(pts, NONE, G(RIDGE.grey, 0.8), RIDGE.w);
}

// trees on the bank from the canopy share (band 0): a global grid of 3 m slots; fixed ink size, not to scale.
// Broadleaf only: the canopy class does not say what the trees are, so no pines are drawn.
function trees(st, xa, xb, tone, size) {
  let o = '';
  const cname = 'canopy0_' + st.bank;
  const sp = 3 * st.hx;
  for (let q = Math.ceil(xa / sp); q <= Math.floor((xb - 1e-6) / sp); q++) {
    const r = mulberry32(hash(st.s, 500, q));
    const x = q * sp + (r() - 0.5) * sp;
    const s = sAt(st, x);
    const p = at(st.pack, cname, s) * 0.62;
    if (r() > p) continue;
    const y = yOf(st, 'band0', x) + r() * 6;
    const h = size * (0.6 + r() * 0.7);
    o += leafy(x, y, h, tone, r, Math.max(0.35, 1 / st.ve));
  }
  return o;
}
// h in world px (height x ve); ax scales the crown's width (1 / ve keeps the crown true in plan width)
function leafy(x, y, h, tone, r, ax = 1) {
  let o = '';
  const lean = (r() - 0.5) * h * 0.15 * ax;
  o += brush([[x, y], [x + lean * 0.5, y - h * 0.5], [x + lean, y - h * 0.8]], 1 + h * 0.012, G(tone, 0.85), r, { noi: 0.3 });
  const cx = x + lean, cy = y - h * 0.68, rx = h * (0.3 + r() * 0.12) * ax, ry = h * (0.3 + r() * 0.1);
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
// buildings: massing at their base above ws(s), heights x ve; windows as lights by occupancy.
// Rows by distance from the water edge (pack band 0 to 3; beyond 700 m not drawn: no ground is drawn under it),
// value before hue: near dark, far pale, so depth comes from the massing.
export const ROWS = [
  // band: fill grey, line grey, line width
  { f: 176, g: 30, w: 1.3 },     // 0 to 40 m
  { f: 198, g: 80, w: 1.0 },     // 40 to 120 m
  { f: 220, g: 130, w: 0.8 },    // 120 to 300 m
  { f: 236, g: 170, w: 0.7 },    // 300 to 700 m
];
export const ROW_MAX_BAND = 3;
const OCC_LIT = [0.3, 0.45, 0.12, 0.35, 0.4, 0.2];
const OCC_KIND = [LK.breathe, LK.steady, LK.flicker, LK.steady, LK.steady, LK.steady];
function buildings(st, row, x0, x1) {
  let o = '';
  const P = st.pack, VY = st.VY, R = ROWS[row];
  for (const b of P.buildings) {
    if (b[2] !== st.side || b[3] !== row) continue;
    const xm = xOf(P, (b[0] + b[1]) / 2, st.bank);
    if (xm < x0 || xm >= x1) continue;
    let xa = xOf(P, b[0], st.bank), xb = xOf(P, b[1], st.bank);
    if (xa > xb) [xa, xb] = [xb, xa];
    if (xb - xa < 3) { xa = xm - 1.5; xb = xm + 1.5; }
    const base = YW - Math.max(-0.5, b[4]) * VY, top = base - b[5] * VY;
    const r = mulberry32(hash(st.s, 700, Math.round(b[0] * 10), b[2]));
    const tn = R.g;
    o += pl([[xa, base + 2], [xa, top], [xb, top], [xb, base + 2]], G(R.f, 1), G(tn, 0.9), R.w);
    o += pl([[xa - 0.8, top], [xb + 0.8, top]], NONE, G(Math.max(0, tn - 20), 0.9), R.w * 1.4);
    // the ground it stands on: a thin line at its base, a little wider than the building (a line, never a fill)
    const gw = Math.max(6, (xb - xa) * 0.15);
    o += pl([[xa - gw, base + 2], [xb + gw, base + 2]], NONE, G(tn, 0.7), Math.max(0.8, R.w));
    // floors every 3.5 m, windows every 3 m
    const fh = 3.5 * VY, ww = Math.max(2, 3 * st.hx);
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
    const w = (rail ? 8 : 14) * st.hx, yd = YW - b.deck_h * VY, th = Math.max(6, 1.2 * VY), yb = YW - at(P, 'bed', b.s) * VY;
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
  const X = u => xd + dir * u * st.hx;
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

// structures that are points only in the data (pack.structures, kind 'dike'): drawn at their station on the bank in
// view as a levee in section, its height from the record (NID DAM_HEIGHT), crest 4 m, side slopes 1 in 2.5 (schematic:
// the line of the levee is not in the data, so it is not drawn along the bank)
function dikes(st, x0, x1) {
  const P = st.pack;
  if (!P.structures) return '';
  let o = '';
  for (const d of P.structures) {
    if (d.kind !== 'dike' || d.side !== st.side) continue;
    const x = xOf(P, d.s, st.bank);
    if (x < x0 || x >= x1) continue;
    const g = YW - at(P, 'band0_' + st.bank, d.s) * st.VY, h = d.height_m * st.VY, cw = 2 * st.hx, bw = (2 + 2.5 * d.height_m) * st.hx;
    o += pl([[x - bw, g + 2], [x - cw, g - h], [x + cw, g - h], [x + bw, g + 2]], G(150, 1), G(25, 1), 1.6);
    for (let i = 1; i < 6; i++) { const t = i / 6, y = g - h * t; o += pl([[x - bw + (bw - cw) * t, y], [x + bw - (bw - cw) * t, y]], NONE, G(70, 0.5), 0.6); }
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
    L[0].push(['terrain', ridge(st, ta, tb)]);
    L[1].push(['buildings', buildings(st, 3, x0, x1)], ['buildings', buildings(st, 2, x0, x1)]);
    L[2].push(['buildings', buildings(st, 1, x0, x1)]);
    L[3].push(['terrain', bank(st, ta, tb)], ['hardscape', lot(st, x0, x1)], ['trees', trees(st, ta, tb, 60, 12 * st.VY)], ['buildings', buildings(st, 0, x0, x1)], ['landmarks', dikes(st, x0, x1)], ['cso', pipes(st, x0, x1, 'cso')], ['infrastructure', pipes(st, x0, x1, 'outfall')], ['interventions', observatories(st, x0, x1)]);
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
