// Ink kit: the same element strings upstream draws (<polyline> with rgba greys on white paper), so
// the raster worker, the palette shader and vector export treat both worlds alike. Lights are
// extra elements the ink pass ignores: <circle data-l> and <polyline data-l> (see raster-worker.js).
//
// A drawing call takes a generator `r` (mulberry32) for its jitter, so each call is deterministic.

export const G = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${+a.toFixed(3)})`;
export const PAPER = G(255, 1);       // opaque occluder: hides what is behind, stays paper
export const NONE = 'rgba(0,0,0,0)';

const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
export function pl(pts, fil = NONE, str = NONE, wid = 0) {
  let s = "<polyline points='";
  for (let i = 0; i < pts.length; i++) s += (i ? ' ' : '') + f1(pts[i][0]) + ',' + f1(pts[i][1]);
  return s + "' style='fill:" + fil + ';stroke:' + str + ';stroke-width:' + wid + "'/>";
}

// light kinds (stored with a phase in the tile, animated in the shader)
export const L = { steady: 0, breathe: 1, blink: 2, flicker: 3, chase: 4, beacon: 5 };
// a point light: r world px, i intensity 0..1, phase 0..1
export function lamp(x, y, r, kind, phase, i = 1) {
  return `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(r)}' data-l='${kind},${(Math.floor(((phase % 1) + 1) % 1 * 32)) & 31},${i.toFixed(2)}'/>`;
}
// a light line (neon): stroked in the light channel
export function neon(pts, wid, kind, phase, i = 1) {
  let s = "<polyline points='";
  for (let k = 0; k < pts.length; k++) s += (k ? ' ' : '') + f1(pts[k][0]) + ',' + f1(pts[k][1]);
  return s + `' data-l='${kind},${(Math.floor(((phase % 1) + 1) % 1 * 32)) & 31},${i.toFixed(2)},${f1(wid)}'/>`;
}

// smooth 1D jitter from a generator: a few random knots, interpolated
function knots(r, n) { const k = []; for (let i = 0; i < n + 2; i++) k.push(r() * 2 - 1); return t => { const x = t * n, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return k[i] + (k[i + 1] - k[i]) * u; }; }

// resample a polyline every `step` px and push it sideways by smooth noise: the hand-drawn line
export function wob(pts, amp, r, step = 6) {
  const out = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const nz = knots(r, Math.max(2, Math.ceil(total / 40)));
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay) || 1e-6;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n, d = nz(Math.min(0.9999, (acc + t * len) / (total || 1))) * amp;
      out.push([ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d]);
    }
    acc += len;
  }
  return out;
}

// brush: a filled polygon around a centre line, width swelling and thinning like upstream's stroke()
export function brush(pts, wid, col, r, { noi = 0.5, taper = true, out = 0.6 } = {}) {
  if (pts.length < 2) return '';
  if (pts.length === 2) pts = wob(pts, 0, r, 5);
  const nz = knots(r, Math.max(2, pts.length >> 2));
  const a = [], b = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1e-6;
    const t = i / (n - 1);
    let w = wid * (taper ? Math.max(0.15, Math.sin(Math.PI * (0.08 + t * 0.84))) : 1);
    w *= 1 - noi * 0.5 + noi * 0.5 * (nz(Math.min(0.9999, t)) + 1);
    const nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
    a.push([pts[i][0] + nx, pts[i][1] + ny]);
    b.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  return pl(a.concat(b.reverse()), col, col, out);
}

// a straight inked line, hand-drawn
export const line = (x0, y0, x1, y1, wid, col, r, amp = 0.6) => brush(wob([[x0, y0], [x1, y1]], amp, r, 5), wid, col, r, { noi: 0.35 });
// a thin even line (wire, lattice), no swelling
export const thin = (pts, wid, col) => pl(pts, NONE, col, wid);

export const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

// parallel hatch strokes clipped to a rect, angle in radians (0 = horizontal), spacing in px
export function hatch(x0, y0, x1, y1, spacing, ang, col, wid, r, dens = 1) {
  const s = [];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let d = -diag / 2; d <= diag / 2; d += spacing * (0.7 + r() * 0.6)) {
    if (r() > dens) continue;
    // line through centre offset d along the normal, clipped to the rect
    const px = cx - sa * d, py = cy + ca * d;
    let t0 = -diag, t1 = diag;
    const clip = (p, dp, lo, hi) => { if (Math.abs(dp) < 1e-9) return p >= lo && p <= hi; let a = (lo - p) / dp, b = (hi - p) / dp; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 < t1; };
    if (!clip(px, ca, x0, x1) || !clip(py, sa, y0, y1)) continue;
    const k0 = t0 + (t1 - t0) * r() * 0.15, k1 = t1 - (t1 - t0) * r() * 0.15;
    s.push(pl([[px + ca * k0, py + sa * k0], [px + ca * k1, py + sa * k1]], NONE, col, wid));
  }
  return s.join('');
}

// rust streaks: short vertical drips under an edge
export function drips(x0, x1, y, len, col, r, n) {
  const s = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), l = len * (0.3 + r());
    s.push(pl([[x, y], [x + (r() - 0.5) * 1.5, y + l]], NONE, col, 0.4 + r() * 0.6));
  }
  return s.join('');
}

// grass and weeds: tufts of curved blades rising from y
export function tufts(x0, x1, y, h, col, r, n) {
  const s = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), hh = h * (0.4 + r() * 0.8);
    const k = 2 + (r() * 4 | 0);
    for (let j = 0; j < k; j++) {
      const lean = (r() - 0.5) * hh * 0.9;
      s.push(brush([[x + j, y], [x + j + lean * 0.3, y - hh * 0.5], [x + j + lean, y - hh]], 1.2 + r(), col, r, { noi: 0.2 }));
    }
  }
  return s.join('');
}

// a hanging vine: a wavering line down from (x, y) with small leaves
export function vine(x, y, len, col, r, leaf = true) {
  const pts = [];
  const sway = (r() - 0.5) * 10;
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([x + Math.sin(t * 5 + r()) * 2 + sway * t * t, y + t * len]); }
  let s = brush(pts, 1.4, col, r, { noi: 0.3, taper: false });
  if (leaf) for (let i = 2; i < 12; i += 1 + (r() * 2 | 0)) {
    const [px, py] = pts[i], d = r() < 0.5 ? -1 : 1;
    s += pl([[px, py], [px + d * 4, py + 1.5], [px + d * 6, py + 4], [px + d * 2, py + 3], [px, py]], col, col, 0.3);
  }
  return s;
}

// a catenary between two points, sag in px
export function sagLine(x0, y0, x1, y1, sag, n = 16) {
  const p = [];
  for (let i = 0; i <= n; i++) { const t = i / n; p.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)]); }
  return p;
}

// 7-segment stencil digits as brush strokes (runway numbers: invented, never a real airport)
const SEG = { 0: 'abcfed', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd', L: 'fed', R: 'efabg', C: 'afed' };
export function glyph(ch, x, y, w, h, wid, col, r, skew = 0) {
  const segs = SEG[ch] || '';
  const P = (u, v) => [x + u * w + (1 - v) * skew, y + v * h];
  const ends = { a: [[0, 0], [1, 0]], b: [[1, 0], [1, 0.5]], c: [[1, 0.5], [1, 1]], d: [[0, 1], [1, 1]], e: [[0, 0.5], [0, 1]], f: [[0, 0], [0, 0.5]], g: [[0, 0.5], [1, 0.5]] };
  let s = '';
  for (const k of segs) { const [a, b] = ends[k]; s += pl([P(...a), P(...b)], NONE, col, wid); }
  return s;
}
