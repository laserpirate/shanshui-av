// nashua world tests on the real GPU (ANGLE D3D11), plus the byte-identity of the older worlds against v0.3.0.
//   node tests/nashua.mjs [http://localhost:8093/] [--v030=http://localhost:8095/] [--only=name,name]
// Writes test-results/nashua.json. Exit code 1 on any failure.
// The band and bridge metrics below were frozen (thresholds and method) before any tuning; see DECISIONS.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const V030 = (args.find(a => a.startsWith('--v030=')) || '--v030=http://localhost:8095/').slice(7);
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
fs.mkdirSync(path.join(ROOT, 'test-results', 'nashua'), { recursive: true });

const results = [], consoleProblems = [];
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1300,860'] });
function watch(page) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: page.url(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', e => consoleProblems.push({ url: page.url(), text: 'pageerror: ' + e.message }));
}
// a frozen clock: performance.now and Date.now run normally until window.__freeze = t, then stand still at t
const FREEZE = () => {
  const pn = performance.now.bind(performance), dn = Date.now;
  performance.now = () => (window.__freeze != null ? window.__freeze : pn());
  Date.now = () => (window.__freeze != null ? 1.7e12 + window.__freeze : dn());
};
async function newPage(base, url, { w = 1280, h = 720, freeze = false, mine = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  if (freeze) await ctx.addInitScript(FREEZE);
  const page = await ctx.newPage();
  if (mine) watch(page);
  await page.goto(base + url);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  return { ctx, page };
}
function assert(c, msg) { if (!c) throw new Error(msg); }
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 400) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const ready = () => {
  const w = SSAV.world(); if (!w || SSAV.fading || !SSAV.scene.lastFrame) return false;
  const v = SSAV.scene.lastFrame.v, k0 = Math.floor(SSAV.x / 512), k1 = Math.floor((SSAV.x + v.viewW) / 512);
  for (let k = k0; k <= k1; k++) { const t = w.tiles.get(k); if (!t || !t.tex || t.pending || t.dirty) return false; }
  return true;
};
const settle = async (page, ms = 300) => { await page.waitForTimeout(ms); await page.waitForFunction(ready, null, { timeout: 120000 }); await page.waitForTimeout(ms); await page.waitForFunction(ready, null, { timeout: 60000 }); };
const lumOf = png => { const l = new Float32Array(png.width * png.height); for (let i = 0, k = 0; i < png.data.length; i += 4, k++) l[k] = (png.data[i] * 0.299 + png.data[i + 1] * 0.587 + png.data[i + 2] * 0.114); return l; };
const median = a => { if (!a.length) return NaN; const b = Float64Array.from(a).sort(); return b[b.length >> 1]; };
// the look used by every measured nashua frame: dry, day, light fog, no wind
const LOOK = () => { document.body.classList.add('uihidden'); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: 1, wind: 0.2 }; SSAV.pb.pause(); SSAV.pb.k = 0; };
// put s at the view centre
const goS = (page, s) => page.evaluate(s => { const P = SSAV.world().pack, b = SSAV.opts.bank; SSAV.pb.x = (b === 'R' ? P.route_len_m - s : s) * 2 - SSAV.viewW() / 2; }, s);

// ---------------------------------------------------------------------------------------------
await test('nashua-loads', async () => {
  const { ctx, page } = await newPage(BASE, '?i=nt-load&seed=1&world=nashua');
  await page.evaluate(LOOK); await goS(page, 870); await settle(page);
  const info = await page.evaluate(() => ({ world: SSAV.worldName, hash: SSAV.world().pack.hash, opts: SSAV.opts, tiles: SSAV.scene.stats().tiles, facts: document.getElementById('hud-facts').textContent }));
  const png = PNG.sync.read(await page.screenshot());
  fs.writeFileSync(path.join(ROOT, 'test-results', 'nashua', 'load.png'), PNG.sync.write(png));
  const L = lumOf(png); let s = 0, s2 = 0; for (const v of L) { s += v; s2 += v * v; } const m = s / L.length, sd = Math.sqrt(s2 / L.length - m * m);
  await ctx.close();
  assert(info.world === 'nashua' && info.hash, 'not the nashua world: ' + JSON.stringify(info));
  assert(info.opts.bank === 'L' && info.opts.ve === 10, 'defaults: ' + JSON.stringify(info.opts));
  assert(sd > 10, 'frame looks blank, sd ' + sd.toFixed(1));
  assert(/Vertical Exaggeration 10x/.test(info.facts) && /100 m \(328 ft\)/.test(info.facts), 'fact line: ' + info.facts);
  return { sd: +sd.toFixed(1), mean: +m.toFixed(1), hash: info.hash, facts: info.facts };
});

await test('nashua-determinism', async () => {
  // tiles at the start and mid-reach, then 50,000 px away (the start is culled), then back: the same tile hashes
  const { ctx, page } = await newPage(BASE, '?i=nt-det&seed=1&world=nashua', { w: 960, h: 540 });
  await page.evaluate(LOOK);
  const hashes = () => page.evaluate(() => { const w = SSAV.world(), v = SSAV.scene.lastFrame.v, o = {}; for (let k = Math.floor(SSAV.x / 512); k <= Math.floor((SSAV.x + v.viewW) / 512); k++) o[k] = w.tiles.get(k).hash; return o; });
  const at = async x => { await page.evaluate(x => { SSAV.pb.x = x; }, x); await settle(page); return hashes(); };
  const a0 = await at(0), a1 = await at(2400);
  for (let x = 5000; x <= 50000; x += 5000) await at(x);
  const far = await page.evaluate(() => { const w = SSAV.world(); let mn = Infinity; for (const c of w.chunks.values()) mn = Math.min(mn, c.x); return { minX: mn, chunks: w.chunks.size, world: SSAV.worldName }; });
  assert(far.world === 'nashua', 'left the world during the test: ' + far.world);
  assert(far.minX > 30000, 'start not culled at 50,000: ' + JSON.stringify(far));
  for (let x = 45000; x >= 5000; x -= 5000) await at(x);
  const b1 = await at(2400), b0 = await at(0);
  await ctx.close();
  const diff = [...Object.keys(a0).filter(k => a0[k] !== b0[k]), ...Object.keys(a1).filter(k => a1[k] !== b1[k])];
  assert(Object.keys(a0).length >= 2 && !diff.length, 'tiles differ after the round trip: ' + diff.join(',') + ' ' + JSON.stringify({ a0, b0 }));
  return { tiles: Object.keys(a0).length + Object.keys(a1).length, far };
});

await test('nashua-bank-flip', async () => {
  const { ctx, page } = await newPage(BASE, '?i=nt-bank&seed=1&world=nashua');
  await page.evaluate(LOOK); await goS(page, 1260); await settle(page);
  const sAt = () => page.evaluate(() => { const P = SSAV.world().pack, b = SSAV.opts.bank, xc = SSAV.x + SSAV.viewW() / 2; return { bank: b, s: b === 'R' ? P.route_len_m - xc / 2 : xc / 2 }; });
  const a = await sAt();
  await page.keyboard.press('k'); await page.waitForFunction(() => SSAV.opts && SSAV.opts.bank === 'R' && !SSAV.fading, null, { timeout: 20000 }); await settle(page);
  const b = await sAt();
  const shotR = lumOf(PNG.sync.read(await page.screenshot()));
  await page.evaluate(() => SSAV.setBank('L')); await page.waitForFunction(() => SSAV.opts.bank === 'L' && !SSAV.fading, null, { timeout: 20000 }); await settle(page);
  const c = await sAt();
  const shotL = lumOf(PNG.sync.read(await page.screenshot()));
  await ctx.close();
  let d = 0; for (let i = 0; i < shotL.length; i++) d += Math.abs(shotL[i] - shotR[i]); d /= shotL.length;
  assert(b.bank === 'R' && Math.abs(b.s - a.s) < 1 && Math.abs(c.s - a.s) < 1, 'bank flip moved s: ' + JSON.stringify({ a, b, c }));
  assert(d > 3, 'left and right banks look the same, mean diff ' + d.toFixed(2));
  return { a, b, c, meanDiff: +d.toFixed(2) };
});

await test('nashua-levels', async () => {
  // each level raises the water line where it should; the scrub interpolates; the drawn frame changes
  const { ctx, page } = await newPage(BASE, '?i=nt-lv&seed=1&world=nashua');
  await page.evaluate(LOOK); await goS(page, 870); await settle(page);
  const probe = () => page.evaluate(() => { const w = SSAV.world(), wl = w.waterLine(SSAV.lvShown), xc = SSAV.x + SSAV.viewW() / 2; const i = Math.round((xc - wl.x0) / wl.w * (wl.data.length - 1)); return { lv: SSAV.lvShown, y: wl.data[i], levels: w.pack.levels.map(l => l.name) }; });
  const shot = async () => lumOf(PNG.sync.read(await page.screenshot()));
  const out = [];
  const L0 = await shot();
  const n = (await probe()).levels.length;
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => SSAV.setLevel(i), i);
    await page.waitForFunction(i => Math.abs(SSAV.lvShown - i) < 0.01, i, { timeout: 20000 });
    await page.waitForTimeout(300);
    out.push(await probe());
  }
  const Ltop = await shot();
  await page.evaluate(() => SSAV.scrubLevel(0.5)); await page.waitForTimeout(400);
  const mid = await probe();
  await page.evaluate(() => SSAV.setLevel(0)); await page.waitForFunction(() => SSAV.lvShown < 0.01, null, { timeout: 20000 });
  await ctx.close();
  let d = 0; for (let i = 0; i < L0.length; i++) d += Math.abs(L0[i] - Ltop[i]); d /= L0.length;
  for (let i = 1; i < out.length; i++) assert(out[i].y < out[i - 1].y, 'level ' + out[i].levels[i] + ' is not above ' + out[i - 1].levels[i - 1] + ': ' + JSON.stringify(out.map(o => o.y)));
  assert(mid.y < out[0].y && mid.y > out.at(-1).y, 'scrub not between the ends: ' + mid.y);
  assert(d > 2, 'the 1936 flood did not change the frame, mean diff ' + d.toFixed(2));
  return { levels: out[0].levels, y: out.map(o => +o.y.toFixed(1)), scrubMid: +mid.y.toFixed(1), meanDiff: +d.toFixed(2) };
});

await test('nashua-labels', async () => {
  const { ctx, page } = await newPage(BASE, '?i=nt-lab&seed=1&world=nashua');
  await page.evaluate(LOOK); await goS(page, 870); await settle(page);
  const count = () => page.evaluate(() => { const r = document.getElementById('labels'); return r.hidden ? 0 : [...r.querySelectorAll('.rl')].filter(d => d.style.display !== 'none').length; });
  const def = await page.evaluate(() => ({ labels: SSAV.cfg.nashua.labels, out: SSAV.cfg.nashua.outLabels, outFacts: SSAV.cfg.nashua.outFacts }));
  const on = await count();
  const font = await page.evaluate(() => { const d = document.querySelector('#labels .rl'); return d ? parseFloat(getComputedStyle(d).fontSize) : 0; });
  await page.keyboard.press('l'); await page.waitForTimeout(400);
  const off = await count();
  await page.keyboard.press('l'); await page.waitForTimeout(400);
  const back = await count();
  await ctx.close();
  assert(def.out === false && def.outFacts === false, 'labels on the output should be off by default: ' + JSON.stringify(def));
  assert(on > 0 && off === 0 && back === on, 'labels toggle: ' + JSON.stringify({ on, off, back }));
  assert(font >= 18, 'label text ' + font + ' px');
  return { def, on, off, back, font };
});

await test('nashua-bands-separable', async () => {
  // At 1280x720, for 160 columns across the frame, the visible face of each band is the run between its ridge and
  // the next nearer ridge (band0: down to the water line). A run counts when it is at least 10 px tall; it is sampled
  // 3 px in from both ends. The band value is the median of the run medians. A band is separable when it is seen in
  // at least 10% of the columns and differs from each seen neighbour by at least 5 (of 255). Pass: 4 or more.
  const { ctx, page } = await newPage(BASE, '?i=nt-band&seed=1&world=nashua');
  await page.evaluate(LOOK);
  const rows = [];
  for (const s of [300, 870, 1260, 1706]) {
    await goS(page, s); await settle(page, 500); await page.waitForTimeout(800);
    const geo = await page.evaluate(async () => {
      const m = await import('./src/worlds/nashua/pack.js');
      const w = SSAV.world(), P = w.pack, o = SSAV.opts, v = SSAV.scene.lastFrame.v, cs = innerWidth / v.viewW, VY = m.HX * o.ve;
      const names = ['far1', 'far0', 'band3', 'band2', 'band1', 'band0'];
      const cols = [];
      for (let i = 0; i < 160; i++) {
        const sx = (i + 0.5) * innerWidth / 160, x = SSAV.x + sx / cs, s = Math.max(0, Math.min(P.route_len_m, m.sOf(P, x, o.bank)));
        const top = names.map(n => (m.YW - m.at(P, n + '_' + o.bank, s) * VY - v.camY) * cs);
        cols.push({ sx: Math.round(sx), top, water: (m.YW - v.camY) * cs });
      }
      return cols;
    });
    const png = PNG.sync.read(await page.screenshot()), L = lumOf(png);
    rows.push({ s, geo, L, w: png.width, h: png.height });
    if (s === 870) fs.writeFileSync(path.join(ROOT, 'test-results', 'nashua', 'bands-720.png'), PNG.sync.write(png));
  }
  await ctx.close();
  const names = ['far1', 'far0', 'band3', 'band2', 'band1', 'band0'];
  const runs = names.map(() => []), seen = names.map(() => 0); let ncol = 0;
  for (const r of rows) for (const c of r.geo) {
    ncol++;
    for (let k = 0; k < names.length; k++) {
      // the face of band k runs from its own ridge down to the highest ridge nearer than it (or the water)
      let lo = c.water; for (let j = k + 1; j < names.length; j++) lo = Math.min(lo, c.top[j]);
      const y0 = Math.max(0, Math.ceil(c.top[k] + 3)), y1 = Math.min(r.h - 1, Math.floor(lo - 3));
      if (y1 - y0 < 4 || lo - c.top[k] < 10) continue;
      const a = []; for (let y = y0; y <= y1; y++) a.push(r.L[y * r.w + c.sx]);
      runs[k].push(median(a)); seen[k]++;
    }
  }
  const val = runs.map(median), share = seen.map(n => n / ncol);
  const vis = names.map((_, k) => share[k] >= 0.1);
  const sep = names.map((_, k) => {
    if (!vis[k]) return false;
    const nb = []; for (let j = k - 1; j >= 0; j--) if (vis[j]) { nb.push(j); break; } for (let j = k + 1; j < names.length; j++) if (vis[j]) { nb.push(j); break; }
    return nb.every(j => Math.abs(val[j] - val[k]) >= 5);
  });
  const n = sep.filter(Boolean).length;
  const table = names.map((nm, k) => ({ band: nm, value: +val[k].toFixed(1), seen: +share[k].toFixed(2), separable: sep[k] }));
  assert(n >= 4, 'only ' + n + ' bands separable: ' + JSON.stringify(table));
  return { separable: n, table };
});

await test('nashua-bridges-dam-visible', async () => {
  // At each bridge's s (and the dam at s 0), in a 40 x 40 px window at the deck (crest) the count of pixels at least
  // 40 darker than the median of the same window 260 px along must be 60 or more. Ink is dark on light paper here,
  // so the frame uses the original palette (nashua-kit inverts: light ink on a dark ground).
  const { ctx, page } = await newPage(BASE, '?i=nt-br&seed=1&world=nashua&palette=original');
  await page.evaluate(LOOK);
  const targets = await page.evaluate(() => { const P = SSAV.world().pack; return [{ name: P.dam.label, s: 0, h: P.dam.headpond_m - P.A.ws[0], dam: true }, ...P.bridges.map(b => ({ name: b.name + ' s ' + b.s, s: b.s, h: b.deck_h }))]; });
  const out = [];
  for (const t of targets) {
    await page.evaluate(s => { const P = SSAV.world().pack; SSAV.pb.x = (s * 2) - SSAV.viewW() / (s < 50 ? 4 : 2); }, t.s); await settle(page, 400); await page.waitForTimeout(600);
    const g = await page.evaluate(async t => { const m = await import('./src/worlds/nashua/pack.js'); const P = SSAV.world().pack, o = SSAV.opts, v = SSAV.scene.lastFrame.v, cs = innerWidth / v.viewW; return { sx: (m.xOf(P, t.s, o.bank) - SSAV.x) * cs, sy: (m.YW - t.h * m.HX * o.ve - v.camY) * cs }; }, t);
    const png = PNG.sync.read(await page.screenshot()), L = lumOf(png);
    const win = (cx, cy) => { const a = []; for (let y = Math.round(cy - 20); y < Math.round(cy + 20); y++) for (let x = Math.round(cx - 20); x < Math.round(cx + 20); x++) if (x >= 0 && y >= 0 && x < png.width && y < png.height) a.push(L[y * png.width + x]); return a; };
    const cx = t.dam ? Math.max(25, g.sx + 20) : g.sx;
    const here = win(cx, g.sy + 6), ref = median(win(cx + 260 < png.width - 20 ? cx + 260 : cx - 260, g.sy + 6));
    const dark = here.filter(v => v <= ref - 40).length;
    out.push({ name: t.name, sx: Math.round(cx), sy: Math.round(g.sy), dark, ref: Math.round(ref) });
    if (t.dam) fs.writeFileSync(path.join(ROOT, 'test-results', 'nashua', 'dam.png'), PNG.sync.write(png));
  }
  await ctx.close();
  const bad = out.filter(o => o.dark < 60 || o.sy < 0 || o.sy > 720);
  assert(!bad.length, 'not visible: ' + JSON.stringify(bad));
  return out;
});

await test('old-worlds-identical', async () => {
  // shanshui and derelict at fixed frames, this build against the v0.3.0 tag. The app's loop is stopped and the same
  // frame state (time, weather, x, palette) is drawn in both pages: every screenshot byte must match, and so must
  // every tile hash. (A free-running loop is not repeatable even against itself: weather and light phases drift.)
  const shots = [];
  for (const [world, seed, palette, x, night] of [['shanshui', '1', 'original', 0, 0], ['shanshui', '7', 'kl4-look', 900, 0], ['derelict', '21', 'original', 1500, 0], ['derelict', '3', 'kodama-water', 4200, 1], ['derelict', '8', 'derelict-rust', 2600, 1]]) {
    let fixed = null;
    const one = async base => {
      const { ctx, page } = await newPage(base, `?i=nt-same-${world}-${seed}&seed=${seed}&world=${world}&palette=${palette}`, { mine: base === BASE });
      await page.evaluate(({ x, night }) => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.pb.k = 0; SSAV.pb.x = x; if (SSAV.cfg.weather) { SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0.4, fog: 0.3, light: night ? 0 : 1, wind: 0.3, water: 0.5 }; } }, { x, night });
      await settle(page, 500);
      await page.waitForTimeout(2500);
      await settle(page, 200);
      // stop the loop, then draw one fixed frame state
      const fsUsed = await page.evaluate(async ({ x, fixed }) => {
        window.requestAnimationFrame = () => 0;
        await new Promise(r => setTimeout(r, 300));
        const fs = SSAV.frameState();
        const w = fs.worlds.at(-1); fs.worlds = [{ ...w, x, alpha: 1 }];
        fs.time = 77.7; fs.v = 0; fs.dir = 1;
        if (fixed) fs.weather = fixed.weather; else fixed = { weather: fs.weather };
        for (let k = 0; k < 3; k++) { SSAV.scene.frame(fs, { blackout: false, panic: false }); await new Promise(r => setTimeout(r, 250)); }
        return fixed;
      }, { x, fixed });
      if (!fixed) fixed = fsUsed;
      const png = PNG.sync.read(await page.screenshot());
      const th = await page.evaluate(() => { const w = SSAV.world(), o = {}; for (const [k, t] of w.tiles) if (t.hash != null) o[k] = t.hash; return o; });
      await ctx.close();
      return { png, th };
    };
    const a = await one(V030), c = await one(BASE);
    let maxd = 0, n = 0;
    for (let i = 0; i < a.png.data.length; i++) { const d = Math.abs(a.png.data[i] - c.png.data[i]); if (d) { n++; if (d > maxd) maxd = d; } }
    const keys = Object.keys(a.th).filter(k => k in c.th), tdiff = keys.filter(k => a.th[k] !== c.th[k]);
    shots.push({ world, seed, palette, x, night, maxDiff: maxd, bytesDiffering: n, tilesCompared: keys.length, tilesDiffering: tdiff.length });
  }
  const bad = shots.filter(s => s.maxDiff > 0 || s.tilesDiffering > 0 || s.tilesCompared < 2);
  assert(!bad.length, 'differs from v0.3.0: ' + JSON.stringify(bad));
  return shots;
});

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, v030: V030, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.writeFileSync(path.join(ROOT, 'test-results', 'nashua.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
