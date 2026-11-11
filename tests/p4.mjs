// P4 show-machine tests: the quality ladder (pure), baked tiles against live tiles (same pixels), offline after the
// network goes away, (MIDI is in tests/midi.mjs).
//   node tests/p4.mjs [http://localhost:8096/] [--only=name,name]
// The bake test writes baked/ and precache.json in the repo (both gitignored). Writes test-results/p4.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8096/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const OUT = path.join(ROOT, 'test-results', 'p4');
fs.mkdirSync(OUT, { recursive: true });

const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 400) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
function watch(page, allow = []) {
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !allow.some(r => r.test(m.text()))) consoleProblems.push({ url: page.url(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', e => consoleProblems.push({ url: page.url(), text: 'pageerror: ' + e.message }));
}
function diff(a, b) { let s = 0; for (let i = 0; i < a.data.length; i += 4) for (let k = 0; k < 3; k++) s += Math.abs(a.data[i + k] - b.data[i + k]); return s / (a.data.length / 4 * 3); }

// ---------- pure ----------
await test('ladder', async () => {
  const { Ladder, RUNGS } = await import(pathToFileURL(path.join(ROOT, 'src', 'core', 'ladder.js')).href);
  const logs = [], L = new Ladder((l, m) => logs.push(m), 'auto');
  let t = 0;
  const run = (fps, ms) => { for (const end = t + ms; t < end; t += 100) L.tick(t, fps, true); };
  run(60, 5000); assert(L.i === 0, 'moved at 60 fps');
  run(40, 4500); assert(L.i === 1, 'did not step down after 4 s under 50: ' + L.i);
  run(40, 30000); assert(L.i === RUNGS.length - 1, 'did not reach the bottom: ' + L.i);
  run(60, 30000); assert(L.i === RUNGS.length - 1, 'stepped up within the hold');
  // the first step up comes once the hold (60 s from the last step down) is over, one rung at a time
  let n = 0; while (L.i === RUNGS.length - 1 && n++ < 600) { L.tick(t, 60, true); t += 100; }
  assert(L.i === RUNGS.length - 2, 'did not step up after the hold: ' + L.i);
  const holdBefore = L.hold; run(40, 4500); assert(L.hold === holdBefore * 2, 'a quick fall back did not double the hold: ' + L.hold);
  const blackout = L.i; for (let e = t + 20000; t < e; t += 100) L.tick(t, 20, false); assert(L.i === blackout, 'judged while inactive');
  const F = new Ladder(() => {}, 'low'); for (let e = 0; e < 60000; e += 100) F.tick(e, 60, true);
  assert(F.rung.q === 0.5 && !F.auto, 'quality=low not fixed');
  const fixedHigh = new Ladder(() => {}, 'high'); for (let e = 0; e < 60000; e += 100) fixedHigh.tick(e, 10, true);
  assert(fixedHigh.rung.q === 1, 'quality=high moved');
  return { rungs: RUNGS.map(r => r.q), logs: logs.length, hold: L.hold };
});

const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1000,640'] });
const ready = p => p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });

await test('bake-matches-live', async () => {
  // bake the nashua reach at 540 px, then draw the same place live and baked
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bake.mjs'), BASE, '--world=nashua', '--seed=1', '--height=540', '--headed'], { cwd: ROOT, stdio: 'inherit', timeout: 600000 });
  const shots = {}, info = {};
  for (const baked of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const p = await ctx.newPage(); watch(p);
    const logs = [];
    await p.goto(BASE + '?i=p4-bake' + (baked ? 'b' : 'l') + '&world=nashua&seed=1&palette=original' + (baked ? '&baked=1' : ''));
    await ready(p);
    await p.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 6000; });
    await p.waitForFunction(() => SSAV.world().coverage(SSAV.pb.x, SSAV.pb.x + SSAV.viewW()) >= 1, null, { timeout: 60000 });
    await p.waitForTimeout(4000);
    // stop the clock so fog and water stand still, then draw one fixed frame
    const fs0 = await p.evaluate(() => { window.requestAnimationFrame = () => 0; const f = SSAV.frameState(); f.time = 77.7; f.t = Date.now(); for (let i = 0; i < 3; i++) SSAV.scene.frame(f, {}); return f.worlds[0].x; });
    shots[baked] = PNG.sync.read(await p.locator('#gl').screenshot());
    fs.writeFileSync(path.join(OUT, 'bake-' + (baked ? 'baked' : 'live') + '.png'), PNG.sync.write(shots[baked]));
    info[baked] = await p.evaluate(() => { const w = SSAV.world(); const ts = [...w.tiles.values()].filter(t => t.tex); return { baked: ts.filter(t => t.bakedKey).length, live: ts.filter(t => !t.bakedKey).length, key: w.bakeKey() }; });
    info[baked].x = fs0;
    await ctx.close();
  }
  const d = diff(shots[false], shots[true]);
  assert(info[true].baked >= 3, 'baked page used ' + info[true].baked + ' baked tiles');
  assert(info[false].baked === 0, 'live page used baked tiles');
  assert(d < 0.5, 'baked differs from live, mean ' + d.toFixed(3));
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'baked', info[true].key, 'index.json'), 'utf8'));
  return { meanDiff: +d.toFixed(4), bakedTiles: info[true].baked, span: [idx.k0, idx.k1], MB: +(idx.bytes / 1e6).toFixed(1) };
});

await test('offline-reload', async () => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const p = await ctx.newPage();
  // going offline makes the generator's later fetches fail by design until the cache has them; only page errors count
  watch(p, [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/]);
  await p.goto(BASE + '?i=p4-off&world=nashua&seed=1&offline=1');
  await ready(p);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || navigator.serviceWorker.getRegistration().then(r => !!(r && r.active)), null, { timeout: 30000 });
  await p.reload(); await ready(p);   // now every file is served through the worker and cached
  await p.waitForTimeout(2000);
  // a release while the worker is installed: online, the new file must be served, never the cached one
  const probe = path.join(ROOT, 'sw-probe.js');
  const get = () => p.evaluate(() => fetch('sw-probe.js').then(r => r.text()));
  fs.writeFileSync(probe, 'release A\n');
  const a = await get();
  fs.writeFileSync(probe, 'release B\n');
  const b = await get();
  await ctx.setOffline(true);
  const cachedB = await get().catch(e => 'failed: ' + e.message);
  await p.reload();
  await ready(p);
  const ok = await p.evaluate(() => ({ controlled: !!navigator.serviceWorker.controller, tiles: SSAV.scene.stats().tiles, world: SSAV.worldName }));
  await ctx.setOffline(false);
  fs.rmSync(probe, { force: true });
  assert(a === 'release A\n' && b === 'release B\n', 'stale file after a release: ' + JSON.stringify([a, b]));
  assert(cachedB === 'release B\n', 'offline did not serve the last good copy: ' + cachedB);
  // and a page without ?offline=1 in a fresh context registers nothing
  const c2 = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const p2 = await c2.newPage(); watch(p2);
  await p2.goto(BASE + '?i=p4-noff&world=shanshui'); await ready(p2);
  const reg = await p2.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r));
  await ctx.close(); await c2.close();
  assert(ok.controlled && ok.tiles >= 1 && ok.world === 'nashua', 'offline reload failed ' + JSON.stringify(ok));
  assert(!reg, 'a page without ?offline=1 registered a service worker');
  return ok;
});

// MIDI: tests/midi.mjs

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.writeFileSync(path.join(ROOT, 'test-results', 'p4.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
