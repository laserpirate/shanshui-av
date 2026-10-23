// Palettes: palettes.json -> lookup tables. One table per palette, 256 x 64 RGBA:
//   x = ink amount after contrast and ink weight (0 = bare paper, 1 = darkest ink)
//   y = drift position u for gradient palettes (rows repeat for plain ramps)
// The same math runs on the CPU for vector export (colorAt).

export const LUT_W = 256, LUT_H = 64;

export function hexRgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function sampleStops(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [p0, c0] = stops[k - 1], [p1, c1] = stops[k];
      return mix(c0, c1, p1 > p0 ? (t - p0) / (p1 - p0) : 0);
    }
  }
  return stops[stops.length - 1][1];
}

// parsed form, cached by object identity
const parsedCache = new WeakMap();
function parsed(p) {
  let q = parsedCache.get(p);
  if (q) return q;
  const st = list => [...list].map(([t, h]) => [+t, hexRgb(h)]).sort((a, b) => a[0] - b[0]);
  q = { ground: hexRgb(p.ground), stops: p.stops ? st(p.stops) : null, ramp: p.ramp ? st(p.ramp) : null };
  parsedCache.set(p, q);
  return q;
}

// colour for ink amount i (already through contrast / weight) at drift position u
export function colorAt(p, i, u, inkRange) {
  const q = parsed(p);
  const t = p.raw ? i : Math.min(1, i / (inkRange || 0.75));
  if (p.type === 'gradient') return mix(q.ground, sampleStops(q.ramp, ((u % 1) + 1) % 1), t);
  return sampleStops(q.stops, t);
}

export function buildLUT(p, inkRange) {
  const data = new Uint8Array(LUT_W * LUT_H * 4);
  const rows = p.type === 'gradient' ? LUT_H : 1;
  for (let y = 0; y < rows; y++) {
    const u = y / LUT_H;
    for (let x = 0; x < LUT_W; x++) {
      const c = colorAt(p, x / (LUT_W - 1), u, inkRange);
      const k = (y * LUT_W + x) * 4;
      data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
    }
  }
  for (let y = rows; y < LUT_H; y++) data.copyWithin(y * LUT_W * 4, 0, LUT_W * 4);
  return data;
}

// drift: u = worldX * dx + time * dt
export function driftOf(p) {
  if (p.type !== 'gradient') return [0, 0];
  return p.drift === 'time' ? [0, +p.rate || 0.01] : [1 / (+p.period || 6000), 0];
}
export const paperMode = p => ({ tint: 1, grain: 2 }[p.paper] || 0);
export const isDark = p => { const g = hexRgb(p.ground); return 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2] < 110; };

// the contrast / ink weight curve, shared with the shader (keep in sync with renderer.js)
export function inkCurve(i, contrast, weight) {
  i = Math.min(1, Math.max(0, i * weight));
  if (i > 0.002) i = Math.min(1, Math.max(0, (i - 0.3) * contrast + 0.3));
  return i;
}

export async function loadPalettes(url = 'palettes.json') {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('palettes.json: ' + r.status);
  const j = await r.json();
  const ids = new Set();
  for (const p of j.palettes) {
    if (!p.id || ids.has(p.id)) throw new Error('palettes.json: missing or duplicate id ' + p.id);
    ids.add(p.id);
    if (!p.ground || !(p.stops || p.ramp)) throw new Error('palettes.json: ' + p.id + ' needs ground and stops or ramp');
  }
  return j;
}
