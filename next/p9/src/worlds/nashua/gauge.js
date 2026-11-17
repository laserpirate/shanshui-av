// Time scroll: the water level driven through a real daily record. The record is the Nashua River at East Pepperell,
// MA (USGS 01096500, data/nashua/gauge/01096500.json), upstream of the reach: a declared proxy, not the stage at the
// site. Stage at the site is taken as log-linear in discharge between two anchors, both from the record itself:
//   the record's median daily flow   -> Median Water (the first level)
//   the record's largest daily flow (1936-03-20) -> the 1936 Flood of Record (the last level)
// Flows below the median sit at Median Water. Everything in between is the proxy, said so on the fact line.
import { levelH } from './pack.js';

export const GAUGE_URL = new URL('../../../data/nashua/gauge/01096500.json', import.meta.url).href;
export const MARCH_1936 = '1936-03-20';
const DAY = 86400000;
let cache = null;
export function loadGauge() { return cache || (cache = fetch(GAUGE_URL).then(r => { if (!r.ok) throw new Error('gauge ' + r.status); return r.json(); }).then(prep)); }

function prep(g) {
  const d0 = Date.parse(g.start + 'T00:00:00Z') / DAY;
  // fill the rare gaps from the nearest earlier value so the scroll never jumps to nothing
  const q = Float32Array.from(g.q, v => (v == null ? NaN : v));
  for (let i = 1; i < q.length; i++) if (isNaN(q[i])) q[i] = q[i - 1];
  return { ...g, d0, qf: q, lnMed: Math.log(g.median), lnMax: Math.log(g.max.q) };
}
// day index (float) <-> ISO date
export const dayOf = (g, iso) => Date.parse(iso + 'T00:00:00Z') / DAY - g.d0;
export const isoOf = (g, d) => new Date((g.d0 + Math.floor(d)) * DAY).toISOString().slice(0, 10);
// discharge at a fractional day (linear between days), ft3/s
export function qAt(g, d) {
  const n = g.qf.length, k = Math.max(0, Math.min(n - 1, d)), i = Math.floor(k), t = k - i;
  return i + 1 < n ? g.qf[i] + (g.qf[i + 1] - g.qf[i]) * t : g.qf[i];
}
// continuous level position (0 .. levels - 1) for a discharge, read at the reach's middle station
export function lvOfQ(g, pack, q) {
  const L = pack.levels, s = pack.route_len_m / 2;
  const f = Math.max(0, Math.min(1, (Math.log(Math.max(1, q)) - g.lnMed) / (g.lnMax - g.lnMed)));
  const h0 = levelH(pack, L[0], s), h1 = levelH(pack, L[L.length - 1], s), h = h0 + (h1 - h0) * f;
  for (let i = 0; i + 1 < L.length; i++) {
    const a = levelH(pack, L[i], s), b = levelH(pack, L[i + 1], s);
    if (h <= b || i + 2 === L.length) return i + Math.max(0, Math.min(1, b > a ? (h - a) / (b - a) : 0));
  }
  return 0;
}
// the fact for the line: date, discharge in m3/s (ft3/s), the gauge and the word proxy
export function timeFact(g, d) {
  const q = qAt(g, d);
  return isoOf(g, d) + '  ' + (q * 0.0283168).toFixed(q < 353 ? 1 : 0) + ' m³/s (' + Math.round(q).toLocaleString('en-US') + ' ft³/s) at East Pepperell, upstream proxy';
}
