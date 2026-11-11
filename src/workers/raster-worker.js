// Raster worker: draws upstream SVG element strings into OffscreenCanvas tiles, off the main thread.
// Upstream only emits <polyline points style="fill;stroke;stroke-width"/> plus a few <text> sign
// boards, so a small parser and Canvas 2D paint them the way the browser paints the SVG
// (fill then stroke, nonzero fill, butt caps, miter joins, miter limit 4).
// Tiles are grey (the source colours), on white paper; the GL palette pass colours them.
// Worlds with lights (derelict) also ask for an aux tile at half resolution, RGBA bytes:
//   R depth layer x 50 (0 = nothing drawn, 1 far .. 5 near)   G light intensity (glow)
//   B light kind x 32 + phase (0..31), read unfiltered by the shader to animate blink and flicker
// Lights are <circle data-l='kind,phase,i'/> and <polyline points data-l='kind,phase,i,width'/>,
// which the ink pass ignores, so ink tiles stay exactly as they were.
//
// in : {type:'add', items:[{id,canv,depth}]}      parse and keep
//      {type:'drop', ids}
//      {type:'tile', key, x0, w, h, scale, order:[ids], y0, aux}   world rect [x0, x0+w] x [y0, y0+h]
//      {type:'clear'}
// out: {type:'extents', items:[[id, minx, maxx]]}   after each add
//      {type:'tile', key, grey: {width, height, data}, aux: {width, height, data} | null, ms, prims, hash}

const store = new Map(); // id -> {prims:[...], minx, maxx}

const RE_POLY = /<polyline points='([^']*)' style='fill:([^;]*);stroke:([^;]*);stroke-width:([^']*)'\/>/g;
const RE_LAMP = /<circle cx='([^']*)' cy='([^']*)' r='([^']*)' data-l='([^']*)'\/>/g;
const RE_NEON = /<polyline points='([^']*)' data-l='([^']*)'\/>/g;
const RE_TEXT = /<text font-size='([^']*)' font-family='([^']*)' style='fill:([^']*)' text-anchor='middle' transform='translate\(([^,]*),([^)]*)\) rotate\(([^)]*)\)'>([^<]*)<\/text>/g;

function visible(col) {
  if (!col || col === 'none' || col === 'transparent') return false;
  const m = /^rgba\(([^)]*)\)$/.exec(col);
  if (m) { const a = parseFloat(m[1].split(',')[3]); return !(a <= 0); }
  return true;
}

function nums2(str) {
  const nums = str.trim().split(/[\s,]+/), n = nums.length >> 1, pts = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) pts[i] = +nums[i];
  return pts;
}
function parse(canv, depth) {
  const prims = [];
  const lights = [];
  let minx = Infinity, maxx = -Infinity;
  let m;
  RE_POLY.lastIndex = 0;
  while ((m = RE_POLY.exec(canv))) {
    const nums = m[1].trim().split(/[\s,]+/);
    const n = nums.length >> 1;
    if (n < 1) continue;
    const pts = new Float32Array(n * 2);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = +nums[2 * i], y = +nums[2 * i + 1];
      pts[2 * i] = x; pts[2 * i + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const wid = parseFloat(m[4]) || 0;
    const fil = visible(m[2]) ? m[2] : null;
    const str = wid > 0 && visible(m[3]) ? m[3] : null;
    if (!fil && !str) continue;
    const pad = wid;
    prims.push({ k: 0, pts, fil, str, wid, x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad });
    if (x0 - pad < minx) minx = x0 - pad; if (x1 + pad > maxx) maxx = x1 + pad;
  }
  RE_TEXT.lastIndex = 0;
  while ((m = RE_TEXT.exec(canv))) {
    const size = +m[1], tx = +m[4], ty = +m[5];
    const r = size * Math.max(1, m[7].length);
    prims.push({ k: 1, size, font: m[2], fil: m[3], tx, ty, rot: +m[6], text: m[7], x0: tx - r, x1: tx + r, y0: ty - r, y1: ty + r });
    if (tx - r < minx) minx = tx - r; if (tx + r > maxx) maxx = tx + r;
  }
  if (depth) {
    RE_LAMP.lastIndex = 0;
    while ((m = RE_LAMP.exec(canv))) {
      const [k, ph, i] = m[4].split(',').map(Number), x = +m[1], y = +m[2], r = +m[3];
      lights.push({ k: 0, x, y, r, code: k * 32 + ph, i, x0: x - r * 5, x1: x + r * 5, y0: y - r * 5, y1: y + r * 5 });
    }
    RE_NEON.lastIndex = 0;
    while ((m = RE_NEON.exec(canv))) {
      const [k, ph, i, w] = m[2].split(',').map(Number), pts = nums2(m[1]);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let j = 0; j < pts.length; j += 2) { x0 = Math.min(x0, pts[j]); x1 = Math.max(x1, pts[j]); y0 = Math.min(y0, pts[j + 1]); y1 = Math.max(y1, pts[j + 1]); }
      lights.push({ k: 1, pts, w, code: k * 32 + ph, i, x0: x0 - w * 5, x1: x1 + w * 5, y0: y0 - w * 5, y1: y1 + w * 5 });
    }
    for (const l of lights) { if (l.x0 < minx) minx = l.x0; if (l.x1 > maxx) maxx = l.x1; }
  }
  return { prims, lights, depth: depth || 0, minx, maxx };
}

// depth of a primitive's colour: only marks pixels it really covers (alpha 0.25 or more)
function covers(col) {
  if (!col) return false;
  const m = /^rgba\(([^)]*)\)$/.exec(col);
  return !m || parseFloat(m[1].split(',')[3]) >= 0.25;
}
let auxCv = null;
function auxTile(msg, W, H) {
  // half resolution, three passes on CPU canvases: depth, glow (additive), light code
  const w = Math.max(1, Math.ceil(W / 2)), h = Math.max(1, Math.ceil(H / 2));
  if (!auxCv || auxCv[0].width !== w || auxCv[0].height !== h) auxCv = [0, 1, 2].map(() => new OffscreenCanvas(w, h));
  const [cd, cg, cc] = auxCv.map(c => c.getContext('2d', { willReadFrequently: true }));
  const s = msg.scale * w / W, y0 = msg.y0 || 0;
  for (const c of [cd, cg, cc]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.setTransform(s, 0, 0, s, -msg.x0 * s, -y0 * s); c.lineCap = 'round'; c.lineJoin = 'round'; }
  cg.globalCompositeOperation = 'lighter';
  const xa = msg.x0, xb = msg.x0 + msg.w, ya = y0, yb = y0 + msg.h;
  for (const id of msg.order) {
    const el = store.get(id);
    if (!el || !el.depth || el.maxx < xa || el.minx > xb) continue;
    const dc = 'rgb(' + el.depth * 50 + ',0,0)';
    cd.fillStyle = cd.strokeStyle = dc;
    for (const p of el.prims) {
      if (p.k !== 0 || p.x1 < xa || p.x0 > xb || p.y1 < ya || p.y0 > yb) continue;
      const a = p.pts;
      cd.beginPath(); cd.moveTo(a[0], a[1]);
      for (let i = 2; i < a.length; i += 2) cd.lineTo(a[i], a[i + 1]);
      if (covers(p.fil)) cd.fill();
      if (p.str && covers(p.str) && p.wid >= 0.8) { cd.lineWidth = p.wid; cd.stroke(); }
    }
    for (const l of el.lights) {
      if (l.x1 < xa || l.x0 > xb || l.y1 < ya || l.y0 > yb) continue;
      const code = 'rgb(' + l.code + ',' + l.code + ',' + l.code + ')';
      if (l.k === 0) {
        const R = l.r * 4.5, g = cg.createRadialGradient(l.x, l.y, 0, l.x, l.y, R);
        g.addColorStop(0, `rgba(255,255,255,${l.i})`); g.addColorStop(0.18, `rgba(255,255,255,${l.i * 0.75})`);
        g.addColorStop(0.45, `rgba(255,255,255,${l.i * 0.22})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        cg.fillStyle = g; cg.beginPath(); cg.arc(l.x, l.y, R, 0, Math.PI * 2); cg.fill();
        cc.fillStyle = code; cc.beginPath(); cc.arc(l.x, l.y, R, 0, Math.PI * 2); cc.fill();
      } else {
        const a = l.pts;
        const path = c => { c.beginPath(); c.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) c.lineTo(a[i], a[i + 1]); };
        path(cg); cg.strokeStyle = `rgba(255,255,255,${l.i * 0.25})`; cg.lineWidth = l.w * 5; cg.stroke();
        cg.strokeStyle = `rgba(255,255,255,${l.i * 0.8})`; cg.lineWidth = l.w * 1.5; cg.stroke();
        path(cc); cc.strokeStyle = code; cc.lineWidth = l.w * 6; cc.stroke();
      }
    }
  }
  const D = cd.getImageData(0, 0, w, h).data, Gd = cg.getImageData(0, 0, w, h).data, C = cc.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = D[i]; out[i + 1] = Gd[i]; out[i + 2] = C[i]; out[i + 3] = 255; }
  return { width: w, height: h, data: out };
}

function paint(ctx, p) {
  if (p.k === 1) {
    ctx.save();
    ctx.translate(p.tx, p.ty);
    ctx.rotate(p.rot * Math.PI / 180);
    ctx.font = p.size + 'px ' + p.font + ', sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.fil;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
    return;
  }
  const a = p.pts;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  for (let i = 2; i < a.length; i += 2) ctx.lineTo(a[i], a[i + 1]);
  if (p.fil) { ctx.fillStyle = p.fil; ctx.fill(); }
  if (p.str) { ctx.lineWidth = p.wid; ctx.strokeStyle = p.str; ctx.stroke(); }
}

let canvas = null;
self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'add') {
      const items = [];
      for (const it of msg.items) { const el = parse(it.canv, it.depth); store.set(it.id, el); items.push([it.id, el.minx, el.maxx]); }
      self.postMessage({ type: 'extents', items });
    } else if (msg.type === 'drop') {
      for (const id of msg.ids) store.delete(id);
    } else if (msg.type === 'clear') {
      store.clear();
    } else if (msg.type === 'tile') {
      const t = performance.now();
      const W = msg.pw || Math.max(1, Math.round(msg.w * msg.scale)), H = msg.ph || Math.max(1, Math.round(msg.h * msg.scale));
      if (!canvas || canvas.width !== W || canvas.height !== H) canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });   // CPU canvas: no GPU readback
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const y0 = msg.y0 || 0;
      ctx.setTransform(msg.scale, 0, 0, msg.scale, -msg.x0 * msg.scale, -y0 * msg.scale);
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 4;
      const xa = msg.x0, xb = msg.x0 + msg.w;
      let prims = 0;
      for (const id of msg.order) {
        const el = store.get(id);
        if (!el || el.maxx < xa || el.minx > xb) continue;
        for (const p of el.prims) {
          if (p.x1 < xa || p.x0 > xb || p.y1 < y0 || p.y0 > y0 + msg.h) continue;
          paint(ctx, p); prims++;
        }
      }
      // read back here, in the worker, and send one grey byte per pixel: uploading an RGBA ImageBitmap
      // into an R8 texture made the main thread wait on a GPU readback and conversion (frame drops on reseed)
      const rgba = ctx.getImageData(0, 0, W, H).data;
      const grey = new Uint8Array(W * H);
      for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = rgba[i];
      const aux = msg.aux ? auxTile(msg, W, H) : null;
      // a cheap content hash (every 7th byte, FNV-1a) for the determinism tests
      let hsh = 0x811C9DC5;
      for (let i = 0; i < grey.length; i += 7) { hsh ^= grey[i]; hsh = Math.imul(hsh, 0x01000193); }
      if (aux) for (let i = 0; i < aux.data.length; i += 7) { hsh ^= aux.data[i]; hsh = Math.imul(hsh, 0x01000193); }
      const tr = [grey.buffer]; if (aux) tr.push(aux.data.buffer);
      self.postMessage({ type: 'tile', key: msg.key, grey: { width: W, height: H, data: grey }, aux, ms: performance.now() - t, prims, hash: hsh >>> 0 }, tr);
    }
  } catch (err) {
    self.postMessage({ type: 'error', key: msg && msg.key, message: String(err && err.stack || err) });
  }
};
