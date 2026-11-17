// ?hydro=1: a small hydrograph under the fact line while the time scroll is on. One year either side of the scroll's
// day of the East Pepperell daily record (the same record and the same upstream-proxy caveat as the fact line), on a
// log axis fixed to the whole record so a flood reads the same height in any year; the record median and the 1936
// maximum as rules; a cursor at the scroll's day. Redrawn only when the day changes (no per-frame work).
import { qAt, isoOf } from '../worlds/nashua/gauge.js';

const SPAN = 365, W = 480, H = 132, PADT = 26, PADB = 6;
const M3 = 0.0283168;

export class Hydro {
  constructor(parent) {
    this.cv = document.createElement('canvas');
    this.cv.id = 'hud-hydro';
    this.cv.style.cssText = `display:block;width:${W}px;height:${H}px;margin-top:6px`;
    this.cv.hidden = true;
    parent.appendChild(this.cv);
    this.day = null; this.draws = 0; this.ms = 0; this.cursorX = null;
  }

  // g: the prepared gauge record (gauge.js), d: the scroll's fractional day, on: time scroll on
  update(g, d, on) {
    if (!on || !g) { if (!this.cv.hidden) { this.cv.hidden = true; this.day = null; } return; }
    if (this.cv.hidden) this.cv.hidden = false;
    const day = Math.floor(d);
    if (day === this.day) return;
    this.day = day;
    const t0 = performance.now();
    this._draw(g, d);
    this.ms = performance.now() - t0; this.draws++;
  }

  _draw(g, d) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cv = this.cv;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    if (!this.lnMin) { let m = Infinity; for (const v of g.qf) if (v > 0 && v < m) m = v; this.lnMin = Math.log(m); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const n = g.qf.length, a = Math.floor(d) - SPAN, b = Math.floor(d) + SPAN;
    const X = k => ((k - a) / (b - a)) * W;
    const Y = q => PADT + (1 - (Math.log(Math.max(1, q)) - this.lnMin) / (g.lnMax - this.lnMin)) * (H - PADT - PADB);
    c.fillStyle = 'rgba(7,9,14,0.55)'; c.fillRect(0, 0, W, H);
    // rules: the record median (dashed) and the record maximum (solid, 1936)
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(200,214,240,0.55)'; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(0, Y(g.median)); c.lineTo(W, Y(g.median)); c.stroke();
    c.setLineDash([]); c.strokeStyle = 'rgba(200,214,240,0.35)';
    c.beginPath(); c.moveTo(0, Y(g.max.q)); c.lineTo(W, Y(g.max.q)); c.stroke();
    // year starts
    c.strokeStyle = 'rgba(200,214,240,0.18)';
    for (let k = a; k <= b; k++) if (k >= 0 && k < n && isoOf(g, k).endsWith('-01-01')) { const x = X(k); c.beginPath(); c.moveTo(x, PADT); c.lineTo(x, H - PADB); c.stroke(); }
    // the record
    c.strokeStyle = '#c8d6f0'; c.lineWidth = 1.4; c.beginPath();
    let pen = false;
    for (let k = Math.max(0, a); k <= Math.min(n - 1, b); k++) { const x = X(k), y = Y(g.qf[k]); if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; } }
    c.stroke();
    // cursor at the scroll's day
    const cx = X(d); this.cursorX = cx;
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, PADT - 4); c.lineTo(cx, H - PADB); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, Y(qAt(g, d)), 4, 0, 6.2832); c.fill();
    // one line of text, 18 px: what the strip is
    c.font = '18px "Plex Cond", system-ui, sans-serif'; c.fillStyle = '#c8d6f0'; c.textBaseline = 'top';
    c.fillText('1 year either side, log, dashed = median ' + (g.median * M3).toFixed(0) + ' m³/s', 6, 3);
  }
}
