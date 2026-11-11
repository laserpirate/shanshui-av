// Labels and the fact line for data worlds (nashua), as DOM over the canvas, in the controller and (optionally)
// the output window. Label text is names and ids from the data pack only. Nodes are built once per world and
// moved with transforms each frame; nothing is rebuilt on mouse or frame events.
import { xOf, YW, HX, levelAt, sOf, MORPH_LABELS } from '../worlds/nashua/pack.js';

const FT = 0.3048;
export const mft = (m, nd = 1, sign = false) => {
  const f = v => (sign && v >= 0 ? '+' : '') + v.toFixed(nd);
  return `${f(m)} m (${f(m / FT)} ft)`;
};

export class ReachOverlay {
  constructor(root) { this.root = root; this.key = null; this.items = []; this.on = false; }

  _build(world) {
    const P = world.pack, o = world.opts || {}, side = o.bank === 'R' ? -1 : 1, VY = HX * (o.ve || 10);
    this.root.textContent = '';
    this.items = [];
    const add = (s, y, text, cls) => {
      const d = document.createElement('div');
      d.className = 'rl ' + (cls || '');
      d.textContent = text;
      this.root.appendChild(d);
      this.items.push({ x: xOf(P, s, o.bank), y, d });
    };
    add(0, YW - (P.dam.headpond_m - P.A.ws[0]) * VY - 30, P.dam.label, 'dam');
    for (const b of P.bridges) if (b.deck_h != null) add(b.s, YW - b.deck_h * VY - 52, b.name, 'br');
    add(P.nashua_len_m, YW - 40, 'confluence', 'lm');
    for (const c of P.cso) if (c.side === side) add(c.s, YW + 18, c.id, 'pipe');
    for (const f of P.outfalls) if (f.side === side) add(f.s, YW + 44, f.id, 'pipe');
    if (P.lot.side === side) add((P.lot.s0 + P.lot.s1) / 2, YW - 120, P.lot.label, 'lot');
    for (const st of P.stations) add((st.s0 + st.s1) / 2, 40, st.id, 'st');
  }

  // view: {cssScale, camX, camY, W}; show: boolean
  update(world, view, show) {
    const ok = show && world && world.pack;
    if (!ok) { if (this.on) { this.root.hidden = true; this.on = false; } return; }
    const key = world.key + ':' + (world.opts && world.opts.ve);
    if (key !== this.key) { this._build(world); this.key = key; }
    if (!this.on) { this.root.hidden = false; this.on = true; }
    const s = view.cssScale;
    for (const it of this.items) {
      const sx = (it.x - view.camX) * s, sy = (it.y - view.camY) * s;
      const vis = sx > -400 && sx < view.W + 400;
      if (vis !== it.vis) { it.d.style.display = vis ? '' : 'none'; it.vis = vis; }
      if (vis) it.d.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    }
  }
}

// one line of facts at the playhead (view centre)
export function factLine(world, x, lv, cssScale) {
  if (!world || !world.pack) return '';
  const P = world.pack, o = world.opts || {}, ve = o.ve || 10;
  const s = sOf(P, x, o.bank);
  if (s < 0 || s > P.route_len_m) return 'outside the reach';
  const k = Math.max(0, Math.min(P.n - 1, Math.round(s / P.ds)));
  const meas = P.A.bed_measured[k] > 0.5;
  const i = Math.round(Math.max(0, Math.min(P.levels.length - 1, lv)));
  const L = P.levels[i];
  const water = Math.abs(lv - i) < 0.02 ? L.name : 'Water ' + mft(levelAt(P, lv, s), 2, true) + ' above the local water surface';
  return [
    's ' + mft(s, 1),
    o.bank === 'R' ? 'right bank' : 'left bank',
    'Vertical Exaggeration ' + ve + 'x',
    'building heights estimated',
    'bed ' + (meas ? 'measured' : 'estimated'),
    '100 m (328 ft) = ' + Math.round(100 * HX * cssScale) + ' px',
    water,
    ...(o.morph > 0 ? [world.designMissing ? 'design pack not loaded' : (o.morph >= 1 ? MORPH_LABELS[1] : MORPH_LABELS[0] + ' to ' + MORPH_LABELS[1] + ' ' + Math.round(o.morph * 100) + '%')] : []),
  ].join('   ');
}
