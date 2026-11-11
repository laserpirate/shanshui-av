// P6 tests (ADDENDUM-A): no hills, the scale, what is really there, the map inset, the label toggles, the pair.
//   node tests/p6.mjs [http://localhost:8093/] [--ref=http://localhost:8098/] [--only=name,name]
// --ref is the .p5 tag served from its own worktree: the A1 rule must fail on it (a planted failure from the real past).
// Writes test-results/p6.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const REF = (args.find(a => a.startsWith('--ref=')) || '').slice(6) || null;
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 600) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1300,860'] });
async function open(base, q, vp = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
  await p.goto(base + q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  return { ctx, p };
}
const settle = p => p.waitForFunction(() => !SSAV.fading && SSAV.world() && SSAV.world().pack && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 90000 });

// ---------- A1: no filled terrain above the near-bank band ----------
// The rule, frozen before tuning: render terrain and water only (?layers=terrain,water; buildings, trees, structures off),
// labels and UI hidden, rain 0, fog 0, light 1. For every screen column, find the bank top y_b from the pack
// (band0, the highest ground 0 to 40 m from the water edge, x hx x ve). Count the pixels from the top of the frame to
// y_b - 6 that differ from the paper (the median of the top 20 rows) by more than 30 (sum of |dR|+|dG|+|dB|).
// A column is FILLED when more than 8 of them differ (the one ridgeline is 1 to 3 px wide). A station FAILS when more than
// 3 % of its columns are filled. The test passes when no station of either reach fails, and only if the same rule
// fails (a) on a planted fill painted into a real frame and (b) on the .p5 tag at 6 or more of its 8 stations.
function fillRule(png, ybOf) {
  const { width: W, height: H, data } = png;
  const pr = [], pg = [], pb = [];
  for (let y = 2; y < 22; y++) for (let x = 0; x < W; x += 7) { const i = (y * W + x) * 4; pr.push(data[i]); pg.push(data[i + 1]); pb.push(data[i + 2]); }
  const med = a => a.sort((u, v) => u - v)[a.length >> 1];
  const P = [med(pr), med(pg), med(pb)];
  let filled = 0, worst = 0;
  for (let x = 0; x < W; x++) {
    const yb = Math.min(H, Math.floor(ybOf(x) - 6));
    let n = 0;
    for (let y = 0; y < yb; y++) { const i = (y * W + x) * 4; if (Math.abs(data[i] - P[0]) + Math.abs(data[i + 1] - P[1]) + Math.abs(data[i + 2] - P[2]) > 30) n++; }
    if (n > 8) filled++;
    worst = Math.max(worst, n);
  }
  return { share: filled / W, worst, paper: P, fails: filled / W > 0.03 };
}
async function stationFrames(base, reach, { ref = false, plant = false } = {}) {
  const q = `?i=p6-a1&world=nashua&seed=1&bank=L&palette=original${reach === 'merrimack' ? '&reach=merrimack' : ''}${ref ? '&mode=nature' : '&layers=terrain,water'}`;
  const { ctx, p } = await open(base, q);
  await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; });
  const out = [];
  const len = await p.evaluate(() => SSAV.world().pack.route_len_m);
  for (let i = 0; i < 8; i++) {
    const s = len * (i + 0.5) / 8;
    await p.evaluate(s => { const P = SSAV.world().pack; SSAV.pb.x = s * (P.hx || 2) - SSAV.viewW() / 2; }, s);
    await settle(p); await p.waitForTimeout(500);
    const png = PNG.sync.read(await p.screenshot({ type: 'png' }));
    // the bank top per column, from the pack (the same mapping the label overlay uses)
    const yb = await p.evaluate(W => {
      const w = SSAV.world(), P = w.pack, o = w.opts || {}, hx = P.hx || 2, VY = hx * (o.ve || 10);
      const v = SSAV.view ? SSAV.view() : { scale: innerHeight / (800 / 1.142), camY: 0 };
      const at = (name, s) => { const a = P.A[name], f = Math.max(0, Math.min(P.n - 1, s / P.ds)), k = Math.floor(f), t = f - k; return k + 1 < P.n ? a[k] + (a[k + 1] - a[k]) * t : a[k]; };
      const r = [];
      for (let x = 0; x < W; x++) { const s = Math.max(0, Math.min(P.route_len_m, (SSAV.x + x / v.scale) / hx)); r.push((600 - at('band0_L', s) * VY - v.camY) * v.scale); }
      return r;
    }, png.width);
    if (plant) {   // a planted fill: a 60 px grey wash above the bank over 30 % of the columns
      for (let x = Math.floor(png.width * 0.35); x < png.width * 0.65; x++) for (let y = Math.max(0, Math.floor(yb[x] - 80)); y < yb[x] - 20; y++) { const k = (y * png.width + x) * 4; png.data[k] = png.data[k + 1] = png.data[k + 2] = 150; }
    }
    out.push({ s: Math.round(s), ...fillRule(png, x => yb[x]) });
    if (i === 3 && !ref && !plant) fs.writeFileSync(path.join(ROOT, 'test-results', `p6-a1-${reach}-s${Math.round(s)}.png`), PNG.sync.write(png));
  }
  await ctx.close();
  return out;
}
await test('a1-no-hills', async () => {
  fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
  const planted = await stationFrames(BASE, 'nashua', { plant: true });
  const caught = planted.filter(r => r.fails).length;
  assert(caught === 8, `the planted fill was caught at ${caught} of 8 stations`);
  let ref = null;
  if (REF) {
    ref = await stationFrames(REF, 'nashua', { ref: true });
    const n = ref.filter(r => r.fails).length;
    assert(n >= 6, `the .p5 tag (hills) failed the rule at only ${n} of 8 stations`);
  }
  const N = await stationFrames(BASE, 'nashua'), M = await stationFrames(BASE, 'merrimack');
  const bad = [...N.map(r => ({ reach: 'nashua', ...r })), ...M.map(r => ({ reach: 'merrimack', ...r }))].filter(r => r.fails);
  assert(!bad.length, 'filled terrain above the bank: ' + JSON.stringify(bad.map(b => [b.reach, b.s, +b.share.toFixed(3)])));
  return {
    planted: caught + '/8', ref: ref ? ref.filter(r => r.fails).length + '/8 (shares ' + ref.map(r => r.share.toFixed(2)).join(' ') + ')' : 'not run',
    nashua: N.map(r => [r.s, +r.share.toFixed(3), r.worst]), merrimack: M.map(r => [r.s, +r.share.toFixed(3), r.worst]),
  };
});

// ---------- A6: the scale ----------
await test('a6-scale', async () => {
  const { ctx, p } = await open(BASE, '?i=p6-a6&world=nashua&seed=1');
  const o = await p.evaluate(() => ({ ...SSAV.opts, ends: SSAV.cfg.nashua.ends, hx: SSAV.world().pack.hx }));
  assert(o.hx === 8 && o.ve === 2 && o.ends === 'pingpong', 'defaults ' + JSON.stringify(o));
  await p.waitForTimeout(600);
  const f8 = await p.evaluate(() => document.getElementById('hud-facts').textContent);
  const sc = await p.evaluate(() => SSAV.view().scale);
  assert(f8.includes('Vertical Exaggeration 2x') && f8.includes('100 m (328 ft) = ' + Math.round(800 * sc) + ' px'), 'fact line at 8 px/m: ' + f8);
  // a live change keeps the s at the view centre, and the reach is len x hx wide
  await p.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 900 * 8 - SSAV.viewW() / 2; });
  await p.waitForTimeout(300);
  await p.evaluate(() => SSAV.setHX(4, true));
  await p.waitForFunction(() => SSAV.world() && SSAV.world().pack && SSAV.world().pack.hx === 4 && !SSAV.fading, null, { timeout: 30000 });
  const r = await p.evaluate(() => ({ s: (SSAV.x + SSAV.viewW() / 2) / 4, hx: SSAV.world().pack.hx, f: document.getElementById('hud-facts').textContent }));
  assert(Math.abs(r.s - 900) < 2, 'centre s after the scale change ' + r.s);
  await p.waitForTimeout(400);
  const f4 = await p.evaluate(() => document.getElementById('hud-facts').textContent);
  assert(f4.includes('= ' + Math.round(400 * sc) + ' px'), 'fact line at 4 px/m: ' + f4);
  await ctx.close();
  // ?hx= outside 2 to 12 is clamped
  const b = await open(BASE, '?i=p6-a6b&world=nashua&seed=1&hx=99');
  const hx99 = await b.p.evaluate(() => SSAV.world().pack.hx);
  await b.ctx.close();
  assert(hx99 === 12, '?hx=99 gave ' + hx99);
  return { defaults: o, centre_s_after_change: +r.s.toFixed(2), hx99 };
});
// the pack at 8 px per m: stations every 2 m are 16 px apart; a silhouette is blocky when the slope jumps between
// neighbouring segments. The worst slope change of the bank line (band0) over the reach must stay under 0.05
// (about 3 degrees). The control: the same band0 rounded to 0.5 m steps (what an unsmoothed grid of whole half metres
// would draw) must exceed it. (P6 run 1 used fine0 as the control; it is a land-cover share, flat on the left bank,
// and measured 0, so it could not fail. Replaced, the limit unchanged.)
await test('a6-pack-holds', async () => {
  const { ctx, p } = await open(BASE, '?i=p6-a6c&world=nashua&seed=1');
  const r = await p.evaluate(() => {
    const P = SSAV.world().pack, VY = P.hx * SSAV.opts.ve, seg = P.ds * P.hx;
    const worstOf = a => { let w = 0; for (let i = 1; i + 1 < P.n; i++) { const s1 = (a[i] - a[i - 1]) * VY / seg, s2 = (a[i + 1] - a[i]) * VY / seg; w = Math.max(w, Math.abs(s2 - s1)); } return w; };
    const worst = name => worstOf(P.A[name]);
    const bands = {}; for (const sd of ['L', 'R']) for (let j = 0; j < 4; j++) bands['band' + j + '_' + sd] = worst('band' + j + '_' + sd);
    // ADDENDUM-B B10: the ridgeline is drawn from bands 1 and 2 only, so the drawn bands are 0 (the bank), 1 and 2
    const ridge = Array.from(P.A.band1_L, (v, i) => Math.max(v, P.A.band2_L[i]));
    const drawn = Object.entries(bands).filter(([k]) => !k.startsWith('band3')).map(([, v]) => v);
    return { ds_m: P.ds, seg_px: seg, worst_band: Math.max(...drawn), ...bands, ridge_corners_reported: worstOf(ridge), control_stepped: worstOf(Array.from(P.A.band0_L, v => Math.round(v * 2) / 2)) };
  });
  await ctx.close();
  assert(r.control_stepped > 0.05, 'the control (stepped) did not exceed the limit: ' + r.control_stepped);
  // P6 run 2: at the 2 m step the rule failed (band0_L 0.059, band1_L 0.056, the ridge 0.58), so the pack was rebuilt at
  // 1 m as A6 says. The rule applies to each band, the resolution of the pack. The ridge is the highest of bands 1 to 3:
  // where two bands cross it turns a corner whatever the step (0.58 at 2 m, 0.47 at 1 m), so it is reported, not held
  // to the limit.
  // ADDENDUM-B B10 (decided by chat): draw the ridgeline from bands 1 and 2 only, do not loosen the rule. Band 3
  // (0.058 at 1 m) is no longer drawn and is reported; the limit stays 0.05 for every drawn band.
  assert(r.ds_m === 1, 'pack step ' + r.ds_m + ' m, A6 rebuild is at 1 m');
  assert(r.worst_band < 0.05, 'blocky at 8 px/m: ' + JSON.stringify(r));
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(4)]));
});

// ---------- A2: what is really there ----------
await test('a2-structures', async () => {
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nashua/existing/pack.json'), 'utf8'));
  const prim = pk.prim_codes;
  const mill = pk.buildings.find(b => b[2] === 1 && prim[b[8]] === 'Light' && b[1] - b[0] > 400);
  const church = pk.buildings.find(b => b[2] === 1 && prim[b[8]] === 'Religious' && Math.abs((b[0] + b[1]) / 2 - 1110) < 30);
  const dike = (pk.structures || []).find(d => d.id === 'NH03813');
  assert(mill && church && dike && pk.dam, 'mill ' + !!mill + ' church ' + !!church + ' dike ' + !!dike + ' dam ' + !!pk.dam);
  const md = fs.readFileSync(path.join(ROOT, 'docs/nashua/structures.md'), 'utf8');
  const m = /\*\*(\d+) drawn of (\d+) in range\*\*/.exec(md);
  assert(m && +m[1] === +m[2], 'structures.md: ' + (m && m[0]));
  // the mill and the church are drawn: the frame with buildings differs from the control frame without them
  const shot = async (layers, s) => {
    const { ctx, p } = await open(BASE, `?i=p6-a2&world=nashua&seed=1&palette=original&layers=${layers}`);
    await p.evaluate(s => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0 }; SSAV.cfg.nashua.labels = false; SSAV.pb.x = s * 8 - SSAV.viewW() / 2; }, s);
    await settle(p); await p.waitForTimeout(500);
    const png = PNG.sync.read(await p.screenshot({ type: 'png' }));
    await ctx.close();
    return png;
  };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 40) n++; return n / (a.width * a.height); };
  const out = {};
  for (const [name, s] of [['mill', (mill[0] + mill[1]) / 2], ['church', (church[0] + church[1]) / 2]]) {
    const w = await shot('terrain,water,buildings', s), wo = await shot('terrain,water', s);
    out[name] = +diff(w, wo).toFixed(4);
  }
  assert(out.mill > 0.05 && out.church > 0.003, 'buildings not drawn: ' + JSON.stringify(out));
  // labels by kind and id from the data
  const { ctx, p } = await open(BASE, '?i=p6-a2b&world=nashua&seed=1');
  await p.evaluate(() => { SSAV.pb.pause(); SSAV.setLabels('labels', true); SSAV.pb.x = 1110 * 8 - SSAV.viewW() / 2; });
  await p.waitForTimeout(800);
  const labels = await p.evaluate(() => [...document.querySelectorAll('#labels .rl')].map(d => d.textContent));
  await ctx.close();
  // the dike is on the right bank (side -1): its label is in the right bank view
  const r = await open(BASE, '?i=p6-a2c&world=nashua&seed=1&bank=R');
  await r.p.evaluate(() => { SSAV.pb.pause(); SSAV.setLabels('labels', true); });
  await r.p.waitForTimeout(800);
  const labelsR = await r.p.evaluate(() => [...document.querySelectorAll('#labels .rl')].map(d => d.textContent));
  await r.ctx.close();
  assert(labels.some(t => t === 'Religious (structures layer ' + church[9] + ')') && labels.some(t => t.startsWith('Light industrial')) && labelsR.some(t => t.startsWith('Nashua Flood Control Levee (NID NH03813)')), 'labels ' + JSON.stringify(labels.slice(0, 30)) + ' R ' + JSON.stringify(labelsR.slice(0, 30)));
  return { drawn_of_in_range: m[1] + '/' + m[2], mill_span_m: [mill[0], mill[1]], church: { id: church[9], s: (church[0] + church[1]) / 2 }, dike: { s: dike.s, side: dike.side, position: dike.position }, pixel_share_with_vs_without_buildings: out };
});

// ---------- A3: the label toggles ----------
await test('a3-labels', async () => {
  const { ctx, p } = await open(BASE, '?i=p6-a3&world=nashua&seed=1');
  await p.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 0; });
  const vis = () => p.evaluate(() => !document.getElementById('labels').hidden && [...document.querySelectorAll('#labels .rl')].some(d => d.style.display !== 'none'));
  const before = await p.evaluate(() => SSAV.cfg.nashua.labels);
  await p.click('#b-labels'); await p.waitForTimeout(400);
  const a = { cfg: await p.evaluate(() => SSAV.cfg.nashua.labels), shown: await vis() };
  await p.click('#b-labels'); await p.waitForTimeout(400);
  const b = { cfg: await p.evaluate(() => SSAV.cfg.nashua.labels), shown: await vis() };
  assert(a.cfg !== before && b.cfg === before && a.shown === a.cfg && b.shown === b.cfg, 'controller toggle ' + JSON.stringify({ before, a, b }));
  const o0 = await p.evaluate(() => SSAV.frameState().reach.labels);
  await p.click('#b-outlabels');
  const o1 = await p.evaluate(() => SSAV.frameState().reach.labels);
  await p.evaluate(() => SSAV.openPanel ? SSAV.openPanel('p-reach') : document.querySelector('[data-panel="p-reach"]').click());
  await p.click('#r-outlabels');
  const o2 = await p.evaluate(() => SSAV.frameState().reach.labels);
  assert(o0 === false && o1 === true && o2 === false, 'output toggle ' + [o0, o1, o2]);
  const txt = await p.evaluate(() => document.getElementById('r-labels').textContent + ' | ' + document.getElementById('r-outlabels').textContent);
  // sizes: the buttons at least 44 px high, their text at least 18 px
  const sz = await p.evaluate(() => ['b-labels', 'b-outlabels', 'b-map', 'r-labels', 'r-outlabels', 'r-map', 'r-outmap', 'b-pair', 'b-pairlinks'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return [id, Math.round(r.height), parseFloat(getComputedStyle(e).fontSize)]; }));
  assert(sz.every(([, h, f]) => h >= 44 && f >= 18), 'sizes ' + JSON.stringify(sz));
  // the MIDI roles: listed as targets (Learn can bind them) and each one acts as a binding would fire it
  const roles = await p.evaluate(() => SSAV.midiRoles());
  const want = ['labels', 'outLabels', 'mapInset', 'hx'];
  assert(want.every(r => roles.includes(r)), 'MIDI roles missing: ' + want.filter(r => !roles.includes(r)));
  const acted = await p.evaluate(async () => {
    const st = () => ({ labels: SSAV.cfg.nashua.labels, outLabels: SSAV.cfg.nashua.outLabels, map: SSAV.cfg.nashua.map });
    const a = st(); SSAV.midiAct('labels'); SSAV.midiAct('outLabels'); SSAV.midiAct('mapInset'); const b = st();
    SSAV.midiAct('hx', 1); await new Promise(r => setTimeout(r, 900));
    return { a, b, hx: SSAV.cfg.nashua.hx };
  });
  await ctx.close();
  assert(acted.b.labels !== acted.a.labels && acted.b.outLabels !== acted.a.outLabels && acted.b.map !== acted.a.map && acted.hx === 12, 'MIDI roles did not act: ' + JSON.stringify(acted));
  return { controller: [before, a.cfg, b.cfg], output: [o0, o1, o2], text: txt, sizes: sz, midiRoles: want, midiActed: acted };
});

// ---------- A4: the map inset ----------
await test('a4-map', async () => {
  const { ctx, p } = await open(BASE, '?i=p6-a4&world=nashua&seed=1');
  const off = await p.evaluate(() => SSAV.mapInset.on);
  const outOff = await p.evaluate(() => SSAV.frameState().reach.map);
  assert(off === false && outOff === false, 'on by default ' + off + ' ' + outOff);
  await p.click('#b-map'); await p.waitForTimeout(400);
  const m = await p.evaluate(() => SSAV.mapInset);
  assert(m.on && m.w === 400, 'shown at 400 px: ' + JSON.stringify(m));
  // the dot follows the playhead: at s 165 (S1) and s 2309 (S6) it sits on those stations' marks
  const at = async s => { await p.evaluate(s => { SSAV.pb.pause(); SSAV.pb.x = s * 8 - SSAV.viewW() / 2; }, s); await p.waitForTimeout(350); return p.evaluate(() => SSAV.mapInset.dot); };
  const hits = m.hits;
  const d1 = await at(165), d6 = await at(2309);
  const near = (d, h) => Math.hypot(d[0] - (h.x0 + 14 - 8), d[1] - (h.y1 - 22 + 18 * 0.8));
  const e1 = near(d1, hits[0]), e6 = near(d6, hits[5]);
  assert(e1 < 3 && e6 < 3, 'dot off its station: ' + [e1, e6]);
  // a click on S4 goes there
  const h4 = hits[3], box = await p.evaluate(() => { const r = document.querySelector('.map-inset canvas + canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await p.mouse.click(box.x + (h4.x0 + h4.x1) / 2, box.y + (h4.y0 + h4.y1) / 2);
  await p.waitForTimeout(300);
  const s4 = await p.evaluate(() => (SSAV.x + SSAV.viewW() / 2) / 8);
  assert(Math.abs(s4 - 1635) < 2, 'click S4 went to s ' + s4);
  // static plan drawn once: scrolling does not redraw it
  const dr0 = await p.evaluate(() => SSAV.mapInset.draws);
  await p.evaluate(() => SSAV.pb.play()); await p.waitForTimeout(1500); await p.evaluate(() => SSAV.pb.pause());
  const dr1 = await p.evaluate(() => SSAV.mapInset.draws);
  assert(dr1 === dr0, 'the plan redrew while scrolling ' + dr0 + ' to ' + dr1);
  // three sizes
  const sizes = {};
  for (const k of ['s', 'm', 'l']) { await p.evaluate(k => SSAV.setMapInset(true, k), k); await p.waitForTimeout(250); sizes[k] = await p.evaluate(() => SSAV.mapInset.w); }
  assert(sizes.s === 240 && sizes.m === 400 && sizes.l === 600, 'sizes ' + JSON.stringify(sizes));
  const ms = await p.evaluate(() => SSAV.mapInset.ms);
  await ctx.close();
  return { dotError_px: [+e1.toFixed(2), +e6.toFixed(2)], clickS4: +s4.toFixed(1), redrawsWhileScrolling: dr1 - dr0, sizes, buildMs: +ms.toFixed(1) };
});

// ---------- A5: the pair ----------
await test('a5-pair', async () => {
  const { ctx, p } = await open(BASE, '?i=p6-a5&world=nashua&seed=7&reach=merrimack');
  await p.evaluate(() => { window.__opened = []; window.open = (u, n, f) => { window.__opened.push([u, f]); return null; }; });
  await p.click('#b-pair');
  const opened = await p.evaluate(() => window.__opened);
  const L = await p.evaluate(() => SSAV.pairLinks(1700000000000));
  await ctx.close();
  const q = opened.map(([u]) => new URL(u).searchParams);
  assert(opened.length === 2 && q[0].get('wall') === '2x1' && q[0].get('col') === '0' && q[1].get('col') === '1', 'open pair ' + JSON.stringify(opened));
  const a = new URL(L[0]).searchParams, b = new URL(L[1]).searchParams;
  for (const k of ['world', 'seed', 't0', 'speed', 'reach', 'hx', 've', 'bank', 'palette']) assert(a.get(k) != null && a.get(k) === b.get(k), 'link param ' + k + ': ' + a.get(k) + ' / ' + b.get(k));
  assert(a.get('col') === '0' && b.get('col') === '1' && a.get('wall') === '2x1' && a.get('reach') === 'merrimack' && a.get('seed') === '7', 'links ' + L.join(' '));
  return { open: opened.map(([u, f]) => u.split('?')[1] + ' [' + f + ']'), links: L.map(u => u.split('?')[1]) };
});

// the 2 x 1 pair against one canvas (nashua at 8 px per m): two nodes, no overlap, no bezel, and one output as wide
// as both, from the same frozen controller frame. The columns either side of the seam must be the reference's.
function bandDiff(a, ax, b, bx, w) {
  let s = 0, n = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < w; x++) { const i = (y * a.width + ax + x) * 4, j = (y * b.width + bx + x) * 4; for (let k = 0; k < 3; k++) s += Math.abs(a.data[i + k] - b.data[j + k]); n += 3; }
  return s / n;
}
const tilesUp = p => p.waitForFunction(() => window.SSOUT && SSOUT.scene.lastFrame && SSOUT.scene.stats().tiles >= 1, null, { timeout: 60000 });
await test('a5-seam-2x1', async () => {
  const w = 800, h = 450, ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const ctl = await ctx.newPage(); await ctl.goto(BASE + '?i=p6-seam&seed=7&world=nashua&palette=original');
  await ctl.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  await ctl.evaluate(() => { SSAV.pb.pause(); SSAV.pb.x = 500 * 8; SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0 }; });
  const n = [];
  for (let c = 0; c < 2; c++) { const p = await ctx.newPage(); await p.goto(BASE + `output.html?i=p6-seam&wall=2x1&col=${c}&row=0&overlap=0&bezel=0`); n.push(p); }
  const ref = await ctx.newPage(); await ref.setViewportSize({ width: 2 * w, height: h }); await ref.goto(BASE + 'output.html?i=p6-seam');
  for (const p of [...n, ref]) await tilesUp(p);
  await ctl.waitForTimeout(4000);
  await ctl.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await ctl.waitForTimeout(3000);
  const S = [PNG.sync.read(await n[0].screenshot()), PNG.sync.read(await n[1].screenshot())], R = PNG.sync.read(await ref.screenshot());
  await ctx.close();
  const B = 4, left = bandDiff(S[0], w - B, R, w - B, B), right = bandDiff(S[1], 0, R, w, B), ctrl = bandDiff(S[1], 0, R, 0, B);
  assert(left < 2 && right < 2, `seam differs from one canvas: left ${left.toFixed(2)} right ${right.toFixed(2)}`);
  assert(ctrl > 4, 'the seam match is not informative (an unrelated band differs by ' + ctrl.toFixed(2) + ')');
  return { left: +left.toFixed(3), right: +right.toFixed(3), unrelated: +ctrl.toFixed(2) };
});
// clock mode, two nodes from one pair of links (shared t0), nashua at 8 px per m, 120 px/s, over --drift-min minutes
// (default 10): every 10 s both nodes are read at once; node 1's x against node 0's x carried to node 1's frame time
const DRIFT_MIN = +((args.find(a => a.startsWith('--drift-min=')) || '').slice(12) || 10);
await test('a5-clock-drift', async () => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const c = await ctx.newPage(); await c.goto(BASE + '?i=p6-links&world=nashua&seed=5');
  await c.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  await c.evaluate(() => { SSAV.cfg.speed = 120; });
  const L = await c.evaluate(() => SSAV.pairLinks(Date.now() + 3000));
  await c.close();
  const n = [];
  for (const u of L) { const p = await ctx.newPage(); await p.goto(u); n.push(p); }
  for (const p of n) await tilesUp(p);
  const t0 = Date.now(); let worst = 0, k = 0; const samples = [];
  while (Date.now() - t0 < DRIFT_MIN * 60000) {
    const f = await Promise.all(n.map(p => p.evaluate(() => { const fs = SSOUT.scene.lastFrame.fs; return { x: fs.worlds[0].x, t: fs.t, v: fs.v }; })));
    if (Math.sign(f[0].v) === Math.sign(f[1].v)) {
      const e = Math.abs(f[1].x - (f[0].x + f[0].v * (f[1].t - f[0].t) / 1000));
      worst = Math.max(worst, e); k++;
      if (samples.length < 70) samples.push(+e.toFixed(3));
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  await ctx.close();
  assert(k >= DRIFT_MIN * 5, 'too few samples ' + k);
  assert(worst < 2, 'clock-mode nodes drift apart by ' + worst.toFixed(2) + ' world px');
  return { minutes: DRIFT_MIN, samples: k, worst_world_px: +worst.toFixed(3), note: 'two windows on one machine share one clock; two machines add their clock offset' };
});

// ---------- loop 1: footprint widths and ?spread=1 ----------
// Rules, set before the run: (a) at most 2 drawn footprints (bands 0 to 3) under 1 m along the reach (it was 53 of
// 152); (b) the spread fields put fewer footprints into stacks (3 or more drawn on one side with centres within 2 m)
// than the nearest-station fields; (c) at s 1847 the frame with ?spread=1 differs from the default in more than 1 %
// of its pixels (more than 40 in the RGB sum), while two default frames differ in under 0.1 % (the control).
// Spread is the default since ADDENDUM-B B10, so "default" below is ?spread=0 and "spread" is the app's default.
await test('loop-spread', async () => {
  const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nashua/existing/pack.json'), 'utf8'));
  assert(pk.buildings_fields[10] === 'sv0' && pk.buildings_fields[11] === 'sv1', 'fields ' + pk.buildings_fields);
  const drawn = pk.buildings.filter(b => b[3] <= 3), thin = drawn.filter(b => b[1] - b[0] < 1).length;
  const stacked = k0 => { let n = 0; for (const side of [1, -1]) { const c = drawn.filter(b => b[2] === side).map(b => (b[k0] + b[k0 + 1]) / 2).sort((a, b) => a - b); let i = 0; while (i < c.length) { let j = i; while (j + 1 < c.length && c[j + 1] - c[i] <= 2) j++; if (j - i + 1 >= 3) n += j - i + 1; i = j + 1; } } return n; };
  const st0 = stacked(0), st1 = stacked(10);
  assert(thin <= 2, 'footprints under 1 m wide: ' + thin + ' of ' + drawn.length);
  assert(st1 < st0, 'spread did not reduce the stacks: ' + st0 + ' -> ' + st1);
  const shot = async q => {
    const { ctx, p } = await open(BASE, '?i=p6-sp&world=nashua&seed=1&palette=original' + q);
    await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0 }; SSAV.cfg.nashua.labels = false; SSAV.pb.x = 1847 * SSAV.world().pack.hx - SSAV.viewW() / 2; });
    await settle(p); await p.waitForTimeout(500);
    const png = PNG.sync.read(await p.screenshot({ type: 'png' }));
    await ctx.close();
    return png;
  };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 40) n++; return n / (a.width * a.height); };
  const d0 = await shot('&spread=0'), d1 = await shot('&spread=0'), sp = await shot('');
  const control = diff(d0, d1), moved = diff(d0, sp);
  assert(control < 0.001, 'two default frames differ: ' + control);
  assert(moved > 0.01, 'spread changed only ' + moved + ' of the frame');
  return { under1m: thin + ' of ' + drawn.length, stackedFootprints: { nearestStation: st0, spread: st1 }, pixelShare: { spread: +moved.toFixed(4), control: +control.toFixed(5) } };
});

await browser.close();
const file = path.join(ROOT, 'test-results', 'p6.json');
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const byName = Object.fromEntries((prev.results || []).map(r => [r.name, r]));
for (const r of results) byName[r.name] = r;
fs.writeFileSync(file, JSON.stringify({ base: BASE, when: new Date().toISOString(), results: Object.values(byName), consoleProblems }, null, 1));
console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed', consoleProblems.length ? 'console problems: ' + consoleProblems.length : 'console clean');
process.exit(results.every(r => r.pass) ? 0 : 1);
