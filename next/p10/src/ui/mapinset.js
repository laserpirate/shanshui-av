// The map inset (P6, ADDENDUM-A A4): the reach in plan, north up, drawn from the public pack only (pack.plan, the
// route every 10 m in EPSG:32110, and the edge_L / edge_R arrays along its normals). The stations, bridges, the dam
// and the structures are marked; a dot follows the playhead and a heavier stroke shows the stretch in view.
// Click a station label to go to its middle, or anywhere on the river to go to that s.
// The plan is drawn once per world and size on one canvas; the dot and the view stretch move on a second canvas,
// redrawn only when they move by half a pixel. Sizes: s 240, m 400, l 600 css px wide (text 18 px at m and l).
const FT = 0.3048;
export const MAP_W = { s: 240, m: 400, l: 600 };

export class MapInset {
  // parent: the stage element; onGo(s): scroll to s (null on an output window: no clicks there)
  // float (ADDENDUM-B B1, the controller): {pos: {x, y} | null, onMove(pos)}. The inset sits above everything, the
  // bar and the header included, and is dragged by its grip or its edge; it stays where it was left (onMove saves it).
  constructor(parent, onGo, float = null) {
    this.root = document.createElement('div');
    this.root.className = 'map-inset' + (float ? ' float' : '');
    this.root.hidden = true;
    this.base = document.createElement('canvas'); this.top = document.createElement('canvas');
    this.root.append(this.base, this.top);
    parent.appendChild(this.root);
    this.onGo = onGo; this.key = null; this.on = false; this.last = null; this.draws = 0; this.ms = 0; this.drags = 0;
    if (onGo) this.top.addEventListener('click', e => this._click(e));
    else this.root.style.pointerEvents = 'none';
    if (float) this._float(float);
  }
  _float(f) {
    this.grip = document.createElement('button');
    this.grip.className = 'map-grip'; this.grip.type = 'button';
    this.grip.title = 'Drag to move the map'; this.grip.setAttribute('aria-label', 'move the map');
    this.grip.textContent = '✥';
    this.root.prepend(this.grip);
    this.onMove = f.onMove; this.pos = f.pos || null;
    let d = null;
    const down = e => {
      // the grip or the edge band (the root's padding), never the map itself: a click there goes to a station
      if (e.button !== 0 || (e.target !== this.grip && e.target !== this.root)) return;
      const r = this.root.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, moved: false };
      this.root.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    };
    const move = e => {
      if (!d || e.pointerId !== d.id) return;
      d.moved = true; this.place({ x: e.clientX - d.dx, y: e.clientY - d.dy }, true);
    };
    const up = e => {
      if (!d || e.pointerId !== d.id) return;
      if (d.moved) { this.drags++; if (this.onMove) this.onMove(this.pos); }
      d = null;
    };
    this.root.addEventListener('pointerdown', down);
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
    addEventListener('resize', () => { if (this.pos) this.place(this.pos); });
    if (this.pos) this.place(this.pos);
  }
  // put the floating inset at {x, y} css px (its top-left), kept fully on screen
  // A drag sets the saved spot (this.pos). Showing it again or a resize only clamps what is shown and keeps the saved
  // spot, so a smaller window, or a place() made while the inset is hidden, cannot overwrite it.
  place(p, drag = false) {
    const r = this.root.getBoundingClientRect();
    if (!r.width || !r.height) { Object.assign(this.root.style, { left: p.x + 'px', top: p.y + 'px', bottom: 'auto' }); return; }
    const x = Math.round(Math.max(0, Math.min(innerWidth - r.width, p.x))), y = Math.round(Math.max(0, Math.min(innerHeight - r.height, p.y)));
    if (drag) this.pos = { x, y };
    Object.assign(this.root.style, { left: x + 'px', top: y + 'px', bottom: 'auto' });
  }

  // the plan geometry for a pack: route points, banks, a fit to w x h css px with a margin
  _geom(P, w) {
    const pts = P.plan.pts, n = pts.length, step = P.plan.step_m;
    const A = P.A, at = (name, s) => { const a = A[name], f = Math.max(0, Math.min(P.n - 1, s / P.ds)), k = Math.floor(f), t = f - k; return k + 1 < P.n ? a[k] + (a[k + 1] - a[k]) * t : a[k]; };
    const nrm = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };   // left of downstream
    const L = [], R = [];
    for (let i = 0; i < n; i++) { const s = i * step, [nx, ny] = nrm(i); L.push([pts[i][0] + nx * at('edge_L', s), pts[i][1] + ny * at('edge_L', s)]); R.push([pts[i][0] - nx * at('edge_R', s), pts[i][1] - ny * at('edge_R', s)]); }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of [...L, ...R]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const pad = 0.12 * (x1 - x0 + y1 - y0) / 2;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const h = Math.round(w * (y1 - y0) / (x1 - x0));
    const k = w / (x1 - x0);
    const X = p => [(p[0] - x0) * k, (y1 - p[1]) * k];     // north up
    return { pts, n, step, L, R, w, h, k, X, len: P.route_len_m };
  }
  // css px of s on the route
  _at(g, s) { const f = Math.max(0, Math.min(g.n - 1, s / g.step)), i = Math.floor(f), t = f - i, a = g.pts[i], b = g.pts[Math.min(g.n - 1, i + 1)]; return g.X([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }

  _build(P, size, theme) {
    const t0 = performance.now();
    const w = MAP_W[size] || MAP_W.m, g = this._geom(P, w), dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [this.base, this.top]) { c.width = Math.round(g.w * dpr); c.height = Math.round(g.h * dpr); c.style.width = g.w + 'px'; c.style.height = g.h + 'px'; }
    const c = this.base.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = theme.paper; c.fillRect(0, 0, g.w, g.h);
    // the water between the banks
    c.beginPath(); g.L.forEach((p, i) => { const q = g.X(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); for (let i = g.n - 1; i >= 0; i--) { const q = g.X(g.R[i]); c.lineTo(q[0], q[1]); } c.closePath();
    c.fillStyle = theme.water; c.fill();
    c.strokeStyle = theme.ink; c.lineWidth = 1.2;
    for (const side of [g.L, g.R]) { c.beginPath(); side.forEach((p, i) => { const q = g.X(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); }
    const fs = size === 's' ? 14 : 18;
    c.font = `${fs}px "IBM Plex Sans Condensed", "Plex Cond", Arial, sans-serif`; c.textBaseline = 'middle';
    // bridges: a bar across the channel; the dam: a heavy bar at s = 0; structures: a square
    const across = (s, wd, col) => { const i = Math.round(Math.max(0, Math.min(g.n - 1, s / g.step))); const a = g.X(g.L[i]), b = g.X(g.R[i]); c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
    for (const b of P.bridges || []) across(b.s, 2.2, theme.ink);
    if (P.dam) across(0, 4, theme.ink);
    for (const d of P.structures || []) { const q = this._at(g, d.s); c.fillStyle = theme.ink; c.fillRect(q[0] - 4, q[1] - 4, 8, 8); }
    // stations: a tick on the route and the id beside it (hit boxes kept for clicks)
    this.hits = [];
    c.fillStyle = theme.ink;
    for (const st of P.stations || []) {
      const s = (st.s0 + st.s1) / 2, q = this._at(g, s);
      c.beginPath(); c.arc(q[0], q[1], 3, 0, Math.PI * 2); c.fill();
      const tx = q[0] + 8, ty = q[1] - fs * 0.8;
      c.fillText(st.id, tx, ty);
      this.hits.push({ s, x0: tx - 14, x1: tx + c.measureText(st.id).width + 14, y0: ty - 22, y1: ty + 22 });
    }
    // north arrow and a scale bar (metric first)
    c.strokeStyle = theme.ink; c.lineWidth = 1.5;
    const nx = g.w - 18, ny = 10;
    c.beginPath(); c.moveTo(nx, ny + 26); c.lineTo(nx, ny); c.lineTo(nx - 5, ny + 9); c.moveTo(nx, ny); c.lineTo(nx + 5, ny + 9); c.stroke();
    c.textAlign = 'center'; c.fillText('N', nx, ny + 26 + fs * 0.6); c.textAlign = 'left';
    const bar = g.len > 3000 ? 1000 : 500, bw = bar * g.k, by = g.h - 12;
    c.fillStyle = theme.ink; c.fillRect(10, by, bw, 3);
    c.textBaseline = 'bottom'; c.fillText(bar + ' m (' + Math.round(bar / FT) + ' ft)', 10, by - 3);
    c.strokeStyle = theme.ink; c.lineWidth = 1; c.strokeRect(0.5, 0.5, g.w - 1, g.h - 1);
    this.g = g; this.theme = theme; this.last = null;
    this.draws++; this.ms = performance.now() - t0;
  }

  _click(e) {
    if (!this.g || !this.onGo) return;
    const r = this.top.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const h of this.hits) if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) { this.onGo(h.s, 'station'); return; }
    // nearest route point within 30 px
    let best = null, bd = 30;
    for (let i = 0; i < this.g.n; i++) { const q = this.g.X(this.g.pts[i]), d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = i * this.g.step; } }
    if (best != null) this.onGo(Math.min(best, this.g.len), 'route');
  }

  // world: the shown world (with pack.plan); view: {s, sL, sR}; show; size 's' | 'm' | 'l'; theme {paper, water, ink, dot}
  update(world, view, show, size = 'm', theme = MapInset.THEME) {
    const P = world && world.pack;
    const ok = show && P && P.plan;
    if (!ok) { if (this.on) { this.root.hidden = true; this.on = false; } return; }
    const key = P.hash + ':' + (P.hx || '') + ':' + size;
    if (key !== this.key) { this._build(P, size, theme); this.key = key; if (this.on && this.pos) this.place(this.pos); }
    if (!this.on) { this.root.hidden = false; this.on = true; if (this.pos) this.place(this.pos); }
    const g = this.g, q = this._at(g, view.s), a = this._at(g, view.sL), b = this._at(g, view.sR);
    const sig = [q, a, b].map(p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)).join(';');
    if (sig === this.last) return;
    this.last = sig; this.dot = q;
    const c = this.top.getContext('2d'), dpr = this.top.width / g.w;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, g.w, g.h);
    // the stretch in view along the route
    const i0 = Math.max(0, Math.floor(Math.min(view.sL, view.sR) / g.step)), i1 = Math.min(g.n - 1, Math.ceil(Math.max(view.sL, view.sR) / g.step));
    c.strokeStyle = theme.dot; c.lineWidth = 5; c.globalAlpha = 0.55; c.beginPath();
    for (let i = i0; i <= i1; i++) { const p = g.X(g.pts[i]); i === i0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); }
    c.stroke(); c.globalAlpha = 1;
    c.fillStyle = theme.dot; c.strokeStyle = theme.paper; c.lineWidth = 2;
    c.beginPath(); c.arc(q[0], q[1], 7, 0, Math.PI * 2); c.fill(); c.stroke();
  }
}
// nashua palette: no orange, no yellow; ink on paper, water a pale blue, the dot the kit's deep blue
MapInset.THEME = { paper: '#f4f1ea', water: '#cfe0f2', ink: '#1d2333', dot: '#2E4A8C' };
