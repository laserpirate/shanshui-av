// P8 tests (ADDENDUM-B B11, the mirror). Every rule here is first run on a planted wrong picture and must fail there.
//   node tests/p8.mjs [http://localhost:8100/] --ref=http://localhost:8093/ [--only=name,name]
// --ref: the .p7 state (feat/nashua at the .p7 tag). Writes test-results/p8.json. Exit code 1 on any failure.
// A frame for a hash is drawn by the test inside the page at a fixed time and weather, and read back right after it is
// drawn (a test hook, not the frame path).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';
import pngjs from '../tools/node_modules/pngjs/lib/png.js';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8100/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const REF = (args.find(a => a.startsWith('--ref=')) || '').slice(6) || null;
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 900) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1960,1200'] });
const watch = p => {
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
};
async function open(q, vp = { width: 1280, height: 720 }, base = BASE, ctx0 = null) {
  const ctx = ctx0 || await browser.newContext({ viewport: vp });
  const p = await ctx.newPage(); watch(p);
  await p.goto(base + q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && (!/world=nashua/.test(location.search) || SSAV.world().pack) && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  return { ctx, p };
}
const settle = p => p.waitForFunction(() => !SSAV.fading && SSAV.world() && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 90000 });
// the mirror world is settled too: its tiles cover its view
const settleMirror = p => p.waitForFunction(() => { for (const [k, w] of SSAV.scene.worlds) if (k.startsWith('mirror:')) return !w.world.pendingRaster && w.world.tiles.size > 0; return false; }, null, { timeout: 90000 });
const quiet = p => p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.pause(); SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 }; SSAV.cfg.nashua.labels = false; });

// one frame at a fixed time and weather, its pixels hashed (SHA-256) and optionally returned as a PNG-sized RGBA array
const WX = { dry: { rain: 0, wind: 0.2, water: 0.3, fog: 0, light: 1 }, heavy: { rain: 1, wind: 1, water: 1, fog: 0.6, light: 0.55 } };
async function fixedFrame(p, wx, keep = false) {
  return p.evaluate(async ([wx, keep]) => {
    const fs = SSAV.frameState();
    fs.time = 12.5; fs.weather = wx; fs.v = 0; fs.fx = null;
    const s = SSAV.scene; SSAV.cfg.q = 1; s.q = 1; s.frame(fs); s.frame(fs);
    const gl = s.renderer.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', px))).map(b => b.toString(16).padStart(2, '0')).join('');
    return { h, W, H, px: keep ? Array.from(px) : null, mirror: !!fs.mirror };
  }, [wx, keep]);
}
// share of pixels that differ by more than 30 (sum of |dR|+|dG|+|dB|) in rows [y0, y1) of two RGBA arrays (GL rows: 0 = bottom)
function diffRows(a, b, W, y0, y1, map = null) {
  let n = 0, t = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const [bx, by] = map ? map(x, y) : [x, y];
    if (by < 0 || bx < 0 || bx >= W) continue;
    const i = (y * W + x) * 4, j = (by * W + bx) * 4;
    t++; if (Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]) > 30) n++;
  }
  return t ? n / t : 0;
}
const WORLDQ = { shanshui: 'seed=1', derelict: 'world=derelict&seed=1', nashua: 'world=nashua&seed=1' };
const XAT = { shanshui: 3000, derelict: 3000, nashua: 1400 * 8 };

// ---------- the flag off: the frame is the .p7 frame, byte for byte, on all three worlds ----------
// The rule: equal SHA-256 of the RGBA buffer. Control: the same server twice. Planted: the mirror on (same server).
await test('m1-flag-off-identical', async () => {
  assert(REF, '--ref (the .p7 server) is needed');
  const out = {};
  for (const w of Object.keys(WORLDQ)) {
    for (const wxk of ['dry', 'heavy']) {
      const frame = async (base, q) => {
        const { ctx, p } = await open(`?i=p8-m1-${w}&${WORLDQ[w]}&palette=original${q}`, { width: 1280, height: 720 }, base);
        await quiet(p);
        await p.evaluate(x => { SSAV.pb.x = x; }, XAT[w]);
        await settle(p); await p.waitForTimeout(400);
        if (/mon=1/.test(q)) await settleMirror(p);
        const f = await fixedFrame(p, WX[wxk]);
        await ctx.close();
        return f;
      };
      const ref = await frame(REF, ''), off = await frame(BASE, ''), off2 = await frame(BASE, ''), flag = await frame(BASE, '&mirror=1');
      const on = await frame(BASE, '&mirror=1&mon=1&mstr=1');
      const same = (a, b) => a.h === b.h && a.W === b.W && a.H === b.H;
      assert(same(off, off2), w + ' ' + wxk + ': the control, two flag-off frames on one server, differ');
      assert(!same(on, off) && on.mirror, 'planted: ' + w + ' ' + wxk + ' the mirror on passed the identity rule');
      assert(same(off, ref), w + ' ' + wxk + ': flag off differs from .p7');
      assert(same(flag, ref), w + ' ' + wxk + ': ?mirror=1 with the mirror off differs from .p7');
      out[w + ':' + wxk] = off.h.slice(0, 12);
    }
  }
  return out;
});

// ---------- the geometry: below the axis is the alternate world flipped about the axis ----------
// nashua, the other bank, scroll with, strength 1: the lower part equals the other bank's own frame (bank R, at the
// same stations) turned upside down and left to right. Planted: the same frame compared without the left-right turn.
await test('m2-flip-geometry', async () => {
  const axis = 20;
  const { ctx, p } = await open(`?i=p8-m2&world=nashua&seed=1&palette=original&mirror=1&mon=1&mstr=1&maxis=${axis}&malt=other&mscroll=with`);
  await quiet(p);
  await p.evaluate(() => { SSAV.pb.x = 900 * 8; SSAV.cfg.u = SSAV.cfg.u; SSAV.cfg.vignette = false; });
  await settle(p); await settleMirror(p); await p.waitForTimeout(400);
  const g = await p.evaluate(ax => { const v = SSAV.view(), P = SSAV.world().pack; return { A: Math.round((600 - v.camY) * v.scale + ax), x: SSAV.x, vw: SSAV.viewW(), span: P.route_len_m * P.hx }; }, axis);
  const m = await fixedFrame(p, WX.dry, true);
  await ctx.close();
  // the other bank as the main world, its camera so its view covers the same stations: left edge span - x - viewW.
  // Its mirror is on at 0.002 (invisible) so it has the mirror's view (scale) too.
  const { ctx: c2, p: p2 } = await open(`?i=p8-m2r&world=nashua&seed=1&palette=original&bank=R&mirror=1&mon=1&mstr=0.002&maxis=${axis}`);
  await quiet(p2);
  await p2.evaluate(([x]) => { SSAV.pb.x = x; SSAV.cfg.vignette = false; }, [g.span - g.x - g.vw]);
  await settle(p2); await p2.waitForTimeout(400);
  const r = await fixedFrame(p2, WX.dry, true);
  await c2.close();
  const { W, H } = m, A = g.A;
  // GL rows: screen row y is GL row H-1-y. Below the axis on screen (y >= A) is GL rows [0, H-A).
  // Screen (x, y) below the axis shows screen (W-1-x, 2A-1-y) of the other bank's frame.
  const flipMap = (x, gy) => { const y = H - 1 - gy, sy = 2 * A - 1 - y; return [W - 1 - x, H - 1 - sy]; };
  const noTurn = (x, gy) => { const y = H - 1 - gy, sy = 2 * A - 1 - y; return [x, H - 1 - sy]; };
  const rows = Math.min(H - A, A);   // only rows whose source is on screen
  const y0 = H - A - rows, y1 = H - A;
  const good = diffRows(m.px, r.px, W, y0, y1, flipMap), planted = diffRows(m.px, r.px, W, y0, y1, noTurn);
  // above the axis: the main frame unchanged against the same view with the mirror off is m1's job; here, rows above
  const rule = d => d < 0.03;
  assert(!rule(planted), 'planted: the frame without the left-right turn passed (' + planted.toFixed(3) + ')');
  assert(rule(good), 'the lower part is not the other bank flipped: ' + good.toFixed(3) + ' of pixels differ');
  return { A, rows, good: +good.toFixed(4), planted: +planted.toFixed(3) };
});

// ---------- the controls: the panel, every MIDI role, the axis moves the line, strength fades it ----------
await test('m3-controls', async () => {
  const { ctx, p } = await open('?i=p8-m3&world=nashua&seed=1&palette=original&mirror=1');
  const shown = await p.evaluate(() => !document.getElementById('b-mirror').hidden);
  const roles = await p.evaluate(() => SSAV.midiRoles());
  const want = ['mirror', 'mirrorAxis', 'mirrorStrength', 'mirrorScroll', 'mirrorAlt'];
  assert(shown && want.every(r => roles.includes(r)), 'button ' + shown + ', roles ' + want.filter(r => !roles.includes(r)));
  await p.click('#b-mirror'); await p.waitForTimeout(200);
  await p.click('#mi-on'); await p.waitForTimeout(100);
  const on = await p.evaluate(() => SSAV.cfg.mirror.on && !!SSAV.frameState().mirror);
  await p.evaluate(() => { SSAV.midiAct('mirrorAxis', 1); SSAV.midiAct('mirrorStrength', 0.5); SSAV.midiAct('mirrorScroll'); SSAV.midiAct('mirrorAlt'); });
  const M = await p.evaluate(() => ({ ...SSAV.cfg.mirror }));
  const fsM = await p.evaluate(() => SSAV.frameState().mirror);
  await p.evaluate(() => SSAV.midiAct('mirror'));
  const off = await p.evaluate(() => !SSAV.cfg.mirror.on && !SSAV.frameState().mirror);
  // the seg buttons
  await p.click('#mi-on'); await p.click('#mi-scroll button[data-v="free"]'); await p.click('#mi-alt button[data-v="derelict"]');
  const seg = await p.evaluate(() => [SSAV.cfg.mirror.scroll, SSAV.cfg.mirror.alt, SSAV.frameState().mirror.world]);
  // the pair links carry it
  const links = await p.evaluate(() => SSAV.pairLinks(1));
  await ctx.close();
  // without the flag: no button, no roles, no fs.mirror even with mon=1
  const { ctx: c2, p: p2 } = await open('?i=p8-m3b&world=nashua&seed=1&mon=1');
  const none = await p2.evaluate(() => [document.getElementById('b-mirror').hidden, SSAV.midiRoles().includes('mirror'), !!SSAV.frameState().mirror, SSAV.cfg.mirror === undefined]);
  await c2.close();
  assert(on && off, 'on/off ' + on + ' ' + off);
  assert(M.axis === 80 && M.strength === 0.5 && M.scroll === 'against' && M.alt === 'shanshui', 'MIDI ' + JSON.stringify(M));
  assert(fsM && fsM.world === 'shanshui' && fsM.mode === 'against' && fsM.alpha === 0.5 && fsM.axis === 80, 'frame state ' + JSON.stringify(fsM));
  assert(seg[0] === 'free' && seg[1] === 'derelict' && seg[2] === 'derelict', 'seg ' + seg);
  assert(links.every(l => /mirror=1/.test(l) && /mon=1/.test(l) && /mscroll=free/.test(l) && /malt=derelict/.test(l)), 'pair links ' + links[0]);
  assert(none[0] && !none[1] && !none[2] && none[3], 'flag off: ' + none);
  return { roles: want.length, links: links[0].replace(/^.*\?/, '').slice(0, 200) };
});

// the axis rule: two frames that differ only in the lower half's world (derelict, then shanshui) are the same above
// the axis and differ from it down; the first changed row (from the top) is the water line plus the axis.
async function changedFrom(p, axis) {
  const shot = async alt => {
    await p.evaluate(([a, alt]) => { SSAV.cfg.mirror = { ...SSAV.cfg.mirror, on: true, axis: a, strength: 1, alt }; }, [axis, alt]);
    await p.waitForTimeout(150); await settle(p); await settleMirror(p); await p.waitForTimeout(300);
    return fixedFrame(p, WX.dry, true);
  };
  const a = await shot('derelict'), b = await shot('shanshui');
  const yw = await p.evaluate(() => { const v = SSAV.view(); return (600 - v.camY) * v.scale; });
  const { W, H } = a;
  for (let y = 0; y < H; y++) { const gy = H - 1 - y; if (diffRows(a.px, b.px, W, gy, gy + 1) > 0.02) return { y, H, yw }; }
  return { y: H, H, yw };
}
await test('m4-axis', async () => {
  const { ctx, p } = await open('?i=p8-m4&world=nashua&seed=1&palette=original&mirror=1&mon=1&mstr=1&malt=derelict');
  await quiet(p); await p.evaluate(() => { SSAV.pb.x = 900 * 8; });
  await settle(p); await settleMirror(p); await p.waitForTimeout(400);
  const a0 = await changedFrom(p, 0), a80 = await changedFrom(p, 80);
  await ctx.close();
  // the rule: the first changed row sits within 2 px of the water line plus the axis
  const rule = (r, ax) => Math.abs(r.y - (r.yw + ax)) <= 2;
  assert(!rule(a0, 80), 'planted: the axis-0 frame passed the axis-80 rule');
  assert(rule(a0, 0) && rule(a80, 80), 'first changed row ' + a0.y + ' and ' + a80.y + ', water line ' + a0.yw.toFixed(1) + ' and ' + a80.yw.toFixed(1));
  return { axis0: { waterLine: +a0.yw.toFixed(1), row: a0.y }, axis80: { waterLine: +a80.yw.toFixed(1), row: a80.y } };
});

// ---------- the scroll modes: with follows the main world, against runs the other way, free on its own ----------
await test('m5-scroll', async () => {
  const { ctx, p } = await open('?i=p8-m5&seed=1&mirror=1&mon=1&malt=other');
  await quiet(p);
  const mx = mode => p.evaluate(async m => {
    SSAV.cfg.mirror = { ...SSAV.cfg.mirror, scroll: m };
    // the lower picture's motion on screen in world px (negative: to the left, as the upper one moves when x grows);
    // a turned world (flip) shows x decreasing to the right, so its picture moves with +dx
    const at = async x => { SSAV.pb.x = x; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const m = SSAV.scene.lastFrame.f.mirror; return m ? (m.flip ? m.x : -m.x) : null; };
    const a = await at(1000), b = await at(1400);
    return b - a;
  }, mode);
  const w = await mx('with'), ag = await mx('against');
  // against on an endless world: its ground is there (covered within 30 s). Planted: the camera at 100000 - x
  // (the first build), where an unchunked world has generated nothing
  const cov = await p.evaluate(async () => {
    const t0 = performance.now();
    let w = null, m = null, c = 0;
    while (performance.now() - t0 < 30000) {
      await new Promise(r => setTimeout(r, 500));
      m = SSAV.scene.lastFrame.f.mirror; w = m && m.world;
      const vw = SSAV.viewW(), lo = m.flip ? m.x - vw : m.x;
      c = w.coverage(lo, lo + vw);
      if (c >= 0.999) break;
    }
    return { c, planted: w.coverage(1e5 - SSAV.x, 1e5 - SSAV.x + SSAV.viewW()) };
  });
  assert(!(cov.planted >= 0.999), 'planted: the camera at 100000 - x passed the coverage rule');
  assert(cov.c >= 0.999, 'against: the lower world is not there (coverage ' + cov.c + ')');
  // free: the main world paused and still, the mirror moves with the clock
  const fr = await p.evaluate(async () => {
    SSAV.cfg.mirror = { ...SSAV.cfg.mirror, scroll: 'free' };
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const x0 =SSAV.scene.lastFrame.f.mirror ? SSAV.scene.lastFrame.f.mirror.x : null;
    await new Promise(r => setTimeout(r, 1000));
    return [x0, SSAV.scene.lastFrame.f.mirror.x, SSAV.x];
  });
  // nashua below shanshui: against and free stay inside nashua's reach (the scene folds them by the loaded pack).
  // Planted: the unfolded camera (the spec's own x, 100000 - x for against) is outside it.
  const inReach = await p.evaluate(async () => {
    const res = {};
    for (const m of ['against', 'free']) {
      SSAV.cfg.mirror = { ...SSAV.cfg.mirror, alt: 'nashua', scroll: m };
      SSAV.pb.x = 3000;
      await new Promise(r => setTimeout(r, 4000));
      let span = 0;
      for (const [k, w] of SSAV.scene.worlds) if (k.startsWith('mirror:') && w.world.pack) span = w.world.pack.route_len_m * (w.world.pack.hx || 8);
      const M = SSAV.frameState().mirror;
      res[m] = { x: SSAV.scene.lastFrame.f.mirror.x, span, raw: m === 'against' ? M.c - SSAV.x : M.d };
    }
    return res;
  });
  await ctx.close();
  const inside = r => r.span > 0 && r.x >= 0 && r.x <= r.span;
  assert(!inside({ ...inReach.against, x: inReach.against.raw }), 'planted: the unfolded against camera passed (' + inReach.against.raw + ')');
  assert(inside(inReach.against) && inside(inReach.free), 'nashua below: ' + JSON.stringify(inReach));
  assert(Math.abs(w + 400) < 1, 'with: the lower picture moved ' + w + ' (the upper: -400)');
  assert(Math.abs(ag - 400) < 1, 'against: the lower picture moved ' + ag + ' (the upper: -400)');
  assert(fr[1] - fr[0] > 10, 'free: the mirror did not move on its own ' + fr);
  return { with: w, against: ag, againstCoverage: cov.c, free: +(fr[1] - fr[0]).toFixed(1), nashuaBelow: { against: Math.round(inReach.against.x), free: Math.round(inReach.free.x), span: Math.round(inReach.against.span) } };
});

// ---------- the output window, a pair and a clock-mode wall node draw the mirror ----------
// The rule: below the axis differs from the mirror off by over 5 % of pixels; above it under 0.5 %. Planted: two
// frames with the mirror off fail the lower rule.
const PNGof = b => PNG.sync.read(b);
function bandDiff(a, b, y0, y1) {
  const A = PNGof(a), B = PNGof(b); let n = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(A.height, y1); y++) for (let x = 0; x < A.width; x++) { const i = (y * A.width + x) * 4; t++; if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30) n++; }
  return t ? n / t : 0;
}
async function outShot(ctx, q) {
  const o = await ctx.newPage(); watch(o);
  await o.setViewportSize({ width: 960, height: 540 });
  await o.goto(BASE + 'output.html?' + q);
  await o.waitForTimeout(6000);
  const b = await o.screenshot({ type: 'png' });
  await o.close();
  return { b };
}
// The rule, on each node: two frames that differ only in the lower half's world (derelict, then shanshui) differ below
// the axis by over 5 % of pixels and above it by under 0.5 %. Planted: two frames with the same lower world fail the
// lower rule.
await test('m6-output-pair-wall', async () => {
  const out = {};
  let cut = 0, same = null;
  // the output window of a controller (same instance, BroadcastChannel), and the right window of an Open pair
  for (const [name, oq] of [['output', ''], ['pair', 'wall=2x1&col=1&']]) {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const { p } = await open(`?i=p8-m6${name}&world=nashua&seed=1&palette=original&mirror=1&mon=1&mstr=1&malt=derelict`, { width: 960, height: 540 }, BASE, ctx);
    await quiet(p); await p.evaluate(() => { SSAV.pb.x = 900 * 8; SSAV.cfg.q = 1; });
    cut = await p.evaluate(() => { const v = SSAV.view(); return (600 - v.camY) * v.scale + SSAV.cfg.mirror.axis; });
    const A1 = await outShot(ctx, `i=p8-m6${name}&${oq}`), A2 = await outShot(ctx, `i=p8-m6${name}&${oq}`);
    if (name === 'output') { await settle(p); await settleMirror(p); await p.waitForTimeout(800); same = bandDiff(await p.screenshot({ type: 'png' }), A1.b, 0, 540); }
    await p.evaluate(() => { SSAV.cfg.mirror = { ...SSAV.cfg.mirror, alt: 'shanshui' }; });
    const B1 = await outShot(ctx, `i=p8-m6${name}&${oq}`);
    await ctx.close();
    out[name] = { below: bandDiff(B1.b, A1.b, cut + 4, 540), above: bandDiff(B1.b, A1.b, 0, cut - 4), control: bandDiff(A2.b, A1.b, cut + 4, 540), aboveControl: bandDiff(A2.b, A1.b, 0, cut - 4) };
  }
  // a clock-mode wall node: the m* parameters on its URL
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const t0 = Date.now() - 20000;
    const base = `world=nashua&seed=1&palette=original&wall=2x1&col=0&t0=${t0}&speed=0&mirror=1&mon=1&maxis=20&mstr=1`;
    const A1 = await outShot(ctx, base + '&malt=derelict'), A2 = await outShot(ctx, base + '&malt=derelict'), B1 = await outShot(ctx, base + '&malt=shanshui');
    await ctx.close();
    out.wall = { below: bandDiff(B1.b, A1.b, cut + 4, 540), above: bandDiff(B1.b, A1.b, 0, cut - 4), control: bandDiff(A2.b, A1.b, cut + 4, 540), aboveControl: bandDiff(A2.b, A1.b, 0, cut - 4) };
  }
  out.outputVsController = same;   // reported only: the controller draws at half resolution while an output is open
  out.waterLine = cut;
  // the upper rule: no more change above the axis than between two frames of the same state, plus 0.5 % (the scroll's
  // own motion: water and trees move with time). Planted: the lower band, which must fail it.
  const lower = d => d > 0.05, upper = (d, c) => d < c + 0.005;
  for (const [k, r] of Object.entries(out)) {
    if (typeof r === 'number') continue;
    assert(!lower(r.control), 'planted: ' + k + ' two same frames passed the lower rule (' + r.control.toFixed(3) + ')');
    assert(!upper(r.below, r.control), 'planted: ' + k + ' the lower band passed the upper rule');
    assert(lower(r.below), k + ': the lower part changed only ' + r.below.toFixed(3));
    assert(upper(r.above, r.aboveControl), k + ': the upper part changed ' + r.above.toFixed(4) + ' (two same frames: ' + r.aboveControl.toFixed(4) + ')');
  }
  return Object.fromEntries(Object.entries(out).map(([k, r]) => [k, typeof r === 'number' ? +r.toFixed(3) : { below: +r.below.toFixed(3), above: +r.above.toFixed(4), control: +r.control.toFixed(4), aboveControl: +r.aboveControl.toFixed(4) }]));
});

// ---------- 60 fps at 1080p in the heaviest weather, the mirror on ----------
// The rule: the median of 10 one-second fps samples is at least 58. Planted: the same page with 25 ms added per frame.
async function fpsRun(p, secs = 10) {
  return p.evaluate(async n => { const a = []; for (let i = 0; i < n; i++) { await new Promise(r => setTimeout(r, 1000)); a.push(SSAV.scene.fps); } a.sort((x, y) => x - y); return { med: a[a.length >> 1], min: a[0] }; }, secs);
}
await test('m7-fps-1080p-heavy', async () => {
  const out = {};
  for (const w of ['nashua', 'derelict', 'shanshui']) {
    const { ctx, p } = await open(`?i=p8-m7${w}&${WORLDQ[w]}&mirror=1&mon=1&mstr=0.85&quality=high`, { width: 1920, height: 1080 });
    await p.evaluate(() => { document.body.classList.add('uihidden'); SSAV.cfg.weather.holds = { rain: 1, wind: 1, water: 1, fog: 0.6, light: 0.55 }; if (SSAV.setLevel && /nashua/.test(location.search)) SSAV.setLevel(4); });
    await p.waitForTimeout(4000);
    const r = await fpsRun(p);
    if (w === 'nashua') {
      // planted: the same page with 25 ms of work added to every frame (a 12x slower CPU and 4x the resolution both
      // still ran at 60 here, so they cannot be the wrong state)
      await p.evaluate(() => { window.__hog = true; requestAnimationFrame(function hog() { if (!window.__hog) return; const t = performance.now(); while (performance.now() - t < 25); requestAnimationFrame(hog); }); });
      await p.waitForTimeout(1500);
      out.planted = await fpsRun(p, 5);
      await p.evaluate(() => { window.__hog = false; });
    }
    const vp = await p.evaluate(() => [innerWidth, innerHeight, SSAV.scene.renderer.gl.drawingBufferWidth]);
    await ctx.close();
    out[w] = { ...r, vp };
  }
  const rule = r => r.med >= 58;
  assert(!rule(out.planted), 'planted: 25 ms per frame passed the fps rule (' + out.planted.med.toFixed(1) + ')');
  for (const w of ['nashua', 'derelict', 'shanshui']) assert(rule(out[w]), w + ': median ' + out[w].med.toFixed(1) + ' fps');
  return Object.fromEntries(Object.entries(out).map(([k, r]) => [k, { med: +r.med.toFixed(1), min: +r.min.toFixed(1), ...(r.vp ? { vp: r.vp } : {}) }]));
});

await browser.close();
const file = path.join(ROOT, 'test-results', 'p8.json');
let prev = {}; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const byName = Object.fromEntries((prev.results || []).map(r => [r.name, r]));
for (const r of results) byName[r.name] = r;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ base: BASE, ref: REF, when: new Date().toISOString(), results: Object.values(byName), consoleProblems }, null, 1));
console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed', consoleProblems.length ? 'console problems: ' + consoleProblems.length : 'console clean');
process.exit(results.every(r => r.pass) ? 0 : 1);
