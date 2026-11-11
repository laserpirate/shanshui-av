// Scene: what both windows run. Takes a frame state (from the controller's clock, or over
// BroadcastChannel in the output window), keeps one World per seed instance, draws with the
// Renderer, and watches its own output for blank frames.
import { World } from './world.js';
import { Renderer } from '../render/renderer.js';
import { WORLD_H } from './constants.js';

export function viewOf(W, H, zoom, yAlign) {
  const scale = (H / WORLD_H) * zoom;          // screen px per world px
  const viewH = H / scale;
  const camY = (WORLD_H - viewH) * yAlign;     // zoom < 1 letterboxes, zoom > 1 crops
  return { scale, viewW: W / scale, viewH, camY };
}

export class Scene {
  constructor(canvas, palettes, { onLog, still } = {}) {
    this.canvas = canvas;
    this.palettes = palettes;           // palettes.json object
    this.byId = new Map(palettes.palettes.map(p => [p.id, p]));
    this.onLog = onLog || (() => {});
    this.renderer = new Renderer(canvas, { onLog: this.onLog });
    this.renderer.onRestore = () => { this.checkTarget = this.stillTarget = null; for (const w of this.worlds.values()) { this.renderer.attach(w.world); w.world.tiles.forEach(t => { t.tex = null; t.dirty = true; t.pending = false; }); w.world.pendingRaster = 0; } };
    this.worlds = new Map();            // key -> {world, lastUsed}
    this.still = still || null;         // canvas for the panic still
    this.fps = 60; this._ft = []; this._last = 0;
    this.blankSince = 0; this.lastCheck = 0; this.lastStill = 0; this.goodFrames = 0;
    this.watch = { blank: false, events: 0 };
    this.checkTarget = null;
    this.q = 1;
    this.lastFrame = null;
  }

  palette(id) { return this.byId.get(id) || this.byId.get('original'); }
  setPalette(p) { this.byId.set(p.id, p); }

  world(key, seed, kind) {
    let w = this.worlds.get(key);
    if (!w) {
      const world = new World(seed, { key, onLog: this.onLog, world: kind });
      this.renderer.attach(world);
      w = { world, lastUsed: performance.now() };
      this.worlds.set(key, w);
    }
    return w.world;
  }
  peek(key) { const w = this.worlds.get(key); return w ? w.world : null; }

  // css size -> drawing buffer (DPR capped at 1, times quality)
  size() {
    const r = this.canvas.getBoundingClientRect();
    const W = Math.max(2, Math.round(r.width * this.q)), H = Math.max(2, Math.round(r.height * this.q));
    this.renderer.resize(W, H);
    return [W, H];
  }

  // fs: {worlds:[{key, seed, world, x, alpha}], dir, pal:{a, b, mix}, u:{contrast, ink, paper, vignette, zoom, yAlign}, time,
  //      weather:{rain, wind, water, fog, light}}
  frame(fs, { blackout = false, panic = false } = {}) {
    const now = performance.now();
    if (this._last) { this._ft.push(now - this._last); if (this._ft.length > 60) this._ft.shift(); this.fps = 1000 / (this._ft.reduce((a, b) => a + b, 0) / this._ft.length); }
    this._last = now;
    const [W, H] = this.size();
    const v = viewOf(W, H, fs.u.zoom, fs.u.yAlign);
    const rscale = Math.round(v.scale * 64) / 64;   // quantized so small resizes do not redraw every tile
    const list = [];
    for (const it of fs.worlds) {
      const world = this.world(it.key, it.seed, it.world);
      this.worlds.get(it.key).lastUsed = now;
      world.update(it.x, v.viewW, fs.dir, rscale);
      list.push({ world, x: it.x, alpha: it.alpha });
    }
    // close worlds no longer shown
    for (const [k, w] of this.worlds) {
      if (now - w.lastUsed > 1500) { this.renderer.releaseWorld(w.world); w.world.dispose(); this.worlds.delete(k); }
    }
    const look = this.look(fs);
    const f = { ...look, W, H, scale: v.scale, camY: v.camY, worlds: list };
    this.lastFrame = { fs, f, v };
    this.renderer.poll();
    const ok = this.renderer.draw(f);
    if (ok && !blackout && !panic) this._watch(now, f, list);
    return v;
  }

  look(fs) {
    return {
      palA: this.palette(fs.pal.a), palB: this.palette(fs.pal.b), mix: fs.pal.mix,
      inkRange: this.palettes.inkRange || 0.75,
      contrast: fs.u.contrast, ink: fs.u.ink, paperOn: fs.u.paper, vignette: fs.u.vignette ? 0.55 : 0, time: fs.time,
      weather: fs.weather || null,
    };
  }

  // once a second: a 160 x 90 copy of the frame; blank = one flat colour for 3 s while tiles should be there.
  // Both copies are read back asynchronously (renderer.readAsync), so they never cost a frame.
  _watch(now, f, list) {
    if (now - this.lastCheck < 1000) {
      if (this.still && now - this.lastStill > 2000 && this.goodFrames > 2) { this._copyStill(f); this.lastStill = now; }
      return;
    }
    this.lastCheck = now;
    const r = this.renderer;
    if (!this.checkTarget) this.checkTarget = r.target(160, 90);
    r.draw({ ...f, W: 160, H: 90, scale: f.scale * 160 / f.W, vignette: 0 }, this.checkTarget);
    r.readAsync(this.checkTarget, px => this._judge(px, performance.now(), list));
  }
  _judge(px, now, list) {
    let mn = 255, mx = 0;
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; if (l < mn) mn = l; if (l > mx) mx = l; }
    const anyTiles = list.some(w => w.world.started);
    const flat = mx - mn < 4;
    if (flat && anyTiles) {
      if (!this.blankSince) this.blankSince = now;
      if (now - this.blankSince > 3000 && !this.watch.blank) {
        this.watch.blank = true; this.watch.events++;
        this.onLog('warn', 'watchdog: output blank for 3 s, redrawing tiles');
        for (const w of list) w.world.refreshTiles();
      }
      if (now - this.blankSince > 15000 && this.onStuck) { this.onStuck(); this.blankSince = now; }
      this.goodFrames = 0;
    } else {
      if (this.watch.blank) this.onLog('info', 'watchdog: output back');
      this.blankSince = 0; this.watch.blank = false; this.goodFrames++;
    }
    this.lastLum = [mn, mx];
  }

  _copyStill(f) {
    const s = this.still, r = this.renderer; if (!s) return;
    const W = s.width, H = s.height;
    if (!this.stillTarget) this.stillTarget = r.target(W, H);
    r.draw({ ...f, W, H, scale: f.scale * H / f.H }, this.stillTarget);
    r.readAsync(this.stillTarget, px => {
      const img = new ImageData(W, H), row = W * 4;
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      try { s.getContext('2d').putImageData(img, 0, 0); } catch (e) { /* keep the previous still */ }
    });
  }

  stats() {
    let chunks = 0, tiles = 0, gen = 0;
    for (const { world } of this.worlds.values()) { chunks += world.chunks.size; tiles += [...world.tiles.values()].filter(t => t.tex).length; gen = world.genAvgMs; }
    return { fps: this.fps, chunks, tiles, worlds: this.worlds.size, genMs: gen };
  }
}
