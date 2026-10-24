// Layer 2, mid-far: terminal halls with collapsed roof trusses (ribs like a whale skeleton), hangars
// with sagging doors, fuel tank farms, cargo cranes, power pylons, a radar dish on a mast.
// Long structures (the hall, the pylon wires) are pure functions of x and join across chunks.
import { G, PAPER, NONE, pl, thin, brush, wob, line, hatch, drips, tufts, vine, lamp, neon, L, sagLine, rect } from './ink.js';
import { hash01, rngFor, noise1 } from './rng.js';
import { Y, plan } from './planner.js';

const B = Y.midfar;
const INK = a => G(60, a);

function hall(s, p, r) {
  // the hall runs while neighbouring chunks are terminal too
  let o = '';
  const L0 = plan(s, p.c - 1).passage !== 'terminal', R0 = plan(s, p.c + 1).passage !== 'terminal';
  const x0 = p.x0 + (L0 ? 60 : 0), x1 = p.x1 - (R0 ? 60 : 0);
  const wallTop = B - 34, roofRise = 46;
  const roofY = x => wallTop - roofRise * (0.85 + 0.15 * Math.sin(x / 300));
  // facade: paper occluder, ink outline, mullions, broken glass
  o += pl([[x0, B], [x0, wallTop], [x1, wallTop], [x1, B], [x0, B]], PAPER, NONE, 0);
  o += line(x0, wallTop, x1, wallTop, 1.6, INK(0.75), r);
  o += line(x0, B, x1, B, 1.2, INK(0.6), r);
  for (let x = Math.ceil(x0 / 18) * 18; x < x1; x += 18) {
    o += thin([[x, wallTop + 2], [x + (r() - 0.5), B]], 0.6, INK(0.45));
    if (hash01(s, 601, x) < 0.45) o += hatch(x + 1, wallTop + 3, x + 17, B - 2, 2.2, 1.2 + r() * 0.6, INK(0.28), 0.4, r, 0.8);
    else if (hash01(s, 602, x) < 0.2) o += lamp(x + 9, wallTop + 12, 1.4, L.flicker, r(), 0.45);
  }
  // the hall's volume: a pale wash under where the roof was
  { const top = []; for (let x = x0; x <= x1 + 0.01; x += 32) top.push([Math.min(x, x1), roofY(x) + 10]); o += pl([[x0, wallTop], ...top, [x1, wallTop], [x0, wallTop]], G(215, 0.3), NONE, 0); }
  // ribs: arches at a fixed spacing, many broken off
  for (let x = Math.ceil(x0 / 34) * 34; x <= x1; x += 34) {
    const h = hash01(s, 603, x);
    if (h < 0.12) continue;                                   // gone
    const top = roofY(x), span = 34;
    const pts = [];
    const end = h < 0.45 ? 0.35 + h : 1;                      // snapped part way up
    for (let i = 0; i <= 14 * end; i++) {
      const t = i / 14, a = Math.PI * t;
      pts.push([x - span * 0.5 * Math.cos(a) + span * 0.5, wallTop - (wallTop - top) * Math.sin(a) * (0.6 + 0.4 * (1 - Math.abs(t - 0.5) * 2))]);
    }
    o += brush(wob(pts, 0.5, r, 4), 2.2, INK(0.7), r, { noi: 0.4, taper: false });
    if (end === 1 && hash01(s, 604, x) < 0.35) o += vine(x + span / 2, top + 4, 14 + r() * 26, INK(0.6), r);
  }
  // a few purlins still spanning between ribs
  for (let x = Math.ceil(x0 / 34) * 34; x + 34 <= x1; x += 34) {
    if (hash01(s, 605, x) < 0.55) continue;
    const yy = roofY(x) + 6 + r() * 8;
    o += line(x + 6, yy, x + 28, yy + (r() - 0.5) * 6, 0.9, INK(0.55), r);
  }
  if (L0) o += line(x0, wallTop - 10, x0, B, 2, INK(0.7), r);
  if (R0) o += line(x1, wallTop - 10, x1, B, 2, INK(0.7), r);
  o += drips(x0, x1, wallTop + 1, 10, G(90, 0.35), r, 18);
  o += tufts(x0, x1, B, 10, INK(0.55), r, 10);
  return o;
}

function hangar(x, w, r, s) {
  let o = '';
  const h = 54 + r() * 24, top = B - h;
  const roof = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; roof.push([x + w * t, B - h * 0.55 - h * 0.45 * Math.sin(Math.PI * t)]); }
  o += pl([[x, B], ...roof, [x + w, B], [x, B]], PAPER, NONE, 0);
  o += brush(wob(roof, 0.6, r, 5), 2.2, INK(0.75), r, { taper: false });
  o += line(x, roof[0][1], x, B, 1.6, INK(0.7), r) + line(x + w, roof[16][1], x + w, B, 1.6, INK(0.7), r);
  // roof ribs and a torn skin
  for (let i = 1; i < 16; i += 2) o += thin([[roof[i][0], roof[i][1]], [roof[i][0], roof[i][1] + 6]], 0.5, INK(0.4));
  const tear = 3 + (r() * 8 | 0);
  o += hatch(roof[tear][0], roof[tear][1] + 2, roof[tear + 4][0], roof[tear][1] + 14, 2, 0.3, INK(0.3), 0.4, r, 0.9);
  // door: dark interior, panels sagging off their track
  const dx = x + w * 0.15, dw = w * 0.7, dt = B - h * 0.5;
  o += pl(rect(dx, dt, dw, B - dt), G(70, 0.55), NONE, 0);
  const panels = 4 + (r() * 3 | 0);
  for (let i = 0; i < panels; i++) {
    if (r() < 0.35) continue;
    const px = dx + i * dw / panels, sag = r() * 8, lean = (r() - 0.5) * 6;
    o += pl([[px, dt + sag * 0.3], [px + dw / panels, dt + sag], [px + dw / panels + lean, B], [px + lean, B], [px, dt + sag * 0.3]], PAPER, INK(0.6), 0.8);
    o += thin([[px + 3, dt + sag + 4], [px + 3 + lean, B - 3]], 0.4, INK(0.35));
  }
  o += thin([[dx - 4, dt], [dx + dw + 4, dt]], 1, INK(0.6));
  o += drips(x, x + w, roof[8][1], 14, G(90, 0.3), r, 10);
  if (r() < 0.5) o += lamp(x + w * 0.5, roof[8][1] - 2, 1.5, L.beacon, r(), 0.6);
  return o;
}

function tank(x, w, r) {
  let o = '';
  const h = 22 + r() * 34, top = B - h, ry = w * 0.12;
  const ell = (cy, half) => { const p = []; for (let i = 0; i <= 18; i++) { const a = Math.PI * (half ? i / 18 : 2 * i / 18); p.push([x + w / 2 - Math.cos(a) * w / 2, cy + Math.sin(a) * ry]); } return p; };
  o += pl([[x, top], ...ell(B, true), [x + w, top], [x, top]], PAPER, NONE, 0);
  o += line(x, top, x, B, 1.4, INK(0.7), r) + line(x + w, top, x + w, B, 1.4, INK(0.7), r);
  o += brush(wob(ell(B, true), 0.4, r, 4), 1.2, INK(0.6), r, { taper: false });
  o += pl(ell(top, false), PAPER, INK(0.7), 1);
  // shading bands and rust
  o += hatch(x + w * 0.65, top + ry, x + w - 1, B, 2.4, Math.PI / 2, INK(0.25), 0.5, r, 0.9);
  o += drips(x, x + w, top + ry, h * 0.5, G(80, 0.35), r, 8);
  // spiral stair
  for (let i = 0; i < 4; i++) { const t0 = i / 4, t1 = (i + 0.5) / 4; o += thin([[x + w * t0, B - h * t0], [x + w * t1, B - h * t1]], 0.6, INK(0.5)); }
  if (r() < 0.4) { o += pl(sagLine(x + w * 0.2, top - ry, x + w * 0.8, top + ry, 6), NONE, INK(0.4), 0.5); }
  return o;
}

function stsCrane(x, r) {
  // ship-to-shore gantry crane: A-frame legs, a boom, sometimes raised
  let o = '';
  const h = 80 + r() * 30, w = 30, top = B - h;
  const col = INK(0.7);
  o += line(x, B, x + 4, top + 20, 1.6, col, r) + line(x + w, B, x + w - 4, top + 20, 1.6, col, r);
  o += line(x + 4, top + 20, x + w - 4, top + 20, 1.4, col, r) + line(x + 2, B - 30, x + w - 2, B - 30, 1, col, r);
  o += thin([[x + 4, top + 20], [x + w - 2, B - 30]], 0.6, col) + thin([[x + w - 4, top + 20], [x + 2, B - 30]], 0.6, col);
  o += line(x + w / 2, top + 20, x + w / 2, top, 1.4, col, r);
  if (r() < 0.4) {
    const bl = 70 + r() * 40, a = -1.1 - r() * 0.3;
    o += line(x + w / 2, top + 22, x + w / 2 + Math.cos(a) * bl, top + 22 + Math.sin(a) * bl, 1.4, col, r);
  } else {
    o += line(x - 50 - r() * 20, top + 22, x + w + 30, top + 22, 1.6, col, r);
    for (let k = x - 50; k < x + w + 30; k += 8) o += thin([[k, top + 22], [k + 8, top + 18]], 0.4, INK(0.4));
    const hx = x - 20 - r() * 20;
    o += thin([[hx, top + 22], [hx, top + 50 + r() * 20]], 0.5, INK(0.5));
  }
  o += thin([[x + w / 2, top], [x - 30, top + 22]], 0.5, INK(0.5)) + thin([[x + w / 2, top], [x + w + 20, top + 22]], 0.5, INK(0.5));
  o += lamp(x + w / 2, top - 1, 1.5, L.beacon, r(), 0.75);
  // container stacks below
  for (let i = 0; i < 4; i++) {
    const cx = x - 40 + i * 26 + r() * 6, ch = 7 * (1 + (r() * 3 | 0));
    o += pl(rect(cx, B - ch, 22, ch), PAPER, INK(0.6), 0.8);
    for (let yy = B - ch + 7; yy < B; yy += 7) o += thin([[cx, yy], [cx + 22, yy]], 0.5, INK(0.4));
    o += hatch(cx + 1, B - ch + 1, cx + 21, B - 1, 2.2, Math.PI / 2, INK(0.22), 0.4, r, 0.7);
  }
  return o;
}

function lowRoofs(x0, x1, r) {
  // dense low district behind the apron (the kampung's back rows)
  let o = '';
  for (let x = x0; x < x1;) {
    const w = 14 + r() * 22, h = 10 + r() * 16, pk = r() < 0.6;
    const top = B - h;
    const pts = pk ? [[x, B], [x, top], [x + w / 2, top - 6], [x + w, top], [x + w, B], [x, B]] : [[x, B], [x, top], [x + w, top - 2], [x + w, B], [x, B]];
    o += pl(pts, PAPER, INK(0.6), 0.8);
    if (r() < 0.4) o += hatch(x + 1, top + 2, x + w - 1, B, 2, 0.2, INK(0.25), 0.4, r, 0.7);
    if (r() < 0.25) o += lamp(x + w / 2, top + h * 0.5, 1.3, L.breathe, r(), 0.55);
    x += w * (0.7 + r() * 0.4);
  }
  return o;
}

function radar(x, r) {
  let o = '';
  const h = 70 + r() * 30, top = B - h;
  o += line(x, B, x, top, 2, INK(0.75), r);
  for (let y = B - 10; y > top + 10; y -= 10) o += thin([[x - 3, y], [x + 3, y - 10]], 0.5, INK(0.5));
  // the dish, tipped: a lens of paper with a feed horn
  const a = -0.5 - r() * 0.6, R = 18 + r() * 8, cx = x, cy = top;
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = (i / 16) * 2 - 1; const ux = Math.cos(a), uy = Math.sin(a); pts.push([cx + -uy * t * R + ux * (1 - t * t) * 6, cy + ux * t * R + uy * (1 - t * t) * 6]); }
  o += pl([...pts, pts[0]], PAPER, INK(0.75), 1.2);
  o += thin([[cx, cy], [cx + Math.cos(a) * 16, cy + Math.sin(a) * 16]], 0.7, INK(0.6));
  o += hatch(cx - R, cy - R, cx + R, cy + R, 3, 0.8, INK(0.2), 0.4, r, 0.35);
  o += lamp(x, top - 4, 1.5, L.beacon, r(), 0.8);
  return o;
}

function pylons(s, p, r) {
  // power pylons on a fixed grid; the wire from pylon j to j+1 belongs to pylon j's chunk
  let o = '';
  const g = 233;
  const live = j => noise1(s ^ 0x9F1, j * 0.31) > 0.42;
  const hgt = j => 64 + hash01(s, 621, j) * 20;
  for (let j = Math.ceil(p.x0 / g); j * g < p.x1; j++) {
    if (!live(j)) continue;
    const x = j * g, h = hgt(j), top = B - h;
    const col = G(90, 0.55);
    o += thin([[x - 8, B], [x - 2, top], [x + 2, top], [x + 8, B]], 0.8, col);
    for (let y = B - 8; y > top + 6; y -= 9) o += thin([[x - 7 * (y - top) / h, y], [x + 7 * (y - top + 9) / h, y - 9]], 0.4, col);
    o += thin([[x - 12, top + 8], [x + 12, top + 8]], 0.8, col) + thin([[x - 9, top + 18], [x + 9, top + 18]], 0.7, col);
    if (live(j + 1)) {
      const h2 = hgt(j + 1), x2 = x + g;
      for (const [dx, dy] of [[-12, 8], [12, 8], [-9, 18]]) {
        if (hash01(s, 622, j, dx + dy) < 0.15) { o += pl(sagLine(x + dx, top + dy, x + dx + 40, top + dy + 60, 10, 8), NONE, G(90, 0.4), 0.4); continue; }
        o += pl(sagLine(x + dx, top + dy, x2 + dx, B - h2 + dy, 14 + r() * 6), NONE, G(90, 0.4), 0.4);
      }
    } else if (r() < 0.6) o += pl(sagLine(x + 12, top + 8, x + 60, top + 70, 8, 8), NONE, G(90, 0.4), 0.4);
  }
  return o;
}

export function midfar(s, p) {
  const r = rngFor(s, p.c, 2);
  let o = '';
  o += pylons(s, p, r);
  if (p.quiet) return o;
  switch (p.passage) {
    case 'terminal': o += hall(s, p, r); break;
    case 'hangars': {
      let x = p.x0 + r() * 60;
      while (x < p.x1 - 120) { const w = 130 + r() * 90; if (r() < 0.8 * (0.5 + p.dens)) o += hangar(x, w, r, s); x += w + 20 + r() * 80; }
      break;
    }
    case 'tanks': {
      let x = p.x0 + r() * 30;
      while (x < p.x1 - 50) { const w = 34 + r() * 46; if (r() < 0.55 + 0.4 * p.dens) o += tank(x, w, r); x += w + 6 + r() * 40; }
      // pipe rack joining the tanks
      o += line(p.x0, B - 8, p.x1, B - 8, 1, INK(0.5), r, 0.3) + line(p.x0, B - 11, p.x1, B - 11, 0.8, INK(0.45), r, 0.3);
      break;
    }
    case 'port': {
      let x = p.x0 + 40 + r() * 80;
      while (x < p.x1 - 40) { o += stsCrane(x, r); x += 150 + r() * 120; }
      break;
    }
    case 'kampung': o += lowRoofs(p.x0, p.x1, r); break;
  }
  for (const lm of p.landmarks) if (lm.type === 'radar') o += radar(p.x0 + lm.u * 512, r);
  return o;
}
