// P5 tests: the time scroll (the water level through the East Pepperell daily record).
//   node tests/p5.mjs [http://localhost:8096/] [--only=name,name]
// Writes test-results/p5.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';

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

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', 'p5.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
