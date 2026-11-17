// Layer 4, ground: runway fragments with cracked threshold stripes and invented numbers, taxiway
// lines, the apron (the shader floods it to the water level), runway edge lights, baggage carts,
// chain-link fence, pipes and ducts, mangrove and grass, stilt houses and aquaculture nets on the
// flooded apron in kampung passages, a few longtail boats.
import { G, PAPER, NONE, pl, thin, brush, wob, line, hatch, drips, tufts, vine, lamp, L, sagLine, rect, glyph } from './ink.js';
import { hash01, rngFor, noise1 } from './rng.js';
import { Y } from './planner.js';

const INK = a => G(25, a);
const R0 = Y.runway0, R1 = Y.runway1;

function runway(s, p, r) {
  let o = '';
  const on = x => noise1(s ^ 0x7A1, x / 1900) > 0.3;
  // edges and centreline in 32 px steps; cracks and missing slabs from hashes on the same grid
  for (let x = p.x0; x < p.x1; x += 32) {
    if (!on(x)) continue;
    const gone = hash01(s, 801, x) < 0.08;
    if (!gone) {
      o += thin([[x, R0 + (hash01(s, 802, x) - 0.5)], [x + 32, R0 + (hash01(s, 802, x + 32) - 0.5)]], 1.1, INK(0.65));
      o += thin([[x, R1 + (hash01(s, 803, x) - 0.5)], [x + 32, R1 + (hash01(s, 803, x + 32) - 0.5)]], 1.3, INK(0.7));
    }
    if (hash01(s, 804, x) < 0.55) o += pl([[x + 6, (R0 + R1) / 2 - 0.8], [x + 22, (R0 + R1) / 2 - 0.8], [x + 23, (R0 + R1) / 2 + 0.8], [x + 7, (R0 + R1) / 2 + 0.8]], G(50, 0.55), NONE, 0);
    if (hash01(s, 805, x) < 0.35) {
      // a crack: a jagged line across the slab
      const cx = x + r() * 32, pts = [[cx, R0 + 1]];
      for (let y = R0 + 6; y < R1; y += 6) pts.push([cx + (r() - 0.5) * 8, y]);
      o += thin(pts, 0.6, INK(0.5));
    }
    if (hash01(s, 806, x) < 0.25) o += tufts(x, x + 32, R0 + 4 + r() * (R1 - R0 - 6), 6, INK(0.55), r, 2);
    // edge lights on a 64 px grid, a few dead; they chase toward the threshold
    if (x % 64 === 0 && hash01(s, 807, x) > 0.18) {
      o += pl(rect(x - 1, R0 - 4, 2, 3), INK(0.7), NONE, 0) + lamp(x, R0 - 4, 1.8, L.chase, (x / 640) % 1, 0.9);
      if (hash01(s, 808, x) > 0.25) o += pl(rect(x - 1, R1 + 1, 2, 3), INK(0.7), NONE, 0) + lamp(x, R1 + 1, 2, L.chase, (x / 640) % 1, 0.95);
    }
    if (gone) o += hatch(x, R0 + 1, x + 32, R1 - 1, 3.2, 0.15, INK(0.35), 0.5, r, 0.8);
  }
  // threshold: piano keys and an invented number, at most one per chunk
  if (hash01(s, 809, p.c) < 0.33 && on(p.x0 + 256)) {
    const tx = p.x0 + 120 + r() * 220, dir = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < 10; k++) {
      if (r() < 0.12) continue;                                // worn away
      const y = R0 + 3 + k * (R1 - R0 - 6) / 10;
      o += pl([[tx, y], [tx + dir * 34, y - 0.6], [tx + dir * 36, y + 2], [tx + 2, y + 2.6], [tx, y]], G(60, 0.6), NONE, 0);
    }
    // invented runway number: two digits 01 to 36 plus L/C/R, foreshortened onto the band
    const n = 1 + Math.floor(hash01(s, 810, p.c) * 36);
    const txt = String(n).padStart(2, '0') + ['', 'L', 'R', 'C'][Math.floor(hash01(s, 811, p.c) * 4)];
    let gx = tx + dir * 48 + (dir < 0 ? -txt.length * 14 : 0);
    for (const ch of txt) { o += glyph(ch, gx, R0 + 8, 10, R1 - R0 - 16, 2.2, G(50, 0.6), r, 3); gx += 14; }
  }
  return o;
}

function taxiway(s, p, r) {
  // curved yellow-line ghosts from the runway to the apron, a few per chunk
  let o = '';
  if (hash01(s, 821, p.c) < 0.4) return o;
  const x = p.x0 + 60 + r() * 380, d = r() < 0.5 ? 1 : -1;
  const pts = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push([x + d * 120 * (1 - Math.cos(t * Math.PI / 2)), R0 - 2 - (R0 - Y.apron - 6) * Math.sin(t * Math.PI / 2)]); }
  for (let i = 0; i < pts.length - 1; i += 2) o += thin([pts[i], pts[i + 1]], 0.9, INK(0.4));
  return o;
}

function fence(s, p, r) {
  let o = '';
  const on = x => noise1(s ^ 0xFE1, x / 1100) > 0.62;
  const y1 = Y.apron + 6, y0 = y1 - 22;
  for (let x = Math.ceil(p.x0 / 30) * 30; x < p.x1; x += 30) {
    if (!on(x)) continue;
    const lean = (hash01(s, 831, x) - 0.5) * 6, down = hash01(s, 832, x) < 0.12;
    o += line(x, y1, x + lean, y0, 1.2, INK(0.75), r, 0.3);
    if (!on(x + 30)) continue;
    if (down) { o += pl(sagLine(x + lean, y0 + 2, x + 30, y1 - 2, 6, 8), NONE, INK(0.45), 0.5); continue; }
    const leanB = (hash01(s, 831, x + 30) - 0.5) * 6;
    o += thin(sagLine(x + lean, y0, x + 30 + leanB, y0, 2.5, 6), 0.6, INK(0.6));
    // chain link: a diamond lattice of thin lines
    for (let k = 0; k < 30; k += 4) {
      o += thin([[x + k, y1 - 1], [Math.min(x + 30, x + k + 10), y0 + 2]], 0.3, INK(0.35));
      o += thin([[x + k, y0 + 2], [Math.min(x + 30, x + k + 10), y1 - 1]], 0.3, INK(0.35));
    }
    if (hash01(s, 833, x) < 0.3) o += vine(x + r() * 30, y0, 8 + r() * 10, INK(0.55), r, true);
  }
  return o;
}

function carts(x, r) {
  // a short train of baggage carts, one tipped over
  let o = '';
  const y = Y.apron + 18;
  const n = 2 + (r() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const cx = x + i * 30, tipped = r() < 0.25;
    if (tipped) { o += pl([[cx, y], [cx + 6, y - 20], [cx + 14, y - 18], [cx + 8, y + 2], [cx, y]], PAPER, INK(0.8), 1); continue; }
    o += pl(rect(cx, y - 14, 24, 10), PAPER, INK(0.8), 1.1);
    o += thin([[cx + 2, y - 14], [cx + 2, y - 20], [cx + 22, y - 20], [cx + 22, y - 14]], 0.7, INK(0.6));
    for (const wx of [cx + 4, cx + 20]) { const w = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI * 2; w.push([wx + Math.cos(a) * 2.6, y - 2 + Math.sin(a) * 2.6]); } o += pl(w, PAPER, INK(0.8), 0.9); }
    if (i) o += thin([[cx - 6, y - 7], [cx, y - 7]], 0.8, INK(0.7));
    if (r() < 0.5) o += pl(rect(cx + 4, y - 22, 9, 8), PAPER, INK(0.6), 0.8);
  }
  o += tufts(x - 10, x + n * 30, y + 1, 8, INK(0.55), r, 4);
  return o;
}

function pipes(s, p, r) {
  // two runs along the ground with flanges and saddles; they rise and dip on hashed grid points
  let o = '';
  const on = x => noise1(s ^ 0x91E, x / 1500) > 0.38;
  const yA = x => Y.pipes + (noise1(s ^ 0x91F, x / 300) - 0.5) * 10;
  for (let x = p.x0; x < p.x1; x += 32) {
    if (!on(x)) continue;
    const a = yA(x), b = yA(x + 32);
    o += pl([[x, a - 4], [x + 32, b - 4], [x + 32, b + 4], [x, a + 4], [x, a - 4]], PAPER, NONE, 0);
    o += thin([[x, a - 4], [x + 32, b - 4]], 1.2, INK(0.8)) + thin([[x, a + 4], [x + 32, b + 4]], 1.2, INK(0.8));
    o += hatch(x, a + 1, x + 32, a + 4, 1.6, 0, INK(0.3), 0.4, r, 0.6);
    if (hash01(s, 841, x) < 0.5) o += pl(rect(x - 1.5, a - 6, 3, 12), PAPER, INK(0.8), 0.8);       // flange
    if (hash01(s, 842, x) < 0.3) o += thin([[x + 16, a + 4], [x + 13, Y.pipes + 14], [x + 19, Y.pipes + 14]], 0.9, INK(0.7));  // saddle
    if (hash01(s, 843, x) < 0.18) o += drips(x, x + 32, a + 4, 8, G(80, 0.35), r, 3);
    // a smaller duct above on some runs
    if (noise1(s ^ 0x920, x / 700) > 0.6) {
      const c = a - 12;
      o += thin([[x, c], [x + 32, b - 12]], 0.9, INK(0.7)) + thin([[x, c - 3], [x + 32, b - 15]], 0.9, INK(0.7));
      if (hash01(s, 844, x) < 0.2) o += vine(x + 10, c, 10, INK(0.55), r);
    }
  }
  return o;
}

function mangrove(x, y, r) {
  // prop roots arching into the flood, a dark canopy
  let o = '';
  const w = 30 + r() * 40, h = 30 + r() * 30;
  for (let i = 0; i < 7; i++) {
    const rx = x + (r() - 0.5) * w, top = y - h * 0.35;
    o += brush([[x + (r() - 0.5) * 8, top], [rx * 0.5 + x * 0.5, top + 6], [rx, y]], 1.2, INK(0.7), r, { noi: 0.3 });
  }
  o += line(x, y - h * 0.3, x + (r() - 0.5) * 6, y - h, 2, INK(0.8), r);
  const can = [];
  for (let i = 0; i <= 18; i++) { const a = Math.PI * (1 + i / 18); can.push([x + Math.cos(a) * w * 0.6 * (0.8 + r() * 0.3), y - h + Math.sin(a) * h * 0.4 * (0.7 + r() * 0.4)]); }
  o += pl([...can, can[0]], G(60, 0.55), INK(0.6), 0.6);
  o += hatch(x - w * 0.5, y - h - h * 0.35, x + w * 0.5, y - h, 2, 0.5, INK(0.35), 0.5, r, 0.6);
  return o;
}

function stiltHouse(x, r) {
  let o = '';
  const w = 22 + r() * 40, h = 14 + r() * 18, floor = Y.apron - 10 + r() * 34, foot = R1 + 6;
  let top = floor - h;
  // stilts down to the old apron, cross-braced
  for (let k = 0; k <= 3; k++) { const sx = x + k * w / 3; o += line(sx, floor, sx + (r() - 0.5) * 3, foot, 1, INK(0.75), r, 0.3); }
  o += thin([[x, floor + 8], [x + w, foot - 6]], 0.5, INK(0.5)) + thin([[x + w, floor + 8], [x, foot - 6]], 0.5, INK(0.5));
  // walls of patched sheet, a tin roof, a lit window
  o += pl(rect(x - 2, top, w + 4, h), PAPER, INK(0.85), 1.2);
  o += pl(rect(x + w * 0.55, top + 1, w * 0.45, h - 1), G(150, 0.35), NONE, 0);
  for (let k = x + 4; k < x + w; k += 5 + r() * 4) o += thin([[k, top + 2], [k, floor - 1]], 0.4, INK(0.4));
  // a second storey built on, smaller and leaning
  if (r() < 0.35) { const w2 = w * (0.45 + r() * 0.3), h2 = 10 + r() * 8, x2 = x + r() * (w - w2); o += pl([[x2, top], [x2 + 1, top - h2], [x2 + w2 + 2, top - h2 - 1], [x2 + w2, top], [x2, top]], PAPER, INK(0.85), 1.1); o += hatch(x2 + 1, top - h2, x2 + w2, top, 1.8, 1.4, INK(0.3), 0.4, r, 0.8); top -= h2; }
  const pitch = r() < 0.6;
  const roof = pitch ? [[x - 6, top + 1], [x + w / 2, top - 10], [x + w + 6, top + 1]] : [[x - 6, top - 2], [x + w + 6, top - 6]];
  o += brush(wob(roof, 0.5, r, 4), 2.2, INK(0.85), r, { taper: false });
  const wx = x + 6 + r() * (w - 16);
  o += pl(rect(wx, top + 5, 7, 7), G(70, 0.7), NONE, 0);
  if (r() < 0.75) o += lamp(wx + 3.5, top + 8.5, 2.2, L.breathe, r(), 0.85);
  // walkway plank and a laundry line
  o += thin([[x + w + 2, floor], [x + w + 30, floor + 4]], 1, INK(0.7));
  if (r() < 0.5) { const ln = sagLine(x + w + 2, top + 4, x + w + 40, top + 8, 4, 8); o += thin(ln, 0.4, INK(0.5)); for (let k = 2; k < 8; k += 2) o += pl(rect(ln[k][0] - 2, ln[k][1], 4, 6), G(110, 0.5), NONE, 0); }
  if (r() < 0.3) o += lamp(x - 4, top + 2, 1.8, L.breathe, r(), 0.8);   // a lantern on the corner
  return o;
}

function nets(x, w, r) {
  // aquaculture: posts in a row, net panels between them, floats on the line
  let o = '';
  const y0 = R1 + 2, y1 = Y.pipes - 6;
  const n = 3 + (r() * 4 | 0), step = w / n;
  for (let i = 0; i <= n; i++) {
    const px = x + i * step + (r() - 0.5) * 4;
    o += line(px, y0 - 10 - r() * 8, px + (r() - 0.5) * 2, y1, 1.1, INK(0.75), r, 0.3);
    if (i < n) {
      const qx = x + (i + 1) * step;
      o += thin(sagLine(px, y0, qx, y0, 3, 6), 0.6, INK(0.6));
      for (let k = px + 3; k < qx; k += 4) o += thin([[k, y0 + 2], [k + (r() - 0.5), y1 - 2]], 0.3, INK(0.3));
      for (let yy = y0 + 5; yy < y1; yy += 5) o += thin([[px, yy], [qx, yy + (r() - 0.5)]], 0.3, INK(0.28));
      for (let k = 1; k < 3; k++) { const fx = px + k * step / 3; const f = []; for (let a = 0; a <= 8; a++) f.push([fx + Math.cos(a / 8 * Math.PI * 2) * 1.8, y0 + 1.5 + Math.sin(a / 8 * Math.PI * 2) * 1.8]); o += pl(f, PAPER, INK(0.7), 0.6); }
    }
  }
  return o;
}

function longtail(x, y, r) {
  // a long narrow hull, an engine on a long tail shaft, a lamp at the bow
  let o = '';
  const len = 70 + r() * 30, d = r() < 0.5 ? 1 : -1;
  const hull = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; hull.push([x + d * len * t, y - 4 * Math.sin(Math.PI * t) - (t > 0.85 ? (t - 0.85) * 40 : 0)]); }
  const keel = hull.map(([a, b], i) => [a, b + 5 - Math.abs(i - 8) * 0.25]).reverse();
  o += pl([...hull, ...keel, hull[0]], PAPER, INK(0.85), 1.2);
  o += thin(hull.map(([a, b]) => [a, b + 2]), 0.5, INK(0.5));
  o += line(x, y - 1, x - d * 30, y + 6, 1, INK(0.8), r, 0.2);
  o += pl(rect(x - d * 4 - 4, y - 8, 8, 6), PAPER, INK(0.8), 0.9);
  o += lamp(x + d * len, y - 10, 1.8, L.breathe, r(), 0.85);
  return o;
}

function rubble(x, r) {
  // a mound of broken slab and rebar, washed in
  let o = '';
  const w = 40 + r() * 90, h = 8 + r() * 16, y = Y.apron + 14 + r() * 30;
  const pts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([x + w * t, y - h * Math.sin(Math.PI * t) * (0.7 + r() * 0.5)]); }
  o += pl([...pts, pts[0]], G(150, 0.4), NONE, 0);
  o += brush(pts, 1.4, INK(0.6), r, { noi: 0.5 });
  for (let k = 0; k < 5; k++) { const sx = x + r() * w, sy = y - r() * h; o += pl([[sx, sy], [sx + 8 + r() * 10, sy - 3 - r() * 5], [sx + 12 + r() * 8, sy + 2], [sx, sy]], PAPER, INK(0.7), 0.8); }
  for (let k = 0; k < 4; k++) { const sx = x + r() * w, sy = y - r() * h * 0.6; o += thin([[sx, sy], [sx + (r() - 0.5) * 14, sy - 6 - r() * 10]], 0.6, INK(0.6)); }
  o += tufts(x, x + w, y, 8, INK(0.55), r, 3);
  return o;
}

export function ground(s, p, r0) {
  const r = rngFor(s, p.c, 4);
  let o = '';
  for (let i = 0; i < (p.quiet ? 1 : 2); i++) if (r() < 0.55) o += rubble(p.x0 + r() * 440, r);
  // ground texture: sparse asphalt strokes over the whole band
  o += hatch(p.x0, Y.apron + 8, p.x1, Y.bottom, 9, 0.02, INK(0.12), 0.5, r, 0.35);
  o += taxiway(s, p, r);
  o += runway(s, p, r);
  o += fence(s, p, r);
  o += pipes(s, p, r);
  const dens = p.dens;
  // grass everywhere, thicker in quiet stretches
  o += tufts(p.x0, p.x1, Y.apron + 4, 9, INK(0.5), r, 4 + (1 - dens) * 8 | 0);
  o += tufts(p.x0, p.x1, Y.bottom - 2, 16, INK(0.65), r, 3 + (1 - dens) * 6 | 0);
  if (p.passage === 'kampung') {
    let x = p.x0 + r() * 30;
    while (x < p.x1 - 40) { if (r() < 0.7 + 0.3 * dens) o += stiltHouse(x, r); x += 18 + r() * 60; }
    if (r() < 0.8) o += nets(p.x0 + 40 + r() * 200, 120 + r() * 120, r);
    for (let i = 0; i < 2; i++) if (r() < 0.6) o += longtail(p.x0 + 40 + r() * 420, R1 + 20 + r() * 20, r);
  } else if (!p.quiet && r() < 0.6) o += carts(p.x0 + 40 + r() * 380, r);
  if (p.passage === 'open' || r() < 0.25) for (let i = 0; i < 1 + (r() * 2 | 0); i++) o += mangrove(p.x0 + r() * 512, Y.pipes - 2 + r() * 20, r);
  if (p.passage === 'open' && r() < 0.35) o += longtail(p.x0 + 80 + r() * 340, R1 + 18 + r() * 24, r);
  return o;
}
