// Labels and the fact line for data worlds (nashua), as DOM over the canvas, in the controller and (optionally)
// the output window. Label text is names and ids from the data pack only. Nodes are built once per world and
// moved with transforms each frame; nothing is rebuilt on mouse or frame events.
import { xOf, YW, hxOf, VE_DEF, levelAt, sOf, at as at0, MORPH_LABELS } from '../worlds/nashua/pack.js';

const FT = 0.3048;
export const mft = (m, nd = 1, sign = false) => {
  const f = v => (sign && v >= 0 ? '+' : '') + v.toFixed(nd);
  return `${f(m)} m (${f(m / FT)} ft)`;
};

export class ReachOverlay {
  constructor(root) { this.root = root; this.key = null; this.items = []; this.on = false; }

  _build(world) {
    const P = world.pack, o = world.opts || {}, side = o.bank === 'R' ? -1 : 1, VY = hxOf(P) * (o.ve || VE_DEF);
    this.root.textContent = '';
    this.items = [];
    const add = (s, y, text, cls) => {
      const d = document.createElement('div');
      d.className = 'rl ' + (cls || '');
      d.textContent = text;
      this.root.appendChild(d);
      this.items.push({ x: xOf(P, s, o.bank), y, d });
    };
    if (P.dam) add(0, YW - (P.dam.headpond_m - P.A.ws[0]) * VY - 30, P.dam.label, 'dam');
    for (const b of P.bridges) if (b.deck_h != null) add(b.s, YW - b.deck_h * VY - 52, b.name, 'br');
    if (P.nashua_len_m != null) add(P.nashua_len_m, YW - 40, 'confluence', 'lm');
    for (const c of P.cso) if (c.side === side) add(c.s, YW + 18, c.id, 'pipe');
    for (const f of P.outfalls) if (f.side === side) add(f.s, YW + 44, f.id, 'pipe');
    if (P.lot && P.lot.side === side) add((P.lot.s0 + P.lot.s1) / 2, YW - 120, P.lot.label, 'lot');
    for (const st of P.stations) add((st.s0 + st.s1) / 2, 40, st.id, 'st');
    // P6: structures from the data (dikes) and buildings of a kind worth naming, by their kind and id from the source
    // (the structures layer has no names: a church is "Religious", a mill "Light industrial")
    for (const d of P.structures || []) if (d.side === side) add(d.s, YW - (at0(P, 'band0_' + o.bank, d.s) + d.height_m) * VY - 40, d.label, 'lm');
    const prim = P.prim_codes || [];
    for (const b of P.buildings) {
      if (b[2] !== side || b[3] > 3 || b.length < 10) continue;
      const k = prim[b[8]], ind = (k === 'Light' || k === 'Heavy' || k === 'Metals/Minerals Processing') && b[1] - b[0] >= 60;
      if (k !== 'Religious' && !ind) continue;
      add((b[0] + b[1]) / 2, YW - (Math.max(-0.5, b[4]) + b[5]) * VY - 36, (k === 'Religious' ? 'Religious' : k + ' industrial') + ' (structures layer ' + b[9] + ')', 'bl');
    }
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

// ?ticks=1: a distance rule along the bottom of the view (metric first, feet in brackets). The step follows the
// horizontal scale so ticks stay at least 150 world px apart: at 2 to 5 px per m a tick every 100 m and a label every
// 500 m; at 6 px per m and up (the default 8) a tick every 25 m and a label every 100 m. Built once per world like
// the labels, moved with transforms each frame.
export const tickStep = P => (hxOf(P) >= 6 ? { step: 25, major: 100 } : { step: 100, major: 500 });
export class TickOverlay {
  constructor(parent) {
    this.root = document.createElement('div');
    this.root.className = 'reach-labels reach-ticks';
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.key = null; this.items = []; this.on = false;
  }
  _build(world) {
    const P = world.pack, o = world.opts || {};
    this.root.textContent = '';
    this.items = [];
    const T = tickStep(P);
    this.step = T.step;
    for (let s = 0; s <= P.route_len_m + 1e-6; s += T.step) {
      const major = Math.round(s) % T.major === 0;
      const d = document.createElement('div');
      d.className = 'rt' + (major ? ' major' : '');
      if (major) { const b = document.createElement('span'); b.textContent = s + ' m (' + Math.round(s / FT) + ' ft)'; d.appendChild(b); }
      this.root.appendChild(d);
      this.items.push({ s, x: xOf(P, s, o.bank), d });
    }
  }
  update(world, view, show) {
    const ok = show && world && world.pack;
    if (!ok) { if (this.on) { this.root.hidden = true; this.on = false; } return; }
    if (world.key !== this.key) { this._build(world); this.key = world.key; }
    if (!this.on) { this.root.hidden = false; this.on = true; }
    const s = view.cssScale;
    for (const it of this.items) {
      const sx = (it.x - view.camX) * s;
      const vis = sx > -300 && sx < view.W + 300;
      if (vis !== it.vis) { it.d.style.display = vis ? '' : 'none'; it.vis = vis; }
      if (vis) { it.sx = sx; it.d.style.transform = `translateX(${sx.toFixed(1)}px)`; }
    }
  }
}

// one line of facts at the playhead (view centre)
export function factLine(world, x, lv, cssScale, time) {
  if (!world || !world.pack) return '';
  const P = world.pack, o = world.opts || {}, ve = o.ve || VE_DEF;
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
    '100 m (328 ft) = ' + Math.round(100 * hxOf(P) * cssScale) + ' px',
    water,
    ...(P.fact_note ? [P.fact_note] : []),
    ...(time ? [time] : []),
    ...(o.morph > 0 ? [world.designMissing ? 'design pack not loaded' : (o.morph >= 1 ? MORPH_LABELS[1] : MORPH_LABELS[0] + ' to ' + MORPH_LABELS[1] + ' ' + Math.round(o.morph * 100) + '%')] : []),
  ].join('   ');
}
