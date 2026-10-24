// Soak: N minutes of playback at high speed with an output window, auto reseed and palette cycling,
// on the real GPU. Samples every 30 s: fps (controller and output), JS heap after forced GC, DOM
// nodes, element and tile counts, worlds, watchdog events.
//   node tools/serve.mjs --port 8093 &   then   node tools/soak.mjs [minutes=30] [http://localhost:8093/] [--speed=1500] [--every=2] [--palevery=1] [--headed]
// Pass: no console errors, no reloads, no context loss, fps (1 s average) min >= 45 and mean >= 58, heap growth first third to last third < 8 MB,
// DOM nodes flat, elements and tiles bounded. Writes test-results/soak.json.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const MIN = Number(args.find(a => /^\d+(\.\d+)?$/.test(a)) || 30);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const SPEED = Number((args.find(a => a.startsWith('--speed=')) || '--speed=1500').slice(8));
const headed = args.includes('--headed');
const opt = (k, d) => Number((args.find(a => a.startsWith('--' + k + '=')) || '=' + d).split('=')[1]);
const EVERY = opt('every', 2), PAL_EVERY = opt('palevery', 1);

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const problems = [];
const watch = (p, tag) => {
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push({ t: Date.now(), tag, text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => problems.push({ t: Date.now(), tag, text: 'pageerror: ' + e.message }));
};
watch(page, 'controller');
await page.goto(BASE + '?i=soak&seed=2026');
await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2);
// output window
const popP = ctx.waitForEvent('page');
await page.keyboard.press('o');
const out = await popP;
watch(out, 'output');
await out.setViewportSize({ width: 1920, height: 1080 });
await out.waitForFunction(() => window.SSOUT && SSOUT.msg);
// a reload wipes these markers (counting load events is racy for the popup's first load)
for (const p of [page, out]) await p.evaluate(() => { window.__soakMark = 1; });
// show mode: high speed, reseed every 2 min, palette every 1 min
await page.evaluate(o => {
  Object.assign(SSAV.cfg.show, { auto: true, mode: 'min', every: o.every, autoPal: true, palEvery: o.palEvery });
  SSAV.resetAuto(); SSAV.resetAutoPal();
  SSAV.cfg.speed = o.speed; SSAV.pb.speed = o.speed; SSAV.pb.play();
}, { speed: SPEED, every: EVERY, palEvery: PAL_EVERY });
const cdp = await ctx.newCDPSession(page);
const cdpOut = await ctx.newCDPSession(out);
async function heap(c) { await c.send('HeapProfiler.collectGarbage'); return (await c.send('Runtime.getHeapUsage')).usedSize / 1048576; }
const gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); });
console.log(`soak: ${MIN} min at ${SPEED} px/s, reseed ${EVERY} min, palette ${PAL_EVERY} min, output 1920 x 1080, ${headed ? 'headed' : 'headless'}, ${gpu}`);
const samples = [];
const t0 = Date.now();
let fpsMinC = 999, fpsMinO = 999;
const dips = [];   // every 1 s sample under 50 fps, with what was happening
while (Date.now() - t0 < MIN * 60000) {
  for (let k = 0; k < 30; k++) {
    await page.waitForTimeout(1000);
    const f = await page.evaluate(() => [SSAV.scene.fps, SSAV.fading, SSAV.seed, SSAV.palette]);
    const fo = await out.evaluate(() => SSOUT.scene.fps);
    if (Date.now() - t0 > 10000 && Math.min(f[0], fo) < 50) dips.push({ s: Math.round((Date.now() - t0) / 1000), fps: +f[0].toFixed(1), outFps: +fo.toFixed(1), fading: f[1], seed: f[2], pal: f[3] });
    // ignore the first 10 s (warm-up)
    if (Date.now() - t0 > 10000) { fpsMinC = Math.min(fpsMinC, f[0]); fpsMinO = Math.min(fpsMinO, fo); }
  }
  const c = await page.evaluate(() => ({ x: SSAV.x, seed: SSAV.seed, pal: SSAV.palette, fps: SSAV.scene.fps, ...SSAV.scene.stats(), dom: document.getElementsByTagName('*').length, watch: SSAV.scene.watch.events, lost: SSAV.scene.renderer.lost, log: document.querySelectorAll('#log li.error').length }));
  const o = await out.evaluate(() => ({ fps: SSOUT.scene.fps, ...SSOUT.scene.stats(), dom: document.getElementsByTagName('*').length, watch: SSOUT.scene.watch.events, lost: SSOUT.scene.renderer.lost }));
  const row = {
    min: +((Date.now() - t0) / 60000).toFixed(2), x: Math.round(c.x), seed: c.seed, pal: c.pal,
    fps: +c.fps.toFixed(1), outFps: +o.fps.toFixed(1), heapMB: +(await heap(cdp)).toFixed(2), outHeapMB: +(await heap(cdpOut)).toFixed(2),
    dom: c.dom, outDom: o.dom, chunks: c.chunks, tiles: c.tiles, worlds: c.worlds, outChunks: o.chunks, outTiles: o.tiles,
    watch: c.watch + o.watch, lost: c.lost || o.lost, logErrors: c.log, genMs: +c.genMs.toFixed(1),
  };
  samples.push(row);
  console.log(JSON.stringify(row));
}
const marks = [await page.evaluate(() => window.__soakMark === 1), await out.evaluate(() => window.__soakMark === 1)];
await browser.close();
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const third = Math.max(1, Math.floor(samples.length / 3));
const growth = key => +(avg(samples.slice(-third).map(s => s[key])) - avg(samples.slice(0, third).map(s => s[key]))).toFixed(2);
const max = key => Math.max(...samples.map(s => s[key]));
const summary = {
  base: BASE, minutes: MIN, speed: SPEED, gpu, headed, samples: samples.length,
  distance: samples.at(-1).x, seeds: new Set(samples.map(s => s.seed)).size, palettes: new Set(samples.map(s => s.pal)).size,
  fpsMin: +fpsMinC.toFixed(1), outFpsMin: +fpsMinO.toFixed(1), fpsAvg: +avg(samples.map(s => s.fps)).toFixed(1), outFpsAvg: +avg(samples.map(s => s.outFps)).toFixed(1),
  heapStartMB: samples[0].heapMB, heapEndMB: samples.at(-1).heapMB, heapGrowthMB: growth('heapMB'), outHeapGrowthMB: growth('outHeapMB'),
  domMin: Math.min(...samples.map(s => s.dom)), domMax: max('dom'), outDomMax: max('outDom'),
  chunksMax: max('chunks'), tilesMax: max('tiles'), outChunksMax: max('outChunks'), worldsMax: max('worlds'),
  watchdogEvents: samples.at(-1).watch, contextLost: samples.some(s => s.lost), reloads: marks[0] ? 0 : 1, outReloads: marks[1] ? 0 : 1, dips: dips.length, consoleProblems: problems.length,
};
summary.pass = summary.consoleProblems === 0 && summary.reloads === 0 && summary.outReloads === 0 && !summary.contextLost &&
  summary.fpsMin >= 45 && summary.outFpsMin >= 45 && summary.fpsAvg >= 58 && summary.heapGrowthMB < 8 && summary.outHeapGrowthMB < 8 &&
  summary.domMax - summary.domMin < 60 && summary.chunksMax < 2500 && summary.tilesMax < 40;
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync(path.join('test-results', 'soak.json'), JSON.stringify({ summary, samples, dips, problems }, null, 1));
console.log('\nSUMMARY', JSON.stringify(summary, null, 1));
if (dips.length) console.log('dips:', JSON.stringify(dips));
if (problems.length) console.log('problems:', problems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
