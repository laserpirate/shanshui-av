// The nashua data pack: loader and the geometry every reader shares (worker, controller, output, export).
// pack.json holds the manifest, objects and an index into pack.bin (Float32 and Uint8 arrays). See
// tools/nashua/build-pack.py for what each array means. Heights are m above the local water surface ws(s).
//
// Scroll space:  x = s * HX (left bank view, downstream to the right) or (len - s) * HX (right bank view, the
// mirror: standing in the river facing the right bank, downstream is on your left).
//                y = YW - h * HX * ve   (h in m above ws(s); ve the vertical exaggeration)

export const HX = 2;              // world px per m along the river (the finite scroll's own scale)
export const YW = 600;            // world y of the local water surface ws(s)
export const VE_DEF = 10, VE_MIN = 1, VE_MAX = 20;
export const PACK_URL = new URL('../../../data/nashua/existing/pack.json', import.meta.url).href;
// a second reach from the same pipeline (tools/nashua/build-reach.py): the Merrimack below the confluence
export const REACHES = { nashua: PACK_URL, merrimack: new URL('../../../data/nashua/merrimack/pack.json', import.meta.url).href };
export const reachOf = v => (REACHES[v] ? v : 'nashua');
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
  if (r !== 'nashua' || !(opts.morph > 0)) return { pack: p, designMissing: false };
  const d = await loadPack(DESIGN_URL).catch(() => null);
  return { pack: d ? blendPacks(p, d, opts.morph) : p, designMissing: !d };
}

export const bankKey = bank => bank === 'R' ? 'R' : 'L';
export const reachW = pack => pack.route_len_m * HX;
export const xOf = (pack, s, bank) => (bank === 'R' ? pack.route_len_m - s : s) * HX;
export const sOf = (pack, x, bank) => bank === 'R' ? pack.route_len_m - x / HX : x / HX;

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
    out[i] = YW - levelAt(pack, lv, s) * HX * ve;
  }
  return { data: out, x0, w };
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
