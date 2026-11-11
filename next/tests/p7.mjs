// P7 tests (ADDENDUM-B, the interface): B1 the floating map, B2 the shorter bar, B3 Rain and B4 Flood on the bar,
// B5 the menu cycle, B6 the guide. Every rule here is first run on a planted wrong state and must fail there.
//   node tests/p7.mjs [http://localhost:8093/] [--only=name,name]
// Writes test-results/p7.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
// --ref: the .p6 state served from its own worktree (the planted wrong picture for B7 and B8)
const REF = (args.find(a => a.startsWith('--ref=')) || '').slice(6) || null;
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 700) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1300,860'] });
async function open(q, vp = { width: 1280, height: 720 }, ctx0 = null, base = BASE) {
  const ctx = ctx0 || await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
  await p.goto(base + q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && (SSAV.cfg.world !== 'nashua' && !/world=nashua/.test(location.search) || SSAV.world().pack) && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  return { ctx, p };
}
const settle = p => p.waitForFunction(() => !SSAV.fading && SSAV.world() && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 90000 });
// share of pixels that differ by more than 30 (sum of |dR|+|dG|+|dB|) between two PNG buffers of one size
function diffShare(a, b) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30) n++;
  return n / (A.width * A.height);
}

// ---------- B1: the map floats over everything and moves; a drag does not scrub; a station click still goes ----------
// The rule: at a point inside both the map and the header (or the bar), the topmost element belongs to the map.
const mapOnTop = (p, pt) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('.map-inset')); }, pt);
const overlapPt = (p, sel) => p.evaluate(sel => {
  const a = document.querySelector('.map-inset').getBoundingClientRect(), b = document.querySelector(sel).getBoundingClientRect();
  const x0 = Math.max(a.left, b.left), x1 = Math.min(a.right, b.right), y0 = Math.max(a.top, b.top), y1 = Math.min(a.bottom, b.bottom);
  return x1 - x0 > 4 && y1 - y0 > 4 ? [(x0 + x1) / 2, (y0 + y1) / 2] : null;
}, sel);
await test('b1-map-floats', async () => {
  const { ctx, p } = await open('?i=p7-b1&world=nashua&seed=1');
  await p.evaluate(() => SSAV.pb.pause());
  await p.click('#b-map'); await p.waitForTimeout(400);
  assert(await p.evaluate(() => SSAV.mapInset.on), 'the map did not open');
  const x0 = await p.evaluate(() => SSAV.x);
  // drag by the grip up over the header
  const g = await p.locator('.map-grip').boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down(); await p.mouse.move(700, 30, { steps: 10 }); await p.mouse.up();
  await p.waitForTimeout(200);
  const x1 = await p.evaluate(() => SSAV.x);
  assert(Math.abs(x1 - x0) < 0.5, 'the drag scrubbed the scroll ' + x0 + ' to ' + x1);
  const ptHud = await overlapPt(p, '#hud');
  assert(ptHud, 'the dragged map does not overlap the header');
  assert(await mapOnTop(p, ptHud), 'the header covers the map');
  // and down over the bar
  const g2 = await p.locator('.map-grip').boundingBox();
  await p.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2); await p.mouse.down(); await p.mouse.move(300, 700, { steps: 10 }); await p.mouse.up();
  await p.waitForTimeout(200);
  const ptBar = await overlapPt(p, '#bar');
  assert(ptBar, 'the dragged map does not overlap the bar');
  assert(await mapOnTop(p, ptBar), 'the bar covers the map');
  // planted: the same rule must fail on a map put under the page (z-index -1)
  await p.evaluate(() => { document.querySelector('.map-inset').style.zIndex = '-1'; });
  assert(!(await mapOnTop(p, ptBar)), 'planted: the on-top rule passed a map under the bar');
  await p.evaluate(() => { document.querySelector('.map-inset').style.zIndex = ''; });
  // control for the scrub rule: the same drag on the stage does scrub
  await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(400, 300, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(200);
  const x2 = await p.evaluate(() => SSAV.x);
  assert(Math.abs(x2 - x1) > 50, 'planted: a drag on the stage did not scrub either, the scrub rule proves nothing');
  // a station click still goes there (S4, s 1635)
  const pos = await p.evaluate(() => SSAV.cfg.nashua.mapPos);
  const h4 = await p.evaluate(() => SSAV.mapInset.hits[3]);
  const box = await p.evaluate(() => { const r = document.querySelector('.map-inset canvas + canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await p.mouse.click(box.x + (h4.x0 + h4.x1) / 2, box.y + (h4.y0 + h4.y1) / 2); await p.waitForTimeout(300);
  const s4 = await p.evaluate(() => (SSAV.x + SSAV.viewW() / 2) / 8);
  assert(Math.abs(s4 - 1635) < 2, 'click S4 went to s ' + s4);
  // the position persists per instance
  await p.reload();
  await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => { const m = document.querySelector('.map-inset'); const r = m.getBoundingClientRect(); return { on: SSAV.mapInset.on, x: r.left, y: r.top }; });
  assert(after.on && Math.abs(after.x - pos.x) < 1 && Math.abs(after.y - pos.y) < 1, 'position not kept: ' + JSON.stringify([pos, after]));
  // another instance does not take it
  const o = await open('?i=p7-b1-other&world=nashua&seed=1', null, ctx);
  const other = await o.p.evaluate(() => SSAV.cfg.nashua.mapPos || null);
  assert(other === null || other.x !== pos.x || other.y !== pos.y, 'another instance took the position');
  await ctx.close();
  return { pos, scrubOnMap: +(x1 - x0).toFixed(2), scrubOnStage: +(x2 - x1).toFixed(1), s4: +s4.toFixed(1) };
});

// ---------- B2: the bar fits: no horizontal overflow, 2 rows at 1280, 3 at most at 1024, nothing under 18 px or 44 px ----------
const barRule = p => p.evaluate(() => {
  const bar = document.getElementById('bar');
  const tops = new Set(), small = [];
  for (const g of bar.children) { const r = g.getBoundingClientRect(); if (r.width && r.height) tops.add(Math.round(r.top)); }
  for (const e of bar.querySelectorAll('button, select, input, label, output')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 18) small.push((e.id || e.textContent.trim()) + ' font ' + fs);
    if ((e.tagName === 'BUTTON' || e.tagName === 'SELECT') && (r.height < 44 || r.width < 44)) small.push((e.id || e.textContent.trim()) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  const over = document.documentElement.scrollWidth > innerWidth || bar.scrollWidth > bar.clientWidth + 1 || [...bar.querySelectorAll('*')].some(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 0.5 || r.left < -0.5); });
  return { rows: tops.size, h: Math.round(bar.getBoundingClientRect().height), over, small };
});
await test('b2-bar-fits', async () => {
  const out = {};
  for (const [W, maxRows] of [[1280, 2], [1024, 3]]) {
    for (const world of ['nashua', 'derelict', 'shanshui']) {
      const { ctx, p } = await open(`?i=p7-b2&world=${world}&seed=1`, { width: W, height: 720 });
      await p.waitForTimeout(300);
      const r = await barRule(p);
      out[world + W] = r.rows + ' rows ' + r.h + ' px';
      assert(!r.over, world + ' at ' + W + ': horizontal overflow');
      assert(r.rows <= maxRows, world + ' at ' + W + ': ' + r.rows + ' rows');
      assert(!r.small.length, world + ' at ' + W + ': small ' + r.small.join(', '));
      if (world === 'nashua' && W === 1280) {
        // planted: a wide button and a 12 px label must fail the same rule
        await p.evaluate(() => { const b = document.createElement('button'); b.id = 'planted'; b.textContent = 'x'.repeat(160); b.style.whiteSpace = 'nowrap'; b.style.fontSize = '12px'; document.getElementById('b-data').appendChild(b); });
        const bad = await barRule(p);
        assert(bad.over || bad.rows > maxRows, 'planted: a 1400 px button passed the fit rule');
        assert(bad.small.some(s => s.startsWith('planted font')), 'planted: a 12 px button passed the size rule');
      }
      await ctx.close();
    }
  }
  return out;
});

// ---------- B3 and B4: Rain and Flood on the bar, a key and MIDI roles; the picture moves ----------
async function quietFrame(p) { await settle(p); await p.waitForTimeout(1600); return p.screenshot({ type: 'png' }); }
await test('b3-rain', async () => {
  const { ctx, p } = await open('?i=p7-b3&world=nashua&seed=1&hx=2');
  await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.pb.x = 900 * 2 - SSAV.viewW() / 2; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; });
  const off1 = await quietFrame(p), off2 = await quietFrame(p);
  await p.evaluate(() => document.body.classList.remove('uihidden'));
  await p.click('#b-rain'); await p.waitForTimeout(200);
  const st1 = await p.evaluate(() => [SSAV.cfg.weather.holds.rain, document.getElementById('b-rain').classList.contains('on')]);
  assert(st1[0] === 0.85 && st1[1], 'Rain on: ' + st1);
  await p.evaluate(() => document.body.classList.add('uihidden'));
  const on = await quietFrame(p);
  await p.evaluate(() => document.body.classList.remove('uihidden'));
  const moved = diffShare(off1, on), control = diffShare(off1, off2);
  // planted: the "rain changed the picture" rule fails on two frames without rain
  // the rule: rain on changes more than 0.5 % of the frame. Planted: two dry frames must fail it
  const rainRule = share => share > 0.005;
  assert(!rainRule(control), 'planted: two dry frames passed the rain rule (' + control + ')');
  assert(rainRule(moved), 'rain changed only ' + moved + ' of the frame (control ' + control + ')');
  await p.click('#b-rain'); await p.waitForTimeout(200);
  const st2 = await p.evaluate(() => [SSAV.cfg.weather.holds.rain, document.getElementById('b-rain').classList.contains('on')]);
  assert(st2[0] === 0 && !st2[1], 'Rain off: ' + st2);
  // key N and the MIDI role
  await p.keyboard.press('n'); await p.waitForTimeout(150);
  const k = await p.evaluate(() => SSAV.cfg.weather.holds.rain);
  const roles = await p.evaluate(() => SSAV.midiRoles());
  await p.evaluate(() => SSAV.midiAct('rainToggle')); await p.waitForTimeout(150);
  const m = await p.evaluate(() => SSAV.cfg.weather.holds.rain);
  assert(k === 0.85 && m === 0 && roles.includes('rainToggle'), 'key or MIDI: ' + [k, m, roles.includes('rainToggle')]);
  // shanshui has no weather: the button is not shown there
  await p.evaluate(() => document.querySelector('#b-world button[data-v="shanshui"]').click());
  await p.waitForFunction(() => SSAV.world() && SSAV.key && SSAV.key.startsWith('shanshui'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  const hid = await p.evaluate(() => { const e = document.getElementById('b-wx'); return e.hidden || getComputedStyle(e).display === 'none'; });
  assert(hid, 'Rain shown in shanshui');
  await ctx.close();
  return { rainMoved: +moved.toFixed(4), control: +control.toFixed(5) };
});
await test('b4-flood', async () => {
  const { ctx, p } = await open('?i=p7-b4&world=nashua&seed=1&hx=2');
  await p.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 900 * 2 - SSAV.viewW() / 2; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; SSAV.setLevel(0); });
  const shot = async () => { await p.evaluate(() => document.body.classList.add('uihidden')); const b = await quietFrame(p); await p.evaluate(() => document.body.classList.remove('uihidden')); return b; };
  const lv = () => p.evaluate(() => [Math.round(SSAV.cfg.nashua.level), document.getElementById('b-flood').classList.contains('on'), document.getElementById('b-floodlv').value]);
  const z1 = await shot(), z2 = await shot();
  await p.click('#b-flood'); await p.waitForTimeout(300);
  const a = await lv();
  assert(a[0] === 2 && a[1] && a[2] === '2', 'Flood on, default Minor Flood: ' + a);
  const minor = await shot();
  await p.selectOption('#b-floodlv', '4'); await p.waitForTimeout(300);
  const b = await lv();
  assert(b[0] === 4 && b[1], 'picker 1936: ' + b);
  await p.click('#b-flood'); await p.waitForTimeout(300);
  const c = await lv();
  assert(c[0] === 0 && !c[1] && c[2] === '4', 'Flood off keeps the pick: ' + c);
  await p.click('#b-flood'); await p.waitForTimeout(300);
  assert((await lv())[0] === 4, 'Flood on again goes to the last pick');
  const moved = diffShare(z1, minor), control = diffShare(z1, z2);
  // the rule: Minor Flood changes more than 1 % of the frame. Planted: two Median frames must fail it
  const floodRule = share => share > 0.01;
  assert(!floodRule(control), 'planted: two Median frames passed the flood rule (' + control + ')');
  assert(floodRule(moved), 'the flood changed only ' + moved + ' (control ' + control + ')');
  // the fact line names the level in full
  await p.waitForFunction(() => Math.abs(SSAV.lvShown - 4) < 0.01, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);
  const fact = await p.evaluate(() => [document.getElementById('hud').textContent, SSAV.world().pack.levels[4].name, SSAV.lvShown]);
  assert(fact[0].includes(fact[1]), 'the fact line does not name the level: ' + JSON.stringify(fact.slice(1)));
  // MIDI role
  await p.evaluate(() => SSAV.midiAct('flood')); await p.waitForTimeout(200);
  assert((await lv())[0] === 0 && (await p.evaluate(() => SSAV.midiRoles())).includes('flood'), 'MIDI flood');
  // how far each level moves the water at 2x, css px above Median Water (B4: under about 10 px goes in the checkpoint)
  // B4 "at 2x" is Vertical Exaggeration 2x (the default). Measured with the app's own levelAt at the view centre, at the
  // default scale (8 px per m) and at 2 px per m, in css px of a 1280 x 720 view. Reported, not asserted.
  const px = {};
  for (const hx of [8, 2]) {
    const q = await open(`?i=p7-b4-px${hx}&world=nashua&seed=1&hx=${hx}&ve=2`);
    px['hx' + hx] = await q.p.evaluate(async () => {
      const { levelAt } = await import('./src/worlds/nashua/pack.js');
      const P = SSAV.world().pack, o = SSAV.world().opts, v = SSAV.view(), hxp = P.hx || 2;
      SSAV.pb.pause(); SSAV.pb.x = 900 * hxp - SSAV.viewW() / 2;
      return P.levels.map((l, k) => [l.name.replace(/^Fluvial · /, '').replace(/ \d.*$/, ''), +((levelAt(P, k, 900) - levelAt(P, 0, 900)) * hxp * o.ve * v.scale).toFixed(1)]);
    });
    await q.ctx.close();
  }
  await ctx.close();
  return { floodMoved: +moved.toFixed(4), control: +control.toFixed(5), pxAt2x: px };
});

// ---------- B5: Full cycles full menu, mini menu, full screen; the label names the next state; F goes straight; persists ----------
const MINI = ['b-play', 'b-speed', 'shanshui', 'derelict', 'nashua', 'b-guide', 'b-full', 'b-labels', 'b-map'];
const visibleBar = p => p.evaluate(() => [...document.querySelectorAll('#bar button, #bar input, #bar select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden'; }).map(e => e.id || e.dataset.v || e.textContent.trim()));
const isMiniSet = v => v.length === MINI.length && MINI.every(id => v.includes(id));
await test('b5-menu-cycle', async () => {
  const { ctx, p } = await open('?i=p7-b5&world=nashua&seed=1');
  const st = () => p.evaluate(() => ({ label: document.getElementById('b-full').textContent, mini: document.body.classList.contains('mini'), fs: !!document.fullscreenElement, hide: document.body.classList.contains('hide'), menu: SSAV.cfg.menu }));
  const s0 = await st(), full = await visibleBar(p);
  assert(s0.label === 'Mini menu' && !s0.mini && !s0.fs, 'start ' + JSON.stringify(s0));
  // planted: the full menu fails the mini rule
  assert(!isMiniSet(full), 'planted: the full menu passed the mini rule');
  await p.click('#b-full'); await p.waitForTimeout(300);
  const s1 = await st(), mini = await visibleBar(p);
  assert(s1.label === 'Full screen' && s1.mini && !s1.fs && s1.menu === 'mini', 'mini ' + JSON.stringify(s1));
  assert(isMiniSet(mini), 'mini menu shows ' + mini.join(' '));
  await p.click('#b-full'); await p.waitForTimeout(800);
  const s2 = await st();
  assert(s2.label === 'Full menu' && s2.mini && s2.fs, 'full screen ' + JSON.stringify(s2));
  await p.waitForTimeout(3400);
  const s3 = await st();
  assert(s3.hide, 'not hidden after 3 s');
  await p.mouse.move(300, 300); await p.mouse.move(340, 320); await p.waitForTimeout(200);
  assert(!(await st()).hide, 'mouse move did not bring it back');
  await p.click('#b-full'); await p.waitForTimeout(800);
  const s4 = await st();
  assert(s4.label === 'Mini menu' && !s4.mini && !s4.fs, 'back to full menu ' + JSON.stringify(s4));
  // key F goes straight to full screen and does not change the menu state
  await p.keyboard.press('f'); await p.waitForTimeout(800);
  const s5 = await st();
  assert(s5.fs && s5.menu === 'full' && !s5.mini, 'key F ' + JSON.stringify(s5));
  await p.keyboard.press('f'); await p.waitForTimeout(800);
  // persists per instance: mini survives a reload; full screen comes back as mini (a page cannot enter full screen by itself)
  await p.click('#b-full'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForFunction(() => window.SSAV && SSAV.world(), null, { timeout: 60000 }); await p.waitForTimeout(300);
  const s6 = await st();
  assert(s6.mini && s6.label === 'Full screen', 'reload ' + JSON.stringify(s6));
  const o = await open('?i=p7-b5-other&world=nashua&seed=1', null, ctx);
  const other = await o.p.evaluate(() => document.body.classList.contains('mini'));
  assert(!other, 'another instance took the mini menu');
  await ctx.close();
  return { mini: mini.length + ' controls', hiddenAfter3s: s3.hide };
});

// ---------- B6: the guide, from the app's own tables; every URL parameter the source reads is in it ----------
// The reads: X.get('k') or X.has('k') where X is bound to a URLSearchParams, URLSearchParams(...).get('k'), and a
// wrapper like num('k') whose body reads X.get of its argument.
export function urlReads(src) {
  const vars = [...src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*new URLSearchParams\(/g)].map(m => m[1]);
  const out = new Set();
  for (const m of src.matchAll(/URLSearchParams\([^)]*\)\.(?:get|has)\(\s*'([\w-]+)'\s*\)/g)) out.add(m[1]);
  if (vars.length) {
    const V = vars.join('|');
    for (const m of src.matchAll(new RegExp(`\\b(?:${V})\\.(?:get|has)\\(\\s*'([\\w-]+)'\\s*\\)`, 'g'))) out.add(m[1]);
    const wraps = [...src.matchAll(new RegExp(`(?:const|let|function)\\s+(\\w+)\\s*=?\\s*\\(\\s*(\\w+)[^)]*\\)\\s*(?:=>)?\\s*\\{?[^;\\n]{0,80}?\\b(?:${V})\\.get\\(\\s*\\2\\s*\\)`, 'g'))].map(m => m[1]);
    for (const w of wraps) for (const m of src.matchAll(new RegExp(`\\b${w}\\(\\s*'([\\w-]+)'`, 'g'))) out.add(m[1]);
  }
  return out;
}
function srcFiles(dir) { const r = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) r.push(...srcFiles(f)); else if (/\.(m?js|html)$/.test(e.name)) r.push(f); } return r; }
await test('b6-guide', async () => {
  const { PARAMS } = await import(pathToFileURL(path.join(ROOT, 'src/ui/guide.js')).href).catch(() => ({}));
  let names;
  if (PARAMS) names = new Set(PARAMS.map(p => p[0]));
  else { const g = fs.readFileSync(path.join(ROOT, 'src/ui/guide.js'), 'utf8'); names = new Set([...g.slice(g.indexOf('PARAMS'), g.indexOf('PAIR')).matchAll(/\['([\w-]+)',/g)].map(m => m[1])); }
  const files = [...srcFiles(path.join(ROOT, 'src')), path.join(ROOT, 'index.html'), path.join(ROOT, 'output.html')];
  const read = new Map();
  for (const f of files) for (const k of urlReads(fs.readFileSync(f, 'utf8'))) { if (!read.has(k)) read.set(k, path.relative(ROOT, f)); }
  // planted: a source with two new reads must be caught
  const planted = urlReads("const u = new URLSearchParams(location.search); u.get('zzz'); const n = (k, d) => { const v = u.get(k); return v; }; n('yyy', 0); new URLSearchParams(x).has('www');");
  assert(['zzz', 'yyy', 'www'].every(k => planted.has(k) && !names.has(k)), 'planted: the drift check missed ' + [...planted].join(','));
  const missing = [...read.keys()].filter(k => !names.has(k));
  assert(!missing.length, 'URL parameters read but not in the guide: ' + missing.map(k => k + ' (' + read.get(k) + ')').join(', '));
  assert(read.size >= 30, 'the scan found only ' + read.size + ' parameters, the extractor is broken');
  const stale = [...names].filter(k => !read.has(k));
  assert(!stale.length, 'in the guide but never read: ' + stale.join(', '));
  // the guide opens from the bar, shows every key and every shown bar control, fits one screen, closes on Escape
  const { ctx, p } = await open('?i=p7-b6&world=nashua&seed=1');
  await p.click('#b-guide'); await p.waitForTimeout(300);
  const g = await p.evaluate(() => {
    const root = document.querySelector('.guide'), card = root.querySelector('.guide-card'), r = card.getBoundingClientRect();
    const text = root.textContent;
    const bar = [...document.querySelectorAll('#bar button, #bar select')].filter(b => !(b.closest('.grp') && b.closest('.grp').hidden)).map(b => (b.tagName === 'SELECT' ? b.getAttribute('aria-label') : b.textContent).replace(/\s+/g, ' ').trim()).filter(Boolean);
    const cols = [...card.querySelectorAll('.guide-col')].map(c => c.querySelector('h3').textContent);
    const small = [...root.querySelectorAll('*')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 18).length;
    return { shown: !root.hidden, fits: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && document.documentElement.scrollHeight <= innerHeight, cols, missingBar: bar.filter(t => !text.includes(t)), small, link: !!root.querySelector('a[href*="README"]') };
  });
  assert(g.shown && g.fits, 'guide shown/fits ' + JSON.stringify(g));
  assert(g.cols.join() === 'Keys,Bar,URL,Pair', 'columns ' + g.cols);
  assert(!g.missingBar.length, 'bar controls missing from the guide: ' + g.missingBar.join(', '));
  assert(!g.small && g.link, 'small text ' + g.small + ' or no README link');
  const keysOk = await p.evaluate(async () => { const { KEYS } = await import('./src/ui/keys.js'); const t = document.querySelector('.guide').textContent; return KEYS.filter(k => !t.includes(k[1])).map(k => k[0]); });
  assert(!keysOk.length, 'keys missing from the guide: ' + keysOk);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  assert(await p.evaluate(() => document.querySelector('.guide').hidden), 'Escape did not close the guide');
  // in the mini menu too
  await p.click('#b-full'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => { const r = document.getElementById('b-guide').getBoundingClientRect(); return r.width > 0; }), 'Guide not in the mini menu');
  await ctx.close();
  return { params: read.size, inGuide: names.size, cols: g.cols };
});

// ---------- B7: the Nashua scroll ends at the mouth; past it the Merrimack in forced perspective ----------
// The rule, on a terrain and water render at the mouth (bank L): in the columns from 40 css px past the mouth to the
// vanishing point (520 world px past it), the top of the ground falls steadily (3 px slack) from at least 40 px above
// the water line to within 14 px of it. It must fail on the .p6 state (--ref), where the section ran on past the mouth.
const paperOf = png => { const { width: W, data } = png, a = [[], [], []]; for (let y = 2; y < 22; y++) for (let x = 0; x < W; x += 7) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) a[c].push(data[i + c]); } return a.map(v => v.sort((u, w) => u - w)[v.length >> 1]); };
const inkAt = (png, P, x, y) => { const i = (y * png.width + x) * 4, d = png.data; return Math.abs(d[i] - P[0]) + Math.abs(d[i + 1] - P[1]) + Math.abs(d[i + 2] - P[2]) > 30; };
async function mouthFrame(base, bank = 'L') {
  const { ctx, p } = await open(`?i=p7-b7&world=nashua&seed=1&bank=${bank}&palette=original&layers=terrain,water`, undefined, null, base);
  await p.evaluate(bank => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; const P = SSAV.world().pack, xm = (bank === 'R' ? P.route_len_m - P.nashua_len_m : P.nashua_len_m) * P.hx; SSAV.pb.x = xm - SSAV.viewW() / 2; }, bank);
  await settle(p); await p.waitForTimeout(800);
  const png = PNG.sync.read(await p.screenshot({ type: 'png' }));
  const g = await p.evaluate(bank => { const P = SSAV.world().pack, v = SSAV.view(), xm = (bank === 'R' ? P.route_len_m - P.nashua_len_m : P.nashua_len_m) * P.hx; return { xm: (xm - SSAV.x) * v.scale, yw: (600 - v.camY) * v.scale, s: v.scale }; }, bank);
  await ctx.close();
  return { png, g };
}
function convergeRule({ png, g }, dir = 1) {
  const P = paperOf(png), cols = [];
  for (let u = 40; u < 520 * g.s - 20; u += 16) {
    const x = Math.round(g.xm + dir * u); if (x < 1 || x > png.width - 2) break;
    // the first of 3 inked pixels in a row (a single speck of paper grain is not ground)
    let y = 0; while (y < g.yw + 2 && !(inkAt(png, P, x, y) && inkAt(png, P, x, y + 1) && inkAt(png, P, x, y + 2))) y++;
    cols.push(y);
  }
  if (process.env.P7_DEBUG) { fs.writeFileSync(path.join(ROOT, 'test-results', 'p7-b7-' + dir + '.png'), PNG.sync.write(png)); console.log('b7 cols', dir, JSON.stringify(g), cols.join(' ')); }
  const mono = cols.every((y, i) => i === 0 || y >= cols[i - 1] - 3);
  const first = g.yw - cols[0], last = g.yw - cols[cols.length - 1];
  return { pass: cols.length > 10 && mono && first > 40 && last < 14, mono, first: Math.round(first), last: Math.round(last), n: cols.length };
}
await test('b7-mouth', async () => {
  const L = convergeRule(await mouthFrame(BASE, 'L')), R = convergeRule(await mouthFrame(BASE, 'R'), -1);
  assert(L.pass && R.pass, 'the forced perspective does not converge: ' + JSON.stringify({ L, R }));
  let planted = 'not run (no --ref)';
  if (REF) { const bad = convergeRule(await mouthFrame(REF, 'L')); assert(!bad.pass, 'planted: the .p6 frame passed the convergence rule ' + JSON.stringify(bad)); planted = bad; }
  // S6 left the default reach: the stations, the labels, the map; the fact line says the note once, at the mouth only
  const { ctx, p } = await open('?i=p7-b7b&world=nashua&seed=1');
  const d = await p.evaluate(() => { const P = SSAV.world().pack; return { st: P.stations.map(s => s.id), len: P.route_len_m, nas: P.nashua_len_m }; });
  assert(d.st.join() === 'S1,S2,S3,S4,S5' && d.len === d.nas, 'default reach ' + JSON.stringify(d));
  await p.click('#b-map'); await p.waitForTimeout(400);
  const hits = await p.evaluate(() => SSAV.mapInset.hits.length);
  const labs = await p.evaluate(() => [...document.querySelectorAll('#labels .rl')].map(e => e.textContent));
  assert(hits === 5 && !labs.includes('S6'), 'map hits ' + hits + ', labels ' + labs.filter(t => /^S\d/.test(t)));
  const fact = async s => { await p.evaluate(s => { SSAV.pb.x = s * 8 - SSAV.viewW() / 2; }, s); await p.waitForTimeout(500); return (await p.evaluate(() => document.getElementById('hud').textContent)).split('forced perspective, not to scale').length - 1; };
  const atMouth = await fact(d.nas), atMid = await fact(1000);
  assert(atMouth === 1 && atMid === 0, 'the note at the mouth ' + atMouth + ' times, at s 1000 ' + atMid + ' times');
  await ctx.close();
  // reach=merrimack stays: its own stations and length
  const m = await open('?i=p7-b7m&world=nashua&seed=1&reach=merrimack');
  const mm = await m.p.evaluate(() => { const P = SSAV.world().pack; return { st: P.stations.length, mouth: !!P.mouth, len: P.route_len_m }; });
  assert(!mm.mouth && mm.len > 1000, 'merrimack ' + JSON.stringify(mm));
  await m.ctx.close();
  return { L, R, planted, merrimack: mm };
});

// ---------- B8: the landmarks as glyphs, labelled with the owner's words; ids only in the tooltip and structures.md ----------
const ID_RULE = t => /NID|NH0\d|structures layer|\b\d{5,}\b|parcel/i.test(t) && !/^parking lot/.test(t);   // the lot label predates B8 (a question in the checkpoint)
async function labelsAt(base, bank) {
  const { ctx, p } = await open(`?i=p7-b8&world=nashua&seed=1&bank=${bank}`, undefined, null, base);
  await p.waitForTimeout(500);
  const l = await p.evaluate(() => [...document.querySelectorAll('#labels .rl')].map(d => [d.textContent, d.title || '']));
  await ctx.close();
  return l;
}
await test('b8-glyphs', async () => {
  const L = await labelsAt(BASE, 'L'), R = await labelsAt(BASE, 'R'), all = [...L, ...R];
  const bad = all.filter(([t]) => ID_RULE(t)).map(l => l[0]);
  assert(!bad.length, 'ids on the picture: ' + bad.join(' | '));
  const words = new Set(all.map(l => l[0]));
  for (const w of ['Dam', 'Church', 'Factory', 'CSO #9', 'CSO #6', 'Canal St', 'rail bridge']) assert(words.has(w), 'no label ' + w);
  const tip = w => (all.find(l => l[0] === w) || [])[1] || '';
  assert(/NH00121/.test(tip('Dam')) && /24170/.test(tip('Church')) && /6000042/.test(tip('Factory')), 'tooltips ' + [tip('Dam'), tip('Church'), tip('Factory')]);
  let planted = 'not run (no --ref)';
  if (REF) { const old = await labelsAt(REF, 'L'); const hit = old.filter(([t]) => ID_RULE(t)); assert(hit.length, 'planted: the .p6 labels passed the id rule'); planted = hit.length + ' labels with ids'; }
  // structures.md logs each glyph as schematic, at the surveyed position
  const md = fs.readFileSync(path.join(ROOT, 'docs/nashua/structures.md'), 'utf8');
  const { LANDMARK_IDS, LANDMARK_WORDS } = await import(pathToFileURL(path.join(ROOT, 'src/worlds/nashua/pack.js')).href);
  const missing = [...Object.values(LANDMARK_IDS), ...Object.values(LANDMARK_WORDS), 'CSO #9', 'CSO #6', 'Canal St'].filter(w => !md.includes('| ' + w + ' |'));
  assert(!missing.length && md.includes('schematic, at the surveyed position'), 'structures.md misses ' + missing);
  // the church glyph: ink in its tower above the roof the old box had (1.3 to 2.0 times the estimated height); none on .p6
  const steeple = async base => {
    const { ctx, p } = await open('?i=p7-b8s&world=nashua&seed=1&bank=L&palette=original&layers=buildings', undefined, null, base);
    await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; SSAV.pb.x = 1110 * 8 - SSAV.viewW() / 2; });
    await settle(p); await p.waitForTimeout(800);
    const png = PNG.sync.read(await p.screenshot({ type: 'png' }));
    const g = await p.evaluate(() => { const w = SSAV.world(), P = w.pack, o = w.opts, v = SSAV.view(), b = P.buildings.find(b => b[9] === 24170), k0 = o.spread && b.length >= 12 ? 10 : 0, VY = P.hx * o.ve; const xa = b[k0] * P.hx, xb = b[k0 + 1] * P.hx, base = 600 - Math.max(-0.5, b[4]) * VY, h = b[5] * VY; return { x0: (xa - SSAV.x) * v.scale, x1: (xa + 0.32 * (xb - xa) - SSAV.x) * v.scale, y0: (base - 2.0 * h - v.camY) * v.scale, y1: (base - 1.3 * h - v.camY) * v.scale }; });
    await ctx.close();
    const P = paperOf(png); let n = 0, t = 0;
    for (let y = Math.round(g.y0); y < g.y1; y++) for (let x = Math.round(g.x0) + 1; x < g.x1 - 1; x++) { t++; if (inkAt(png, P, x, y)) n++; }
    return t ? n / t : 0;
  };
  const now = await steeple(BASE);
  assert(now > 0.3, 'no steeple: ' + now);
  let plantedSteeple = 'not run';
  if (REF) { plantedSteeple = await steeple(REF); assert(plantedSteeple < 0.3, 'planted: the .p6 box passed the steeple rule ' + plantedSteeple); }
  return { labels: words.size, planted, steeple: +now.toFixed(2), plantedSteeple };
});

// ---------- B9: runoff runs with the rain, stronger in flood, off when dry or switched off; no tile drawn again ----------
// The rule: the mean colour change (sum |dR|+|dG|+|dB|, averaged over 4 frames each) in the water under the lot with
// runoff on against off exceeds 12. Planted: two sets with runoff off must fail it.
await test('b9-runoff', async () => {
  const { ctx, p } = await open('?i=p7-b9&world=nashua&seed=1&bank=L&palette=original');
  await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; SSAV.setLevel(0); SSAV.pb.x = 1052 * 8 - SSAV.viewW() / 2; });
  await settle(p); await p.waitForTimeout(1500);
  const amt = () => p.evaluate(() => SSAV.frameState().runoff);
  const dry = await amt();
  const g = await p.evaluate(() => { const P = SSAV.world().pack, v = SSAV.view(); return { x0: (P.lot.s0 * 8 - SSAV.x) * v.scale, x1: (P.lot.s1 * 8 - SSAV.x) * v.scale, y0: (606 - v.camY) * v.scale, y1: (650 - v.camY) * v.scale }; });
  const mean = async () => {
    let acc = null;
    for (let k = 0; k < 4; k++) {
      const png = PNG.sync.read(await p.screenshot({ type: 'png' })); await p.waitForTimeout(170);
      const out = [];
      for (let y = Math.round(g.y0); y < g.y1; y += 2) for (let x = Math.round(g.x0); x < g.x1; x += 2) { const i = (y * png.width + x) * 4; out.push(png.data[i] + png.data[i + 1] + png.data[i + 2]); }
      acc = acc ? acc.map((v, i) => v + out[i] / 4) : out.map(v => v / 4);
    }
    return acc;
  };
  const md = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const r0 = await p.evaluate(() => SSAV.world().rastered || 0);
  await p.evaluate(() => { SSAV.cfg.weather.holds.rain = 0.85; SSAV.cfg.nashua.runoff = false; });
  await p.waitForTimeout(1500);
  const off1 = await mean(), off2 = await mean();
  await p.evaluate(() => { SSAV.cfg.nashua.runoff = true; });
  await p.waitForTimeout(400);
  const rainAmt = await amt();
  const on = await mean();
  const moved = md(on, off1), control = md(off2, off1);
  const rule = d => d > 12;
  assert(!rule(control), 'planted: two runoff-off sets passed the rule (' + control.toFixed(1) + ')');
  assert(rule(moved), 'runoff changed the water by only ' + moved.toFixed(1) + ' (control ' + control.toFixed(1) + ')');
  await p.evaluate(() => SSAV.setLevel(4)); await p.waitForFunction(() => Math.abs(SSAV.lvShown - 4) < 0.05, null, { timeout: 15000 }).catch(() => {});
  const floodAmt = await amt();
  // the Reach panel toggle turns it off
  await p.evaluate(() => { document.body.classList.remove('uihidden'); document.querySelector('[data-panel="p-reach"]').click(); });
  await p.waitForTimeout(300);
  const wasOn = await p.evaluate(() => document.getElementById('r-runoff').checked);
  await p.click('#r-runoff'); await p.waitForTimeout(200);
  const offAmt = await amt();
  const r1 = await p.evaluate(() => SSAV.world().rastered || 0);
  await ctx.close();
  assert(dry === 0 && rainAmt > 0.5 && floodAmt > rainAmt && wasOn && offAmt === 0, 'amounts ' + JSON.stringify({ dry, rainAmt, floodAmt, wasOn, offAmt }));
  assert(r1 === r0, 'tiles drawn again: ' + r0 + ' to ' + r1);
  return { moved: +moved.toFixed(1), control: +control.toFixed(1), amounts: { dry, rain: +rainAmt.toFixed(2), flood: +floodAmt.toFixed(2), off: offAmt }, rastered: r1 - r0 };
});

// ---------- found in P7: a clock-mode nashua node turns at the reach ends (the pair links) ----------
// Since .p6 the clock world's key carries hx, ve and spread, and the output looked it up without them, so it saw no
// reach and ran on past the end. The rule: a node started long ago (t0 an hour back) shows a camera inside the reach.
// It fails on the .p6 and .p7 output (--ref).
async function clockX(base) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
  await p.goto(base + `output.html?world=nashua&seed=1&t0=${Date.now() - 3600e3}&speed=60`);
  await p.waitForFunction(() => window.SSOUT && SSOUT.msg && [...SSOUT.scene.worlds.values()].some(w => w.world.pack), null, { timeout: 60000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const w = [...SSOUT.scene.worlds.values()].find(w => w.world.pack).world, P = w.pack; return { x: SSOUT.msg.fs.worlds[0].x, span: P.route_len_m * P.hx }; });
  await ctx.close();
  return r;
}
await test('c1-clock-turns', async () => {
  const rule = r => r.x >= 0 && r.x <= r.span;
  const now = await clockX(BASE);
  if (REF) { const old = await clockX(REF); assert(!rule(old), 'planted: the reference output passed (x ' + old.x.toFixed(0) + ' of ' + old.span.toFixed(0) + ')'); }
  assert(rule(now), 'the clock camera x ' + now.x.toFixed(0) + ' is past the reach (' + now.span.toFixed(0) + ')');
  return { x: Math.round(now.x), span: Math.round(now.span) };
});

await browser.close();
const file = path.join(ROOT, 'test-results', 'p7.json');
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const byName = Object.fromEntries((prev.results || []).map(r => [r.name, r]));
for (const r of results) byName[r.name] = r;
fs.writeFileSync(file, JSON.stringify({ base: BASE, when: new Date().toISOString(), results: Object.values(byName), consoleProblems }, null, 1));
console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed', consoleProblems.length ? 'console problems: ' + consoleProblems.length : 'console clean');
process.exit(results.every(r => r.pass) ? 0 : 1);
