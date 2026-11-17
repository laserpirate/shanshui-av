// The nashua data pack: loader and the geometry every reader shares (worker, controller, output, export).
// pack.json holds the manifest, objects and an index into pack.bin (Float32 and Uint8 arrays). See
// tools/nashua/build-pack.py for what each array means. Heights are m above the local water surface ws(s).
//
// Scroll space:  x = s * hx (left bank view, downstream to the right) or (len - s) * hx (right bank view, the
// mirror: standing in the river facing the right bank, downstream is on your left).
//                y = YW - h * hx * ve   (h in m above ws(s); ve the vertical exaggeration)
// hx (world px per m along the river) is a setting since P6: the pack a world draws carries it as pack.hx
// (packFor sets it from opts.hx), so every reader of the same pack agrees on the scale.

export const HX_DEF = 8, HX_MIN = 2, HX_MAX = 12;
export const HX = HX_DEF;         // the default scale (readers of a loaded pack use hxOf(pack))
export const hxOf = pack => (pack && pack.hx) || HX_DEF;
export const clampHX = v => Math.max(HX_MIN, Math.min(HX_MAX, Math.round(+v) || HX_DEF));
export const YW = 600;            // world y of the local water surface ws(s)
export const VE_DEF = 2, VE_MIN = 1, VE_MAX = 20;
export const PACK_URL = new URL('../../../data/nashua/existing/pack.json', import.meta.url).href;
// a second reach from the same pipeline (tools/nashua/build-reach.py): the Merrimack below the confluence
export const REACHES = { nashua: PACK_URL, merrimack: new URL('../../../data/nashua/merrimack/pack.json', import.meta.url).href };
export const reachOf = v => (REACHES[v] ? v : 'nashua');
// ADDENDUM-B B8: landmarks drawn as glyphs, schematic, at the surveyed position (docs/nashua/structures.md).
// Buildings by their structures-layer id; the label word is the owner's, the id goes only in the tooltip.
export const LANDMARK_IDS = { 24170: 'Church', 6000042: 'Factory' };
export const LANDMARK_WORDS = { dam: 'Dam', dike: 'Levee (approximate)' };
export const DESIGN_URL = new URL('../../../data/local/nashua/design/pack.json', import.meta.url).href;

const cache = new Map();
export function loadPack(url = PACK_URL) {
  if (!cache.has(url)) cache.set(url, (async () => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('pack ' + r.status);
    const j = await r.json();
    const b = await (await fetch(new URL(j.bin.file, url).href, { cache: 'no-cache' })).arrayBuffer();
    const A = {};
    for (const e of j.index) {
      const n = e.shape.reduce((a, v) => a * v, 1);
      A[e.name] = e.dtype === 'uint8' ? new Uint8Array(b, e.offset, n) : new Float32Array(b, e.offset, n);
    }
    j.A = A;
    j.n = A.s.length;
    j.ds = j.station_step_m;
    j.levelsSorted = j.levels.slice();
    return j;
  })().catch(e => { cache.delete(url); throw e; }));
  return cache.get(url);
}

// Existing to design morph: every per-station and per-section array of the same shape is interpolated (terrain bands,
// water edge, bed, sections together); objects (buildings, levels, landmarks) come from the nearer end. t in [0, 1].
export const MORPH_LABELS = ['Existing Grade (before landform)', 'Landform Sequence (after landform)'];
const MORPH_FIXED = new Set(['s', 'sec_s', 'sec_off']);
export function blendPacks(a, b, t) {
  if (!b || !(t > 0)) return a;
  t = Math.min(1, t);
  const A = {};
  for (const k of Object.keys(a.A)) {
    const x = a.A[k], y = b.A[k];
    if (y && y.length === x.length && x instanceof Float32Array && !MORPH_FIXED.has(k)) {
      const o = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) o[i] = x[i] + (y[i] - x[i]) * t;
      A[k] = o;
    } else A[k] = t < 0.5 || !y ? x : y;
  }
  const near = t < 0.5 ? a : b;
  return { ...near, A, n: a.n, ds: a.ds, route_len_m: a.route_len_m, hash: a.hash + '>' + b.hash + '@' + t.toFixed(3), morph: t };
}

// the pack a world draws: the existing pack, morphed toward the local design pack when opts.morph > 0 (the design
// pack is fetched only then; it is never published, so on the preview it is missing and the morph stays at 0)
export async function packFor(opts = {}) {
  const r = reachOf(opts.reach);
  const p = await loadPack(REACHES[r]);
  const hx = clampHX(opts.hx || HX_DEF);
  if (r !== 'nashua' || !(opts.morph > 0)) return { pack: { ...toMouth(p), hx }, designMissing: false };
  const d = await loadPack(DESIGN_URL).catch(() => null);
  return { pack: { ...toMouth(d ? blendPacks(p, d, opts.morph) : p), hx }, designMissing: !d };
}

// ADDENDUM-B B7: the Nashua scroll ends at the confluence (the mouth, in S5). S6 and what lies past the mouth leave the
// default reach: the stations, the map, the labels, the drawn objects. Beyond the mouth the generator draws the
// Merrimack in forced perspective (not to scale). ?reach=merrimack still draws the Merrimack reach in section.
const mouthCache = new WeakMap();
export function toMouth(p) {
  if (p.nashua_len_m == null || !(p.route_len_m > p.nashua_len_m)) return p;
  if (mouthCache.has(p)) return mouthCache.get(p);
  const E = p.nashua_len_m, inS = s => s <= E;
  const q = {
    ...p, route_len_m: E, full_len_m: p.route_len_m, mouth: true,
    stations: p.stations.filter(st => st.s0 < E - 1),
    bridges: p.bridges.filter(b => inS(b.s)),
    cso: p.cso.filter(c => inS(c.s)),
    outfalls: p.outfalls.filter(o => inS(o.s)),
    structures: (p.structures || []).filter(d => inS(d.s)),
    buildings: p.buildings.filter(b => b[0] <= E && (b.length < 12 || b[10] <= E)),
    plan: p.plan ? { ...p.plan, pts: p.plan.pts.slice(0, Math.ceil(E / p.plan.step_m) + 1) } : p.plan,
  };
  mouthCache.set(p, q);
  return q;
}
// the forced perspective past the mouth: world px it takes beyond the end of the scroll
export const MOUTH_W = 1100;

export const bankKey = bank => bank === 'R' ? 'R' : 'L';
export const reachW = pack => pack.route_len_m * hxOf(pack);
export const xOf = (pack, s, bank) => (bank === 'R' ? pack.route_len_m - s : s) * hxOf(pack);
export const sOf = (pack, x, bank) => bank === 'R' ? pack.route_len_m - x / hxOf(pack) : x / hxOf(pack);

// linear sample of a per-station array at s (clamped to the reach)
export function at(pack, name, s) {
  const a = pack.A[name], f = Math.max(0, Math.min(pack.n - 1, s / pack.ds)), i = Math.floor(f), t = f - i;
  return i + 1 < pack.n ? a[i] + (a[i + 1] - a[i]) * t : a[i];
}

// level offset above ws(s) for a level object
export const levelH = (pack, L, s) => L.type === 'absolute' ? L.z - at(pack, 'ws', s) : L.h;   // ws is absolute (m)
// continuous level position lv in [0, levels - 1]: between two named levels the water eases linearly
export function levelAt(pack, lv, s) {
  const L = pack.levels, k = Math.max(0, Math.min(L.length - 1, lv)), i = Math.floor(k), t = k - i;
  const a = levelH(pack, L[i], s);
  return i + 1 < L.length ? a + (levelH(pack, L[i + 1], s) - a) * t : a;
}

// water line for the shader: world y of the water surface every `step` world px over the reach (plus margins)
export const WL_N = 1024;
export function waterLine(pack, { bank = 'L', ve = VE_DEF } = {}, lv = 0) {
  const W = reachW(pack), x0 = -256, w = W + 512, out = new Float32Array(WL_N);
  for (let i = 0; i < WL_N; i++) {
    const x = x0 + (i + 0.5) / WL_N * w;
    const s = Math.max(0, Math.min(pack.route_len_m, sOf(pack, x, bank)));
    out[i] = YW - levelAt(pack, lv, s) * hxOf(pack) * ve;
  }
  return { data: out, x0, w };
}

// ADDENDUM-B B9: runoff sources for the shader, world px: [x0, x1, yTop, kind], kind 0 a CSO (a jet from the mouth, the
// same mouth the generator draws), kind 1 the lot (sheet runoff down the bank face). The bank in view only; at most RUN_N.
export const RUN_N = 4;
export function runoffSources(pack, { bank = 'L', ve = VE_DEF } = {}) {
  const side = bank === 'R' ? -1 : 1, hx = hxOf(pack), VY = hx * ve, out = [];
  for (const c of pack.cso || []) {
    if (c.side !== side) continue;
    const x = xOf(pack, c.s, bank), rr = Math.max(8, 1.1 * Math.min(VY, 4 * hx));
    out.push([x, x, YW - 0.3 * VY - 0.4 * rr, 0]);
  }
  const L = pack.lot;
  if (L && L.side === side) {
    let a = xOf(pack, L.s0, bank), b = xOf(pack, L.s1, bank);
    if (a > b) [a, b] = [b, a];
    out.push([a, b, YW - at(pack, 'mean0_' + bank, (L.s0 + L.s1) / 2) * VY, 1]);
  }
  return out.slice(0, RUN_N);
}

// the facts for the fact line at scroll position x (controller and optional output)
export function facts(pack, { bank = 'L', ve = VE_DEF } = {}, x, lv) {
  const s = sOf(pack, x, bank);
  const inReach = s >= 0 && s <= pack.route_len_m;
  const sc = Math.max(0, Math.min(pack.route_len_m, s));
  const k = Math.round(sc / pack.ds);
  const measured = pack.A.bed_measured[Math.max(0, Math.min(pack.n - 1, k))] > 0.5;
  const L = pack.levels, i = Math.round(Math.max(0, Math.min(L.length - 1, lv)));
  return { s: sc, inReach, ve, measured, level: L[i], levelExact: Math.abs(lv - i) < 0.02, bank };
}
