// End-to-end tests on the real GPU (ANGLE D3D11). Headed where it matters (full screen, output window).
//   node tools/serve.mjs --port 8093 &   then   node tests/e2e.mjs [http://localhost:8093/] [--only=name,name] [--headless-all]
// Writes test-results/e2e.json. Exit code 1 on any failure.
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
const HEADLESS_ALL = args.includes('--headless-all');
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const DL = path.join(ROOT, 'test-results', 'downloads');
fs.mkdirSync(DL, { recursive: true });

const results = [];
const consoleProblems = [];
let headless, headed;
async function browser(head) {
  if (head && !HEADLESS_ALL) return headed || (headed = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1400,900'] }));
  return headless || (headless = await chromium.launch({ headless: true, args: GPU }));
}
async function newPage(url, { head = false, w = 1400, h = 800 } = {}) {
  const b = await browser(head);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE + url);
  await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2, null, { timeout: 30000 });
  return { ctx, page };
}
function watch(page) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: page.url(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', e => consoleProblems.push({ url: page.url(), text: 'pageerror: ' + e.message }));
}
function assert(c, msg) { if (!c) throw new Error(msg); }
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 300) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
// screenshot stats; clip avoids nothing (UI hidden by caller when needed)
async function pixels(page, clip) {
  const png = PNG.sync.read(await page.screenshot(clip ? { clip } : {}));
  let s = 0, s2 = 0, n = 0, mn = 255, mx = 0;
  const lum = [];
  for (let i = 0; i < png.data.length; i += 4) { const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; lum.push(l); s += l; s2 += l * l; n++; if (l < mn) mn = l; if (l > mx) mx = l; }
  const mean = s / n;
  return { mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), min: mn, max: mx, lum, w: png.width, h: png.height };
}
const hideUI = page => page.evaluate(() => document.body.classList.add('uihidden'));
const showUI = page => page.evaluate(() => document.body.classList.remove('uihidden'));
function downsample(p, W, H) {
  const out = new Float64Array(W * H), cnt = new Float64Array(W * H);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const k = Math.floor(y * H / p.h) * W + Math.floor(x * W / p.w); out[k] += p.lum[y * p.w + x]; cnt[k]++; }
  for (let i = 0; i < out.length; i++) out[i] /= cnt[i];
  return out;
}
function corr(a, b) {
  const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb);
}

// ---------------------------------------------------------------------------------------------
await test('keymap-unique', async () => {
  const { KEYS, KEY_CODES } = await import('../src/ui/keys.js');
  const k = KEYS.map(r => r[0]);
  assert(new Set(k).size === k.length, 'duplicate key card rows');
  assert(new Set(KEY_CODES).size === KEY_CODES.length, 'duplicate key codes');
  return { rows: k.length };
});

await test('upstream-identical', async () => {
  const b = await browser(false);
  const out = [];
  for (const seed of ['1', '1729700000000', 'shanshui']) {
    const up = await b.newPage();
    await up.goto(BASE + 'upstream/index.html?seed=' + seed);
    await up.waitForFunction(() => window.MEM && MEM.chunks.length > 0);
    const upRes = await up.evaluate(async () => {
      while (MEM.xmax < 9000) xcroll(200);
      const h = async s => { const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); };
      const hashes = []; for (const c of MEM.chunks) hashes.push(await h(c.canv));
      return { n: MEM.chunks.length, xmax: MEM.xmax, hashes, paperPx: (() => { const c = document.getElementById('bgcanv').getContext('2d').getImageData(0, 0, 512, 512).data; let s = 0; for (let i = 0; i < c.length; i += 97) s = (s * 31 + c[i]) % 1000000007; return s; })() };
    });
    await up.close();
    const ours = await b.newPage();
    watch(ours);
    await ours.goto(BASE + 'tools/rastertest.html?tiles=0&seed=x');   // any page on the origin; we drive the worker directly
    const ourRes = await ours.evaluate(async ({ seed, xmax }) => {
      const w = new Worker('../src/workers/gen-worker.js');
      const chunks = new Map(); let order = []; let paper = null;
      await new Promise(res => {
        w.onmessage = e => {
          const m = e.data;
          if (m.type === 'paper') paper = m.data;
          if (m.type !== 'chunks') return;
          for (const a of m.added) chunks.set(a.id, a.canv);
          order = m.order;
          if (m.xmax < xmax) w.postMessage({ type: 'right' }); else res();
        };
        w.postMessage({ type: 'init', seed });
      });
      w.terminate();
      const h = async s => { const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); };
      const hashes = []; for (const id of order) hashes.push(await h(chunks.get(id)));
      let s = 0; for (let i = 0; i < paper.length; i += 97) s = (s * 31 + paper[i]) % 1000000007;
      return { n: order.length, hashes, paperPx: s };
    }, { seed, xmax: upRes.xmax });
    await ours.close();
    assert(upRes.n === ourRes.n, `seed ${seed}: ${upRes.n} upstream elements vs ${ourRes.n}`);
    const diff = upRes.hashes.findIndex((h, i) => h !== ourRes.hashes[i]);
    assert(diff < 0, `seed ${seed}: element ${diff} differs`);
    assert(upRes.paperPx === ourRes.paperPx, `seed ${seed}: paper texture differs`);
    out.push({ seed, elements: upRes.n, xmax: upRes.xmax });
  }
  return out;
});

await test('raster-matches-svg', async () => {
  const b = await browser(false);
  const p = await b.newPage(); watch(p);
  await p.goto(BASE + 'tools/rastertest.html?seed=1&tiles=4');
  await p.waitForFunction(() => window.RESULT, null, { timeout: 120000 });
  const r = await p.evaluate(() => window.RESULT);
  await p.close();
  for (const t of r) { assert(t.meanDiff < 2, 'mean diff ' + t.meanDiff); assert(t.over48pct < 0.1, 'over48 ' + t.over48pct); }
  return r.map(t => [t.meanDiff, t.over48pct]);
});

await test('playback', async () => {
  const { ctx, page } = await newPage('?i=e2e-play&seed=1');
  const st = () => page.evaluate(() => ({ x: SSAV.x, playing: SSAV.playing, v: SSAV.pb.velocity }));
  let s = await st();
  assert(!s.playing && s.x === 0, 'starts paused at 0');
  await page.keyboard.press('Space');
  // ease in: velocity ramps, never jumps to full
  const vs = [];
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(100); vs.push((await st()).v); }
  assert(vs[0] < vs[vs.length - 1] && vs[0] > 0, 'velocity ramps up ' + vs.map(v => v.toFixed(1)));
  await page.waitForTimeout(1500);
  const xPlay = (await st()).x;
  assert(xPlay > 50, 'moved while playing ' + xPlay);
  await page.keyboard.press('Space');
  const v1 = (await st()).v; await page.waitForTimeout(150); const v2 = (await st()).v;
  assert(v2 < v1 && v2 > 0, 'eases out ' + v1 + ' ' + v2);
  await page.waitForTimeout(1500);
  const xa = (await st()).x; await page.waitForTimeout(400); const xb = (await st()).x;
  assert(Math.abs(xb - xa) < 0.5, 'stopped after ease ' + (xb - xa));
  // speed keys, direction
  const sp0 = await page.evaluate(() => SSAV.cfg.speed);
  await page.keyboard.press('Equal'); await page.keyboard.press('Equal');
  const sp1 = await page.evaluate(() => SSAV.cfg.speed);
  assert(sp1 > sp0, 'speed up');
  await page.keyboard.press('Minus');
  assert(await page.evaluate(() => SSAV.cfg.speed) < sp1, 'speed down');
  await page.keyboard.press('d'); await page.keyboard.press('Space'); await page.waitForTimeout(1500);
  const xl = (await st()).x;
  assert(xl < xb, 'moves left after D');
  await page.keyboard.press('Space'); await page.keyboard.press('d');
  // manual scrub pauses
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(500, 400, { steps: 5 }); await page.mouse.up();
  assert(!(await st()).playing, 'drag pauses');
  const xd = (await st()).x;
  await page.mouse.wheel(0, 300); await page.waitForTimeout(600);
  assert((await st()).x > xd, 'wheel scrubs');
  // stop: ease back to the start
  await page.keyboard.press('Home'); await page.waitForTimeout(3500);
  const xs = (await st()).x;
  assert(Math.abs(xs) < 1, 'stop returns to 0, at ' + xs);
  await ctx.close();
  return { xPlay: Math.round(xPlay), velocityRamp: vs.map(v => +v.toFixed(1)) };
});

await test('auto-resume', async () => {
  const { ctx, page } = await newPage('?i=e2e-resume&seed=1');
  await page.evaluate(() => { SSAV.cfg.show.resume = true; SSAV.pb.autoResume = true; SSAV.pb.resumeSecs = 1; });
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  await page.keyboard.press('ArrowRight');
  assert(!(await page.evaluate(() => SSAV.playing)), 'nudge pauses');
  await page.waitForTimeout(1600);
  assert(await page.evaluate(() => SSAV.playing), 'resumed after 1 s');
  await ctx.close();
});

await test('reseed-history-stars', async () => {
  const { ctx, page } = await newPage('?i=e2e-seed&seed=42');
  await page.evaluate(() => { try { localStorage.removeItem('shanshui-av:e2e-seed'); } catch (e) {} });
  const s0 = await page.evaluate(() => SSAV.seed);
  assert(s0 === '42', 'seed from URL');
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  const mid = await page.evaluate(() => ({ seed: SSAV.seed, fading: SSAV.fading, worlds: SSAV.frameState().worlds.length }));
  assert(mid.seed !== '42' && mid.fading && mid.worlds === 2, 'crossfade with two worlds ' + JSON.stringify(mid));
  await page.waitForFunction(() => !SSAV.fading, null, { timeout: 15000 });
  assert(page.url().includes('seed=' + mid.seed), 'URL has the new seed');
  await page.keyboard.press('r'); await page.waitForFunction(() => !SSAV.fading, null, { timeout: 15000 });
  const s2 = await page.evaluate(() => SSAV.seed);
  await page.keyboard.press('BracketLeft'); await page.waitForTimeout(100);
  assert(await page.evaluate(() => SSAV.seed) === mid.seed, 'history back');
  await page.keyboard.press('BracketLeft'); await page.waitForTimeout(100);
  assert(await page.evaluate(() => SSAV.seed) === '42', 'history back twice');
  await page.keyboard.press('BracketRight'); await page.keyboard.press('BracketRight'); await page.waitForTimeout(100);
  assert(await page.evaluate(() => SSAV.seed) === s2, 'history forward');
  await page.keyboard.press('s');
  assert((await page.evaluate(() => SSAV.stars)).includes(s2), 'starred');
  // palette to restore
  await page.evaluate(() => SSAV.setPalette('kodama-water'));
  await page.waitForFunction(() => !SSAV.fading);
  await page.keyboard.press('Space'); await page.waitForTimeout(800);
  await page.waitForTimeout(400);
  // reload: same seed and palette, starred kept, paused
  await page.goto(BASE + '?i=e2e-seed');
  await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2);
  const r = await page.evaluate(() => ({ seed: SSAV.seed, pal: SSAV.palette, stars: SSAV.stars, playing: SSAV.playing, x: SSAV.x }));
  assert(r.seed === s2 && r.pal === 'kodama-water' && r.stars.includes(s2) && !r.playing && r.x === 0, 'restored ' + JSON.stringify(r));
  // history is capped at 20
  for (let i = 0; i < 24; i++) await page.evaluate(() => SSAV.reseed('test'));
  assert((await page.evaluate(() => SSAV.hist.length)) === 20, 'history capped at 20');
  await ctx.close();
  return r;
});

await test('palettes-non-blank', async () => {
  const { ctx, page } = await newPage('?i=e2e-pal&seed=1', { w: 960, h: 540 });
  await hideUI(page);
  await page.evaluate(() => { SSAV.pb.x = 300; });
  const ids = await page.evaluate(() => SSAV.palettes.palettes.map(p => p.id));
  const bad = [];
  for (const id of ids) {
    await page.evaluate(id => SSAV.setPalette(id), id);
    await page.waitForFunction(() => !SSAV.fading);
    await page.waitForTimeout(80);
    const p = await pixels(page);
    if (p.sd < 4 || p.max - p.min < 12) bad.push(id + ' sd ' + p.sd.toFixed(1));
  }
  await ctx.close();
  assert(!bad.length, 'blank: ' + bad.join(', '));
  return { palettes: ids.length };
});

await test('palette-keeps-geometry', async () => {
  const { ctx, page } = await newPage('?i=e2e-geo&seed=7', { w: 960, h: 540 });
  await hideUI(page);
  await page.evaluate(() => { SSAV.pb.x = 200; SSAV.cfg.paper = false; });
  await page.waitForTimeout(1500);
  const sig = () => page.evaluate(() => { const w = SSAV.world(); return { order: w.order.join(','), n: w.chunks.size, tiles: [...w.tiles.values()].filter(t => t.tex).map(t => t.k + ':' + t.scale).join(',') }; });
  await page.evaluate(() => SSAV.setPalette('grayscale')); await page.waitForFunction(() => !SSAV.fading); await page.waitForTimeout(300);
  const g0 = await sig(); const a = await pixels(page);
  await page.evaluate(() => SSAV.setPalette('dark')); await page.waitForFunction(() => !SSAV.fading); await page.waitForTimeout(300);
  const g1 = await sig(); const b = await pixels(page);
  await page.evaluate(() => SSAV.setPalette('kl4-look')); await page.waitForFunction(() => !SSAV.fading); await page.waitForTimeout(300);
  const g2 = await sig(); const c = await pixels(page);
  await ctx.close();
  assert(g0.order === g1.order && g1.order === g2.order && g0.tiles === g1.tiles && g1.tiles === g2.tiles, 'elements or tiles changed with palette');
  // ink masks: grey ink is dark on white, dark-mode ink is light on dark
  const inkA = a.lum.map(l => l < 235), inkB = b.lum.map(l => l > 30);
  let inter = 0, uni = 0; for (let i = 0; i < inkA.length; i++) { if (inkA[i] && inkB[i]) inter++; if (inkA[i] || inkB[i]) uni++; }
  const iou = inter / uni;
  const r = corr(a.lum, b.lum.map(l => -l)), r2 = corr(a.lum, c.lum.map(l => -l));
  assert(iou > 0.8 && r > 0.9 && r2 > 0.8, `iou ${iou.toFixed(3)} corr ${r.toFixed(3)} ${r2.toFixed(3)}`);
  return { iou: +iou.toFixed(3), corrDark: +r.toFixed(3), corrKL4: +r2.toFixed(3) };
});

await test('export-files', async () => {
  const { ctx, page } = await newPage('?i=e2e-exp&seed=3');
  await page.evaluate(() => { document.querySelector('[data-panel="p-export"]').click(); });
  const run = async (kind, setup) => {
    await page.evaluate(setup);
    const dl = page.waitForEvent('download', { timeout: 600000 });
    await page.evaluate(k => SSAV.runExport(k), kind);
    const d = await dl; const f = path.join(DL, d.suggestedFilename()); await d.saveAs(f);
    const st = await page.evaluate(() => window.__lastExport);
    assert(!st.error, kind + ': ' + st.error);
    return f;
  };
  const archL = () => { Object.assign(SSAV.cfg.exp, { format: 'archd', portrait: false, margin: 0.5, fit: 1, dpi: 150, border: true, label: true, x0: 100 }); };
  const archP = () => { Object.assign(SSAV.cfg.exp, { format: 'archd', portrait: true, margin: 0.5, fit: 1, dpi: 150, border: false, label: false, x0: 100 }); };
  const out = {};
  // SVG inch size
  let f = await run('svg', archL);
  let head = fs.readFileSync(f, 'utf8').slice(0, 400);
  assert(/width="36in" height="24in" viewBox="0 0 2592 1728"/.test(head), 'landscape SVG size: ' + head.slice(0, 200));
  assert(/_archD-landscape\.svg$/.test(f) && path.basename(f).startsWith('shanshui_3_'), 'file name ' + path.basename(f));
  out.svgL = path.basename(f);
  f = await run('svg', archP);
  head = fs.readFileSync(f, 'utf8').slice(0, 400);
  assert(/width="24in" height="36in" viewBox="0 0 1728 2592"/.test(head), 'portrait SVG size');
  // fit is independent of view zoom
  const g1 = await page.evaluate(() => { SSAV.cfg.zoom = 1; return SSAV.geom(); });
  const g2 = await page.evaluate(() => { SSAV.cfg.zoom = 1.7; return SSAV.geom(); });
  await page.evaluate(() => { SSAV.cfg.zoom = 1; });
  assert(Math.abs(g1.worldW - g2.worldW) < 1e-9 && Math.abs(g1.k - g2.k) < 1e-9, 'view zoom changed the Arch D frame');
  // PDF media box
  f = await run('pdf', archL);
  const pdf = fs.readFileSync(f, 'latin1');
  const mb = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf);
  assert(mb && Math.abs(+mb[1] - 2592) < 0.01 && Math.abs(+mb[2] - 1728) < 0.01, 'PDF MediaBox ' + (mb && mb[0]));
  out.pdf = { file: path.basename(f), mediaBox: mb[0], bytes: pdf.length };
  // PNG pixel size, 150 dpi landscape and portrait
  f = await run('png', archL);
  let png = PNG.sync.read(fs.readFileSync(f), { skipRescale: true });
  assert(png.width === 5400 && png.height === 3600, 'PNG 150 dpi ' + png.width + 'x' + png.height);
  f = await run('png', archP);
  png = PNG.sync.read(fs.readFileSync(f));
  assert(png.width === 3600 && png.height === 5400, 'PNG portrait ' + png.width + 'x' + png.height);
  // view exports
  f = await run('svg', () => { SSAV.cfg.exp.format = 'view'; });
  head = fs.readFileSync(f, 'utf8').slice(0, 400);
  assert(/width="1400" height="800" viewBox="0 0 1400 800"/.test(head), 'view SVG size: ' + head.slice(0, 160));
  f = await run('png', () => { SSAV.cfg.exp.format = 'view'; });
  png = PNG.sync.read(fs.readFileSync(f));
  assert(png.width === 2800 && png.height === 1600, 'view PNG 2x ' + png.width + 'x' + png.height);
  await ctx.close();
  return out;
});

await test('export-300dpi', async () => {
  const { ctx, page } = await newPage('?i=e2e-exp3&seed=3');
  await page.evaluate(() => Object.assign(SSAV.cfg.exp, { format: 'archd', portrait: false, margin: 0.5, fit: 1, dpi: 300, x0: 0 }));
  const dl = page.waitForEvent('download', { timeout: 600000 });
  const t0 = Date.now();
  await page.evaluate(() => SSAV.runExport('png'));
  const d = await dl; const f = path.join(DL, d.suggestedFilename()); await d.saveAs(f);
  const buf = fs.readFileSync(f);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);   // IHDR
  await ctx.close();
  assert(w === 10800 && h === 7200, 'PNG 300 dpi ' + w + 'x' + h);
  return { w, h, mb: +(buf.length / 1048576).toFixed(1), secs: (Date.now() - t0) / 1000 };
});

await test('blackout-any-state', async () => {
  const { ctx, page } = await newPage('?i=e2e-black&seed=5', { w: 960, h: 540 });
  await hideUI(page);
  const isBlack = async () => { await page.waitForTimeout(1200); const p = await pixels(page); return p.max < 6; };
  const off = async () => { await page.keyboard.press('b'); await page.waitForTimeout(1200); };
  const states = {
    paused: async () => {},
    playing: async () => { await page.keyboard.press('Space'); },
    reseeding: async () => { await page.keyboard.press('r'); },
    testcard: async () => { await page.keyboard.press('t'); },
    panic: async () => { await page.keyboard.down('Escape'); await page.waitForTimeout(1200); await page.keyboard.up('Escape'); },
    renderThrows: async () => { await page.evaluate(() => { SSAV.scene.renderer.draw = () => { throw new Error('test: render broken'); }; }); },
  };
  const done = [];
  for (const [name, enter] of Object.entries(states)) {
    await enter();
    await page.keyboard.press('b');
    assert(await isBlack(), 'not black in state ' + name);
    await off();
    done.push(name);
    if (name === 'testcard') await page.keyboard.press('t');
    if (name === 'panic') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  }
  await ctx.close();
  return done;
});

await test('fullscreen-non-blank', async () => {
  const { ctx, page } = await newPage('?i=e2e-full&seed=9', { head: true, w: 1280, h: 720 });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !!document.fullscreenElement || document.body.classList.contains('fullwin'), null, { timeout: 5000 });
  await page.waitForTimeout(4000);   // past the 3 s menu auto-hide
  const p = await pixels(page);
  const st = await page.evaluate(() => ({ fs: !!document.fullscreenElement, hidden: document.body.classList.contains('hide'), w: innerWidth, h: innerHeight, tiles: SSAV.scene.stats().tiles }));
  await page.keyboard.press('f');
  await ctx.close();
  assert(p.sd > 8 && p.max - p.min > 40, 'full screen looks blank: sd ' + p.sd.toFixed(1));
  assert(st.hidden, 'menu auto-hid');
  return { ...st, sd: +p.sd.toFixed(1) };
});

await test('output-mirrors', async () => {
  const { ctx, page } = await newPage('?i=e2e-out&seed=11', { head: true, w: 1280, h: 720 });
  const popP = ctx.waitForEvent('page');
  await page.keyboard.press('o');
  const out = await popP;
  watch(out);
  await out.setViewportSize({ width: 1280, height: 720 });
  await out.waitForFunction(() => window.SSOUT && SSOUT.msg && SSOUT.scene.stats().tiles >= 2, null, { timeout: 30000 });
  await page.waitForFunction(() => SSAV.outConnected, null, { timeout: 5000 });
  await page.evaluate(() => { SSAV.setPalette('kodama-lunar'); SSAV.pb.x = 400; });
  await page.waitForTimeout(2500);
  await hideUI(page);
  const a = await pixels(page), b = await pixels(out);
  const r = corr(downsample(a, 64, 36), downsample(b, 64, 36));
  const seeds = [await page.evaluate(() => SSAV.seed), await out.evaluate(() => SSOUT.msg.fs.worlds.at(-1).seed)];
  // output shows no UI
  const ui = await out.evaluate(() => document.querySelectorAll('button, input, #hud, #bar').length);
  // blackout mirrors
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  const ob = await pixels(out);
  await page.keyboard.press('b'); await page.waitForTimeout(300);
  // output writes no storage
  const writes = await out.evaluate(() => { let n = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { n++; return o.apply(this, arguments); }; return new Promise(r => setTimeout(() => r(n), 1500)); });
  await out.close(); await ctx.close();
  assert(seeds[0] === seeds[1], 'seed mismatch ' + seeds);
  assert(r > 0.9, 'output differs from controller, corr ' + r.toFixed(3));
  assert(ui === 0, 'output has UI elements');
  assert(ob.max < 6, 'output not black on blackout');
  assert(writes === 0, 'output wrote storage');
  return { corr: +r.toFixed(3), seed: seeds[0] };
});

await test('midi-learn', async () => {
  // fake MIDI input (no hardware): learn a CC for speed and a note for blackout, then drive them
  const b = await browser(false);
  const ctx = await b.newContext({ viewport: { width: 1400, height: 800 } });
  await ctx.addInitScript(() => {
    const input = { name: 'Fake nanoKONTROL', onmidimessage: null };
    window.__midi = d => input.onmidimessage && input.onmidimessage({ data: d });
    navigator.requestMIDIAccess = async () => ({ inputs: new Map([['fake', input]]), onstatechange: null });
  });
  const page = await ctx.newPage(); watch(page);
  await page.goto(BASE + '?i=e2e-midi&seed=5');
  await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2, null, { timeout: 30000 });
  const before = await page.evaluate(() => ({ midi: Object.keys(SSAV.cfg.midi).filter(k => k !== 'weather').length, weather: SSAV.cfg.midi.weather, access: !!SSAV.midi.access }));
  await page.click('[data-panel="p-show"]');
  await page.click('#m-enable');
  await page.waitForFunction(() => !!SSAV.midi.access);
  const dev = await page.textContent('#m-dev');
  await page.evaluate(() => { SSAV.midi.startLearn('speed'); __midi([0xb0, 7, 10]); SSAV.midi.startLearn('black'); __midi([0x91, 36, 100]); });
  const map = await page.evaluate(() => ({ ...SSAV.cfg.midi }));
  await page.evaluate(() => __midi([0xb0, 7, 127]));
  const fast = await page.evaluate(() => SSAV.cfg.speed);
  await page.evaluate(() => __midi([0xb0, 7, 0]));
  const slow = await page.evaluate(() => SSAV.cfg.speed);
  await page.evaluate(() => __midi([0x91, 36, 90]));
  const black = await page.evaluate(() => SSAV.flags.blackout);
  await page.evaluate(() => __midi([0x91, 36, 90]));
  const unblack = await page.evaluate(() => SSAV.flags.blackout);
  await ctx.close();
  assert(before.midi === 0 && !before.access, 'MIDI requested before Enable');
  assert(before.weather === 'cc:0:4', 'CC 4 drives the weather by default: ' + before.weather);
  assert(/Fake nanoKONTROL/.test(dev), 'device not listed: ' + dev);
  assert(map.speed === 'cc:0:7' && map.black === 'note:1:36', 'bindings ' + JSON.stringify(map));
  assert(fast === 2000 && slow === 0, 'speed ' + fast + ' ' + slow);
  assert(black && !unblack, 'blackout toggle ' + black + ' ' + unblack);
  return { map, fast, slow };
});

await test('long-travel-cull', async () => {
  const { ctx, page } = await newPage('?i=e2e-cull&seed=13', { w: 960, h: 540 });
  await page.evaluate(() => { SSAV.cfg.speed = 2000; SSAV.pb.speed = 2000; SSAV.pb.play(); });
  await page.waitForFunction(() => SSAV.x > 30000, null, { timeout: 120000 });
  const r = await page.evaluate(() => { const w = SSAV.world(); let mn = Infinity; for (const c of w.chunks.values()) mn = Math.min(mn, c.x); return { x: SSAV.x, minX: mn, chunks: w.chunks.size, culledBelow: w.culledBelow, fps: SSAV.scene.fps }; });
  assert(r.minX > r.x - 20000 - 4096, 'elements kept beyond the cap: min x ' + r.minX + ' at ' + r.x);
  // Stop past the cap restarts the seed at 0 with the original landscape
  await page.keyboard.press('Home');
  await page.waitForFunction(() => !SSAV.fading, null, { timeout: 20000 });
  const s = await page.evaluate(() => ({ x: SSAV.x, seed: SSAV.seed, playing: SSAV.playing }));
  await ctx.close();
  assert(Math.abs(s.x) < 1 && s.seed === '13' && !s.playing, 'stop after cap ' + JSON.stringify(s));
  return r;
});

// ---------------------------------------------------------------------------------------------
// v0.3.0: worlds. The derelict world, the world switch, weather, lights; shanshui unchanged.
const ready = () => {
  const w = SSAV.world(); if (!w || SSAV.fading || !SSAV.scene.lastFrame) return false;
  const v = SSAV.scene.lastFrame.v, k0 = Math.floor(SSAV.x / 512), k1 = Math.floor((SSAV.x + v.viewW) / 512);
  for (let k = k0; k <= k1; k++) { const t = w.tiles.get(k); if (!t || !t.tex || t.pending || t.dirty) return false; }
  return true;
};
const HEAVY = () => { SSAV.cfg.weather.mode = 'downpour'; Object.assign(SSAV.cfg.weather.holds, { rain: 1, wind: 0.8, water: 1, fog: 0.8, light: 0 }); };

await test('shanshui-unchanged', async () => {
  // the same frames from the v0.2.0 tag (served from a worktree) and from this build, compared pixel for pixel
  const V020 = (args.find(a => a.startsWith('--v020=')) || '--v020=http://localhost:8094/').slice(7);
  const b = await browser(false);
  const shots = [];
  for (const [seed, palette, x] of [['1', 'original', 0], ['1', 'dark', 2600], ['7', 'kl4-look', 900], ['7', 'gradient', 4000], ['shanshui', 'kodama-water', 1500]]) {
    const one = async base => {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage(); if (base === BASE) watch(page);
      await page.goto(`${base}?i=e2e-same-${seed}&seed=${seed}&palette=${palette}`);
      await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2, null, { timeout: 30000 });
      await page.evaluate(x => { document.body.classList.add('uihidden'); SSAV.pb.x = x; }, x);
      await page.waitForTimeout(500);
      await page.waitForFunction(ready, null, { timeout: 60000 });
      await page.waitForTimeout(400);
      const png = PNG.sync.read(await page.screenshot());
      await ctx.close();
      return png;
    };
    const a = await one(V020), c = await one(BASE);
    let maxd = 0, n = 0;
    for (let i = 0; i < a.data.length; i++) { const d = Math.abs(a.data[i] - c.data[i]); if (d) { n++; if (d > maxd) maxd = d; } }
    shots.push({ seed, palette, x, maxDiff: maxd, bytesDiffering: n });
  }
  const bad = shots.filter(s => s.maxDiff > 0);
  assert(!bad.length, 'differs from v0.2.0: ' + JSON.stringify(bad));
  return shots;
});

await test('world-switch', async () => {
  const { ctx, page } = await newPage('?i=e2e-world&seed=5', { w: 960, h: 540 });
  await page.evaluate(() => { try { localStorage.removeItem('shanshui-av:e2e-world'); } catch (e) {} });
  assert(await page.evaluate(() => SSAV.worldName) === 'shanshui', 'shanshui on first load');
  await hideUI(page);
  await page.keyboard.press('w');
  await page.waitForTimeout(150);
  const mid = await page.evaluate(() => ({ w: SSAV.worldName, fading: SSAV.fading, worlds: SSAV.frameState().worlds.map(x => x.world) }));
  assert(mid.w === 'derelict' && mid.fading && mid.worlds.join() === 'shanshui,derelict', 'crossfade shanshui to derelict ' + JSON.stringify(mid));
  await page.waitForFunction(() => !SSAV.fading, null, { timeout: 15000 });
  assert(page.url().includes('world=derelict') && page.url().includes('seed=5'), 'URL ' + page.url());
  await page.waitForFunction(ready, null, { timeout: 30000 });
  const d = await pixels(page);
  assert(d.sd > 4, 'derelict blank, sd ' + d.sd.toFixed(1));
  await page.keyboard.press('s');
  const st = await page.evaluate(() => SSAV.stars);
  assert(st.includes('derelict:5'), 'star remembers its world ' + st);
  await showUI(page); await page.click('#b-world button[data-v="shanshui"]'); await hideUI(page);
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => ({ w: SSAV.worldName, worlds: SSAV.frameState().worlds.map(x => x.world) }));
  assert(back.w === 'shanshui' && back.worlds.join() === 'derelict,shanshui', 'crossfade back ' + JSON.stringify(back));
  await page.waitForFunction(() => !SSAV.fading, null, { timeout: 15000 });
  assert(!page.url().includes('world='), 'URL back to shanshui ' + page.url());
  // history step returns to the derelict entry
  await page.keyboard.press('BracketLeft'); await page.waitForTimeout(150);
  const h = await page.evaluate(() => ({ w: SSAV.worldName, s: SSAV.seed, hist: SSAV.hist }));
  assert(h.w === 'derelict' && h.s === '5', 'history remembers its world ' + JSON.stringify(h));
  await page.waitForFunction(() => !SSAV.fading, null, { timeout: 15000 });
  // reload restores the world
  await page.goto(BASE + '?i=e2e-world');
  await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2);
  const r = await page.evaluate(() => ({ w: SSAV.worldName, s: SSAV.seed, playing: SSAV.playing }));
  await ctx.close();
  assert(r.w === 'derelict' && r.s === '5' && !r.playing, 'reload ' + JSON.stringify(r));
  return { mid, back, reload: r };
});

await test('derelict-determinism', async () => {
  // tiles at x 0, then 50,000 px away (the start is culled), then back: the same tile bytes
  const { ctx, page } = await newPage('?i=e2e-det&seed=21&world=derelict', { w: 960, h: 540 });
  const hashes = () => page.evaluate(() => { const w = SSAV.world(), v = SSAV.scene.lastFrame.v, o = {}; for (let k = Math.floor(SSAV.x / 512); k <= Math.floor((SSAV.x + v.viewW) / 512); k++) o[k] = w.tiles.get(k).hash; return o; });
  const at = async x => { await page.evaluate(x => { SSAV.pb.x = x; }, x); await page.waitForTimeout(300); await page.waitForFunction(ready, null, { timeout: 120000 }); await page.waitForTimeout(300); await page.waitForFunction(ready, null, { timeout: 60000 }); return hashes(); };
  const a0 = await at(0), a1 = await at(3000);
  for (let x = 5000; x <= 50000; x += 5000) await at(x);
  const far = await page.evaluate(() => { const w = SSAV.world(); let mn = Infinity; for (const c of w.chunks.values()) mn = Math.min(mn, c.x); return { minX: mn, xmin: w.xmin, chunks: w.chunks.size }; });
  assert(far.minX > 30000, 'start not culled at 50,000: ' + JSON.stringify(far));
  for (let x = 45000; x >= 5000; x -= 5000) await at(x);
  const b1 = await at(3000), b0 = await at(0);
  await ctx.close();
  const diff = [...Object.keys(a0).filter(k => a0[k] !== b0[k]), ...Object.keys(a1).filter(k => a1[k] !== b1[k])];
  assert(Object.keys(a0).length >= 3 && !diff.length, 'tiles differ after the round trip: ' + diff.join(',') + ' ' + JSON.stringify({ a0, b0 }));
  return { tiles: Object.keys(a0).length + Object.keys(a1).length, far };
});

await test('derelict-palettes-non-blank', async () => {
  const { ctx, page } = await newPage('?i=e2e-dpal&seed=1&world=derelict', { w: 960, h: 540 });
  await hideUI(page);
  await page.evaluate(() => { SSAV.pb.x = 1500; SSAV.cfg.weather.mode = 'dry'; SSAV.weather.p = 0; });
  await page.waitForFunction(ready, null, { timeout: 30000 });
  const ids = await page.evaluate(() => SSAV.palettes.palettes.map(p => p.id));
  const bad = [];
  for (const id of ids) {
    await page.evaluate(id => SSAV.setPalette(id), id);
    await page.waitForFunction(() => !SSAV.fading);
    await page.waitForTimeout(80);
    const p = await pixels(page);
    if (p.sd < 4 || p.max - p.min < 12) bad.push(id + ' sd ' + p.sd.toFixed(1));
  }
  await ctx.close();
  assert(!bad.length, 'blank on derelict: ' + bad.join(', '));
  return { palettes: ids.length };
});

await test('weather-cycle', async () => {
  const { ctx, page } = await newPage('?i=e2e-wx&seed=3&world=derelict', { w: 960, h: 540 });
  await page.evaluate(() => { SSAV.cfg.weather.mode = 'auto'; SSAV.cfg.weather.period = 10; SSAV.cfg.weather.holds = {}; SSAV.weather.p = 0; });
  const seen = new Set(); let maxRain = 0, maxWater = 0, minLight = 1;
  const t0 = Date.now();
  while (Date.now() - t0 < 12500) {
    const v = await page.evaluate(() => ({ ph: SSAV.weather.phase, ...SSAV.weather.values() }));
    seen.add(v.ph); maxRain = Math.max(maxRain, v.rain); maxWater = Math.max(maxWater, v.water); minLight = Math.min(minLight, v.light);
    await page.waitForTimeout(150);
  }
  // pinned phase and a held slider
  await page.evaluate(() => { SSAV.cfg.weather.mode = 'flood'; });
  await page.waitForTimeout(5000);
  const pinned = await page.evaluate(() => ({ ph: SSAV.weather.phase, water: SSAV.weather.values().water }));
  await page.evaluate(() => { SSAV.cfg.weather.holds.rain = 0.9; });
  await page.waitForTimeout(2500);
  const held = await page.evaluate(() => SSAV.weather.values().rain);
  await ctx.close();
  assert(['dry', 'drizzle', 'downpour', 'flood', 'night'].every(p => seen.has(p)), 'phases seen ' + [...seen]);
  assert(maxRain > 0.9 && maxWater > 0.95 && minLight < 0.05, 'extremes ' + JSON.stringify({ maxRain, maxWater, minLight }));
  assert(pinned.ph === 'flood' && pinned.water > 0.95, 'pinned flood ' + JSON.stringify(pinned));
  assert(Math.abs(held - 0.9) < 0.02, 'held rain ' + held);
  return { phases: [...seen], maxRain: +maxRain.toFixed(2), maxWater: +maxWater.toFixed(2), minLight: +minLight.toFixed(2) };
});

await test('lights-at-night', async () => {
  const { ctx, page } = await newPage('?i=e2e-lights&seed=7&world=derelict&palette=derelict-rust', { w: 1280, h: 720 });
  await hideUI(page);
  // sodium light #FF9F3A: count warm bright pixels by day and by night
  const warm = async () => { const png = PNG.sync.read(await page.screenshot()); let n = 0; for (let i = 0; i < png.data.length; i += 4) { const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]; if (r > 200 && r - b > 110 && g > 80) n++; } return n; };
  await page.evaluate(() => { SSAV.pb.x = 1200; SSAV.cfg.weather.mode = 'dry'; SSAV.weather.p = 0; SSAV.cfg.weather.holds = { rain: 0, fog: 0.2, light: 1 }; });
  await page.waitForFunction(ready, null, { timeout: 30000 }); await page.waitForTimeout(1500);
  const day = await warm();
  await page.evaluate(() => { SSAV.cfg.weather.holds = { rain: 0, fog: 0.2, light: 0 }; });
  await page.waitForTimeout(2500);
  const night = await warm();
  await ctx.close();
  assert(night > 150 && night > day * 5, `lights at night: ${night} warm pixels, by day ${day}`);
  return { day, night };
});

await test('derelict-export', async () => {
  const { ctx, page } = await newPage('?i=e2e-dexp&seed=4&world=derelict&palette=derelict-rain', { w: 1400, h: 800 });
  await page.evaluate(() => { SSAV.cfg.weather.mode = 'night'; SSAV.weather.p = 0.8; SSAV.cfg.weather.holds = {}; });
  await page.waitForTimeout(2500);
  const run = async (kind, setup) => {
    await page.evaluate(setup);
    const dl = page.waitForEvent('download', { timeout: 600000 });
    await page.evaluate(k => SSAV.runExport(k), kind);
    const d = await dl; const f = path.join(DL, d.suggestedFilename()); await d.saveAs(f);
    const st = await page.evaluate(() => window.__lastExport);
    assert(!st.error, kind + ': ' + st.error);
    return f;
  };
  const arch = (rain, lights) => `Object.assign(SSAV.cfg.exp, { format: 'archd', portrait: false, margin: 0.5, fit: 1, dpi: 150, x0: 2000, rain: ${rain}, lights: ${lights} })`;
  let f = await run('svg', arch(false, true));
  const svg = fs.readFileSync(f, 'utf8');
  assert(/width="36in" height="24in" viewBox="0 0 2592 1728"/.test(svg.slice(0, 400)), 'Arch D SVG size');
  assert(path.basename(f).startsWith('derelict_4_derelict-rain_2000_archD-landscape'), 'file name ' + path.basename(f));
  const circles = (svg.match(/<circle [^>]*fill='#3FD0C0'/g) || []).length;
  assert(circles > 20, 'lights as accent circles: ' + circles);
  assert(!/data-l=/.test(svg), 'raw light elements left in SVG');
  assert(/<rect x="[\d.-]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#/.test(svg), 'water plane');
  assert(!/stroke-opacity="0.45" stroke-width="0.5"/.test(svg), 'rain off by default');
  f = await run('svg', arch(true, false));
  const svg2 = fs.readFileSync(f, 'utf8');
  assert(!/<circle /.test(svg2), 'lights off');
  f = await run('pdf', arch(false, true));
  const pdf = fs.readFileSync(f, 'latin1');
  const mb = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf);
  assert(mb && Math.abs(+mb[1] - 2592) < 0.01 && Math.abs(+mb[2] - 1728) < 0.01, 'PDF MediaBox ' + (mb && mb[0]));
  f = await run('png', arch(true, true));
  const png = PNG.sync.read(fs.readFileSync(f));
  assert(png.width === 5400 && png.height === 3600, 'PNG 150 dpi ' + png.width + 'x' + png.height);
  // glow: teal-bright pixels exist in the PNG at night
  let teal = 0; for (let i = 0; i < png.data.length; i += 16) { const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]; if (g > 150 && b > 140 && r < g - 50) teal++; }
  await ctx.close();
  assert(teal > 50, 'no glow in PNG: ' + teal);
  return { circles, pdf: mb[0], png: [png.width, png.height], teal };
});

await test('derelict-blackout-panic', async () => {
  const { ctx, page } = await newPage('?i=e2e-dblack&seed=6&world=derelict', { w: 960, h: 540 });
  await hideUI(page);
  await page.evaluate(HEAVY);
  await page.keyboard.press('Space');
  await page.waitForTimeout(3500);
  const heavy = await page.evaluate(() => SSAV.weather.values());
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  const blk = await pixels(page);
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  await page.keyboard.down('Escape'); await page.waitForTimeout(1300); await page.keyboard.up('Escape');
  await page.waitForTimeout(500);
  const pan = await page.evaluate(() => ({ panic: SSAV.flags.panic, playing: SSAV.playing }));
  const still = await pixels(page);
  // blackout from panic, and while rendering throws
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  const blk2 = await pixels(page);
  await page.keyboard.press('b'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => { SSAV.scene.renderer.draw = () => { throw new Error('test: render broken'); }; });
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  const blk3 = await pixels(page);
  await ctx.close();
  assert(heavy.rain > 0.95 && heavy.water > 0.95 && heavy.light < 0.05, 'heaviest weather ' + JSON.stringify(heavy));
  assert(blk.max < 6 && blk2.max < 6 && blk3.max < 6, 'blackout not black ' + [blk.max, blk2.max, blk3.max]);
  assert(pan.panic && !pan.playing && still.sd > 3, 'panic still ' + JSON.stringify(pan) + ' sd ' + still.sd.toFixed(1));
  return { stillSd: +still.sd.toFixed(1) };
});

await test('derelict-output-fullscreen', async () => {
  const { ctx, page } = await newPage('?i=e2e-dout&seed=8&world=derelict&palette=arc-21', { head: true, w: 1280, h: 720 });
  await page.evaluate(HEAVY);
  const popP = ctx.waitForEvent('page');
  await page.keyboard.press('o');
  const out = await popP;
  watch(out);
  await out.setViewportSize({ width: 1280, height: 720 });
  await out.waitForFunction(() => window.SSOUT && SSOUT.msg && SSOUT.scene.stats().tiles >= 2, null, { timeout: 30000 });
  // rain streaks animate per frame, so the mirror compare holds rain at 0 (flood and night stay)
  await page.evaluate(() => { SSAV.pb.x = 900; SSAV.cfg.weather.holds.rain = 0; });
  await page.waitForTimeout(3000);
  await hideUI(page);
  const a = await pixels(page), b = await pixels(out);
  await page.evaluate(() => { SSAV.cfg.weather.holds.rain = 1; });
  const r = corr(downsample(a, 64, 36), downsample(b, 64, 36));
  const ow = await out.evaluate(() => SSOUT.msg.fs.worlds.at(-1).world);
  // blackout and panic reach the output
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  const ob = await pixels(out);
  await page.keyboard.press('b'); await page.waitForTimeout(1300);
  await out.close();
  // full screen on the controller, heaviest weather
  await page.keyboard.press('f');
  await page.waitForFunction(() => !!document.fullscreenElement || document.body.classList.contains('fullwin'), null, { timeout: 5000 });
  await page.waitForTimeout(4000);
  const fsp = await pixels(page);
  await page.keyboard.press('f');
  await ctx.close();
  assert(ow === 'derelict', 'output world ' + ow);
  assert(r > 0.85, 'output differs from controller, corr ' + r.toFixed(3));
  assert(ob.max < 6, 'output not black');
  assert(fsp.sd > 4, 'full screen blank, sd ' + fsp.sd.toFixed(1));
  return { corr: +r.toFixed(3), fullscreenSd: +fsp.sd.toFixed(1) };
});

for (const b of [headless, headed]) if (b) await b.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.writeFileSync(path.join(ROOT, 'test-results', 'e2e.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
