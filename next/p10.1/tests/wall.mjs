// P3 wall on one machine, real GPU: two output nodes of a 2 x 1 wall share an overlap band; with the blend turned off
// the band must be the same picture on both. Then clock mode (no network), the LAN relay with its ping clock,
// the keystone corners, the blend energy sum and the calibration card.
//   node tests/wall.mjs [http://localhost:8096/]
// Writes test-results/wall.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8096/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const OUT = path.join(ROOT, 'test-results', 'wall');
fs.mkdirSync(OUT, { recursive: true });
const W = 960, H = 540, OV = 64;

const results = [], consoleProblems = [];
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1000,640'] });
// the relay-kill test stops its relay on purpose: the browser's own connection errors to that port are expected
const KILL_PORT = 8199, EXPECTED = new RegExp(`WebSocket connection to 'ws://127\\.0\\.0\\.1:${KILL_PORT}/' failed`);
function watch(page) {
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !EXPECTED.test(m.text())) consoleProblems.push({ url: page.url(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', e => consoleProblems.push({ url: page.url(), text: 'pageerror: ' + e.message }));
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 400) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
async function page(ctx, url) { const p = await ctx.newPage(); watch(p); await p.goto(BASE + url); return p; }
const tilesUp = p => p.waitForFunction(() => window.SSOUT && SSOUT.scene.lastFrame && SSOUT.scene.stats().tiles >= 1, null, { timeout: 60000 });
// mean absolute difference over a column band [ax, ax + w) of a and [bx, bx + w) of b
function bandDiff(a, ax, b, bx, w) {
  let s = 0, n = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < w; x++) {
    const i = (y * a.width + ax + x) * 4, j = (y * b.width + bx + x) * 4;
    for (let k = 0; k < 3; k++) s += Math.abs(a.data[i + k] - b.data[j + k]);
    n += 3;
  }
  return s / n;
}
function spread(png) { let lo = 255, hi = 0; for (let i = 0; i < png.data.length; i += 4) { const v = png.data[i + 1]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; }
const shot = async (p, name) => { const b = await p.screenshot(); fs.writeFileSync(path.join(OUT, name + '.png'), b); return PNG.sync.read(b); };
const node = (col, extra = '') => `output.html?wall=2x1&col=${col}&row=0&overlap=${OV}&blend=0,0,0,0${extra}`;

await test('wall-overlap-broadcast', async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const ctl = await page(ctx, '?i=wall-bc&seed=7&world=shanshui&palette=original');
  await ctl.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  await ctl.evaluate(() => { SSAV.pb.pause(); SSAV.cfg.weather && Object.assign(SSAV.cfg.weather, { rain: 0, fog: 0 }); });
  // same instance as the controller: the BroadcastChannel is per instance
  const n0 = await page(ctx, node(0, '&i=wall-bc')), n1 = await page(ctx, node(1, '&i=wall-bc'));
  await tilesUp(n0); await tilesUp(n1);
  await ctl.waitForTimeout(1500);
  // stop the controller: the nodes keep its last frame; after 1 s of silence their extrapolation stops changing
  await ctl.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await ctl.waitForTimeout(3000);
  const dx = await Promise.all([n0, n1].map(p => p.evaluate(() => SSOUT.scene.lastFrame.dx)));
  const [a, b] = [await shot(n0, 'bc-col0'), await shot(n1, 'bc-col1')];
  const d = bandDiff(a, a.width - OV, b, 0, OV), ctrl = bandDiff(a, 0, b, 0, OV);
  await ctx.close();
  assert(dx[0] === 0 && dx[1] > 0, 'node offsets ' + dx);
  assert(spread(a) > 30 && spread(b) > 30, 'a node is blank');
  assert(d < 2, 'the overlap band differs between nodes, mean ' + d.toFixed(2));
  assert(ctrl > d + 2, 'the band match is not informative (unrelated bands differ by only ' + ctrl.toFixed(2) + ')');
  return { dx: dx.map(v => +v.toFixed(2)), bandDiff: +d.toFixed(3), unrelated: +ctrl.toFixed(2) };
});

await test('wall-clock-mode', async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const t0 = Date.now() - 20000, q = `&t0=${t0}&speed=0&world=nashua&seed=3&fog=0&water=0`;
  const n0 = await page(ctx, node(0, q)), n1 = await page(ctx, node(1, q));
  await tilesUp(n0); await tilesUp(n1);
  await n0.waitForTimeout(2500);
  const [a, b] = [await shot(n0, 'clock-col0'), await shot(n1, 'clock-col1')];
  const d = bandDiff(a, a.width - OV, b, 0, OV);
  // moving: both nodes compute the same position from the clock alone
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: W, height: H } });
  const q2 = `&t0=${t0}&speed=120&world=shanshui&seed=3`;
  const m0 = await page(ctx2, node(0, q2)), m1 = await page(ctx2, node(1, q2));
  await tilesUp(m0); await tilesUp(m1);
  const xs = await Promise.all([m0, m1].map(p => p.evaluate(() => { const f = SSOUT.scene.lastFrame.fs; return { x: f.worlds[0].x, t: f.t }; })));
  const asked = await m0.evaluate(() => !!window.__askedCam);
  await ctx2.close();
  const drift = Math.abs((xs[0].x - xs[1].x) - (xs[0].t - xs[1].t) / 1000 * 120);
  assert(spread(a) > 30, 'clock node blank');
  assert(d < 2, 'clock overlap band differs, mean ' + d.toFixed(2));
  assert(drift < 1, 'clock nodes disagree on position by ' + drift.toFixed(2) + ' px');
  assert(!asked, 'an output asked for a camera');
  return { bandDiff: +d.toFixed(3), drift: +drift.toFixed(3) };
});

await test('wall-ws-relay', async () => {
  const PORT = 8198;
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'wall-server.mjs'), '--port', String(PORT), '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const sync = `&sync=ws://127.0.0.1:${PORT}`;
  try {
    // three separate contexts: no BroadcastChannel between them, only the relay
    const c0 = await browser.newContext({ viewport: { width: W, height: H } });
    const ctl = await page(c0, `?i=wall-ws&seed=5&world=shanshui${sync}`);
    await ctl.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
    const c1 = await browser.newContext({ viewport: { width: W, height: H } }), c2 = await browser.newContext({ viewport: { width: W, height: H } });
    const n0 = await page(c1, node(0, sync)), n1 = await page(c2, node(1, sync));
    await tilesUp(n0); await tilesUp(n1);
    await ctl.evaluate(() => { SSAV.cfg.speed = 120; SSAV.pb.speed = 120; SSAV.pb.play(); });
    await ctl.waitForTimeout(3000);
    const st = await Promise.all([n0, n1].map(p => p.evaluate(() => ({ open: SSOUT.sync.open, off: SSOUT.sync.offset, x: SSOUT.msg.fs.worlds[0].x, seed: SSOUT.msg.fs.worlds[0].seed }))));
    const cx = await ctl.evaluate(() => SSAV.pb.x);
    const status = await (await fetch(`http://127.0.0.1:${PORT}/`)).json();
    await Promise.all([c0, c1, c2].map(c => c.close()));
    assert(st.every(s => s.open), 'a node is not connected');
    assert(st.every(s => Math.abs(s.off) < 50), 'clock offsets ' + st.map(s => s.off));
    assert(st.every(s => Math.abs(s.x - cx) < 120 * 0.5), 'nodes lag the controller: ' + st.map(s => s.x.toFixed(0)) + ' vs ' + cx.toFixed(0));
    assert(status.clients >= 3 && status.frames > 30, 'relay status ' + JSON.stringify(status));
    return { offsets: st.map(s => s.off), lagPx: st.map(s => +(cx - s.x).toFixed(1)), frames: status.frames };
  } finally { srv.kill(); }
});

await test('wall-keystone', async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const ks = [20, 10, -30, 5, -10, -20, 15, -5];
  const p = await page(ctx, node(0, '&ks=' + ks.join(',') + '&world=shanshui&t0=' + Date.now() + '&speed=0'));
  await tilesUp(p);
  const got = await p.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.body).transform), w = innerWidth, h = innerHeight;
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => { const r = m.transformPoint(new DOMPoint(x, y, 0, 1)); return [r.x / r.w, r.y / r.w]; });
  });
  await ctx.close();
  const want = [[ks[0], ks[1]], [W + ks[2], ks[3]], [W + ks[4], H + ks[5]], [ks[6], H + ks[7]]];
  const err = Math.max(...got.flatMap((g, i) => [Math.abs(g[0] - want[i][0]), Math.abs(g[1] - want[i][1])]));
  assert(err < 0.5, 'keystone corners off by ' + err.toFixed(3) + ' px: ' + JSON.stringify(got));
  return { maxCornerErrPx: +err.toFixed(4) };
});

await test('wall-blend-and-card', async () => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const q = '&world=shanshui&t0=' + Date.now() + '&speed=0';
  const a = await page(ctx, `output.html?wall=2x1&col=0&row=0&overlap=200&gamma=2.2&cal=1${q}`);
  const b = await page(ctx, `output.html?wall=2x1&col=1&row=0&overlap=200&gamma=2.2${q}`);
  await tilesUp(a); await tilesUp(b);
  const read = p => p.evaluate(() => [...document.querySelectorAll('#wallblend .wall-blend')].map(d => ({ side: ['left', 'right'].find(s => d.style[s] === '0px'), w: d.style.width, bg: d.style.background || d.style.backgroundImage })));
  const ra = await read(a), rb = await read(b);
  const cardOn = await a.evaluate(() => !document.getElementById('wallcard').hidden);
  await a.keyboard.press('c');
  const cardOff = await a.evaluate(() => document.getElementById('wallcard').hidden);
  await b.keyboard.press('c');
  const cardB = await b.evaluate(() => !document.getElementById('wallcard').hidden);
  const status = await b.evaluate(() => SSOUT.cardStatus());
  await shot(b, 'card-col1');
  assert(/^clock mode .*offset .*drift .*frames/.test(status), 'card status line: ' + status);
  await ctx.close();
  assert(ra.length === 1 && ra[0].side === 'right' && ra[0].w === '200px', 'col 0 blend ' + JSON.stringify(ra));
  assert(rb.length === 1 && rb[0].side === 'left' && rb[0].w === '200px', 'col 1 blend ' + JSON.stringify(rb));
  // light through each ramp: (1 - a)^gamma. Across the band the two nodes' light must add to 1 (gamma-correct).
  // the browser writes alpha 1 as rgb(0, 0, 0)
  const alphas = s => [...s.matchAll(/rgba?\(0,\s*0,\s*0(?:,\s*([\d.]+))?\)/g)].map(m => (m[1] == null ? 1 : +m[1]));
  const A = alphas(ra[0].bg), B = alphas(rb[0].bg);
  assert(A.length === 17 && B.length === 17, 'ramp stops ' + A.length + ', ' + B.length);
  // each ramp starts dark at the node's outer edge of the band; stop i of node 0 and stop 16 - i of node 1 are the same spot
  const sums = A.map((x, i) => Math.pow(1 - x, 2.2) + Math.pow(1 - B[16 - i], 2.2));
  const worst = Math.max(...sums.map(s => Math.abs(s - 1)));
  // the browser keeps gradient alpha to 8 bits (1/255); at gamma 2.2 that allows about 0.009 of light
  assert(worst < 0.01, 'blend light does not sum to 1, worst ' + worst.toFixed(4));
  assert(cardOn && cardOff && cardB, 'card toggles: start ' + cardOn + ', C hides ' + cardOff + ', C shows ' + cardB);
  return { worstLightSumErr: +worst.toFixed(5), mid: A[8] };
});

// 3 x 1 wall against one canvas: three nodes (no overlap, no bezel) and one output as wide as the whole wall, all
// from the same frozen frame. At each seam the columns either side must be the reference's columns.
await test('wall-3x1-seam', async () => {
  const w = 640, h = 360, ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const ctl = await page(ctx, '?i=wall-3&seed=7&world=shanshui&palette=original');
  await ctl.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  await ctl.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 1500; SSAV.cfg.weather && Object.assign(SSAV.cfg.weather, { rain: 0, fog: 0 }); });
  const n = [];
  for (let c = 0; c < 3; c++) n.push(await page(ctx, `output.html?i=wall-3&wall=3x1&col=${c}&row=0&overlap=0&bezel=0`));
  const ref = await ctx.newPage(); watch(ref); await ref.setViewportSize({ width: 3 * w, height: h }); await ref.goto(BASE + 'output.html?i=wall-3');
  for (const p of [...n, ref]) await tilesUp(p);
  await ctl.waitForTimeout(2500);
  await ctl.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await ctl.waitForTimeout(3000);
  const S = []; for (let c = 0; c < 3; c++) S.push(await shot(n[c], 'seam-col' + c));
  const R = await shot(ref, 'seam-ref');
  await ctx.close();
  const B = 4, seams = [];
  for (let c = 0; c < 2; c++) {
    const left = bandDiff(S[c], w - B, R, (c + 1) * w - B, B), right = bandDiff(S[c + 1], 0, R, (c + 1) * w, B);
    seams.push({ seam: c + 1, left: +left.toFixed(3), right: +right.toFixed(3) });
  }
  // an unrelated band of the reference, to show the match is informative
  const ctrl = bandDiff(S[1], 0, R, 0, B);
  assert(S.every(s => spread(s) > 30) && spread(R) > 30, 'a window is blank');
  assert(seams.every(s => s.left < 2 && s.right < 2), 'seams differ from the single canvas: ' + JSON.stringify(seams));
  assert(ctrl > 4, 'the seam match is not informative (unrelated band differs by ' + ctrl.toFixed(2) + ')');
  return { seams, unrelated: +ctrl.toFixed(2) };
});

// the relay dies mid-run and comes back: the node runs on at the last speed, then follows the relay again
async function relay(port) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools', 'wall-server.mjs'), '--port', String(port), '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  return srv;
}
// the controller keeps (Date.now, x) for every frame; at the node's (t, x) the error is x minus the controller's x
// at t, interpolated (one machine: the relay's clock offset is under a millisecond here, and reported)
const RECORD = () => { window.__rec = []; const f = () => { __rec.push([Date.now(), SSAV.pb.x]); if (__rec.length > 600) __rec.splice(0, 300); requestAnimationFrame(f); }; requestAnimationFrame(f); };
const ctlAt = (ctl, t) => ctl.evaluate(t => { const r = __rec; for (let i = r.length - 1; i > 0; i--) if (r[i - 1][0] <= t && r[i][0] >= t) { const k = r[i][0] === r[i - 1][0] ? 0 : (t - r[i - 1][0]) / (r[i][0] - r[i - 1][0]); return r[i - 1][1] + k * (r[i][1] - r[i - 1][1]); } return null; }, t);
async function nodeErr(ctl, p) {
  const s = await p.evaluate(() => ({ x: SSOUT.shown.x, t: SSOUT.shown.t - (SSOUT.sync ? SSOUT.sync.offset : 0), fb: SSOUT.fallback, open: SSOUT.sync && SSOUT.sync.open, off: SSOUT.sync ? SSOUT.sync.offset : 0 }));
  await ctl.waitForTimeout(50);
  const cx = await ctlAt(ctl, Math.round(s.t));
  return { ...s, err: cx == null ? null : s.x - cx };
}

await test('wall-relay-kill-recover', async () => {
  let srv = await relay(KILL_PORT);
  const sync = `&sync=ws://127.0.0.1:${KILL_PORT}`, V = 120;
  const c0 = await browser.newContext({ viewport: { width: W, height: H } }), c1 = await browser.newContext({ viewport: { width: W, height: H } });
  try {
    const ctl = await page(c0, `?i=wall-kill&seed=5&world=shanshui${sync}`);
    await ctl.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
    const nd = await page(c1, node(0, sync));
    await tilesUp(nd);
    await ctl.evaluate(V => { SSAV.cfg.speed = V; SSAV.pb.speed = V; SSAV.pb.play(); }, V);
    await ctl.evaluate(RECORD);
    await ctl.waitForTimeout(4000);
    const before = await nodeErr(ctl, nd), VW = await ctl.evaluate(() => SSAV.pb.velocity);
    srv.kill(); srv = null;
    await ctl.waitForTimeout(3500);
    const lost1 = await nodeErr(ctl, nd);
    await ctl.waitForTimeout(1000);
    const lost2 = await nodeErr(ctl, nd);
    srv = await relay(KILL_PORT);
    await nd.waitForFunction(() => SSOUT.sync.open && !SSOUT.fallback, null, { timeout: 15000 });
    await ctl.waitForTimeout(2500);
    const after = await nodeErr(ctl, nd);
    const logs = await ctl.evaluate(() => [...document.querySelectorAll('#log li, #log div, .log li')].map(e => e.textContent).filter(t => /wall sync/.test(t)).slice(-4));
    assert(Math.abs(before.err) < 3 && !before.fb, 'before the kill: ' + JSON.stringify(before));
    assert(lost1.fb && !lost1.open && lost2.fb, 'the node did not notice the relay was gone: ' + JSON.stringify([lost1, lost2]));
    const ran = lost2.x - lost1.x, dtS = (lost2.t - lost1.t) / 1000;
    assert(Math.abs(ran / dtS - VW) < VW * 0.1, 'the node stopped or ran at the wrong speed without the relay: ' + (ran / dtS).toFixed(1) + ' px/s, controller ' + VW.toFixed(1));
    assert(Math.abs(lost2.err) < 30, 'without the relay the node wandered ' + lost2.err.toFixed(1) + ' px from the controller');
    assert(Math.abs(after.err) < 3 && after.open && !after.fb, 'after the relay came back: ' + JSON.stringify(after));
    return { errBefore: +before.err.toFixed(2), errLost: +lost2.err.toFixed(2), speedLost: +(ran / dtS).toFixed(1), speedController: +VW.toFixed(1), errAfter: +after.err.toFixed(2), logs };
  } finally { if (srv) srv.kill(); await c0.close(); await c1.close(); }
});

// drift over time: a 3 x 1 wall on the relay, the controller playing at constant speed; every 5 s each node's drawn x
// is checked against the controller's x at the same instant. Must stay under one frame of travel (world speed / 60).
const DRIFT_MIN = +((args.find(a => a.startsWith('--drift-min=')) || '').slice(12) || 10);
await test('wall-drift', async () => {
  const PORT = 8197, srv = await relay(PORT), sync = `&sync=ws://127.0.0.1:${PORT}`, V = 120;
  const ctxs = [], nodes = [];
  try {
    const c0 = await browser.newContext({ viewport: { width: 640, height: 360 } }); ctxs.push(c0);
    const ctl = await page(c0, `?i=wall-drift&seed=9&world=shanshui${sync}`);
    await ctl.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
    for (let c = 0; c < 3; c++) { const cx = await browser.newContext({ viewport: { width: 640, height: 360 } }); ctxs.push(cx); nodes.push(await page(cx, `output.html?wall=3x1&col=${c}&row=0&overlap=0${sync}`)); }
    for (const p of nodes) await tilesUp(p);
    await ctl.evaluate(V => { SSAV.cfg.speed = V; SSAV.pb.speed = V; SSAV.pb.play(); }, V);
    await ctl.evaluate(RECORD);
    await ctl.waitForTimeout(5000);
    const vw = await ctl.evaluate(() => SSAV.pb.velocity), frame = vw / 60;   // one frame of travel, world px
    const errs = [], t0 = Date.now();
    while (Date.now() - t0 < DRIFT_MIN * 60000) {
      for (const p of nodes) { const e = await nodeErr(ctl, p); if (e.err != null) errs.push(Math.abs(e.err)); }
      await ctl.waitForTimeout(5000);
    }
    const worst = Math.max(...errs), mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const offs = await Promise.all(nodes.map(p => p.evaluate(() => SSOUT.sync.offset)));
    assert(errs.length >= 3 * Math.floor(DRIFT_MIN * 6), 'too few samples: ' + errs.length);
    assert(worst < frame, `drift ${worst.toFixed(2)} px is a frame or more (${frame.toFixed(2)} px at ${vw.toFixed(1)} world px/s)`);
    return { minutes: DRIFT_MIN, samples: errs.length, worstPx: +worst.toFixed(3), meanPx: +mean.toFixed(3), worstFrames: +(worst / frame).toFixed(3), offsetsMs: offs };
  } finally { srv.kill(); for (const c of ctxs) await c.close(); }
});

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.writeFileSync(path.join(ROOT, 'test-results', 'wall.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
