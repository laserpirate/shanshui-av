// P5 tests: the time scroll (the water level through the East Pepperell daily record).
//   node tests/p5.mjs [http://localhost:8096/] [--only=name,name]
// Writes test-results/p5.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8096/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 400) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1300,860'] });
async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
  await p.goto(BASE + q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  return { ctx, p };
}
const fact = p => p.evaluate(() => document.getElementById('hud-facts') ? document.getElementById('hud-facts').textContent : '');

await test('time-1936', async () => {
  const { ctx, p } = await open('?i=p5-a&world=nashua&seed=1&t=1936-03-20');
  await p.waitForFunction(() => SSAV.time.on && Math.abs(SSAV.lvShown - 4) < 0.01, null, { timeout: 20000 });
  await p.waitForTimeout(600);
  const f = await fact(p), t = await p.evaluate(() => SSAV.time);
  await ctx.close();
  assert(/1936-03-20/.test(f) && /549 m³\/s \(19,400 ft³\/s\)/.test(f) && /upstream proxy/.test(f), 'fact line: ' + f);
  assert(t.on && !t.run, 'state ' + JSON.stringify(t));
  return { fact: f.split('   ').slice(-1)[0] };
});

await test('time-low-and-run', async () => {
  const { ctx, p } = await open('?i=p5-b&world=nashua&seed=1&t=2026-11-01');
  await p.waitForFunction(() => SSAV.time.on, null, { timeout: 20000 });
  await p.waitForTimeout(400);
  const lvLow = await p.evaluate(() => SSAV.lvShown);
  const d0 = await p.evaluate(() => { SSAV.setTime({ iso: '1936-03-01', rate: 30, run: true }); return SSAV.time.d; });
  // 2 s at 30 days/s from 1 March 1936 passes the 20 March peak: the highest level seen must reach the 1936 level
  const r = await p.evaluate(() => new Promise(done => { let lv = 0; const t0 = performance.now(); const f = () => { lv = Math.max(lv, SSAV.lvShown); if (performance.now() - t0 < 2000) requestAnimationFrame(f); else done({ d: SSAV.time.d, lv }); }; requestAnimationFrame(f); }));
  // a level key or the level slider takes the water back by hand
  await p.keyboard.press('2');
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ on: SSAV.time.on, level: SSAV.cfg.nashua.level }));
  await ctx.close();
  assert(lvLow === 0, 'low flow (Nov 2026) level ' + lvLow);
  const days = r.d - d0;
  assert(days > 40 && days < 80, 'ran ' + days.toFixed(1) + ' days in 2 s at 30 days/s');
  assert(r.lv > 3.95, 'peak level passing 1936-03-20: ' + r.lv.toFixed(3));
  assert(!after.on && after.level === 1, 'key 2 did not take the level back ' + JSON.stringify(after));
  return { lvLow, days: +days.toFixed(1), lvMarch: +r.lv.toFixed(2) };
});

await test('time-output-fact', async () => {
  const { ctx, p } = await open('?i=p5-c&world=nashua&seed=1&t=1936-03-20');
  await p.evaluate(() => { SSAV.cfg.nashua.outFacts = true; });
  const popP = ctx.waitForEvent('page');
  await p.keyboard.press('o');
  const out = await popP;
  await out.waitForFunction(() => window.SSOUT && SSOUT.msg && document.getElementById('facts') && /1936-03-20/.test(document.getElementById('facts').textContent), null, { timeout: 20000 });
  const f = await out.evaluate(() => document.getElementById('facts').textContent);
  await out.close(); await ctx.close();
  assert(/upstream proxy/.test(f), 'output fact ' + f);
  return { ok: true };
});

// P5.2 night river: the day cycle from the scroll's hour; lights by occupancy, bridge lamps and their reflections are
// the P1 drawing and shader, so the number here is lit pixels at night against noon at the same place
const lit = (b, thr) => { const png = PNG.sync.read(b); let n = 0; for (let i = 0; i < png.data.length; i += 4) if (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] > thr) n++; return { n, of: png.width * png.height }; };
await test('day-cycle', async () => {
  const { ctx, p } = await open('?i=p5-d&world=nashua&seed=1&palette=nashua-kit&t=1936-03-20&daycycle=1&hour=2');
  await p.waitForFunction(() => SSAV.time.on && SSAV.time.dayCycle && SSAV.lvShown > 3.9, null, { timeout: 20000 });
  const light = () => p.evaluate(() => SSAV.frameState(performance.now()).weather.light);
  await p.waitForTimeout(600);
  const night = await light(), f2 = await fact(p);
  // paused at the start view (the Canal St bridge, s 869.7, is in it: tests/nashua.mjs)
  await p.evaluate(() => { SSAV.pb.pause(); SSAV.cfg.nashua.labels = false; });
  await p.keyboard.press('h');   // the panels are bright day and night: count the picture only
  await p.waitForTimeout(1500);
  const shotNight = await p.locator('#gl').screenshot();
  await p.evaluate(() => { const T = SSAV.cfg.nashua.time; T.d = Math.floor(T.d) + 0.5; });
  await p.waitForTimeout(600);
  const noon = await light();
  const shotNoon = await p.locator('#gl').screenshot();
  // 1 day/min: the hour moves 24 h per minute
  const h0 = await p.evaluate(() => { SSAV.setTime({ rate: 0.0166667, run: true }); return SSAV.time.hold; });
  await p.waitForTimeout(3000);
  const h1 = await p.evaluate(() => SSAV.time.hold);
  // 1 year/s: the hour holds, so the light does not strobe
  await p.evaluate(() => SSAV.setTime({ rate: 365, run: true }));
  const ls = []; for (let i = 0; i < 8; i++) { ls.push(await light()); await p.waitForTimeout(250); }
  await p.waitForTimeout(400);
  const fFast = await fact(p);
  // the output follows the controller's light
  await p.evaluate(() => SSAV.setTime({ run: false }));
  await p.evaluate(() => { const T = SSAV.cfg.nashua.time; T.d = Math.floor(T.d) + 2 / 24; });
  const popP = ctx.waitForEvent('page');
  await p.keyboard.press('o');
  const out = await popP;
  await out.waitForFunction(() => window.SSOUT && SSOUT.msg && SSOUT.msg.fs.weather.light < 0.05, null, { timeout: 20000 });
  await out.close(); await ctx.close();
  fs.mkdirSync(path.join(ROOT, 'test-results', 'p5'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test-results', 'p5', 'night-0200.png'), shotNight);
  fs.writeFileSync(path.join(ROOT, 'test-results', 'p5', 'noon-1200.png'), shotNoon);
  const ln = lit(shotNight, 110), ld = lit(shotNoon, 110);
  assert(night < 0.05 && /02:00 EST, day cycle/.test(f2), 'night at 02:00: light ' + night + ', fact ' + f2);
  assert(noon > 0.95, 'noon light ' + noon);
  const moved = h1 - h0;
  assert(moved > 0.9 && moved < 1.5, 'the hour moved ' + moved.toFixed(2) + ' h in 3 s at 1 day/min');
  assert(Math.max(...ls) - Math.min(...ls) < 1e-6 && /hour held/.test(fFast), 'light strobed at 1 year/s: ' + ls.map(v => v.toFixed(3)) + ' ' + fFast);
  assert(ln.n > 50 && ln.n * 2 < ld.n, 'night lit px ' + ln.n + ' vs noon ' + ld.n);
  return { light02: +night.toFixed(3), light12: +noon.toFixed(3), hoursIn3s: +moved.toFixed(2), litPxNight: ln.n, litPxNoon: ld.n, of: ln.of };
});

// P5.3 tag stream: one forward pass of the reach in 100 px steps, a listener in another page on the channel; then
// the level from Median to 1936 (four named levels up). Without ?tags=1 nothing is posted.
await test('tag-stream', async () => {
  const { ctx, p } = await open('?i=p5-tags&world=nashua&seed=1&ends=pingpong&tags=1');
  const ear = await ctx.newPage();
  await ear.goto(BASE + 'palettes.json');
  await ear.evaluate(() => { window.__ev = []; window.__sc = 0; const c = new BroadcastChannel('shanshui-av:p5-tags:tags'); c.onmessage = e => { if (e.data.type === 'tag') __ev.push(e.data); else if (e.data.type === 'scene') __sc++; }; });
  await p.bringToFront();
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // walk from x = 0 to the far end less one view
  const XE = await p.evaluate(async () => { SSAV.pb.pause(); const { reachW } = await import('./src/worlds/nashua/pack.js'); return reachW(SSAV.world().pack) - SSAV.viewW(); });
  await p.evaluate(() => { SSAV.pb.x = 0; });
  await frames();
  const s0 = await p.evaluate(() => SSAV.tagScene() && SSAV.tagScene().s);
  for (let x = 0; x <= XE; x += 100) { await p.evaluate(x => { SSAV.pb.x = x; }, x); await frames(); }
  const s1 = await p.evaluate(() => SSAV.tagScene().s);
  const expect = await p.evaluate(([a, b]) => { const P = SSAV.world().pack, lo = Math.min(a, b), hi = Math.max(a, b); const f = []; if (P.dam) f.push(P.dam.s); for (const k of ['bridges', 'cso', 'outfalls']) for (const o of P[k] || []) f.push(o.s); for (const l of P.landmarks || []) if (l.id !== 'dam') f.push(l.s); return f.filter(s => s > lo && s < hi).length; }, [s0, s1]);
  await p.waitForTimeout(300);
  const pass = await ear.evaluate(() => __ev.slice());
  await p.evaluate(() => SSAV.setLevel(4));
  await p.waitForFunction(() => Math.abs(SSAV.lvShown - 4) < 0.01, null, { timeout: 20000 });
  await p.waitForTimeout(300);
  const all = await ear.evaluate(() => ({ ev: __ev.slice(), sc: __sc }));
  const scene = await p.evaluate(() => SSAV.tagScene());
  await ctx.close();
  // and a page without the flag posts nothing
  const { ctx: c2, p: q } = await open('?i=p5-notags&world=nashua&seed=1');
  const none = await q.evaluate(() => SSAV.tags === null && SSAV.tagScene() === null);
  await c2.close();
  const levels = all.ev.filter(e => e.kind === 'level');
  const kinds = [...new Set(pass.map(e => e.kind))];
  assert(pass.length === expect && pass.length >= 6, 'events on the pass ' + pass.length + ', features inside it ' + expect + ': ' + pass.map(e => e.kind + ' ' + e.s).join(', '));
  assert(new Set(pass.map(e => e.kind + e.s)).size === pass.length, 'a feature sounded twice on one pass');
  assert(levels.length === 4 && levels.every(e => e.rising) && levels[3].to === 4, 'level events ' + JSON.stringify(levels));
  assert(scene && scene.kind === 'nashua' && typeof scene.tags === 'object' && Array.isArray(scene.entered) && all.sc > 5, 'scene snapshot ' + JSON.stringify(scene) + ' posted ' + all.sc);
  assert(none, 'tags without ?tags=1');
  return { passEvents: pass.length, featuresInPass: expect, kinds, levelEvents: levels.length, scenesPosted: all.sc, sRange: [+s0.toFixed(0), +s1.toFixed(0)] };
});

// P5.4 print at stated scales: the geometry for Arch D and the 36 in roll at each scale, then an SVG on Arch D at
// 1:1000 and a PDF roll at 1:500; the scale in the file must be the stated one exactly (never rescaled)
await test('print-scales', async () => {
  const { ctx, p } = await open('?i=p5-print&world=nashua&seed=1&palette=nashua-kit');
  await p.evaluate(() => SSAV.pb.pause());
  const G = await p.evaluate(() => {
    const E = SSAV.cfg.exp, out = {};
    Object.assign(E, { format: 'scale', margin: 0.5, yAlign: 0.5, x0: 0, portrait: false });
    for (const sheet of ['archd', 'roll']) for (const N of [500, 1000, 2000]) {
      Object.assign(E, { sheet, scaleN: N });
      const g = SSAV.geom();
      out[sheet + N] = { k: g.k, pageW: g.pageW, pageH: g.pageH, worldW: g.worldW, worldH: g.worldH, crop: !!g.scale.crop, cut: g.scale.cut, mFrom: g.scale.mFrom, mTo: g.scale.mTo, vN: g.scale.vN };
    }
    return out;
  });
  const PT_PER_M = 72 / 0.0254;
  for (const [key, g] of Object.entries(G)) {
    const N = +key.replace(/\D/g, '');
    assert(Math.abs(g.k * 2 - PT_PER_M / N) < 1e-9, key + ': ' + g.k * 2 + ' pt per m, stated ' + PT_PER_M / N);
    assert(Math.abs(g.vN - N / 10) < 1e-9, key + ' vertical 1:' + g.vN);
  }
  assert(G.archd500.crop && !G.archd1000.crop && !G.archd2000.crop, 'Arch D crop flags ' + [G.archd500.crop, G.archd1000.crop, G.archd2000.crop]);
  assert(!G.roll500.cut && G.roll500.pageW < 200 && Math.abs(G.roll500.mTo - G.roll1000.mTo) < 1, 'roll lengths ' + G.roll500.pageW + ', cut ' + G.roll500.cut);
  // files
  const exportAs = async (o, kind) => {
    await p.evaluate(o => Object.assign(SSAV.cfg.exp, o), o);
    const dl = p.waitForEvent('download', { timeout: 600000 });
    await p.evaluate(k => SSAV.runExport(k), kind);
    const d = await dl, f = path.join(ROOT, 'test-results', 'p5', d.suggestedFilename());
    await d.saveAs(f);
    return { f, name: d.suggestedFilename(), last: await p.evaluate(() => window.__lastExport) };
  };
  fs.mkdirSync(path.join(ROOT, 'test-results', 'p5'), { recursive: true });
  const svg = await exportAs({ sheet: 'archd', scaleN: 1000 }, 'svg');
  const s = fs.readFileSync(svg.f, 'utf8');
  const k = /scale\(([\d.e-]+)\)/.exec(s);
  const pdf = await exportAs({ sheet: 'roll', scaleN: 500 }, 'pdf');
  const pb = fs.readFileSync(pdf.f, 'latin1');
  const mb = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pb);
  await ctx.close();
  assert(/width="36in" height="24in"/.test(s), 'SVG page size');
  assert(k && Math.abs(+k[1] - G.archd1000.k) < 1e-9, 'SVG scale ' + (k && k[1]) + ' vs stated ' + G.archd1000.k);
  assert(s.includes('Scale 1:1000 horizontal, 1:100 vertical (Vertical Exaggeration 10x)') && s.includes('100 m'), 'SVG scale bar text');
  assert(/_1-1000_archD-landscape\.svg$/.test(svg.name) && /_1-500_roll36\.pdf$/.test(pdf.name), 'file names ' + svg.name + ' ' + pdf.name);
  assert(mb && Math.abs(+mb[1] - G.roll500.pageW * 72) < 0.5 && Math.abs(+mb[2] - 36 * 72) < 0.5, 'PDF MediaBox ' + (mb && mb[0]) + ' vs ' + G.roll500.pageW * 72);
  assert(/along the scroll 0 to \d+ m/.test(pdf.last.window), 'export window not logged: ' + pdf.last.window);
  return { archD1000: { m: [0, +G.archd1000.mTo.toFixed(0)], crop: G.archd1000.crop }, archD500crop: G.archd500.crop, roll500in: +G.roll500.pageW.toFixed(1), roll1000in: +G.roll1000.pageW.toFixed(1), svgK: +k[1], pdfMediaBox: [+mb[1], +mb[2]], window: pdf.last.window };
});

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', 'p5.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
