// Layer 3, mid: the landmarks, spaced like upstream's huts and pavilions. The control tower (rare,
// recurring), jet bridges hanging off a terminal pier, a wrecked airliner broken in sections with its
// tail fin standing, a parking structure, a monorail on piers with a broken span.
import { G, PAPER, NONE, pl, thin, brush, wob, line, hatch, drips, tufts, vine, lamp, neon, L, sagLine, rect } from './ink.js';
import { hash01, rngFor, noise1 } from './rng.js';
import { Y, plan } from './planner.js';

const B = Y.mid;
const INK = a => G(30, a);

function controlTower(x, r) {
  let o = '';
  const h = 200 + r() * 40, top = B - h;
  const w0 = 26, w1 = 17;
  // base block
  o += pl(rect(x - 46, B - 34, 92, 34), PAPER, NONE, 0);
  o += line(x - 46, B - 34, x + 46, B - 34, 1.6, INK(0.8), r) + line(x - 46, B - 34, x - 46, B, 1.4, INK(0.7), r) + line(x + 46, B - 34, x + 46, B, 1.4, INK(0.7), r);
  for (let k = x - 40; k < x + 40; k += 11) o += pl(rect(k, B - 26, 6, 10), G(80, 0.5), NONE, 0);
  // shaft
  const shaft = [[x - w0 / 2, B - 34], [x - w1 / 2, top + 40], [x + w1 / 2, top + 40], [x + w0 / 2, B - 34]];
  o += pl([...shaft, shaft[0]], PAPER, NONE, 0);
  o += brush(wob([shaft[0], shaft[1]], 0.6, r, 5), 2, INK(0.85), r, { taper: false }) + brush(wob([shaft[3], shaft[2]], 0.6, r, 5), 2, INK(0.85), r, { taper: false });
  o += hatch(x + 1, top + 42, x + w0 / 2 - 1, B - 36, 2.4, Math.PI / 2, INK(0.3), 0.5, r, 0.9);
  for (let y = top + 60; y < B - 40; y += 22) o += thin([[x - 5, y], [x - 5, y + 8]], 1.2, INK(0.55));
  // cab: inverted trapezoid, slanted glazing, many panes gone
  const cw = 64, ch = 26, cy = top + 14;
  const cab = [[x - cw / 2, cy], [x + cw / 2, cy], [x + cw / 2 - 8, cy + ch], [x - cw / 2 + 8, cy + ch]];
  o += pl([[x - w1 / 2 - 6, cy + ch], [x - w1 / 2 - 6, top + 46], [x + w1 / 2 + 6, top + 46], [x + w1 / 2 + 6, cy + ch]], PAPER, INK(0.8), 1.2);
  o += pl([...cab, cab[0]], G(120, 0.6), INK(0.9), 1.6);
  for (let i = 0; i <= 8; i++) { const t = i / 8; o += thin([[x - cw / 2 + cw * t, cy], [x - cw / 2 + 8 + (cw - 16) * t, cy + ch]], 0.8, INK(0.7)); }
  for (let i = 0; i < 8; i++) if (r() < 0.45) { const t = (i + 0.5) / 8; o += hatch(x - cw / 2 + cw * t - 3, cy + 2, x - cw / 2 + cw * t + 3, cy + ch - 2, 1.6, 1.1, INK(0.45), 0.4, r); }
  o += lamp(x - 10 + r() * 20, cy + ch * 0.5, 2.2, L.flicker, r(), 0.6);
  // roof cap, mast, beacon
  o += line(x - cw / 2 - 4, cy, x + cw / 2 + 4, cy, 2.4, INK(0.9), r);
  o += pl(rect(x - 20, cy - 8, 40, 8), PAPER, INK(0.8), 1);
  o += line(x + 6, cy - 8, x + 6, cy - 48, 1.2, INK(0.8), r);
  for (let y = cy - 14; y > cy - 46; y -= 8) o += thin([[x + 3, y], [x + 9, y]], 0.6, INK(0.6));
  o += lamp(x + 6, cy - 50, 2.8, L.beacon, r(), 1);
  o += lamp(x - 14, cy - 9, 1.6, L.blink, r(), 0.8);
  // reclaimed: vines off the cab, rust, grass on the base
  for (let i = 0; i < 6; i++) o += vine(x - cw / 2 + 6 + r() * (cw - 12), cy + ch - 1, 14 + r() * 50, INK(0.65), r);
  o += drips(x - w1 / 2, x + w1 / 2, top + 48, 30, G(70, 0.4), r, 8);
  o += tufts(x - 46, x + 46, B - 34, 8, INK(0.6), r, 8);
  return o;
}

function airliner(x, r) {
  // fuselage in three broken sections on the ground, tail fin standing, a wing stub and an engine
  let o = '';
  const base = B + 18, d = 30;
  const sections = [[0, 120, -0.03], [134, 116, 0.05], [262, 104, -0.02]];
  const flip = r() < 0.5 ? -1 : 1;
  const X = u => x + flip * (u - 180);
  for (const [u0, len, tilt] of sections) {
    const a0 = X(u0), a1 = X(u0 + len), lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    const yc = base - d / 2;
    const dy = (hi - lo) * tilt;
    const body = [[lo, yc - d / 2], [hi, yc - d / 2 + dy], [hi, yc + d / 2 + dy], [lo, yc + d / 2], [lo, yc - d / 2]];
    o += pl(body, PAPER, NONE, 0);
    o += brush(wob([body[0], body[1]], 0.5, r, 5), 2, INK(0.85), r, { taper: false });
    o += brush(wob([body[3], body[2]], 0.5, r, 5), 1.8, INK(0.8), r, { taper: false });
    // broken ends show the frames
    for (const ex of [lo, hi]) {
      const e = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; e.push([ex + Math.sin(t * Math.PI) * 6 * (ex === lo ? -1 : 1) * (0.4 + r() * 0.6), yc - d / 2 + d * t + (ex === hi ? dy : 0)]); }
      o += brush(e, 1.2, INK(0.7), r, { taper: false });
      for (let k = 1; k < 4; k++) o += thin([[ex + (ex === lo ? 1 : -1) * k * 5, yc - d / 2 + 2 + (ex === hi ? dy : 0)], [ex + (ex === lo ? 1 : -1) * k * 5, yc + d / 2 - 2 + (ex === hi ? dy : 0)]], 0.6, INK(0.45));
    }
    // window row and a cheat line
    for (let k = lo + 8; k < hi - 8; k += 7) if (r() < 0.8) { const ky = yc - 5 + (k - lo) * tilt; o += pl(rect(k, ky, 3, 4), G(60, 0.7), NONE, 0); }
    o += thin([[lo + 4, yc + 2], [hi - 4, yc + 2 + dy]], 0.8, INK(0.5));
    o += hatch(lo + 2, yc + 4, hi - 2, yc + d / 2 - 1, 2.6, 0, INK(0.22), 0.5, r, 0.8);
    o += tufts(lo, hi, base + 2, 10, INK(0.6), r, 5);
  }
  // nose cone on the first section
  const n0 = X(0);
  o += pl([[n0, base - d], [n0 - flip * 26, base - d * 0.45], [n0, base], [n0, base - d]], PAPER, INK(0.8), 1.4);
  o += pl([[n0 - flip * 4, base - d + 6], [n0 - flip * 14, base - d * 0.7], [n0 - flip * 4, base - d * 0.62]], G(70, 0.6), NONE, 0);
  // tail section with the fin standing
  const t0 = X(366), t1 = X(366 + 70);
  o += pl([[t0, base - d], [t1, base - d * 0.7], [t1, base - d * 0.35], [t0, base], [t0, base - d]], PAPER, INK(0.8), 1.4);
  const fin = [[t0 + flip * 8, base - d], [t1 - flip * 4, base - d - 74], [t1 + flip * 12, base - d - 74], [t1 + flip * 6, base - d * 0.7]];
  o += pl([...fin, fin[0]], PAPER, INK(0.9), 1.8);
  o += hatch(Math.min(fin[1][0], fin[0][0]), base - d - 70, Math.max(fin[2][0], fin[3][0]), base - d - 4, 3, 1.2, INK(0.2), 0.5, r, 0.6);
  // an invented livery mark on the fin: two bars and a ring, no real airline
  const fx = (fin[1][0] + fin[2][0]) / 2, fy = base - d - 46;
  o += pl([[fx - 8, fy], [fx + 8, fy], [fx + 6, fy + 4], [fx - 10, fy + 4], [fx - 8, fy]], G(50, 0.75), NONE, 0);
  o += pl([[fx - 6, fy + 10], [fx + 10, fy + 10], [fx + 8, fy + 14], [fx - 8, fy + 14], [fx - 6, fy + 10]], G(50, 0.75), NONE, 0);
  o += lamp(t1 + flip * 10, base - d - 74, 1.8, L.blink, r(), 0.7);
  // wing stub and engine nacelle on the ground
  const wx = X(150);
  o += pl([[wx, base - 8], [wx + flip * 110, base - 2], [wx + flip * 112, base + 4], [wx - flip * 20, base + 2], [wx, base - 8]], PAPER, INK(0.75), 1.2);
  const ex = X(200);
  o += pl([[ex, base - 2], [ex + flip * 34, base - 3], [ex + flip * 36, base + 10], [ex, base + 11], [ex, base - 2]], PAPER, INK(0.85), 1.4);
  o += pl([[ex + flip * 2, base], [ex + flip * 6, base], [ex + flip * 6, base + 9], [ex + flip * 2, base + 9]], G(40, 0.8), NONE, 0);
  for (let i = 0; i < 5; i++) o += vine(X(20 + r() * 340), base - d + 2, 6 + r() * 12, INK(0.6), r);
  return o;
}

function parking(x, r) {
  let o = '';
  const w = 170 + r() * 50, decks = 4 + (r() * 2 | 0), dh = 19;
  const top = B - decks * dh;
  const fall = r() < 0.5 ? 0 : 1;                             // which corner collapsed
  o += pl([[x, B], [x, top], [x + w, top], [x + w, B], [x, B]], PAPER, NONE, 0);
  o += hatch(x + 2, top + 2, x + w - 2, B - 2, 3, 0, G(80, 0.18), 0.5, r, 0.7);
  for (let k = 0; k <= decks; k++) {
    const y = B - k * dh;
    if (k > 0 && k >= decks - 1) {
      // top decks: the collapsed corner pancakes down
      const cut = fall ? x + w * 0.62 : x + w * 0.38;
      const drop = (decks - k + 1) * 9;
      if (fall) { o += line(x, y, cut, y, 2.4, INK(0.85), r); o += line(cut, y, x + w, y + drop + 10, 2.4, INK(0.85), r); }
      else { o += line(x, y + drop + 10, cut, y, 2.4, INK(0.85), r); o += line(cut, y, x + w, y, 2.4, INK(0.85), r); }
      o += pl(sagLine(cut, y + 2, cut + (fall ? 30 : -30), y + 6, 8), NONE, INK(0.5), 0.6);
    } else o += line(x, y, x + w, y, 2.2, INK(0.85), r);
    o += drips(x, x + w, y + 2, 6, G(80, 0.3), r, 6);
  }
  for (let cx = x; cx <= x + w + 0.1; cx += w / 6) o += line(cx, top + dh, cx, B, 1.6, INK(0.75), r);
  // ramp
  o += line(x + 8, B - 2, x + w * 0.45, B - dh + 2, 1, INK(0.6), r);
  // vines draping off the deck edges
  for (let i = 0; i < 8; i++) o += vine(x + r() * w, B - (1 + (r() * (decks - 1) | 0)) * dh + 2, 6 + r() * 16, INK(0.6), r);
  // a dead car or two
  for (let i = 0; i < 2; i++) { const cx = x + 10 + r() * (w - 40), cy = B - dh * (1 + (r() * 2 | 0)); o += pl([[cx, cy], [cx + 3, cy - 6], [cx + 16, cy - 6], [cx + 20, cy], [cx, cy]], PAPER, INK(0.7), 0.9); }
  // a flickering neon glyph on the end wall: an invented mark (ring and bar), never a word
  const gx = fall ? x + 18 : x + w - 18, gy = top + dh + 14;
  const ring = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2; ring.push([gx + Math.cos(a) * 6, gy + Math.sin(a) * 6]); }
  o += neon(ring, 1.4, L.flicker, r(), 0.9) + neon([[gx - 9, gy + 11], [gx + 9, gy + 11]], 1.4, L.flicker, r(), 0.9);
  o += thin(ring, 0.6, INK(0.4));
  o += tufts(x, x + w, top, 7, INK(0.6), r, 10);
  return o;
}

function jetBridges(s, p, r) {
  // a gate pier wall across the chunk, with bridges hanging off it
  let o = '';
  const L0 = plan(s, p.c - 1).passage !== 'terminal', R0 = plan(s, p.c + 1).passage !== 'terminal';
  const x0 = p.x0 + (L0 ? 100 : 0), x1 = p.x1 - (R0 ? 100 : 0);
  const top = B - 40;
  o += pl([[x0, B], [x0, top], [x1, top], [x1, B], [x0, B]], PAPER, NONE, 0);
  o += line(x0, top, x1, top, 1.8, INK(0.8), r) + line(x0, top + 14, x1, top + 14, 0.8, INK(0.5), r);
  for (let x = Math.ceil(x0 / 12) * 12; x < x1; x += 12) if (hash01(s, 701, x) < 0.6) o += pl(rect(x + 2, top + 3, 7, 9), G(90, 0.45), NONE, 0);
  if (L0) o += line(x0, top, x0, B, 1.6, INK(0.8), r);
  if (R0) o += line(x1, top, x1, B, 1.6, INK(0.8), r);
  for (let x = Math.ceil(x0 / 128) * 128 + 40; x < x1 - 30; x += 128) {
    const rr = rngFor(s, x, 702);
    const dir = rr() < 0.5 ? -1 : 1, len = 70 + rr() * 40, droop = rr() * 20, collapsed = rr() < 0.3;
    const ax = x, ay = top + 10, bx = x + dir * len, by = ay + droop + (collapsed ? 40 : 0);
    const tube = [[ax, ay - 7], [bx, by - 7], [bx, by + 7], [ax, ay + 7], [ax, ay - 7]];
    o += pl(tube, PAPER, INK(0.85), 1.4);
    for (let k = 1; k < 8; k++) { const t = k / 8; o += thin([[ax + (bx - ax) * t, ay - 7 + (by - ay) * t], [ax + (bx - ax) * t, ay + 7 + (by - ay) * t]], 0.6, INK(0.45)); }
    // accordion cab at the free end
    o += pl([[bx, by - 9], [bx + dir * 12, by - 8], [bx + dir * 12, by + 9], [bx, by + 9], [bx, by - 9]], PAPER, INK(0.85), 1.2);
    for (let k = 2; k < 12; k += 3) o += thin([[bx + dir * k, by - 8], [bx + dir * k, by + 8]], 0.5, INK(0.6));
    if (!collapsed) {
      const lx = ax + (bx - ax) * 0.7;
      o += line(lx, ay + 7 + (by - ay) * 0.7, lx, B + 6, 1.4, INK(0.8), r);
      o += pl(rect(lx - 6, B + 2, 12, 5), PAPER, INK(0.7), 0.8);
    }
    o += vine(bx, by + 8, 10 + rr() * 20, INK(0.6), rr);
    if (rr() < 0.4) o += lamp(bx + dir * 6, by - 10, 1.4, L.breathe, rr(), 0.6);
  }
  return o;
}

function monorail(s, p, r) {
  let o = '';
  const g = 118, beam = 432;
  const on = x => noise1(s ^ 0x40A, x / 2600) > 0.48;
  const broken = j => hash01(s, 711, j) < 0.13;
  for (let j = Math.ceil(p.x0 / g); j * g < p.x1; j++) {
    const x = j * g;
    if (!on(x)) continue;
    // T pier
    o += pl([[x - 4, B], [x - 3, beam + 8], [x + 3, beam + 8], [x + 4, B], [x - 4, B]], PAPER, INK(0.8), 1.2);
    o += line(x - 12, beam + 8, x + 12, beam + 8, 2, INK(0.85), r);
    o += drips(x - 3, x + 3, beam + 10, 20, G(70, 0.35), r, 3);
    if (!on(x + g)) continue;
    const x2 = x + g;
    if (!broken(j)) {
      o += pl([[x, beam], [x2, beam], [x2, beam + 8], [x, beam + 8], [x, beam]], PAPER, INK(0.85), 1.3);
      o += thin([[x, beam + 4], [x2, beam + 4]], 0.5, INK(0.4));
      if (hash01(s, 712, j) < 0.25) o += vine(x + r() * g, beam + 8, 10 + r() * 30, INK(0.6), r);
      if (hash01(s, 713, j) < 0.3) o += lamp(x + g / 2, beam - 1, 1.2, L.blink, r(), 0.5);
    } else {
      // broken span: the two ends hang, rebar out, sometimes a car still on it
      const a = 18 + r() * 20, b = 26 + r() * 30;
      o += pl([[x, beam], [x + g * 0.35, beam + a], [x + g * 0.33, beam + a + 8], [x, beam + 8], [x, beam]], PAPER, INK(0.85), 1.3);
      o += pl([[x2, beam], [x2 - g * 0.3, beam + b], [x2 - g * 0.28, beam + b + 8], [x2, beam + 8], [x2, beam]], PAPER, INK(0.85), 1.3);
      for (let k = 0; k < 4; k++) {
        o += thin([[x + g * 0.34, beam + a + 2 + k * 2], [x + g * 0.34 + 6 + r() * 8, beam + a + 6 + k * 3 + r() * 6]], 0.5, INK(0.6));
        o += thin([[x2 - g * 0.29, beam + b + 2 + k * 2], [x2 - g * 0.29 - 6 - r() * 8, beam + b + 6 + k * 3 + r() * 6]], 0.5, INK(0.6));
      }
      if (r() < 0.6) {
        const cx = x + 6, cy = beam - 2;
        o += pl([[cx, cy - 12], [cx + 30, cy - 12 + a * 0.85], [cx + 30, cy + a * 0.85], [cx, cy], [cx, cy - 12]], PAPER, INK(0.85), 1.2);
        for (let k = 0; k < 4; k++) o += pl(rect(cx + 3 + k * 7, cy - 9 + k * 7 * a / 34, 4, 4), G(60, 0.7), NONE, 0);
      }
    }
  }
  return o;
}

export function mid(s, p) {
  const r = rngFor(s, p.c, 3);
  let o = '';
  o += monorail(s, p, r);
  if (p.passage === 'terminal') o += jetBridges(s, p, r);
  for (const lm of p.landmarks) {
    const x = p.x0 + lm.u * 512;
    if (lm.type === 'tower') o += controlTower(x, r);
    else if (lm.type === 'airliner') o += airliner(x, r);
    else if (lm.type === 'parking') o += parking(x - 90, r);
  }
  return o;
}
