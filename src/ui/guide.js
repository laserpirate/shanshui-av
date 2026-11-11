// ADDENDUM-B B6: the quick guide, one screen. Facts only, built when it opens from the tables the app runs on:
// the keys from KEYS (keys.js), the bar from the bar's own buttons (their text and title), the URL parameters from
// PARAMS below, which tests/p7.mjs checks against every parameter the source reads, so the guide cannot drift.
import { KEYS } from './keys.js';

// [name, where, what]. where: c controller, o output, w a wall node or clock mode
export const PARAMS = [
  ['seed', 'c o w', 'landscape seed'],
  ['world', 'c o w', 'shanshui, derelict or nashua'],
  ['palette', 'c o w', 'palette id from palettes.json'],
  ['i', 'c o', 'instance: its own settings and output channel'],
  ['bank', 'c w', 'nashua: L (north, the default) or R'],
  ['hx', 'c w', 'nashua: world px per m, 2 to 12 (default 8)'],
  ['ve', 'c w', 'nashua: Vertical Exaggeration, 1 to 20 (default 2)'],
  ['level', 'c w', 'nashua: water level 0 to 4'],
  ['ends', 'c', 'nashua: pingpong, handover or loop'],
  ['mode', 'c w', 'nashua: nature, built, design or sections'],
  ['sections', 'c', 'nashua: the live section on'],
  ['morph', 'c', 'nashua: 0 to 1, needs the local design pack'],
  ['reach', 'c w', 'nashua: merrimack for the second reach'],
  ['spread', 'c w', 'nashua: 0 puts far footprints at their nearest station'],
  ['layers', 'c', 'nashua, tests: draw only these layers'],
  ['t', 'c', 'nashua: the time scroll at YYYY-MM-DD'],
  ['daycycle', 'c', 'nashua: 1, the light follows the sun'],
  ['hour', 'c', 'nashua: hour of the day cycle'],
  ['hydro', 'c', 'nashua: 1, the hydrograph'],
  ['ticks', 'c o', 'nashua: 1, the distance rule'],
  ['tags', 'c', 'nashua: 1, the tag stream for a score'],
  ['quality', 'c o', 'auto, high, medium or low'],
  ['offline', 'c', '1, the service worker'],
  ['baked', 'c o', '1, baked tiles where they exist'],
  ['sync', 'c o', 'ws://host:8097, the LAN relay'],
  ['wall', 'o w', 'columns x rows, for example 2x1'],
  ['col', 'o w', 'this node’s column from 0'],
  ['row', 'o w', 'this node’s row from 0'],
  ['bezel', 'o w', 'gap between screens, css px'],
  ['overlap', 'o w', 'projector blend overlap, css px'],
  ['blend', 'o w', 'overlap per edge l,r,t,b'],
  ['gamma', 'o w', 'display gamma for the blend'],
  ['ks', 'o w', 'four-corner keystone offsets'],
  ['cal', 'o w', '1, start on the calibration card'],
  ['cap', 'o w', 'brightness ceiling 0.1 to 1'],
  ['t0', 'w', 'clock mode: shared start, epoch ms'],
  ['speed', 'w', 'clock mode: px per s'],
  ['light', 'w', 'clock mode: light 0 to 1'],
  ['fog', 'w', 'clock mode: fog 0 to 1'],
  ['water', 'w', 'clock mode: water 0 to 1'],
  ['mirror', 'c o w', '1, the Mirror panel (a second world below the water)'],
  ['mon', 'c w', 'with mirror=1: 1 turns the mirror on'],
  ['maxis', 'c w', 'mirror axis, 0 to 80 css px below the water line'],
  ['mstr', 'c w', 'mirror strength 0 to 1'],
  ['mscroll', 'c w', 'mirror scroll: with, against or free'],
  ['malt', 'c w', 'mirror lower half: other, shanshui, derelict or nashua'],
];
export const PAIR = [
  'Open pair: two output windows as a 2 x 1 wall on this machine. Drag each to its screen, press F in each.',
  'Copy pair links: two clock-mode links with one shared t0, 10 s ahead, for two machines (clocks on NTP).',
  'The relay for a wall over a network: tools/wall-server.mjs, port 8097; WALL.md.',
];
export const README = 'https://github.com/laserpirate/shanshui-av/blob/feat/nashua/README.md';

export class Guide {
  constructor(parent, bar) {
    this.root = document.createElement('div');
    this.root.className = 'guide ui'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-label', 'quick guide');
    parent.appendChild(this.root);
    this.bar = bar; this.opened = 0;
    this.root.addEventListener('click', e => { if (e.target === this.root || e.target.closest('.guide-close')) this.close(); });
  }
  get on() { return !this.root.hidden; }
  toggle() { this.on ? this.close() : this.open(); }
  close() { this.root.hidden = true; }
  open() {
    const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const table = rows => { const t = el('table'); for (const r of rows) { const tr = el('tr'); for (const c of r) tr.appendChild(el('td', null, c)); t.appendChild(tr); } return t; };
    const col = (h, body) => { const c = el('section', 'guide-col'); c.append(el('h3', null, h), body); return c; };
    // the bar: every visible button, folded menus included, by its text and its title
    const seen = new Set(), bar = [];
    for (const b of this.bar.querySelectorAll('button, select')) {
      const t = (b.tagName === 'SELECT' ? b.getAttribute('aria-label') : b.textContent).replace(/\s+/g, ' ').trim();
      const what = b.title || b.getAttribute('aria-label') || '';
      if (!t || seen.has(t) || (b.closest('.grp') && b.closest('.grp').hidden)) continue;
      seen.add(t); bar.push([t, what]);
    }
    const pair = el('div'); for (const p of PAIR) pair.appendChild(el('p', null, p));
    const link = el('a', null, 'README (the longer manual)'); link.href = README; link.target = '_blank'; link.rel = 'noopener';
    pair.appendChild(link);
    const card = el('div', 'guide-card');
    const close = el('button', 'guide-close', 'Close'); close.type = 'button';
    card.append(close, col('Keys', table(KEYS)), col('Bar', table(bar)), col('URL', table(PARAMS.map(p => [p[0], p[2] + ' (' + p[1] + ')']))), col('Pair', pair));
    this.root.replaceChildren(card);
    this.root.hidden = false; this.opened++;
    this.counts = { keys: KEYS.length, bar: bar.length, params: PARAMS.length, pair: PAIR.length };
  }
}
