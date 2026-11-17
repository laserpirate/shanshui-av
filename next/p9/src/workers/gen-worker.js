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

function collect(ms) {
  const added = [];
  for (const c of MEM.chunks) {
    if (c._id === undefined) {
      c._id = nextId++;
      known.add(c._id);
      added.push({ id: c._id, tag: c.tag, x: c.x, y: c.y, canv: c.canv });
    }
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
      // move the generated range in, so travel back past a cull generates new landscape there
      const cw = MEM.cwid;
      if (msg.below > MEM.xmin) MEM.xmin = Math.max(MEM.xmin, Math.floor(msg.below / cw) * cw);
      if (msg.above < MEM.xmax) MEM.xmax = Math.min(MEM.xmax, Math.ceil(msg.above / cw) * cw);
      // planner memory outside the kept range
      const lo = Math.floor((msg.below - 4000) / 5), hi = Math.ceil((msg.above + 4000) / 5);
      for (const k in MEM.planmtx) { const n = +k; if (n < lo || n > hi) delete MEM.planmtx[k]; }
      self.postMessage({ type: 'chunks', added: [], removed, order: MEM.chunks.map(c => c._id), xmin: MEM.xmin, xmax: MEM.xmax, ms: 0 });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
