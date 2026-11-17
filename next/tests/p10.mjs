// P10 tests (ADDENDUM-D D1, loop modes). Every rule here is first run on a planted wrong case and must fail there.
//   node tests/p10.mjs [http://localhost:8093/] --ref=http://localhost:8100/ [--only=name,name]
// --ref: the .p8 state (frame hashes with the loop off must equal it). Writes test-results/p10.json; strips of every
// Build stage for the review sheet go to docs/nashua/p10_build_<world>.jpg (d4). Exit code 1 on any failure.
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
const REF = (args.find(a => a.startsWith('--ref=')) || '').slice(6) || null;
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 1200) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1960,1200'] });
const watch = p => {
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
};
async function open(q, vp = { width: 1280, height: 720 }, base = BASE) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage(); watch(p);
  await p.goto(base + q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && (!/world=nashua/.test(location.search) || SSAV.world().pack) && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  return { ctx, p };
}
const settle = p => p.waitForFunction(() => !SSAV.fading && SSAV.world() && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 90000 });
const quiet = p => p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; });

// ink: the share of pixels at least 40 darker (luminance) than the paper, the paper being the 90th percentile
function inkOf(png) {
  const n = png.width * png.height, L = new Uint8Array(n);
  for (let i = 0; i < n; i++) L[i] = (png.data[i * 4] * 0.299 + png.data[i * 4 + 1] * 0.587 + png.data[i * 4 + 2] * 0.114) | 0;
  const h = new Uint32Array(256); for (const v of L) h[v]++;
  let c = 0, paper = 255; for (let v = 0; v < 256; v++) { c += h[v]; if (c >= n * 0.9) { paper = v; break; } }
  let k = 0; for (const v of L) if (v < paper - 40) k++;
  return k / n;
}
const shot = async p => PNG.sync.read(await p.screenshot({ type: 'png' }));

// ---------- d1: the control: bar, Show panel, key, MIDI roles, URL, links, kept per instance, closed where it does not apply ----------
await test('d1-loop-control', async () => {
  const { ctx, p } = await open('?i=p10-d1&world=nashua&seed=1');
  const st = () => p.evaluate(() => ({ ...SSAV.loop, label: document.getElementById('b-loop').textContent }));
  const seq = [];
  for (let i = 0; i < 4; i++) { await p.click('#b-loop'); await p.waitForTimeout(200); const s = await st(); seq.push(s.cfg + ':' + s.label); }
  assert(seq.join(' ') === 'loop:Loop on layers:Layers build:Build off:Loop', 'the bar cycle in nashua: ' + seq.join(' '));
  await p.keyboard.press('q'); assert((await st()).cfg === 'loop', 'key Q');
  const roles = await p.evaluate(() => SSAV.midiRoles());
  for (const r of ['loopMode', 'loopNext', 'loopHold']) assert(roles.includes(r), 'MIDI role ' + r);
  await p.evaluate(() => SSAV.midiAct('loopMode')); assert((await st()).cfg === 'layers', 'MIDI loopMode');
  await p.evaluate(() => SSAV.midiAct('loopHold')); assert((await st()).hold, 'MIDI loopHold');
  const s0 = (await st()).stage; await p.evaluate(() => SSAV.midiAct('loopNext')); const s1 = await st();
  assert(s1.stage === s0 + 1 && s1.pass === 2, 'MIDI loopNext: stage ' + s0 + ' -> ' + s1.stage + ', pass ' + s1.pass);
  const links = await p.evaluate(() => [...SSAV.pairLinks(1), ...SSAV.windowLinks(1, '2x1')]);
  assert(links.every(u => new URL(u).searchParams.get('loop') === 'layers'), 'links carry loop: ' + links[0]);
  // the controller line names the pass and the stage; the output has no such line (output.html has no hud)
  const line = await p.evaluate(() => document.getElementById('hud-loop').textContent);
  assert(/pass 2/.test(line) && /mode 2 of/.test(line), 'controller line ' + line);
  const outHas = /hud-loop|Loop layers/.test(fs.readFileSync(path.join(ROOT, 'output.html'), 'utf8'));
  assert(!outHas, 'the output page carries the loop line');
  // kept per instance: a reload without ?loop= comes back in layers
  await p.goto(BASE + '?i=p10-d1&world=nashua&seed=1'); await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  const kept = (await st()).cfg;
  await ctx.close();
  assert(kept === 'layers', 'not kept per instance: ' + kept);
  // shanshui: Layers is closed (shown disabled with a line why); derelict: Layers and Build
  const why = {};
  for (const w of ['shanshui', 'derelict']) {
    const { ctx: c2, p: q } = await open(`?i=p10-d1-${w}&world=${w}&seed=1&loop=off`);
    const seqW = [];
    for (let i = 0; i < 4; i++) { await q.click('#b-loop'); await q.waitForTimeout(150); seqW.push(await q.evaluate(() => SSAV.loop.cfg)); }
    const dis = await q.evaluate(() => [...document.querySelectorAll('#s-loop button')].filter(b => b.disabled).map(b => b.dataset.v + ': ' + b.title));
    const line = await q.evaluate(() => document.getElementById('s-loop-why').textContent);
    await c2.close();
    why[w] = { cycle: seqW.join(' '), disabled: dis, line };
    if (w === 'shanshui') assert(seqW.join(' ') === 'loop build off loop' && dis.length === 1 && /^layers/.test(dis[0]), 'shanshui ' + JSON.stringify(why[w]));
    else assert(seqW.join(' ') === 'loop off loop off' && dis.length === 2, 'derelict ' + JSON.stringify(why[w]));
    assert(line.length > 10, w + ': no line why');
  }
  return { nashuaCycle: seq, links: links[0].split('?')[1], line, kept, why };
});

// ---------- d2: the seam. A pass runs to the end, crossfades back to the start, the pass count goes up, and no frame
// of the crossfade is blank. Rule: every frame sampled from the seam to the end of the fade has ink >= 0.4 %.
// Planted: a frame of the nashua world past the end of its reach with the loop off (bare paper) must fail the rule.
await test('d2-loop-seam', async () => {
  const out = {};
  // planted
  {
    const { ctx, p } = await open('?i=p10-d2p&world=nashua&seed=1&loop=off&ends=pingpong&palette=original');
    await quiet(p);
    await p.evaluate(() => { SSAV.pb.x = SSAV.loopSpan() + 6000; });
    await p.waitForTimeout(1500);
    const ink = inkOf(await shot(p));
    await ctx.close();
    assert(ink < 0.004, 'planted: a bare paper frame passed the not-blank rule (ink ' + ink + ')');
    out.planted = +ink.toFixed(5);
  }
  for (const [w, q] of [['nashua', 'world=nashua&seed=1'], ['shanshui', 'seed=3']]) {
    const { ctx, p } = await open(`?i=p10-d2-${w}&${q}&loop=loop&palette=original`);
    await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; });
    // run up to 3 s before the end of the pass at 600 px/s
    await p.evaluate(() => { SSAV.pb.pause(); SSAV.cfg.speed = 600; SSAV.pb.speed = 600; SSAV.pb.dir = 1; SSAV.pb.x = SSAV.world().pack ? SSAV.loopSpan() - SSAV.viewW() - 1800 : SSAV.loopSpan() - 1800; });
    await settle(p); await p.waitForTimeout(500);
    const pass0 = await p.evaluate(() => SSAV.loop.pass);
    await p.evaluate(() => SSAV.pb.play());
    const inks = [], t0 = Date.now(); let seamAt = 0, ended = 0;
    while (Date.now() - t0 < 30000) {
      const s = await p.evaluate(() => ({ pass: SSAV.loop.pass, fading: SSAV.loop.fading, x: SSAV.x }));
      if (!seamAt && s.pass > pass0) seamAt = Date.now();
      if (seamAt) { inks.push(inkOf(await shot(p))); if (!s.fading) { ended++; if (ended > 2) break; } }
      else await p.waitForTimeout(100);
    }
    const st = await p.evaluate(() => ({ ...SSAV.loop, x: SSAV.x }));
    await ctx.close();
    assert(seamAt, w + ': no seam in 30 s');
    assert(inks.length >= 5, w + ': too few frames in the crossfade: ' + inks.length);
    const low = Math.min(...inks);
    assert(low >= 0.004, w + `: a blank frame in the crossfade (ink ${low.toFixed(4)})`);
    assert(st.pass === pass0 + 1 && st.x < 3 * 600 + 2000, w + ': after the seam ' + JSON.stringify({ pass: st.pass, x: st.x }));
    out[w] = { frames: inks.length, minInk: +low.toFixed(4), pass: st.pass, xAfter: Math.round(st.x) };
  }
  return out;
});

// ---------- d3: Layers. Each pass the next layer mode, from the start; the outgoing pass keeps its own layers in the
// crossfade; design is skipped when the design pack is absent (the Pages host), and said once.
// Run twice: with the local design pack, and with its probe answered 404 (as where the pack is not, which the cycle
// must skip and say once). The 404 run's own expected console line ("Failed to load resource ... 404") is not counted.
for (const absent of [false, true]) await test(absent ? 'd3-layers-no-design' : 'd3-layers', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (absent) await ctx.route('**/data/local/nashua/design/pack.json', r => r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  const n0 = consoleProblems.length; watch(p);
  await p.goto(BASE + `?i=p10-d3${absent ? 'n' : ''}&world=nashua&seed=1&loop=off`);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  await p.evaluate(() => SSAV.setLoop('layers'));
  await p.waitForFunction(() => SSAV.loop.design !== 'probing' && SSAV.loop.design !== null, null, { timeout: 10000 });
  const design = await p.evaluate(() => SSAV.loop.design);
  const names = [], during = [];
  for (let i = 0; i < 5; i++) {
    const s = await p.evaluate(() => ({ name: SSAV.loop.name, layers: SSAV.loop.layers.join(','), stage: SSAV.loop.stage }));
    names.push(s.name);
    await p.evaluate(() => SSAV.loopNext());
    // inside the crossfade: two worlds, the outgoing with the last mode's layers
    const fsw = await p.evaluate(() => SSAV.frameState().worlds.map(w => (w.layers || []).join(',')));
    during.push(fsw.length === 2 && fsw[0] === s.layers && fsw[1] !== s.layers);
    await p.waitForFunction(() => !SSAV.loop.fading, null, { timeout: 30000 });
  }
  const said = await p.evaluate(() => document.getElementById('s-loop-design').hidden ? '' : document.getElementById('s-loop-design').textContent);
  await ctx.close();
  if (absent) { for (let i = consoleProblems.length - 1; i >= n0; i--) if (/404/.test(consoleProblems[i].text)) consoleProblems.splice(i, 1); }
  assert(design === !absent, (absent ? 'the 404 probe' : 'the local probe') + ' gave design pack ' + design);
  const want = design === true ? ['nature', 'built', 'design', 'sections', 'nature'] : ['nature', 'built', 'sections', 'nature', 'built'];
  assert(names.join() === want.join(), 'the cycle ' + names.join(' ') + ' (design pack ' + design + ')');
  assert(during.every(Boolean), 'the outgoing pass did not keep its layers in the crossfade: ' + during.join(' '));
  assert(design === true ? !said : /design is skipped/.test(said), 'design line: ' + said);
  return { designPack: design, cycle: names, outgoingKeepsLayers: during.length, line: said };
});

// ---------- d4: Build. Each stage adds ink over the one before. Rule: at least 0.08 % of the pixels of a strip of
// 6 views (1280 x 720, about 740 px a view) are 30 or more darker (luminance) than at the same place one stage before.
// Planted: a stage measured twice (k against itself) must fail it. Strips saved for the review sheet.
// History of the rule (logged in DECISIONS): first the ink share must grow by 2 % plus 0.0005, then by 0.0008; both
// fail where a stage adds marks that also cover darker ink (white tree crowns over the bank fill) or lighten the
// frame (stage 8's mist), so the rule counts the pixels a stage darkens, which is what adding ink means.
// six views evenly along the pass: nashua over the reach, shanshui over its 16 views
const XS = { shanshui: [0, 1, 2, 3, 4, 5].map(i => Math.round(1245 * (0.5 + i * 2.5))), nashua: [0, 1, 2, 3, 4, 5].map(i => Math.round((i + 0.5) / 6 * (17270 - 1245))) };
async function stageStrip(p, xs) {
  const pngs = [];
  for (const x of xs) { await p.evaluate(x => { SSAV.pb.x = x; }, x); await settle(p); await p.waitForTimeout(400); pngs.push(await shot(p)); }
  return pngs;
}
function hstack(pngs, scale = 0.25) {
  const w = Math.floor(pngs[0].width * scale), h = Math.floor(pngs[0].height * scale), out = new PNG({ width: w * pngs.length, height: h });
  pngs.forEach((s, k) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((Math.floor(y / scale)) * s.width + Math.floor(x / scale)) * 4, j = (y * out.width + k * w + x) * 4; for (let c = 0; c < 4; c++) out.data[j + c] = s.data[i + c]; } });
  return out;
}
function vstack(rows) {
  const out = new PNG({ width: rows[0].width, height: rows.reduce((s, r) => s + r.height, 0) });
  let y0 = 0; for (const r of rows) { r.data.copy(out.data, y0 * out.width * 4); y0 += r.height; }
  return out;
}
// the share of pixels darker by 30 or more in b than in a (same size)
function darkened(a, b) {
  let k = 0;
  const lum = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  for (let i = 0; i < a.data.length; i += 4) if (lum(a.data, i) - lum(b.data, i) >= 30) k++;
  return k / (a.width * a.height);
}
const stripDark = (A, B) => A.reduce((s, a, i) => s + darkened(a, B[i]), 0) / A.length;
const ruleAdds = d => d >= 0.0008;
await test('d4-build-stages', async () => {
  const out = {};
  for (const [w, q] of [['shanshui', 'seed=3'], ['nashua', 'world=nashua&seed=1']]) {
    const { ctx, p } = await open(`?i=p10-d4-${w}&${q}&loop=build&palette=original`);
    await quiet(p);
    await p.evaluate(() => { SSAV.cfg.weather.holds = { rain: 0, fog: 0.35, light: 1, wind: 0.2, water: 0.3 }; });
    const inks = [], adds = [], rows = [];
    let prev = null, repeat = null;
    for (let k = 1; k <= 8; k++) {
      const st = await p.evaluate(() => SSAV.loop);
      assert(st.build === k, w + ': expected stage ' + k + ', at ' + st.build);
      const pngs = await stageStrip(p, XS[w]);
      inks.push(+(pngs.reduce((s, g) => s + inkOf(g), 0) / pngs.length).toFixed(5)); rows.push(hstack(pngs));
      // stage 1 against bare paper: the strip's own ink
      adds.push(+(prev ? stripDark(prev, pngs) : inks[0]).toFixed(5));
      if (k === 4) { repeat = stripDark(pngs, await stageStrip(p, XS[w])); assert(!ruleAdds(repeat), w + ': planted (stage 4 twice) passed the rule: ' + repeat); }
      prev = pngs;
      if (k < 8) { await p.evaluate(() => SSAV.loopNext()); await p.waitForFunction(() => !SSAV.loop.fading, null, { timeout: 60000 }); }
    }
    // after stage 8 the cycle starts again at 1
    await p.evaluate(() => SSAV.loopNext()); await p.waitForFunction(() => !SSAV.loop.fading, null, { timeout: 60000 });
    const again = await p.evaluate(() => SSAV.loop.build);
    const labels = await p.evaluate(() => document.querySelectorAll('#labels > *').length && !document.getElementById('labels').hidden);
    await ctx.close();
    // the strip for the review sheet: stages 1 to 8 top to bottom, six views each, written as JPEG by the browser
    const img = vstack(rows);
    { const c = await browser.newContext({ viewport: { width: img.width, height: img.height } }), j = await c.newPage();
      await j.setContent(`<body style="margin:0"><img src="data:image/png;base64,${PNG.sync.write(img).toString('base64')}"></body>`);
      await j.screenshot({ path: path.join(ROOT, 'docs', 'nashua', `p10_build_${w}.jpg`), type: 'jpeg', quality: 82 }); await c.close(); }
    const fails = [];
    for (let k = 0; k < 8; k++) if (!ruleAdds(adds[k])) fails.push(`stage ${k + 1} darkens ${adds[k]}`);
    out[w] = { inkShare: inks, darkenedOverPrevious: adds, plantedRepeat: +repeat.toFixed(6), restartsAt: again, labels };
    assert(!fails.length, w + ': stages that add no ink: ' + fails.join('; '));
    assert(again === 1, w + ': after stage 8 came ' + again);
    assert(!labels, w + ': labels shown in Build');
  }
  return out;
});

// ---------- d5: clock mode follows the loop: a node at pass 3 of Build draws stage 3; at a seam two worlds crossfade ----------
await test('d5-clock-loop', async () => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const p = await ctx.newPage(); watch(p);
  // 60 px/s; shanshui span = 16 view widths of this node
  await p.goto(BASE + `output.html?world=shanshui&seed=3&loop=build&speed=60&t0=${Date.now()}`);
  await p.waitForFunction(() => window.SSOUT && SSOUT.scene.lastFrame, null, { timeout: 60000 });
  const span = await p.evaluate(() => { const v = SSOUT.scene.lastFrame.v; return 16 * v.viewW; });
  await ctx.close();
  const res = {};
  for (const [name, d] of [['pass3', span * 2 + span / 2], ['seam', span * 3 + 30]]) {
    const c2 = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const q = await c2.newPage(); watch(q);
    await q.goto(BASE + `output.html?world=shanshui&seed=3&loop=build&speed=60&t0=${Date.now() - d / 60 * 1000}`);
    await q.waitForFunction(() => window.SSOUT && SSOUT.scene.lastFrame, null, { timeout: 60000 });
    res[name] = await q.evaluate(() => { const fs = SSOUT.scene.lastFrame.fs; return { loop: fs.loop, worlds: fs.worlds.map(w => ({ build: w.opts && w.opts.build, a: +w.alpha.toFixed(2) })) }; });
    await c2.close();
  }
  // planted: without &loop= the node has one world and no loop
  const c3 = await browser.newContext({ viewport: { width: 640, height: 360 } }); const r3 = await c3.newPage();
  await r3.goto(BASE + `output.html?world=shanshui&seed=3&speed=60&t0=${Date.now() - span * 3 / 60 * 1000}`);
  await r3.waitForFunction(() => window.SSOUT && SSOUT.scene.lastFrame, null, { timeout: 60000 });
  const plain = await r3.evaluate(() => { const fs = SSOUT.scene.lastFrame.fs; return { loop: fs.loop || null, n: fs.worlds.length }; });
  await c3.close();
  assert(!plain.loop && plain.n === 1, 'planted: a node without loop= ' + JSON.stringify(plain));
  assert(res.pass3.loop && res.pass3.loop.stage === 3 && res.pass3.worlds.at(-1).build === 3, 'pass 3 ' + JSON.stringify(res.pass3));
  const sw = res.seam.worlds;
  assert(sw.length === 2 && sw[0].build === 3 && sw[1].build === 4 && sw[0].a === 1 && sw[1].a < 0.5, 'seam ' + JSON.stringify(res.seam));
  return { span: Math.round(span), ...res };
});

// ---------- d6: the loop off: frame hashes equal the .p8 state on all three worlds, dry and heavy ----------
const WX = { dry: { rain: 0, wind: 0.2, water: 0.3, fog: 0, light: 1 }, heavy: { rain: 1, wind: 1, water: 1, fog: 0.6, light: 0.55 } };
async function fixedFrame(p, wx) {
  return p.evaluate(async wx => {
    const fs = SSAV.frameState();
    fs.time = 12.5; fs.weather = wx; fs.v = 0; fs.fx = null;
    const s = SSAV.scene; SSAV.cfg.q = 1; s.q = 1; s.frame(fs); s.frame(fs);
    const gl = s.renderer.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', px))).map(b => b.toString(16).padStart(2, '0')).join('');
  }, wx);
}
await test('d6-loop-off-identical', async () => {
  assert(REF, '--ref (the .p8 server) is needed');
  const out = {}, Q = { shanshui: 'seed=1', derelict: 'world=derelict&seed=1', nashua: 'world=nashua&seed=1' }, X = { shanshui: 3000, derelict: 3000, nashua: 11200 };
  for (const w of Object.keys(Q)) for (const k of Object.keys(WX)) {
    const frame = async (base, extra) => {
      const { ctx, p } = await open(`?i=p10-d6-${w}&${Q[w]}&palette=original${extra}`, { width: 1280, height: 720 }, base);
      await quiet(p); await p.evaluate(x => { SSAV.pb.x = x; }, X[w]); await settle(p);
      const h = await fixedFrame(p, WX[k]); await ctx.close(); return h;
    };
    const a = await frame(REF, ''), b = await frame(BASE, '&loop=off');
    // planted: the same frame with Build stage 4 differs
    const c = k === 'dry' && w !== 'derelict' ? await frame(BASE, '&loop=build') : null;
    if (c) assert(c !== a, w + ': planted (Build) hashed equal to the reference');
    out[w + ' ' + k] = a === b ? 'equal' : 'DIFFERS';
  }
  const bad = Object.entries(out).filter(([, v]) => v !== 'equal');
  assert(!bad.length, 'loop off differs from .p8: ' + bad.map(e => e[0]).join(', '));
  return out;
});

await browser.close();
const file = path.join(ROOT, 'test-results', 'p10.json');
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const byName = Object.fromEntries((prev.results || []).map(r => [r.name, r]));
for (const r of results) byName[r.name] = r;
fs.writeFileSync(file, JSON.stringify({ base: BASE, when: new Date().toISOString(), results: Object.values(byName), consoleProblems }, null, 1));
console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed', consoleProblems.length ? 'console problems: ' + consoleProblems.length : 'console clean');
process.exit(results.every(r => r.pass) ? 0 : 1);
