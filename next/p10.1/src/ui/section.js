// Live section: the true cross-section at the playhead s, from the pack (sections every 10 m, offsets +-400 m every
// 4 m, m above ws(s); positive offsets are the left bank). Both banks, the named levels, the level shown, filled water.
// Same exaggeration rule as the scroll: vertical px per m = horizontal px per m x Vertical Exaggeration.
// Drawn on a 2D canvas in the stage (controller) and in the output when the sections layer is on.
import { levelH, levelAt, at } from '../worlds/nashua/pack.js';

const INK = '#07090e', PAPER = 'rgba(236, 238, 242, 0.92)', WATER = 'rgba(46, 74, 140, 0.55)', EST = 'rgba(46, 74, 140, 0.25)';
const mft = m => `${m.toFixed(0)} m (${(m * 3.28084).toFixed(0)} ft)`;

export class SectionInset {
  constructor(canvas, line) { this.cv = canvas; this.line = line; this.on = false; this.lastKey = ''; }

  // view: {s, lv, ve, show, W (css px of the stage), H}
  update(pack, view) {
    const show = !!(view.show && pack);
    if (show !== this.on) { this.cv.hidden = !show; if (this.line) this.line.hidden = !show; this.on = show; this.lastKey = ''; }
    if (!show) return;
    const s = Math.max(0, Math.min(pack.route_len_m, view.s));
    const key = Math.round(s / 2) + ':' + view.lv.toFixed(3) + ':' + view.ve + ':' + view.W;
    if (key === this.lastKey) return;    // redraw only when something moved
    this.lastKey = key;
    this.draw(pack, s, view.lv, view.ve, view.W);
  }

  draw(pack, s, lv, ve, stageW) {
    const cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(Math.min(560, Math.max(380, stageW * 0.36))), h = Math.round(w * 0.5);
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
    g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);

    // the section rows either side of s, interpolated
    const S = pack.A.sec_s, OFF = pack.A.sec_off, n = OFF.length, Z = pack.A.sec, F = pack.A.sec_flag;
    let i = Math.min(S.length - 2, Math.max(0, Math.floor(s / pack.section_step_m)));
    const t = Math.max(0, Math.min(1, (s - S[i]) / (S[i + 1] - S[i])));
    const z = new Float32Array(n), f = new Uint8Array(n);
    for (let k = 0; k < n; k++) { z[k] = Z[i * n + k] * (1 - t) + Z[(i + 1) * n + k] * t; f[k] = t < 0.5 ? F[i * n + k] : F[(i + 1) * n + k]; }

    // scales: horizontal from the offsets, vertical = horizontal x ve
    const padX = 14, top = 44, bottom = h - 34;
    const kx = (w - 2 * padX) / (OFF[n - 1] - OFF[0]), ky = kx * ve;
    const names = pack.levels.map(L => levelH(pack, L, s));
    const zTop = Math.max(names.at(-1) + 1, 4), zBot = Math.min(...z) - 1;
    const cy = top + (bottom - top) * zTop / (zTop - zBot);       // screen y of ws(s)
    const X = off => w / 2 - off * kx;                               // left bank (positive offset) on the left
    const Y = m => cy - m * ky;

    // ground (land) and bed (wet), poche below
    g.beginPath(); g.moveTo(X(OFF[0]), h);
    for (let k = 0; k < n; k++) if (f[k] !== 3) g.lineTo(X(OFF[k]), Math.min(h, Y(z[k])));
    g.lineTo(X(OFF[n - 1]), h); g.closePath();
    g.fillStyle = 'rgba(62, 70, 107, 0.35)'; g.fill();
    // water at the level shown
    const wl = levelAt(pack, lv, s);
    g.save(); g.beginPath();
    for (let k = 0; k < n - 1; k++) {
      if (z[k] < wl || z[k + 1] < wl) { g.rect(X(OFF[k + 1]), Y(wl), X(OFF[k]) - X(OFF[k + 1]) + 0.5, Math.max(0, Math.max(Y(z[k]), Y(z[k + 1])) - Y(wl))); }
    }
    g.fillStyle = WATER; g.fill(); g.restore();
    // profile line: solid on land and measured bed, dashed on estimated bed
    for (let k = 0; k < n - 1; k++) {
      if (f[k] === 3 || f[k + 1] === 3) continue;
      g.setLineDash(f[k] === 2 ? [4, 3] : []);
      g.strokeStyle = f[k] === 2 ? EST.replace('0.25', '1') : INK; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(X(OFF[k]), Y(z[k])); g.lineTo(X(OFF[k + 1]), Y(z[k + 1])); g.stroke();
    }
    g.setLineDash([]);
    // the named levels, thin; the shown level, heavier
    g.font = "500 18px 'Plex Cond', 'IBM Plex Sans Condensed', sans-serif"; g.textBaseline = 'bottom';
    for (let j = 0; j < names.length; j++) {
      const y = Y(names[j]);
      if (y < top - 4 || y > bottom + 20) continue;
      g.strokeStyle = 'rgba(7, 9, 14, 0.45)'; g.lineWidth = 1; g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(padX, y); g.lineTo(w - padX, y); g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = '#2E4A8C'; g.lineWidth = 2; g.beginPath(); g.moveTo(padX, Y(wl)); g.lineTo(w - padX, Y(wl)); g.stroke();
    // text: facts only
    g.fillStyle = INK; g.textAlign = 'left';
    g.fillText(`s ${mft(s)}   Vertical Exaggeration ${ve}x`, padX, 28);
    g.textAlign = 'left'; g.fillText('left bank', padX, h - 8);
    g.textAlign = 'right'; g.fillText('right bank', w - padX, h - 8);
    // a 100 m bar
    const bx = w / 2 - 50 * kx;
    g.textAlign = 'center'; g.fillRect(bx, h - 30, 100 * kx, 3); g.fillText('100 m (328 ft)', w / 2, h - 8);
  }
}
