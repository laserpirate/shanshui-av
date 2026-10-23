// World: one seed. Owns a generator worker (upstream engine), a raster worker (tiles), the element
// store (strings kept for vector export) and the tile set. The renderer only reads `tiles`.
import { TILE_W, WORLD_H, AHEAD, CULL, READY_MARGIN } from './constants.js';

const base = new URL('../workers/', import.meta.url);
let worldCount = 0;

export class World {
  constructor(seed, { key, onLog } = {}) {
    this.seed = String(seed);
    this.key = key || this.seed + '#' + (++worldCount);
    this.onLog = onLog || (() => {});
    this.chunks = new Map();          // id -> {id, tag, x, y, canv, minx, maxx}
    this.order = [];
    this.xmin = 0; this.xmax = 0;
    this.started = false;             // first batch arrived
    this.paper = null;                // {w, h, data, mean}
    this.paperVersion = 0;
    this.tiles = new Map();           // k -> {k, tex, scale, dirty, pending, gen}
    this.pendingRaster = 0;
    this.genBusy = true;
    this.genMs = [];
    this.culledBelow = -Infinity; this.culledAbove = Infinity;
    this.disposed = false;
    this.errors = 0;
    this.waiters = [];
    this.leftWanted = false;
    this.gen = new Worker(new URL('gen-worker.js', base));
    this.ras = new Worker(new URL('raster-worker.js', base));
    this.gen.onmessage = e => this._onGen(e.data);
    this.ras.onmessage = e => this._onRas(e.data);
    this.gen.onerror = e => this._fail('generator: ' + (e.message || 'error'));
    this.ras.onerror = e => this._fail('raster: ' + (e.message || 'error'));
    this.gen.postMessage({ type: 'init', seed: this.seed });
    this.onTile = null;               // (k, bitmap, scale) set by the renderer owner
    this.onTileDrop = null;           // (tile) to free textures
  }

  _fail(msg) { this.errors++; this.onLog('error', msg); }

  _onGen(m) {
    if (this.disposed) return;
    if (m.type === 'error') { this._fail('generator: ' + m.message.split('\n')[0]); this.genBusy = false; return; }
    if (m.type === 'paper') {
      let s = 0; for (let i = 0; i < m.data.length; i += 4) s += (m.data[i] + m.data[i + 1] + m.data[i + 2]) / 3;
      this.paper = { w: m.w, h: m.h, data: m.data, mean: s / (m.w * m.h) / 255 };
      const avg = [0, 0, 0]; for (let i = 0; i < m.data.length; i += 4) { avg[0] += m.data[i]; avg[1] += m.data[i + 1]; avg[2] += m.data[i + 2]; }
      this.paper.avg = avg.map(v => v / (m.w * m.h));
      this.paperVersion++;
      return;
    }
    if (m.type !== 'chunks') return;
    const items = [];
    for (const a of m.added) { a.minx = a.x - 1500; a.maxx = a.x + 1500; this.chunks.set(a.id, a); items.push({ id: a.id, canv: a.canv }); }
    for (const id of m.removed) this.chunks.delete(id);
    if (items.length) this.ras.postMessage({ type: 'add', items });
    if (m.removed.length) this.ras.postMessage({ type: 'drop', ids: m.removed });
    this.order = m.order;
    this.xmin = m.xmin; this.xmax = m.xmax;
    if (m.ms) { this.genMs.push(m.ms); if (this.genMs.length > 30) this.genMs.shift(); }
    this.started = true;
    this.genBusy = false;
    const w = this.waiters; this.waiters = [];
    for (const f of w) f();
  }

  _onRas(m) {
    if (this.disposed) { if (m.bitmap) m.bitmap.close(); return; }
    if (m.type === 'error') { this._fail('raster: ' + m.message.split('\n')[0]); const t = this.tiles.get(m.key); if (t) { t.pending = false; } this.pendingRaster = Math.max(0, this.pendingRaster - 1); return; }
    if (m.type === 'extents') {
      for (const [id, minx, maxx] of m.items) {
        const c = this.chunks.get(id);
        if (c && isFinite(minx)) { c.minx = minx; c.maxx = maxx; }
        if (!isFinite(minx)) continue;
        // a new element over a tile already drawn: draw it again
        for (const t of this.tiles.values()) {
          if ((t.tex || t.pending) && maxx >= t.k * TILE_W && minx <= (t.k + 1) * TILE_W) t.dirty = true;
        }
      }
      return;
    }
    if (m.type === 'tile') {
      this.pendingRaster = Math.max(0, this.pendingRaster - 1);
      if (typeof m.key === 'string') { const cb = this._exportCbs && this._exportCbs.get(m.key); if (cb) { this._exportCbs.delete(m.key); cb(m.bitmap); } else m.bitmap.close(); return; }
      const t = this.tiles.get(m.key);
      if (!t || !this.onTile) { m.bitmap.close(); return; }
      t.pending = false;
      this.onTile(t, m.bitmap, t.reqScale);
      m.bitmap.close();
      this.rasterMs = m.ms;
    }
  }

  get genAvgMs() { return this.genMs.length ? this.genMs.reduce((a, b) => a + b, 0) / this.genMs.length : 0; }

  // called every frame: camX, view width (world px), direction of travel, raster scale (px per world px)
  update(camX, viewW, dir, scale) {
    if (this.disposed) return;
    const camR = camX + viewW;
    // generation, one chunk at a time
    if (!this.genBusy && this.started) {
      if (this.xmax < camR + AHEAD && (dir >= 0 || this.xmax < camR + TILE_W)) { this.genBusy = true; this.gen.postMessage({ type: 'right' }); }
      else if (dir < 0 && this.xmin > camX - AHEAD) { this.genBusy = true; this.leftWanted = true; this.gen.postMessage({ type: 'left' }); }
    }
    // memory cap
    if (!this.genBusy && this.started) {
      const below = camX - CULL, above = camR + CULL;
      if (below > this.culledBelow + 4 * TILE_W && this.xmin < below) { this.culledBelow = below; this.genBusy = true; this.gen.postMessage({ type: 'cull', below, above: Infinity }); }
      else if (above < this.culledAbove - 4 * TILE_W && this.xmax > above) { this.culledAbove = above; this.genBusy = true; this.gen.postMessage({ type: 'cull', below: -Infinity, above }); }
    }
    // tiles
    const k0 = Math.floor(camX / TILE_W), k1 = Math.floor(camR / TILE_W);
    const lo = k0 - (dir < 0 ? 2 : 1), hi = k1 + (dir >= 0 ? 2 : 1);
    for (const [k, t] of this.tiles) {
      if (k < lo - 1 || k > hi + 1) { if (this.onTileDrop) this.onTileDrop(t); this.tiles.delete(k); }
    }
    if (!this.started) return;
    // nearest-first request order, visible tiles before lookahead
    const want = [];
    for (let k = k0; k <= k1; k++) want.push(k);
    if (dir >= 0) { for (let k = k1 + 1; k <= hi; k++) want.push(k); for (let k = k0 - 1; k >= lo; k--) want.push(k); }
    else { for (let k = k0 - 1; k >= lo; k--) want.push(k); for (let k = k1 + 1; k <= hi; k++) want.push(k); }
    for (const k of want) {
      if (this.pendingRaster >= 2) break;
      let t = this.tiles.get(k);
      if (!t) { t = { k, tex: null, scale: 0, dirty: true, pending: false }; this.tiles.set(k, t); }
      const stale = t.dirty || Math.abs(t.scale - scale) > 1e-6;
      if (!stale || t.pending) continue;
      // wait until the generator is far enough past this tile that nothing new can land on it,
      // unless it is on screen and has nothing yet
      const final = (k + 1) * TILE_W + READY_MARGIN <= this.xmax;
      const onScreen = k >= k0 && k <= k1;
      if (!final && !(onScreen && !t.tex && this.xmax >= (k + 1) * TILE_W)) continue;
      t.pending = true; t.dirty = !final; t.reqScale = scale;
      this.pendingRaster++;
      this.ras.postMessage({ type: 'tile', key: k, x0: k * TILE_W, w: TILE_W, h: WORLD_H, scale, order: this.order });
    }
  }

  // tiles drawn at the current scale over [x0, x1]
  coverage(x0, x1, scale) {
    let ok = 0, n = 0;
    for (let k = Math.floor(x0 / TILE_W); k <= Math.floor(x1 / TILE_W); k++) { n++; const t = this.tiles.get(k); if (t && t.tex && !t.pending) ok++; }
    return n ? ok / n : 0;
  }

  refreshTiles() { for (const t of this.tiles.values()) t.dirty = true; }

  // make sure elements exist up to x1 (export of a frame ahead of the view); resolves when generated
  ensureRight(x1, timeoutMs = 60000) {
    const t0 = performance.now();
    return new Promise((res, rej) => {
      const step = () => {
        if (this.disposed) return rej(new Error('world closed'));
        if (this.xmax >= x1 + READY_MARGIN) return res();
        if (performance.now() - t0 > timeoutMs) return rej(new Error('generation timed out'));
        if (this.genBusy) { this.waiters.push(step); return; }
        this.genBusy = true; this.waiters.push(step); this.gen.postMessage({ type: 'right' });
      };
      step();
    });
  }

  // elements overlapping [x0, x1], in upstream paint order
  elementsIn(x0, x1) {
    const out = [];
    for (const id of this.order) { const c = this.chunks.get(id); if (c && c.maxx >= x0 && c.minx <= x1) out.push(c); }
    return out;
  }

  // raster an arbitrary world rect for export; resolves with an ImageBitmap (grey)
  rasterRect(x0, y0, w, h, scale, pw, ph) {
    if (!this._exportCbs) this._exportCbs = new Map();
    const key = 'x' + Math.random().toString(36).slice(2);
    return new Promise(res => {
      this._exportCbs.set(key, res);
      this.pendingRaster++;
      this.ras.postMessage({ type: 'tile', key, x0, y0, w, h, scale, pw, ph, order: this.order });
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gen.terminate(); this.ras.terminate();
    for (const t of this.tiles.values()) if (this.onTileDrop) this.onTileDrop(t);
    this.tiles.clear(); this.chunks.clear(); this.order = [];
  }
}
