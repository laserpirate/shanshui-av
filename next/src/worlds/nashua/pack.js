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
