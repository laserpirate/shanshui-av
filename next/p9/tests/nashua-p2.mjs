// P2 tests on the real GPU: modes, the existing-to-design morph, the live section, slit-scan and time-smear.
//   node tests/nashua-p2.mjs [http://localhost:8096/] [--p1=http://localhost:8093/] [--only=name,name]
// The morph test needs the local design pack (data/local/nashua/design/, never published).
// Writes test-results/nashua-p2.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8096/';
const P1 = (args.find(a => a.startsWith('--p1=')) || '--p1=http://localhost:8093/').slice(5);
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const OUT = path.join(ROOT, 'test-results', 'nashua-p2');
fs.mkdirSync(OUT, { recursive: true });

const results = [], consoleProblems = [];
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1300,860', '--autoplay-policy=no-user-gesture-required'] });
function watch(page) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: page.url(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', e => consoleProblems.push({ url: page.url(), text: 'pageerror: ' + e.message }));
}
async function newPage(base, url, { w = 1280, h = 720, mine = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
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
const LOOK = () => { document.body.classList.add('uihidden'); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: 1, wind: 0.2 }; SSAV.pb.pause(); SSAV.pb.k = 0; };
const goS = (page, s) => page.evaluate(s => { const P = SSAV.world().pack, b = SSAV.opts.bank; SSAV.pb.x = (b === 'R' ? P.route_len_m - s : s) * 2 - SSAV.viewW() / 2; }, s);
const hashes = page => page.evaluate(() => { const w = SSAV.world(), v = SSAV.scene.lastFrame.v, o = {}; for (let k = Math.floor(SSAV.x / 512); k <= Math.floor((SSAV.x + v.viewW) / 512); k++) o[k] = w.tiles.get(k).hash; return o; });
const shot = async (page, name) => { const b = await page.screenshot(); if (name) fs.writeFileSync(path.join(OUT, name + '.png'), b); return PNG.sync.read(b); };
const lum = png => { const l = new Float32Array(png.width * png.height); for (let i = 0, k = 0; i < png.data.length; i += 4, k++) l[k] = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; return l; };
const diff = (a, b) => { const A = lum(a), B = lum(b); let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
const sd = png => { const L = lum(png); let s = 0, s2 = 0; for (const v of L) { s += v; s2 += v * v; } const m = s / L.length; return Math.sqrt(s2 / L.length - m * m); };

// ---------------------------------------------------------------------------------------------
await test('modes-built-equals-p1', async () => {
  // splitting each depth layer into pieces by mode layer must not change a pixel: built (every existing layer) = P1
  const at = async (base, mine) => { const { ctx, page } = await newPage(base, '?i=p2-same&seed=1&world=nashua&palette=original', { mine }); await page.evaluate(LOOK); const out = {}; for (const s of [300, 870, 1706]) { await goS(page, s); await settle(page); out[s] = await hashes(page); } await ctx.close(); return out; };
  const a = await at(P1, false), b = await at(BASE, true);
  const bad = []; let n = 0;
  for (const s in a) for (const k in a[s]) { n++; if (a[s][k] !== b[s][k]) bad.push(s + ':' + k); }
  assert(n >= 6 && !bad.length, 'tiles differ from P1: ' + bad.join(','));
  return { tiles: n };
});

await test('modes-switch', async () => {
  const { ctx, page } = await newPage(BASE, '?i=p2-modes&seed=1&world=nashua&palette=original');
  await page.evaluate(LOOK); await goS(page, 1260); await settle(page);
  await page.evaluate(() => { window.__mark = 1; });
  const key0 = await page.evaluate(() => SSAV.key);
  const built = await hashes(page), builtPng = await shot(page, 'mode-built');
  await page.keyboard.press('m'); await page.waitForTimeout(200); await settle(page);   // built -> design
  await page.evaluate(() => SSAV.setMode('nature')); await page.waitForTimeout(200); await settle(page);
  const nature = await hashes(page), naturePng = await shot(page, 'mode-nature');
  const st = await page.evaluate(() => ({ mode: SSAV.cfg.nashua.mode, key: SSAV.key, mark: window.__mark, hidden: [...(SSAV.world().hidden || [])] }));
  await page.evaluate(() => SSAV.setMode('built')); await page.waitForTimeout(200); await settle(page);
  const back = await hashes(page);
  await ctx.close();
  const changed = Object.keys(built).filter(k => built[k] !== nature[k]).length, restored = Object.keys(built).every(k => built[k] === back[k]);
  assert(st.mode === 'nature' && st.key === key0 && st.mark === 1, 'mode switch reloaded or regenerated: ' + JSON.stringify(st));
  assert(st.hidden.includes('buildings') && st.hidden.includes('cso'), 'nature should hide buildings and cso: ' + st.hidden);
  assert(changed > 0, 'nature mode drew the same tiles as built');
  assert(restored, 'back to built did not restore the tiles');
  return { changedTiles: changed, meanDiff: +diff(builtPng, naturePng).toFixed(2), hidden: st.hidden };
});

await test('morph', async () => {
  const { ctx, page } = await newPage(BASE, '?i=p2-morph&seed=1&world=nashua');
  await page.evaluate(LOOK); await goS(page, 1260); await settle(page);
  const a = await shot(page, 'morph-0');
  const labels = await page.evaluate(() => [...document.querySelectorAll('.morph-ends span')].map(s => s.textContent));
  await page.evaluate(() => SSAV.setMorph(1));
  await page.waitForFunction(() => SSAV.opts && SSAV.opts.morph === 1 && !SSAV.fading && SSAV.world().pack, null, { timeout: 30000 }); await settle(page);
  const b = await shot(page, 'morph-1');
  const info = await page.evaluate(() => ({ hash: SSAV.world().pack.hash, missing: SSAV.world().designMissing, facts: document.getElementById('hud-facts').textContent }));
  await page.evaluate(() => SSAV.setMorph(0.5));
  await page.waitForFunction(() => SSAV.opts && SSAV.opts.morph === 0.5 && !SSAV.fading, null, { timeout: 30000 }); await settle(page);
  const mid = await page.evaluate(() => document.getElementById('hud-facts').textContent);
  await page.evaluate(() => SSAV.setMorph(0));
  await page.waitForFunction(() => SSAV.opts && !SSAV.opts.morph && !SSAV.fading, null, { timeout: 30000 });
  await ctx.close();
  assert(labels[0] === 'Existing Grade (before landform)' && labels[1] === 'Landform Sequence (after landform)', 'labels: ' + JSON.stringify(labels));
  assert(!info.missing && /@1\.000$/.test(info.hash), 'design pack not used: ' + JSON.stringify(info));
  assert(/Landform Sequence \(after landform\)/.test(info.facts) && /50%/.test(mid), 'fact line: ' + info.facts + ' | ' + mid);
  const d = diff(a, b);
  assert(d > 1, 'morph 1 looks like morph 0, mean diff ' + d.toFixed(2));
  return { meanDiff: +d.toFixed(2), hash: info.hash, labels };
});

await test('morph-missing-pack', async () => {
  // on a host without the design pack (the preview), the morph stays at the existing grade and says so once
  const { ctx, page } = await newPage(BASE, '?i=p2-nomorph&seed=1&world=nashua');
  await page.route('**/data/local/**', r => r.fulfill({ status: 404, body: '' }));
  await page.evaluate(LOOK);
  await page.evaluate(() => SSAV.setMorph(1));
  await page.waitForFunction(() => SSAV.opts && SSAV.opts.morph === 1 && !SSAV.fading && SSAV.world().pack, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({ missing: SSAV.world().designMissing, hash: SSAV.world().pack.hash, facts: document.getElementById('hud-facts').textContent }));
  await ctx.close();
  // the 404 is expected here; drop it from the console tally
  for (let i = consoleProblems.length - 1; i >= 0; i--) if (/p2-nomorph/.test(consoleProblems[i].url) && /404|Failed to load resource/.test(consoleProblems[i].text)) consoleProblems.splice(i, 1);
  assert(info.missing === true && !/>/.test(info.hash), 'should fall back to the existing pack: ' + JSON.stringify(info));
  assert(/design pack not loaded/.test(info.facts), 'fact line: ' + info.facts);
  return info;
});

await test('live-section', async () => {
  const { ctx, page } = await newPage(BASE, '?i=p2-sec&seed=1&world=nashua');
  await page.evaluate(LOOK); await goS(page, 870); await settle(page);
  const off = await page.evaluate(() => ({ sec: document.getElementById('section').hidden, line: document.getElementById('playhead').hidden }));
  await page.keyboard.press('x'); await page.waitForTimeout(500);
  const on = await page.evaluate(() => { const c = document.getElementById('section'); const r = c.getBoundingClientRect(); return { sec: c.hidden, line: document.getElementById('playhead').hidden, w: r.width, h: r.height, x: r.x, y: r.y }; });
  const png = await shot(page, 'section-870');
  // the inset is not blank: its pixels vary
  let s = 0, s2 = 0, n = 0;
  for (let y = Math.round(on.y); y < Math.round(on.y + on.h); y++) for (let x = Math.round(on.x); x < Math.round(on.x + on.w); x++) { const i = (y * png.width + x) * 4, l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; s += l; s2 += l * l; n++; }
  const insetSd = Math.sqrt(s2 / n - (s / n) ** 2);
  await page.evaluate(() => SSAV.setLevel(4)); await page.waitForTimeout(2500);
  const flood = await shot(page);
  let d = 0; for (let y = Math.round(on.y); y < Math.round(on.y + on.h); y++) for (let x = Math.round(on.x); x < Math.round(on.x + on.w); x++) { const i = (y * png.width + x) * 4; d += Math.abs(png.data[i + 2] - flood.data[i + 2]); }
  d /= n;
  await page.keyboard.press('x'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.getElementById('section').hidden);
  await ctx.close();
  assert(off.sec && off.line, 'section should start hidden');
  assert(!on.sec && !on.line && on.w >= 380, 'section not shown: ' + JSON.stringify(on));
  assert(insetSd > 15, 'inset looks blank, sd ' + insetSd.toFixed(1));
  assert(d > 2, 'the 1936 level did not change the inset, diff ' + d.toFixed(2));
  assert(after, 'X did not hide the section');
  return { inset: on, insetSd: +insetSd.toFixed(1), levelDiff: +d.toFixed(2) };
});

await test('fx-modes', async () => {
  // each mode changes the frame, is not blank, holds 1080p fps, and freeze stops it; console clean
  const { ctx, page } = await newPage(BASE, '?i=p2-fx&seed=1&world=nashua', { w: 1920, h: 1080 });
  await page.evaluate(LOOK); await goS(page, 600); await settle(page);
  await page.evaluate(() => { SSAV.cfg.speed = 300; SSAV.pb.speed = 300; SSAV.pb.play(); });
  await page.waitForTimeout(1500);
  const base = await shot(page, 'fx-off');
  const out = {};
  for (const mode of ['strip', 'smear', 'displace']) {
    await page.evaluate(m => { Object.assign(SSAV.cfg.fx, { mode: m, freeze: false, mix: 1, depth: 64, slope: 1, width: 3, slit: 0.5, dir: 1, axis: 'x', source: 'scroll' }); }, mode);
    await page.waitForTimeout(3500);
    const fps = await page.evaluate(() => new Promise(done => { let n = 0; const t0 = performance.now(); const f = now => { n++; if (now - t0 < 3000) requestAnimationFrame(f); else done(n * 1000 / (now - t0)); }; requestAnimationFrame(f); }));
    const a = await shot(page, 'fx-' + mode);
    await page.evaluate(() => { SSAV.cfg.fx.freeze = true; });
    await page.waitForTimeout(300);
    const f1 = await shot(page); await page.waitForTimeout(600); const f2 = await shot(page);
    await page.evaluate(() => { SSAV.cfg.fx.freeze = false; });
    out[mode] = { fps: +fps.toFixed(1), sd: +sd(a).toFixed(1), vsOff: +diff(a, base).toFixed(2), frozenDiff: +diff(f1, f2).toFixed(3) };
  }
  await page.evaluate(() => { SSAV.cfg.fx.mode = 'off'; SSAV.pb.pause(); });
  await ctx.close();
  for (const [m, r] of Object.entries(out)) {
    assert(r.sd > 8, m + ' blank: ' + JSON.stringify(r));
    assert(r.vsOff > 2, m + ' did not change the frame: ' + JSON.stringify(r));
    assert(r.fps >= 55, m + ' fps ' + r.fps);
  }
  // strip at mix 1 is all history: frozen means still. smear and displace show the live frame too, so not checked.
  assert(out.strip.frozenDiff < 0.05, 'strip still moving while frozen: ' + out.strip.frozenDiff);
  return out;
});

await test('fx-video-source', async () => {
  // a video made in the page (canvas stream, 2 s) dropped in as the source; the frame follows the video
  const { ctx, page } = await newPage(BASE, '?i=p2-vid&seed=1&world=nashua');
  await page.evaluate(LOOK); await settle(page);
  const made = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }), parts = [];
    rec.ondataavailable = e => parts.push(e.data);
    rec.start();
    const t0 = performance.now();
    await new Promise(done => { const f = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#000'; g.fillRect(0, 0, 320, 180); g.fillStyle = '#9FC8F0'; g.fillRect(((t * 160) % 360) - 40, 0, 40, 180); if (t < 2) requestAnimationFrame(f); else done(); }; f(); });
    rec.stop(); await new Promise(r => rec.onstop = r);
    const file = new File(parts, 'test-bar.webm', { type: 'video/webm' });
    SSAV.fxUseVideo(URL.createObjectURL(file), file.name, file);
    Object.assign(SSAV.cfg.fx, { mode: 'strip', mix: 1, width: 4, slit: 0.5, dir: 1, freeze: false });
    return file.size;
  });
  await page.waitForTimeout(4000);
  const a = await shot(page, 'fx-video-strip');
  const src = await page.evaluate(() => ({ source: SSAV.cfg.fx.source, label: document.getElementById('f-video').textContent }));
  await page.evaluate(() => { SSAV.cfg.fx.mode = 'off'; SSAV.cfg.fx.source = 'scroll'; });
  await ctx.close();
  // the strip of a moving bar over black: a mix of near-black and blue columns
  const L = lum(a); let dark = 0, light = 0; for (let i = 0; i < L.length; i += 7) { if (L[i] < 30) dark++; else if (L[i] > 120) light++; }
  assert(made > 1000 && src.source === 'video', 'video not used: ' + JSON.stringify({ made, src }));
  assert(dark > 1000 && light > 1000, 'the strip does not show the video bar: ' + JSON.stringify({ dark, light }));
  return { bytes: made, dark, light };
});

await test('fx-output-follows', async () => {
  const { ctx, page } = await newPage(BASE, '?i=p2-out&seed=1&world=nashua');
  await page.evaluate(LOOK); await settle(page);
  const popP = ctx.waitForEvent('page');
  await page.keyboard.press('o');
  const out = await popP; watch(out);
  await out.setViewportSize({ width: 1280, height: 720 });
  await out.waitForFunction(() => window.SSOUT && SSOUT.msg, null, { timeout: 20000 });
  await page.evaluate(() => { SSAV.cfg.speed = 300; SSAV.pb.speed = 300; SSAV.pb.play(); });
  await page.waitForTimeout(2500);
  const o0 = PNG.sync.read(await out.screenshot());
  await page.evaluate(() => Object.assign(SSAV.cfg.fx, { mode: 'displace', mix: 1, depth: 96, slope: 1, axis: 'x', source: 'scroll' }));
  await page.waitForTimeout(3500);
  const o1 = PNG.sync.read(await out.screenshot());
  const asked = await out.evaluate(() => typeof navigator.mediaDevices !== 'undefined' && !!window.__askedCam);
  await page.evaluate(() => { SSAV.cfg.fx.mode = 'off'; SSAV.pb.pause(); });
  await out.close(); await ctx.close();
  const d = diff(o0, o1);
  assert(d > 2, 'output did not follow the effect, diff ' + d.toFixed(2));
  assert(!asked, 'the output asked for a camera');
  return { meanDiff: +d.toFixed(2) };
});

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.writeFileSync(path.join(ROOT, 'test-results', 'nashua-p2.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
