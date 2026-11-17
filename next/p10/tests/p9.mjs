// P9 tests (ADDENDUM-C C1, Open windows). Every rule here is first run on a planted wrong case and must fail there.
//   node tests/p9.mjs [http://localhost:8093/] [--only=name,name] [--drift-min=10]
// Writes test-results/p9.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const DRIFT_MIN = +((args.find(a => a.startsWith('--drift-min=')) || '').slice(12) || 10);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 900) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1960,1200'] });
const watch = p => {
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
};
const ready = p => p.waitForFunction(() => window.SSAV && SSAV.world() && (!/world=nashua/.test(location.search) || SSAV.world().pack) && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
const tilesUp = p => p.waitForFunction(() => window.SSOUT && SSOUT.scene.lastFrame && SSOUT.scene.stats().tiles >= 1, null, { timeout: 60000 });
async function controller(ctx, q) { const p = await ctx.newPage(); watch(p); await p.goto(BASE + q); await ready(p); return p; }
// the Windows panel from the Pair menu, a count and a layout, then a press on Open windows
async function pressOpen(p, n, layout) {
  if (await p.evaluate(() => document.getElementById('p-windows').hidden)) { await p.click('#b-pairmenu'); await p.click('#b-windows'); }
  await p.click(`#w-count button[data-v="${n}"]`);
  await p.click(`#w-layout button[data-v="${layout}"]`);
  await p.click('#w-open');
}

// the URLs a press opens: n windows, one per (col, row) of the layout, each wall=<layout>, its own win 1..n, and the
// controller's world, seed, reach and mirror state on every one
function checkUrls(urls, layout, want) {
  const [cols, rows] = layout.split('x').map(Number), seen = new Set();
  assert(urls.length === cols * rows, `${urls.length} windows for ${layout}`);
  for (const u of urls) {
    const q = new URL(u).searchParams, c = +q.get('col'), r = +q.get('row');
    assert(q.get('wall') === layout, 'wall ' + q.get('wall') + ' in ' + u);
    assert(c >= 0 && c < cols && r >= 0 && r < rows, 'col/row out of the layout: ' + u);
    assert(+q.get('win') === r * cols + c + 1, 'win ' + q.get('win') + ' for col ' + c + ' row ' + r);
    assert(!q.has('t0'), 'a controller-driven window must not be in clock mode: ' + u);
    for (const [k, v] of Object.entries(want)) assert(q.get(k) === String(v), `param ${k}: ${q.get(k)} wanted ${v}`);
    seen.add(c + ',' + r);
  }
  assert(seen.size === cols * rows, 'two windows at one place: ' + [...seen].join(' '));
}
await test('w1-open-windows-urls', async () => {
  // planted: a 3 x 1 list with two windows at col 1 must fail the check
  const planted = ['output.html?wall=3x1&col=0&row=0&win=1', 'output.html?wall=3x1&col=1&row=0&win=2', 'output.html?wall=3x1&col=1&row=0&win=3'].map(u => 'http://x/' + u);
  let caught = false; try { checkUrls(planted, '3x1', {}); } catch { caught = true; }
  assert(caught, 'the URL check passed a planted list with two windows at one place');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await controller(ctx, '?i=p9-w1&world=nashua&seed=7&reach=merrimack&mirror=1&mon=1&maxis=40&malt=derelict');
  await p.evaluate(() => { window.__opened = []; window.open = (u, n, f) => { window.__opened.push([u, f]); return null; }; });
  const out = {};
  for (const [n, layout] of [[3, '3x1'], [4, '2x2'], [6, '3x2'], [1, '1x1']]) {
    await p.evaluate(() => { window.__opened = []; });
    await pressOpen(p, n, layout);
    const opened = await p.evaluate(() => window.__opened);
    checkUrls(opened.map(o => o[0]), layout, { world: 'nashua', seed: 7, reach: 'merrimack', mirror: 1, mon: 1, maxis: 40, malt: 'derelict', i: 'p9-w1' });
    // placement: tiled over the screen, each window where its column and row belong, none overlapping
    const rects = opened.map(([, f]) => Object.fromEntries(f.split(',').filter(s => s.includes('=')).map(s => s.split('=')).map(([k, v]) => [k, +v])));
    const [cols] = layout.split('x').map(Number);
    rects.forEach((r, i) => { const c = i % cols, row = Math.floor(i / cols); assert(r.left === rects[0].left + c * r.width && r.top === rects[0].top + row * r.height, 'window ' + (i + 1) + ' not at its place: ' + JSON.stringify(r)); });
    out[layout] = opened.length + ' windows, ' + rects[0].width + ' x ' + rects[0].height;
  }
  const layouts = await p.evaluate(() => [1, 2, 3, 4, 5, 6].map(n => SSAV.layoutsFor(n).join(' ')));
  await ctx.close();
  return { opened: out, layouts };
});

// Seam test: the windows a press opens, against one output window as large as all of them (cols x w by rows x h),
// from one frozen controller frame. The 4 px columns either side of every vertical seam, and the rows either side of
// every horizontal seam, must match the reference (mean |d| under 2 of 255); planted: a band of the reference that
// is not at the seam must differ (over 4), or the match says nothing.
function band(a, ax, ay, b, bx, by, w, h) {
  let s = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((ay + y) * a.width + ax + x) * 4, j = ((by + y) * b.width + bx + x) * 4; for (let k = 0; k < 3; k++) s += Math.abs(a.data[i + k] - b.data[j + k]); n += 3; }
  return s / n;
}
async function seam(layout) {
  const [cols, rows] = layout.split('x').map(Number), w = 640, h = 360, inst = 'p9-seam-' + layout;
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const ctl = await controller(ctx, `?i=${inst}&seed=7&world=nashua&palette=original`);
  await ctl.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 500 * 8; SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0 }; });
  const pops = [];
  const onPage = pg => pops.push(pg);
  ctx.on('page', onPage);
  await pressOpen(ctl, cols * rows, layout);
  const t0 = Date.now();
  while (pops.length < cols * rows && Date.now() - t0 < 15000) await ctl.waitForTimeout(200);
  ctx.off('page', onPage);
  assert(pops.length === cols * rows, `${pops.length} of ${cols * rows} windows opened from the button`);
  for (const pg of pops) { watch(pg); await pg.waitForLoadState('load'); await pg.setViewportSize({ width: w, height: h }); }
  const ref = await ctx.newPage(); watch(ref); await ref.setViewportSize({ width: cols * w, height: rows * h }); await ref.goto(BASE + `output.html?i=${inst}`);
  for (const pg of [...pops, ref]) await tilesUp(pg);
  await ctl.waitForTimeout(4000);
  const heard = await ctl.evaluate(() => SSAV.wins.heard);
  await ctl.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await ctl.waitForTimeout(3000);
  const S = {};
  for (const pg of pops) { const q = new URL(pg.url()).searchParams; S[q.get('col') + ',' + q.get('row')] = PNG.sync.read(await pg.screenshot()); }
  const R = PNG.sync.read(await ref.screenshot());
  await ctx.close();
  const B = 4, seams = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c + 1 < cols; c++) {
    seams.push({ at: `v ${c}|${c + 1} row ${r}`, a: band(S[c + ',' + r], w - B, 0, R, (c + 1) * w - B, r * h, B, h), b: band(S[(c + 1) + ',' + r], 0, 0, R, (c + 1) * w, r * h, B, h), ctrl: band(S[(c + 1) + ',' + r], 0, 0, R, c * w, r * h, B, h) });
  }
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c < cols; c++) {
    seams.push({ at: `h ${r}|${r + 1} col ${c}`, a: band(S[c + ',' + r], 0, h - B, R, c * w, (r + 1) * h - B, w, B), b: band(S[c + ',' + (r + 1)], 0, 0, R, c * w, (r + 1) * h, w, B), ctrl: band(S[c + ',' + (r + 1)], 0, 0, R, c * w, (r + 1) * h + 60, w, B) });
  }
  for (const s of seams) {
    assert(s.ctrl > 4, `seam ${s.at}: the match is not informative (an unrelated band differs by ${s.ctrl.toFixed(2)})`);
    assert(s.a < 2 && s.b < 2, `seam ${s.at} differs from one canvas: ${s.a.toFixed(2)} / ${s.b.toFixed(2)}`);
  }
  return { windows: pops.length, heard, seams: seams.map(s => `${s.at}: ${s.a.toFixed(2)} ${s.b.toFixed(2)} (unrelated ${s.ctrl.toFixed(1)})`) };
}
await test('w2-seam-3x1', () => seam('3x1'));
await test('w3-seam-2x2', () => seam('2x2'));

// Close all: every window opened from here closes; a window this controller did not open (no &win) stays open
await test('w4-close-all', async () => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const ctl = await controller(ctx, '?i=p9-close&seed=3');
  const other = await ctx.newPage(); await other.goto(BASE + 'output.html?i=p9-close&wall=2x2&col=0&row=0'); await tilesUp(other);
  const pops = []; ctx.on('page', pg => pops.push(pg));
  await pressOpen(ctl, 4, '2x2');
  await ctl.waitForFunction(() => SSAV.wins.heard.length === 4, null, { timeout: 30000 });
  const before = ctx.pages().length;
  await ctl.click('#w-close');
  await ctl.waitForTimeout(2500);
  const open = pops.filter(pg => !pg.isClosed()).length, otherOpen = !other.isClosed();
  const status = await ctl.evaluate(() => document.getElementById('w-status').textContent);
  await ctx.close();
  assert(otherOpen, 'Close all closed a window this controller did not open');
  assert(open === 0, open + ' of ' + pops.length + ' windows still open after Close all');
  return { pagesBefore: before, opened: pops.length, stillOpen: open, notOpenedHereStillOpen: otherOpen, status };
});

// The pop-up blocker on (Playwright turns it off by default): one press opens fewer than all; the panel says so in
// one line and "Open the next window" opens the rest, one press each. Planted: with the blocker off, all open at once,
// and the test must not count that as the blocked path.
await test('w5-popups-blocked', async () => {
  const b2 = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1400,900'], ignoreDefaultArgs: ['--disable-popup-blocking'] });
  try {
    const ctx = await b2.newContext({ viewport: { width: 1280, height: 720 } });
    const ctl = await controller(ctx, '?i=p9-block&seed=5');
    const pops = []; ctx.on('page', pg => pops.push(pg));
    await pressOpen(ctl, 3, '3x1');
    await ctl.waitForTimeout(3600);
    const first = await ctl.evaluate(() => ({ heard: SSAV.wins.heard.length, missing: SSAV.wins.missing, line: document.getElementById('w-blocked').hidden ? '' : document.getElementById('w-blocked').textContent, next: !document.getElementById('w-next').hidden }));
    assert(first.heard < 3, 'pop-ups were not blocked (all 3 opened at once): the blocked path was not tested');
    assert(first.line && first.next, 'blocked, but no line or no Open the next window button: ' + JSON.stringify(first));
    let presses = 0;
    while (presses < 6) {
      const m = await ctl.evaluate(() => SSAV.wins.missing.length);
      if (!m) break;
      await ctl.click('#w-next'); presses++;
      await ctl.waitForTimeout(3600);
    }
    const last = await ctl.evaluate(() => ({ heard: SSAV.wins.heard, line: document.getElementById('w-blocked').hidden, next: document.getElementById('w-next').hidden, status: document.getElementById('w-status').textContent }));
    assert(last.heard.length === 3 && last.heard.join() === '1,2,3', 'after ' + presses + ' presses: ' + JSON.stringify(last));
    assert(last.line && last.next, 'the blocked line or button still shown with every window open');
    assert(presses === 3 - first.heard, presses + ' presses for ' + (3 - first.heard) + ' blocked windows');
    await ctx.close();
    return { firstPress: first, presses, after: last.status };
  } finally { await b2.close(); }
});

// Copy links: one clock-mode link per window of the layout, one shared t0, the same settings on each
await test('w6-copy-links', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctl = await controller(ctx, '?i=p9-links&world=nashua&seed=9');
  const L = await ctl.evaluate(() => SSAV.windowLinks(1700000000000, '3x2'));
  await ctx.close();
  assert(L.length === 6, L.length + ' links');
  const q = L.map(u => new URL(u).searchParams), seen = new Set();
  for (const s of q) {
    for (const k of ['world', 'seed', 't0', 'speed', 'hx', 've', 'bank', 'palette', 'mode']) assert(s.get(k) != null && s.get(k) === q[0].get(k), 'param ' + k + ': ' + s.get(k) + ' / ' + q[0].get(k));
    assert(s.get('wall') === '3x2' && !s.has('win'), 'links ' + s);
    seen.add(s.get('col') + ',' + s.get('row'));
  }
  assert(seen.size === 6 && q[0].get('t0') === '1700000000000', 'places ' + [...seen].join(' '));
  return { links: L.map(u => u.split('?')[1]).slice(0, 2), places: [...seen].join(' ') };
});

// Drift: the links of a 2 x 2 in clock mode, four windows, nashua at 8 px per m and 120 px/s, over --drift-min minutes.
// Every 10 s all four are read at once; each node's x against node 1's x carried to its frame time (world px).
// Planted: a fifth node whose t0 is 100 ms late must read as drift (12 px at 120 px/s) on the same rule.
await test('w7-drift', async () => {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const c = await controller(ctx, '?i=p9-drift&world=nashua&seed=5');
  await c.evaluate(() => { SSAV.cfg.speed = 120; });
  const t0 = Date.now() + 4000;
  const L = await c.evaluate(t0 => SSAV.windowLinks(t0, '2x2'), t0);
  await c.close();
  const late = L[1].replace('t0=' + t0, 't0=' + (t0 + 100));
  assert(late !== L[1], 'planted link not made');
  const n = [];
  for (const u of [...L, late]) { const p = await ctx.newPage(); watch(p); await p.goto(u); n.push(p); }
  for (const p of n) await tilesUp(p);
  await n[0].waitForTimeout(5000);
  const tStart = Date.now(); let worst = 0, plantedMin = Infinity, k = 0; const samples = [];
  while (Date.now() - tStart < DRIFT_MIN * 60000) {
    const f = await Promise.all(n.map(p => p.evaluate(() => { const fs = SSOUT.scene.lastFrame.fs; return { x: fs.worlds[0].x, t: fs.t, v: fs.v }; })));
    if (f.every(g => Math.sign(g.v) === Math.sign(f[0].v))) {
      const e = g => Math.abs(g.x - (f[0].x + f[0].v * (g.t - f[0].t) / 1000));
      const es = f.slice(1, 4).map(e); worst = Math.max(worst, ...es); plantedMin = Math.min(plantedMin, e(f[4])); k++;
      if (samples.length < 70) samples.push(+Math.max(...es).toFixed(3));
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  const cards = await Promise.all(n.slice(0, 4).map(p => p.evaluate(() => SSOUT.cardStatus())));
  await ctx.close();
  assert(k >= DRIFT_MIN * 5, 'too few samples ' + k);
  assert(plantedMin > 2, 'the planted node (t0 100 ms late) read as no drift: ' + plantedMin.toFixed(2));
  assert(worst < 2, 'clock-mode windows drift apart by ' + worst.toFixed(2) + ' world px');
  return { minutes: DRIFT_MIN, samples: k, worst_world_px: +worst.toFixed(3), planted_min_px: +plantedMin.toFixed(2), card: cards[3], note: 'four windows on one machine share one clock; several machines add their clock offset' };
});

await browser.close();
const file = path.join(ROOT, 'test-results', 'p9.json');
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const byName = Object.fromEntries((prev.results || []).map(r => [r.name, r]));
for (const r of results) byName[r.name] = r;
fs.writeFileSync(file, JSON.stringify({ base: BASE, when: new Date().toISOString(), results: Object.values(byName), consoleProblems }, null, 1));
console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed', consoleProblems.length ? 'console problems: ' + consoleProblems.length : 'console clean');
process.exit(results.every(r => r.pass) ? 0 : 1);
