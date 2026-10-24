// Layer 1, far: megacity and arcology silhouettes, cranes, the seawall, faint windows. Pale and low
// contrast (the role of upstream's distMount); the shader fog dissolves the bases into the horizon.
// Every item belongs to the chunk that holds its anchor x, on fixed grids, so chunks join seamlessly.
import { G, NONE, pl, thin, lamp, L, wob, brush, hatch, sagLine } from './ink.js';
import { hash01, rngFor, noise1, fbm1 } from './rng.js';
import { Y } from './planner.js';

function tower(s, x, base, w, h, tone, r, lit) {
  let o = '';
  const top = base - h;
  const kind = r();
  let shape;
  if (kind < 0.55) shape = [[x, base], [x, top], [x + w, top], [x + w, base]];
  else if (kind < 0.8) { const st = w * 0.2; shape = [[x, base], [x, top + h * 0.3], [x + st, top + h * 0.3], [x + st, top], [x + w - st, top], [x + w - st, top + h * 0.15], [x + w, top + h * 0.15], [x + w, base]]; }
  else { shape = [[x, base], [x + w * 0.1, top], [x + w * 0.9, top], [x + w, base]]; }
  // a snapped crown on some: the ruin line
  if (r() < 0.35) { const k = shape.findIndex(p => p[1] === top); if (k > 0) shape.splice(k + 1, 0, [shape[k][0] + w * 0.3, top + h * 0.12], [shape[k][0] + w * 0.5, top + h * 0.04]); }
  o += pl([...shape, shape[0]], G(tone, 0.28 + r() * 0.12), G(tone - 40, 0.3), 0.6);
  // a few floor lines, paler toward the base
  for (let y = top + 8; y < base - 6; y += 7 + r() * 9) if (r() < 0.45) o += thin([[x + 1, y], [x + w - 1, y]], 0.4, G(tone - 30, 0.22));
  // windows: faint, mostly steady, a few flickering
  if (lit) {
    const cols = Math.max(1, Math.floor(w / 5)), rows = Math.floor(h / 9);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (r() > 0.07) continue;
      o += lamp(x + 2.5 + i * (w - 5) / Math.max(1, cols - 1 || 1), top + 6 + j * 9, 1.1, r() < 0.2 ? L.flicker : L.steady, r(), 0.35 + r() * 0.3);
    }
  }
  // tall ones keep a red beacon
  if (h > 120 && r() < 0.6) { o += thin([[x + w / 2, top], [x + w / 2, top - 14]], 0.6, G(tone - 40, 0.35)); o += lamp(x + w / 2, top - 14, 1.6, L.beacon, r(), 0.8); }
  return o;
}

function arcology(x, base, w, h, tone, r) {
  // stepped mass with terraces and a hanging green fringe
  let o = '';
  const steps = 3 + (r() * 3 | 0);
  const pts = [[x, base]];
  for (let i = 0; i < steps; i++) {
    const t = i / steps, yy = base - h * (i + 1) / steps, inset = w * 0.5 * t * 0.8;
    pts.push([x + inset, base - h * i / steps], [x + inset, yy]);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const t = i / steps, inset = w * 0.5 * t * 0.8;
    pts.push([x + w - inset, base - h * (i + 1) / steps], [x + w - inset, base - h * i / steps]);
  }
  pts.push([x + w, base]);
  o += pl([...pts, pts[0]], G(tone, 0.32), G(tone - 40, 0.3), 0.6);
  for (let i = 1; i < steps; i++) {
    const yy = base - h * i / steps, inset = w * 0.5 * (i / steps) * 0.8;
    o += hatch(x + inset, yy, x + w - inset, yy + 4, 2.5, Math.PI / 2, G(tone - 50, 0.25), 0.5, r, 0.6);
  }
  return o;
}

function crane(x, base, h, tone, r) {
  // tower crane: lattice mast, jib, counter jib, a hanging line
  let o = '';
  const top = base - h, jib = 50 + r() * 60, cj = jib * 0.35, mw = 3;
  const col = G(tone - 50, 0.4);
  o += thin([[x, base], [x, top]], 0.7, col) + thin([[x + mw, base], [x + mw, top]], 0.7, col);
  for (let y = base; y > top + 4; y -= 6) o += thin([[x, y], [x + mw, y - 6]], 0.4, col);
  const dir = r() < 0.5 ? 1 : -1;
  o += thin([[x + mw / 2 - dir * cj, top], [x + mw / 2 + dir * jib, top]], 0.8, col);
  o += thin([[x + mw / 2, top - 12], [x + mw / 2 + dir * jib, top]], 0.4, col) + thin([[x + mw / 2, top - 12], [x + mw / 2 - dir * cj, top]], 0.4, col);
  o += pl([[x + mw / 2 - dir * cj, top], [x + mw / 2 - dir * cj, top + 5], [x + mw / 2 - dir * (cj - 7), top + 5], [x + mw / 2 - dir * (cj - 7), top]], G(tone - 30, 0.35), NONE, 0);
  const hx = x + mw / 2 + dir * jib * (0.4 + r() * 0.5);
  o += thin([[hx, top], [hx + (r() - 0.5) * 3, top + 20 + r() * 50]], 0.35, col);
  if (r() < 0.5) o += lamp(x + mw / 2 + dir * jib, top, 1.3, L.beacon, r(), 0.7);
  return o;
}

// megastructure ruins: the deep parallax behind the city. Giant piers carrying a broken deck,
// stripped tower frames, a great pipe arcing between supports. Palest of all; they fill the sky.
function wash(pts, tone, a) { return pl([...pts, pts[0]], G(tone, a), NONE, 0); }
function fadeBase(x0, x1, yTop, yBase) {
  // stacked paper bands: the base dissolves into the haze
  let o = '';
  for (let k = 0; k < 4; k++) { const y = yTop + (yBase - yTop) * (k / 4); o += pl(rect4(x0, y, x1 - x0, yBase - y), G(255, 0.14), NONE, 0); }
  return o;
}
const rect4 = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

function deck(x, r) {
  let o = '';
  const n = 2 + (r() * 2 | 0), span = 150 + r() * 120, dy = 70 + r() * 90, th = 14 + r() * 10;
  const base = Y.horizon - 4, w = n * span;
  const brokeL = r() < 0.5, cut = brokeL ? x + span * (0.2 + r() * 0.3) : x + w - span * (0.2 + r() * 0.3);
  for (let i = 0; i <= n; i++) {
    const px = x + i * span, pw = 16 + r() * 10;
    if ((brokeL && px < cut - 10) || (!brokeL && px > cut + 10)) {
      // a pier left standing alone, snapped
      const h = (base - dy) * (0.3 + r() * 0.4);
      o += wash([[px, base], [px, base - h], [px + pw * 0.4, base - h - 8], [px + pw, base - h + 4], [px + pw, base]], 200, 0.3);
      continue;
    }
    o += wash([[px, base], [px + 3, dy + th], [px + pw - 3, dy + th], [px + pw, base]], 196, 0.32);
    o += thin([[px + pw * 0.7, dy + th + 4], [px + pw * 0.7, base]], 0.5, G(160, 0.3));
  }
  const a = brokeL ? cut : x, b = brokeL ? x + w + 16 : cut;
  o += wash([[a, dy], [b, dy], [b, dy + th], [a, dy + th]], 188, 0.38);
  o += thin([[a, dy + th], [b, dy + th]], 0.8, G(140, 0.4));
  // underside: cables and roots hanging off the deck
  for (let k = a + 8; k < b; k += 9 + r() * 22) {
    const l = 10 + Math.pow(r(), 2) * 90;
    o += thin([[k, dy + th], [k + (r() - 0.5) * 4, dy + th + l]], 0.5, G(165, 0.35));
  }
  // rebar at the break, drooping
  const e = brokeL ? a : b, d = brokeL ? -1 : 1;
  for (let k = 0; k < 6; k++) o += thin(sagLine(e, dy + 2 + k * 2, e + d * (8 + r() * 18), dy + 10 + k * 4 + r() * 20, 4, 6), 0.5, G(150, 0.4));
  o += fadeBase(x - 10, x + w + 30, base - 120, base);
  return o;
}

function frame(x, r) {
  // a tower stripped to its frame: columns and floor beams, a corner gone
  let o = '';
  const w = 60 + r() * 70, top = 60 + r() * 120, base = Y.horizon - 4;
  const cols = 3 + (r() * 3 | 0), fl = 13 + r() * 6;
  const gone = (cx, fy) => cx > x + w * (0.4 + r() * 0.1) && fy < top + (base - top) * 0.35;
  o += wash([[x, base], [x, top], [x + w, top], [x + w, base]], 228, 0.18);
  for (let i = 0; i <= cols; i++) {
    const cx = x + i * w / cols;
    const t = i > cols / 2 ? top + (base - top) * (0.15 + r() * 0.3) : top;
    o += thin([[cx, base], [cx, t]], 1.6, G(175, 0.38));
  }
  for (let fy = top; fy < base - 8; fy += fl) {
    for (let i = 0; i < cols; i++) {
      const cx = x + i * w / cols;
      if (gone(cx, fy) || r() < 0.08) continue;
      o += thin([[cx, fy], [cx + w / cols, fy + (r() < 0.1 ? 6 : 0)]], 1, G(170, 0.36));
      if (r() < 0.12) o += thin([[cx + 2, fy + 2], [cx + w / cols * 0.7, fy + fl * 0.9]], 0.5, G(170, 0.3));
    }
  }
  // greenery spilling from the open floors
  for (let k = 0; k < 6; k++) { const vx = x + r() * w, vy = top + r() * (base - top) * 0.6; o += thin([[vx, vy], [vx + (r() - 0.5) * 3, vy + 10 + r() * 30]], 0.6, G(160, 0.35)); }
  if (r() < 0.7) o += lamp(x + w * 0.2, top - 3, 1.6, L.beacon, r(), 0.7);
  o += fadeBase(x - 6, x + w + 6, base - 110, base);
  return o;
}

function greatPipe(x, r) {
  let o = '';
  const w = 320 + r() * 260, h = 120 + r() * 120, base = Y.horizon - 4, d = 12 + r() * 8;
  const P = t => [x + w * t, base - 20 - h * Math.sin(Math.PI * Math.min(1, t * 1.15))];
  const a = [], b = [];
  const end = r() < 0.5 ? 0.82 : 1;      // some end in the air, torn
  for (let i = 0; i <= 30 * end; i++) { const [px, py] = P(i / 30); a.push([px, py - d / 2]); b.push([px, py + d / 2]); }
  o += pl([...a, ...b.reverse(), a[0]], G(195, 0.3), G(150, 0.3), 0.6);
  for (let i = 3; i < 30 * end; i += 4) { const [px, py] = P(i / 30); o += thin([[px, py - d / 2], [px, py + d / 2]], 0.8, G(150, 0.35)); }
  for (let i = 6; i < 30 * end; i += 8) { const [px, py] = P(i / 30); o += thin([[px - 3, py + d / 2], [px - 6, base], [px + 6, base], [px + 3, py + d / 2]], 0.7, G(170, 0.32)); }
  return o;
}

function megas(s, p) {
  let o = '';
  const g = 560;
  for (let j = Math.ceil(p.x0 / g); j * g < p.x1; j++) {
    const h = hash01(s, 531, j);
    if (h > 0.62) continue;
    const rr = rngFor(s, j, 532), x = j * g + rr() * 200;
    o += h < 0.25 ? deck(x, rr) : h < 0.48 ? frame(x, rr) : greatPipe(x, rr);
  }
  return o;
}

export function far(s, p) {
  const r = rngFor(s, p.c, 1);
  let o = '';
  const { x0, x1 } = p;
  const big = 0.7 + 0.7 * fbm1(s ^ 0xFA1, x0 / 9000, 2);
  o += megas(s, p);
  // back row: palest, many thin towers
  const g1 = 17;
  for (let j = Math.ceil(x0 / g1); j * g1 < x1; j++) {
    if (hash01(s, 501, j) > 0.42 + 0.25 * p.dens) continue;
    const rr = rngFor(s, j, 502);
    const w = 8 + rr() * 18, h = (25 + Math.pow(rr(), 1.8) * 150) * big;
    o += tower(s, j * g1, Y.horizon - 6, w, h, 205, rr, rr() < 0.5);
  }
  // front row: a little darker, fewer, wider
  const g2 = 41;
  for (let j = Math.ceil(x0 / g2); j * g2 < x1; j++) {
    const h0 = hash01(s, 511, j);
    if (h0 > 0.3 + 0.35 * p.dens) continue;
    const rr = rngFor(s, j, 512);
    if (h0 < 0.05) o += arcology(j * g2, Y.horizon, 70 + rr() * 80, (80 + rr() * 120) * big, 180, rr);
    else o += tower(s, j * g2 + rr() * 10, Y.horizon, 14 + rr() * 26, (30 + Math.pow(rr(), 1.5) * 190) * big, 185, rr, true);
  }
  // cranes over the city
  const g3 = 131;
  for (let j = Math.ceil(x0 / g3); j * g3 < x1; j++) {
    if (hash01(s, 521, j) > 0.22 + 0.2 * p.dens) continue;
    const rr = rngFor(s, j, 522);
    o += crane(j * g3, Y.horizon, 90 + rr() * 110, 190, rr);
  }
  // seawall: a low continuous band with breaches; the line is a pure function of x
  const wall = x => Y.horizon - 2 + (noise1(s ^ 0x5EA, x / 140) - 0.5) * 3;
  const top = [], bot = [];
  for (let x = x0; x <= x1 + 0.01; x += 16) { top.push([x, wall(x) - 5]); bot.push([x, wall(x) + 2]); }
  o += pl([...top, ...bot.reverse(), top[0]], G(165, 0.4), NONE, 0);
  for (let x = Math.ceil(x0 / 16) * 16; x < x1; x += 16) {
    if (noise1(s ^ 0x5EB, x / 230) > 0.78) continue;          // breach: no top line
    o += thin([[x, wall(x) - 5], [Math.min(x1, x + 16), wall(x + 16) - 5]], 0.8, G(120, 0.45));
  }
  // faint ground below the horizon, so the far layer sits on something
  o += hatch(x0, Y.horizon + 2, x1, Y.horizon + 14, 3, 0, G(170, 0.2), 0.5, r, 0.4);
  return o;
}
