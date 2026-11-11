// Layer 5, near: dangling cables, chains and vines crossing the top of the frame, a foreground girder
// or lamp post now and then, reeds at the bottom edge. Cropping the frame like upstream's
// foreground trees; drawn over the flood (the shader leaves this layer dry). Rain is the shader's.
import { G, PAPER, NONE, pl, thin, brush, wob, line, vine, lamp, L, sagLine, hatch, tufts } from './ink.js';
import { hash01, rngFor } from './rng.js';

const INK = a => G(12, a);

function cable(x0, x1, r) {
  const y0 = -10 + r() * 40, y1 = -10 + r() * 60, sag = 60 + r() * 140;
  let o = brush(sagLine(x0, y0, x1, y1, sag, 28), 2.2 + r() * 1.6, INK(0.85), r, { noi: 0.2, taper: false });
  // a loose end hanging from the low point, sometimes
  if (r() < 0.35) { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag; o += brush(wob([[mx, my], [mx + (r() - 0.5) * 10, my + 40 + r() * 60]], 2, r, 5), 1.8, INK(0.85), r, { taper: false }); }
  return o;
}

function chain(x, r) {
  let o = '';
  const len = 60 + r() * 160;
  const sway = (r() - 0.5) * 12;
  for (let y = -6, i = 0; y < len; y += 7, i++) {
    const t = y / len, cx = x + sway * t * t;
    const pts = [];
    if (i % 2) { for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2; pts.push([cx + Math.cos(a) * 2.6, y + 3.5 + Math.sin(a) * 4.6]); } }
    else pts.push([cx, y], [cx, y + 7]);
    o += thin(pts, 1.4, INK(0.85));
  }
  if (r() < 0.5) { const cx = x + sway; o += thin([[cx, len], [cx, len + 10], [cx + 6, len + 14], [cx + 8, len + 8]], 2.2, INK(0.9)); }  // a hook
  return o;
}

function girder(x, r) {
  // an I-beam across a lower corner, rivets, a vine
  const d = r() < 0.5 ? 1 : -1, len = 220 + r() * 160;
  const a = [x, 700 + 10], b = [x + d * len, 560 + r() * 60];
  const nx = -(b[1] - a[1]) / len * 10, ny = (b[0] - a[0]) / len * 10;
  let o = pl([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]], G(40, 0.92), INK(0.95), 1.4);
  o += thin([a, b], 0.7, G(110, 0.6));
  for (let t = 0.05; t < 1; t += 0.07) o += thin([[a[0] + (b[0] - a[0]) * t + nx * 0.6, a[1] + (b[1] - a[1]) * t + ny * 0.6], [a[0] + (b[0] - a[0]) * t + nx * 0.6 + 0.8, a[1] + (b[1] - a[1]) * t + ny * 0.6]], 1.4, G(120, 0.7));
  o += vine(b[0], b[1], 30 + r() * 30, INK(0.8), r);
  return o;
}

function lampPost(x, r) {
  // a bent airfield lamp post, its head flickering
  const top = 380 + r() * 80, bend = (r() - 0.5) * 30;
  let o = brush(wob([[x, 705], [x + bend * 0.3, (705 + top) / 2], [x + bend, top]], 1, r, 6), 5, INK(0.92), r, { taper: false });
  o += pl([[x + bend - 10, top - 2], [x + bend + 12, top - 6], [x + bend + 12, top + 2], [x + bend - 10, top + 4]], PAPER, INK(0.9), 1.4);
  o += lamp(x + bend + 1, top + 4, 3.2, L.flicker, r(), 0.95);
  return o;
}

export function near(s, p) {
  const r = rngFor(s, p.c, 5);
  let o = '';
  const busy = p.quiet ? 0.25 : 0.5 + 0.5 * p.dens;
  // cables between hashed anchor points; a cable belongs to the chunk holding its left anchor
  for (let j = Math.ceil(p.x0 / 160); j * 160 < p.x1; j++) {
    if (hash01(s, 901, j) > 0.2 * busy) continue;
    const rr = rngFor(s, j, 902);
    o += cable(j * 160 + rr() * 60, j * 160 + 200 + rr() * 420, rr);
  }
  for (let j = Math.ceil(p.x0 / 97); j * 97 < p.x1; j++) {
    const h = hash01(s, 903, j);
    if (h < 0.1 * busy) o += chain(j * 97 + 20, rngFor(s, j, 904));
    else if (h < 0.24 * busy) { const rr = rngFor(s, j, 905); for (let k = 0; k < 3; k++) o += vine(j * 97 + rr() * 30, -4, 40 + rr() * 120, INK(0.8), rr); }
  }
  if (hash01(s, 906, p.c) < 0.07 && hash01(s, 906, p.c - 1) >= 0.07) o += girder(p.x0 + r() * 512, r);
  else if (hash01(s, 907, p.c) < 0.06 * (0.5 + p.dens)) o += lampPost(p.x0 + r() * 512, r);
  // reeds along the bottom edge
  o += tufts(p.x0, p.x1, 704, 34, INK(0.85), r, Math.round(3 + 6 * (1 - p.dens)));
  return o;
}
