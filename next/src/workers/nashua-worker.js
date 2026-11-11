// Generator worker for the nashua world (module worker, one per seed, bank and exaggeration). A copy of
// derelict-worker.js: the same messages, so World treats every world alike. It loads the data pack first.
//   in : {type:'init', seed, opts:{bank, ve}}  {type:'right'}  {type:'left'}  {type:'cull', below, above}
//   out: {type:'ready'}  {type:'paper', w, h, data}
//        {type:'chunks', added:[{id,tag,x,y,canv,depth}], removed:[ids], order:[ids], xmin, xmax, ms}
import { init, generate, paintOrder, paperTexture, meta } from '../worlds/nashua/index.js';
import { packFor } from '../worlds/nashua/pack.js';

const CW = meta.chunk;
let st = null;
let c0 = 0, c1 = 0;              // generated chunks [c0, c1)
const live = new Map();          // id -> element (for paint order)
const queue = [];                // messages that arrive while the pack loads

function add(c) {
  const els = generate(st, c);
  for (const e of els) live.set(e.id, e);
  return els.map(e => ({ id: e.id, tag: e.tag, layer: e.layer, x: e.x, y: 0, canv: e.canv, depth: e.depth }));
}
function order() { return [...live.values()].sort(paintOrder).map(e => e.id); }
function send(added, removed, ms) { self.postMessage({ type: 'chunks', added, removed, order: order(), xmin: c0 * CW, xmax: c1 * CW, ms }); }

function handle(msg) {
  const t = performance.now();
  if (msg.type === 'right') {
    const added = add(c1); c1++;
    send(added, [], performance.now() - t);
  } else if (msg.type === 'left') {
    c0--; const added = add(c0);
    send(added, [], performance.now() - t);
  } else if (msg.type === 'cull') {
    const removed = [];
    for (const [id, el] of live) {
      const x = el.c * CW;
      if (x + CW < msg.below || x > msg.above) { removed.push(id); live.delete(id); }
    }
    while (c0 < c1 && (c0 + 1) * CW < msg.below) c0++;
    while (c1 > c0 && (c1 - 1) * CW > msg.above) c1--;
    send([], removed, 0);
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const t = performance.now();
      const { pack } = await packFor(msg.opts || {});
      st = init(msg.seed, msg.opts || {}, pack);
      self.postMessage({ type: 'ready', seed: msg.seed, intSeed: st.s });
      c0 = -2; c1 = 7;
      const added = [];
      for (let c = c0; c < c1; c++) added.push(...add(c));
      const p = paperTexture(st);
      self.postMessage({ type: 'paper', w: p.w, h: p.h, data: p.data }, [p.data.buffer]);
      send(added, [], performance.now() - t);
      while (queue.length) handle(queue.shift());
      return;
    }
    if (!st) { queue.push(msg); return; }
    handle(msg);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
