// Raster worker: draws upstream SVG element strings into OffscreenCanvas tiles, off the main thread.
// Upstream only emits <polyline points style="fill;stroke;stroke-width"/> plus a few <text> sign
// boards, so a small parser and Canvas 2D paint them the way the browser paints the SVG
// (fill then stroke, nonzero fill, butt caps, miter joins, miter limit 4).
// Tiles are grey (the source colours), on white paper; the GL palette pass colours them.
//
// in : {type:'add', items:[{id,canv}]}      parse and keep
//      {type:'drop', ids}
//      {type:'tile', key, x0, w, h, scale, order:[ids], y0}   world rect [x0, x0+w] x [y0, y0+h]
//      {type:'clear'}
// out: {type:'extents', items:[[id, minx, maxx]]}   after each add
//      {type:'tile', key, bitmap, ms, prims}

const store = new Map(); // id -> {prims:[...], minx, maxx}

const RE_POLY = /<polyline points='([^']*)' style='fill:([^;]*);stroke:([^;]*);stroke-width:([^']*)'\/>/g;
const RE_TEXT = /<text font-size='([^']*)' font-family='([^']*)' style='fill:([^']*)' text-anchor='middle' transform='translate\(([^,]*),([^)]*)\) rotate\(([^)]*)\)'>([^<]*)<\/text>/g;

function visible(col) {
  if (!col || col === 'none' || col === 'transparent') return false;
  const m = /^rgba\(([^)]*)\)$/.exec(col);
  if (m) { const a = parseFloat(m[1].split(',')[3]); return !(a <= 0); }
  return true;
}

function parse(canv) {
  const prims = [];
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
  return { prims, minx, maxx };
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
      for (const it of msg.items) { const el = parse(it.canv); store.set(it.id, el); items.push([it.id, el.minx, el.maxx]); }
      self.postMessage({ type: 'extents', items });
    } else if (msg.type === 'drop') {
      for (const id of msg.ids) store.delete(id);
    } else if (msg.type === 'clear') {
      store.clear();
    } else if (msg.type === 'tile') {
      const t = performance.now();
      const W = msg.pw || Math.max(1, Math.round(msg.w * msg.scale)), H = msg.ph || Math.max(1, Math.round(msg.h * msg.scale));
      if (!canvas || canvas.width !== W || canvas.height !== H) canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d');
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
      const bitmap = canvas.transferToImageBitmap();
      self.postMessage({ type: 'tile', key: msg.key, bitmap, ms: performance.now() - t, prims }, [bitmap]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', key: msg && msg.key, message: String(err && err.stack || err) });
  }
};
