// Export: SVG and PDF stay vector (upstream element strings, colours mapped through the palette),
// PNG goes through the same raster + shader as the screen. Frames: the current view, or Arch D
// (36 x 24 in, landscape or portrait) placed on the scroll. View zoom never enters Arch D math.
// Worlds with weather (derelict) export the current cycle state: night darkens the colours, fog thins
// each depth layer, the flood is a flat water plane over layers 1 to 4 (no reflections in vector),
// lights are small filled circles in the palette accent (optional), rain is optional (off for print).
import { WORLD_H, CREDIT } from '../core/constants.js';
import { colorAt, inkCurve, driftOf, rgbHex, lightHex, beaconHex, hexRgb } from '../core/palettes.js';
import { waterY } from '../core/weather.js';
import { mulberry32, seedInt } from '../worlds/derelict/rng.js';

export const ARCH_D = { long: 36, short: 24 };

// frame geometry. opts: {format:'view'|'archd', portrait, fit, yAlign, margin, x0}; view: {W, H, scale, camX, camY}
export function frameGeom(opts, view) {
  if (opts.format !== 'archd') {
    return { unit: 'px', pageW: view.W, pageH: view.H, m: 0, printW: view.W, printH: view.H, k: view.scale,
      x0: view.camX, y0: view.camY, worldW: view.W / view.scale, worldH: view.H / view.scale };
  }
  const pageW = opts.portrait ? ARCH_D.short : ARCH_D.long, pageH = opts.portrait ? ARCH_D.long : ARCH_D.short;
  const m = Math.max(0, Math.min(Math.min(pageW, pageH) / 2 - 1, +opts.margin || 0));
  const printW = pageW - 2 * m, printH = pageH - 2 * m;
  const k = (printH * 72 / WORLD_H) * (opts.fit || 1);        // pt per world px, same on both axes
  const worldW = printW * 72 / k, worldH = printH * 72 / k;
  const y0 = (WORLD_H - worldH) * (opts.yAlign ?? 0.5);
  return { unit: 'in', pageW, pageH, m, printW, printH, k, x0: opts.x0 || 0, y0, worldW, worldH };
}

// page size in the SVG/PDF user unit (pt for inches, px for the view)
const pageUnits = g => g.unit === 'in' ? [g.pageW * 72, g.pageH * 72, g.m * 72] : [g.pageW, g.pageH, 0];

function parseCol(s) {
  s = s.trim();
  if (s === 'none' || s === 'transparent') return null;
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'black') return [0, 0, 0, 1];
  let m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) { const v = m[1].split(',').map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 1]; }
  return [100, 100, 100, 1];
}

// palette look -> colour mapper for one element at world x
export function colorMapper(look, paperAvg, night = 1) {
  const [dxA, dtA] = driftOf(look.palA), [dxB, dtB] = driftOf(look.palB);
  const tint = (p, c) => (look.paperOn && p.paper === 'tint' && paperAvg) ? c.map((v, i) => v * paperAvg[i] / 255) : c;
  const at = (i, x) => {
    const a = tint(look.palA, colorAt(look.palA, i, x * dxA + look.time * dtA, look.inkRange));
    if (look.mix <= 0.001) return night === 1 ? a : a.map(v => v * night);
    const b = tint(look.palB, colorAt(look.palB, i, x * dxB + look.time * dtB, look.inkRange));
    return a.map((v, k) => (v + (b[k] - v) * look.mix) * night);
  };
  const map = (s, x) => {
    const c = parseCol(s);
    if (!c || c[3] <= 0) return null;
    const i = inkCurve(1 - (c[0] + c[1] + c[2]) / 765, look.contrast, 1);
    const opaque = c[3] >= 1 && i < 0.002;   // paper-coloured occluders stay opaque
    const a = opaque ? 1 : Math.min(1, c[3] * look.ink);
    return [rgbHex(at(i, x)), +a.toFixed(3)];
  };
  return { map, ground: rgbHex(at(0, 0)), at };
}

const RE_STYLE = /style='fill:([^;]*);stroke:([^;]*);stroke-width:([^']*)'/g;
const RE_TFILL = /style='fill:([^']*)'/g;
function attrs(col, kind) {
  if (!col) return kind + "='none'";
  return kind + "='" + col[0] + "'" + (col[1] < 1 ? ' ' + kind + "-opacity='" + col[1] + "'" : '');
}
const RE_LAMP = /<circle cx='([^']*)' cy='([^']*)' r='([^']*)' data-l='([^']*)'\/>/g;
const RE_NEON = /<polyline points='([^']*)' data-l='([^']*)'\/>/g;
// light elements: accent circles and strokes, or nothing
function mapLights(canv, lights) {
  if (!lights) return canv.replace(RE_LAMP, '').replace(RE_NEON, '');
  const col = k => +k === 5 ? lights.beacon : lights.light;
  return canv
    .replace(RE_LAMP, (_, cx, cy, r, d) => { const [k, , i] = d.split(','); return `<circle cx='${cx}' cy='${cy}' r='${(+r * 1.3).toFixed(1)}' fill='${col(k)}' fill-opacity='${Math.min(1, +i).toFixed(2)}'/>`; })
    .replace(RE_NEON, (_, pts, d) => { const [k, , i, w] = d.split(','); return `<polyline points='${pts}' fill='none' stroke='${col(k)}' stroke-opacity='${Math.min(1, +i).toFixed(2)}' stroke-width='${w}' stroke-linecap='round'/>`; });
}
export function mapElement(canv, x, mapper, lights) {
  if (canv.indexOf('data-l') >= 0) canv = mapLights(canv, lights);
  return canv
    .replace(RE_STYLE, (_, f, s, w) => {
      const wid = parseFloat(w) || 0;
      return attrs(mapper.map(f, x), 'fill') + ' ' + (wid > 0 ? attrs(mapper.map(s, x), 'stroke') + " stroke-width='" + w + "'" : "stroke='none'");
    })
    .replace(RE_TFILL, (_, f) => attrs(mapper.map(f, x), 'fill'));
}

export function labelText(o) {
  const d = new Date();
  const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return 'seed ' + o.seed + '   ' + o.paletteName + '   ' + date + '   ' + CREDIT;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');

// full SVG document string. o: {seed, paletteName, border, label}
const FOG_W = [0, 0.8, 0.58, 0.36, 0.18, 0.02];
export function buildSVG(world, g, look, o) {
  const [PW, PH, M] = pageUnits(g);
  const wx = world.meta && world.meta.weather ? (look.weather || null) : null;
  const night = wx ? 0.42 + 0.58 * wx.light : 1;
  const mapper = colorMapper(look, world.paper && world.paper.avg, night);
  const els = world.elementsIn(g.x0, g.x0 + g.worldW);
  const lights = wx && o.lights ? { light: lightHex(look.palA), beacon: beaconHex(look.palA) } : null;
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${g.unit === 'in' ? g.pageW + 'in' : PW}" height="${g.unit === 'in' ? g.pageH + 'in' : PH}" viewBox="0 0 ${PW} ${PH}">`);
  parts.push(`<title>${esc((o.world || 'shanshui') + ' ' + o.seed + ' ' + o.paletteName)}</title>`);
  parts.push(`<desc>${esc(CREDIT)}</desc>`);
  if (g.unit === 'in') parts.push(`<rect x="0" y="0" width="${PW}" height="${PH}" fill="#ffffff"/>`);
  const pw = PW - 2 * M, ph = PH - 2 * M;
  parts.push(`<defs><clipPath id="frame"><rect x="${M}" y="${M}" width="${pw}" height="${ph}"/></clipPath></defs>`);
  parts.push(`<g clip-path="url(#frame)"><rect x="${M}" y="${M}" width="${pw}" height="${ph}" fill="${mapper.ground}"/>`);
  parts.push(`<g transform="translate(${M} ${M}) scale(${g.k}) translate(${-g.x0} ${-g.y0})">`);
  let water = !wx;
  const waterPlane = () => {
    // the flood: a flat plane over the far, mid-far, mid and ground layers, with a shore line
    water = true;
    const y = waterY(wx.water);
    if (y >= g.y0 + g.worldH) return;
    const x0 = g.x0 - 10, w = g.worldW + 20;
    parts.push(`<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(WORLD_H + 20 - y).toFixed(1)}" fill="${rgbHex(mapper.at(0.08, g.x0))}"/>`);
    parts.push(`<line x1="${x0.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${rgbHex(mapper.at(0.45, g.x0))}" stroke-width="0.8"/>`);
  };
  for (const c of els) {
    if (!water && c.depth >= 5) waterPlane();
    const el = mapElement(c.canv, c.x, mapper, lights);
    const fog = wx && c.depth ? 1 - wx.fog * FOG_W[c.depth] : 1;
    parts.push(fog < 0.999 ? `<g opacity="${fog.toFixed(3)}">${el}</g>` : el);
  }
  if (!water) waterPlane();
  if (wx && o.rain && wx.rain > 0.01) {
    // rain: seeded streaks over the frame, slanted by the wind
    const r = mulberry32(seedInt(o.seed) ^ 0x7A1);
    const n = Math.round(wx.rain * g.worldW * g.worldH / 900), col = rgbHex(mapper.at(0.5, g.x0));
    const d = [];
    for (let i = 0; i < n; i++) {
      const x = g.x0 + r() * g.worldW, y = g.y0 + r() * g.worldH, l = 8 + r() * 16;
      d.push(`M${x.toFixed(1)} ${y.toFixed(1)}l${(l * wx.wind * 0.5).toFixed(1)} ${l.toFixed(1)}`);
    }
    parts.push(`<path d="${d.join('')}" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="0.5"/>`);
  }
  parts.push('</g></g>');
  if (o.border) parts.push(`<rect x="${M}" y="${M}" width="${pw}" height="${ph}" fill="none" stroke="#000000" stroke-width="0.75"/>`);
  if (o.label) {
    const size = g.unit === 'in' ? 9 : 11;
    const y = M > size * 1.6 ? PH - M / 2 + size / 3 : PH - M - size;
    const x = PW - Math.max(M, size);
    parts.push(`<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#333333" text-anchor="end">${esc(labelText(o))}</text>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

export function fileName(o, g, ext) {
  const safe = s => String(s).replace(/[^\w.-]+/g, '-').slice(0, 64);
  const tail = g.unit === 'in' ? '_archD-' + (g.pageW > g.pageH ? 'landscape' : 'portrait') : '';
  return `${o.world && o.world !== 'shanshui' ? safe(o.world) : 'shanshui'}_${safe(o.seed)}_${safe(o.paletteId)}_${Math.round(g.x0)}${tail}.${ext}`;
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// PNG: raster the frame in blocks (worker), colour each block with the screen shader, paste.
// Pages over 16384 px a side or 180 Mpx are written as several tile files.
export async function buildPNG(world, renderer, g, look, o, dpi, onProgress) {
  const pxPer = g.unit === 'in' ? dpi : 1;               // page px per page unit (in) or per px
  const mult = g.unit === 'in' ? 1 : (o.viewScale || 2);
  const Wp = Math.round(g.pageW * pxPer * mult), Hp = Math.round(g.pageH * pxPer * mult);
  const Mp = Math.round(g.m * pxPer * mult);
  const pw = Wp - 2 * Mp, ph = Hp - 2 * Mp;
  const s = pw / g.worldW;                                // px per world px
  const canvas = document.createElement('canvas'); canvas.width = Wp; canvas.height = Hp;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas too large for this browser: ' + Wp + ' x ' + Hp);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, Wp, Hp);
  const B = Math.min(4096, renderer.maxTex || 4096);
  const blocks = [];
  for (let by = 0; by < ph; by += B) for (let bx = 0; bx < pw; bx += B) blocks.push([bx, by, Math.min(B, pw - bx), Math.min(B, ph - by)]);
  let n = 0;
  for (const [bx, by, bw, bh] of blocks) {
    const rect = { x: g.x0 + bx / s, y: g.y0 + by / s, w: bw / s, h: bh / s };
    const grey = await world.rasterRect(rect.x, rect.y, rect.w, rect.h, s, bw, bh);
    const rgba = renderer.colorize(grey, rect, { ...look, vignette: 0, rainPage: [bx, by, pw, ph] }, world);
    ctx.putImageData(new ImageData(rgba, bw, bh), Mp + bx, Mp + by);
    if (onProgress) onProgress(++n / blocks.length);
    await new Promise(r => setTimeout(r, 0));
  }
  const unit = Wp / (g.unit === 'in' ? g.pageW * 72 : g.pageW);  // canvas px per svg unit
  if (o.border) { ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 0.75 * unit); ctx.strokeRect(Mp, Mp, pw, ph); }
  if (o.label) {
    const size = (g.unit === 'in' ? 9 : 11) * unit;
    ctx.font = `${size}px Helvetica, Arial, sans-serif`; ctx.fillStyle = '#333'; ctx.textAlign = 'right';
    const y = Mp > size * 1.6 ? Hp - Mp / 2 + size / 3 : Hp - Mp - size;
    ctx.fillText(labelText(o), Wp - Math.max(Mp, size), y);
  }
  const toBlob = c => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'));
  if (Wp <= 16384 && Hp <= 16384 && Wp * Hp <= 180e6) return [{ blob: await toBlob(canvas), suffix: '', w: Wp, h: Hp }];
  const T = 8192, out = [];
  for (let ty = 0; ty < Hp; ty += T) for (let tx = 0; tx < Wp; tx += T) {
    const c = document.createElement('canvas'); c.width = Math.min(T, Wp - tx); c.height = Math.min(T, Hp - ty);
    c.getContext('2d').drawImage(canvas, -tx, -ty);
    out.push({ blob: await toBlob(c), suffix: `_tile-r${ty / T + 1}c${tx / T + 1}`, w: c.width, h: c.height });
  }
  return out;
}

let pdfLibs = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.head.appendChild(s); });
}
export async function buildPDF(svgText, g) {
  if (!pdfLibs) {
    pdfLibs = (async () => {
      const base = new URL('../../vendor/', import.meta.url);
      await loadScript(new URL('jspdf/jspdf.umd.min.js', base).href);
      await loadScript(new URL('svg2pdf/svg2pdf.umd.min.js', base).href);
    })();
  }
  await pdfLibs;
  const [PW, PH] = pageUnits(g);
  const w = g.unit === 'in' ? PW : PW * 0.75, h = g.unit === 'in' ? PH : PH * 0.75;   // pt
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML = svgText.replace(/^<\?xml[^>]*>\s*/, '');
  document.body.appendChild(holder);
  try {
    await doc.svg(holder.querySelector('svg'), { x: 0, y: 0, width: w, height: h });
  } finally { holder.remove(); }
  return doc.output('blob');
}
