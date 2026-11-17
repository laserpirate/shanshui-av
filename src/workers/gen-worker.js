// Generator worker: runs the upstream engine (src/engine/upstream-engine.js) unchanged, one worker
// per seed. A fresh worker gives the engine fresh globals (MEM, Noise, Prng), the same state the
// original page has after a reload with ?seed=.
//
// Order of PRNG draws matches the original page exactly:
//   1. Math.seed(seed)
//   2. chunkloader(0, 3000)          (what update() does on load, cursx = 0: right chunks, then one left)
//   3. the paper texture loop        (the bgcanv script at the end of the page: 257 x 257 noise + random)
//   4. one chunk at a time, rightward (what xcroll(+v) does as the view moves right)
// so every seed draws the same landscape as https://lingdong-.github.io/shan-shui-inf/?seed=<seed>
// for any rightward path. Leftward generation is also upstream's own chunkloader, in travel order.
//
// in : {type:'init', seed, quiet}
//      {type:'right'}  one chunk to the right       {type:'left'} one chunk to the left
//      {type:'cull', below, above}  drop elements with x outside [below, above] (memory cap)
// out: {type:'ready', seed, intSeed}
//      {type:'paper', w, h, data}                    upstream paper texture, RGBA
//      {type:'chunks', added:[{id,tag,x,y,canv}], removed:[ids], order:[ids], xmin, xmax, ms}

self.window = self;
self.document = { addEventListener() {}, getElementById() { return null; } };
let quiet = true;
const realLog = console.log;
console.log = function () { if (!quiet) realLog.apply(console, arguments); };

importScripts('../engine/upstream-engine.js');

let nextId = 1;
const known = new Set();

// ---------- ADDENDUM-D D1.3 Build: stages as filters on what the engine draws ----------
// Only for a world made with opts.build (1 to 8); without it nothing below runs and the worker is the one above.
// The engine stays unedited: its drawing functions are wrapped. Every wrapper calls the original first, so the PRNG
// sequence and the landscape are the same at every stage, and then keeps or drops what it drew:
//   1 the water line, one stroke (the engine has none: drawn here with its own brush, the PRNG state restored after)
//   2 + the ground line: the strokes of the near flat land (flatMount), no fill, no texture
//   3 + distant mountains (distMount)
//   4 + near mountains and hills (mountain, flatMount fills, texture strokes, rocks)
//   5 + single trees, sparse (1 in 8 by a hash of the tree's place)   6 + clusters (patches of a low-frequency noise)
//   7 + groves (every tree)   8 + the water the engine draws (ripples) and its boats. The engine draws no mist.
// Never at any stage: pavilions, towers, transmission towers, people (Arch.arch01 to 04, transmissionTower01, Man).
let BUILD = 0, CTX = '';
const WL_Y = 688;        // the water line: the foot of the scroll (the mirror's line for shanshui, D2), 12 px up
const h01 = (a, b) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D) >>> 0; h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const smooth = x => { const i = Math.floor(x), f = x - i, a = h01(i, 77), b = h01(i + 1, 77), t = f * f * (3 - 2 * f); return a + (b - a) * t; };
function keepTree(x, y) {
  if (BUILD >= 7) return true;
  if (BUILD < 5) return false;
  if (h01(Math.round(x), Math.round(y)) < 0.125) return true;   // single trees, sparse
  return BUILD >= 6 && smooth(x / 160) > 0.62;                  // clusters
}
function wrap(obj, name, keep, ctx) {
  const f = obj[name];
  obj[name] = function () {
    const was = CTX; if (ctx) CTX = ctx;
    try { const out = f.apply(this, arguments); return keep.apply(null, arguments) ? out : ''; } finally { CTX = was; }
  };
}
function setupBuild(stage) {
  BUILD = Math.max(1, Math.min(8, stage | 0));
  wrap(Mount, 'mountain', () => BUILD >= 4, 'mount');
  wrap(Mount, 'flatMount', () => BUILD >= 2, 'flat');
  wrap(Mount, 'distMount', () => BUILD >= 3, 'dist');
  wrap(Mount, 'rock', () => BUILD >= 4);
  wrap(self, 'water', () => BUILD >= 8, 'water');
  wrap(self, 'texture', () => BUILD >= 4);
  // inside the flat land before stage 4 only its strokes stay (the ground line): fills dropped. A stroke returns its
  // shape through poly(), so a stroke sets its own context and its poly is kept
  wrap(self, 'stroke', () => true, 'stroke');
  wrap(self, 'poly', () => !(CTX === 'flat' && BUILD < 4));
  for (const k of Object.keys(Tree)) if (/^tree\d+$/.test(k)) wrap(Tree, k, (x, y) => keepTree(x, y));
  for (const k of Object.keys(Arch)) if (typeof Arch[k] === 'function') wrap(Arch, k, () => k === 'boat01' && BUILD >= 8);
  wrap(Man, 'man', () => false);
}
// the water line over [a, b): pieces 512 px wide, one stroke each in the engine's brush, ends square so pieces join
const extra = [];
function waterLine(a, b) {
  for (let x0 = Math.floor(a / 512) * 512; x0 < b; x0 += 512) {
    if (extra.some(e => e.x0 === x0)) continue;
    const pts = [];
    for (let x = x0 - 8; x <= x0 + 520; x += 8) pts.push([x, WL_Y + (smooth(x / 90) - 0.5) * 3 + (smooth(x / 23 + 9) - 0.5) * 1.2]);
    const s = Prng.s;
    const canv = stroke(pts, { col: 'rgba(60,60,60,0.85)', wid: 2.6, noi: 0.35, fun: () => 1 });
    Prng.s = s;
    const e = { _id: nextId++, x0, tag: 'waterline', x: x0 + 256, y: WL_Y, canv };
    known.add(e._id); extra.push(e); e.isNew = true;
  }
}

function collect(ms) {
  const added = [];
  for (const c of MEM.chunks) {
    if (c._id === undefined) {
      c._id = nextId++;
      known.add(c._id);
      added.push({ id: c._id, tag: c.tag, x: c.x, y: c.y, canv: c.canv });
    }
  }
  if (BUILD) {
    waterLine(MEM.xmin, MEM.xmax);
    for (const e of extra) if (e.isNew) { e.isNew = false; added.push({ id: e._id, tag: e.tag, x: e.x, y: e.y, canv: e.canv }); }
    return { type: 'chunks', added, removed: [], order: MEM.chunks.map(c => c._id).concat(extra.map(e => e._id)), xmin: MEM.xmin, xmax: MEM.xmax, ms };
  }
  return { type: 'chunks', added, removed: [], order: MEM.chunks.map(c => c._id), xmin: MEM.xmin, xmax: MEM.xmax, ms };
}

// the bgcanv script, same draw order; returns the 512 x 512 texture it paints
function paperTexture() {
  const reso = 512;
  const data = new Uint8ClampedArray(reso * reso * 4);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= reso || y >= reso) return;
    const k = (y * reso + x) * 4;
    data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 255;
  };
  for (let i = 0; i < reso / 2 + 1; i++) {
    for (let j = 0; j < reso / 2 + 1; j++) {
      let c = 245 + Noise.noise(i * 0.1, j * 0.1) * 10;
      c -= Math.random() * 20;
      const r = +c.toFixed(0), g = +(c * 0.95).toFixed(0), b = +(c * 0.85).toFixed(0);
      put(i, j, r, g, b); put(reso - i, j, r, g, b); put(i, reso - j, r, g, b); put(reso - i, reso - j, r, g, b);
    }
  }
  return { w: reso, h: reso, data };
}

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      quiet = msg.quiet !== false;
      if (msg.opts && msg.opts.build) setupBuild(msg.opts.build);
      Math.seed(msg.seed);
      self.postMessage({ type: 'ready', seed: msg.seed, intSeed: Prng.s });
      let t = performance.now();
      chunkloader(0, 3000);
      const first = collect(performance.now() - t);
      const p = paperTexture();
      self.postMessage({ type: 'paper', w: p.w, h: p.h, data: p.data }, [p.data.buffer]);
      self.postMessage(first);
    } else if (msg.type === 'right') {
      const t = performance.now();
      chunkloader(MEM.xmin + MEM.cwid, MEM.xmax - MEM.cwid + 1);
      self.postMessage(collect(performance.now() - t));
    } else if (msg.type === 'left') {
      const t = performance.now();
      chunkloader(MEM.xmin + MEM.cwid - 1, MEM.xmax - MEM.cwid);
      self.postMessage(collect(performance.now() - t));
    } else if (msg.type === 'cull') {
      const removed = [];
      const keep = [];
      for (const c of MEM.chunks) {
        if (c.x < msg.below || c.x > msg.above) { removed.push(c._id); known.delete(c._id); } else keep.push(c);
      }
      MEM.chunks = keep;
      if (BUILD) for (let i = extra.length - 1; i >= 0; i--) { const e = extra[i]; if (e.x < msg.below || e.x > msg.above) { removed.push(e._id); known.delete(e._id); extra.splice(i, 1); } }
      // move the generated range in, so travel back past a cull generates new landscape there
      const cw = MEM.cwid;
      if (msg.below > MEM.xmin) MEM.xmin = Math.max(MEM.xmin, Math.floor(msg.below / cw) * cw);
      if (msg.above < MEM.xmax) MEM.xmax = Math.min(MEM.xmax, Math.ceil(msg.above / cw) * cw);
      // planner memory outside the kept range
      const lo = Math.floor((msg.below - 4000) / 5), hi = Math.ceil((msg.above + 4000) / 5);
      for (const k in MEM.planmtx) { const n = +k; if (n < lo || n > hi) delete MEM.planmtx[k]; }
      self.postMessage({ type: 'chunks', added: [], removed, order: BUILD ? MEM.chunks.map(c => c._id).concat(extra.map(e => e._id)) : MEM.chunks.map(c => c._id), xmin: MEM.xmin, xmax: MEM.xmax, ms: 0 });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
