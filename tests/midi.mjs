// MIDI tests with a fake Web MIDI (no hardware): presets picked by port name, every preset binding fires its
// action, soft takeover, the REC panic hold, STOP blackout under a 500 CC/s flood, reseed debounce, hot-unplug,
// learn persisting per device, the output window following (and never asking for MIDI), MIDI out off by default and
// sending scene data when on.
//   node tests/midi.mjs [http://localhost:8096/] [--only=name,name]
// Writes test-results/midi.json. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tools/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8096/';
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const NANO = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'midi-maps', 'korg-nanokontrol.json'), 'utf8'));
const results = [], consoleProblems = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };
async function test(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, info }); console.log('PASS', name, info ? JSON.stringify(info).slice(0, 500) : ''); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message }); console.log('FAIL', name, e.message); }
}
const browser = await chromium.launch({ headless: false, args: [...GPU, '--window-size=1400,860'] });

// the fake Web MIDI: one input with the given port name, one output named av-out that records what it is sent
function shim(name) {
  window.__midiAsked = 0; window.__sent = [];
  const input = { id: 'in1', name, type: 'input', state: 'connected', onmidimessage: null };
  const inputs = new Map([['in1', input]]);
  const outputs = new Map([['out1', { id: 'out1', name: 'av-out', type: 'output', send: d => window.__sent.push(Array.from(d)) }]]);
  const access = { inputs, outputs, onstatechange: null, sysexEnabled: false };
  navigator.requestMIDIAccess = async () => { window.__midiAsked++; return access; };
  window.__midi = d => { for (const i of inputs.values()) if (i.onmidimessage) i.onmidimessage({ data: Uint8Array.from(d) }); };
  window.__unplug = () => { inputs.delete('in1'); input.state = 'disconnected'; if (access.onstatechange) access.onstatechange({ port: input }); };
}
async function open(q, name = 'nanoKONTROL', ctxOpt = {}) {
  const ctx = ctxOpt.ctx || await browser.newContext({ viewport: { width: 1400, height: 820 } });
  await ctx.addInitScript(shim, name);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push({ url: p.url(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', e => consoleProblems.push({ url: p.url(), text: 'pageerror: ' + e.message }));
  await p.goto(BASE + q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1 && (!SSAV.world().meta.data || SSAV.world().pack), null, { timeout: 60000 });
  return { ctx, p };
}
async function enable(p) {
  await p.click('[data-panel="p-show"]');
  await p.click('#m-enable');
  await p.waitForFunction(() => !!SSAV.midi.access, null, { timeout: 10000 });
  await p.waitForTimeout(100);
}
const cc = (p, num, val, ch = 0) => p.evaluate(([n, v, c]) => __midi([0xb0 | c, n, v]), [num, val, ch]);
const press = async (p, num) => { await cc(p, num, 127); await cc(p, num, 0); };
const snap = p => p.evaluate(() => JSON.stringify({ f: SSAV.flags, c: SSAV.cfg, pal: SSAV.palette, seed: SSAV.seed, w: SSAV.worldName, play: SSAV.playing, lv: +SSAV.lvShown.toFixed(4), hi: SSAV.histIdx, st: SSAV.stars }));
const quiet = p => p.waitForFunction(() => !SSAV.fading, null, { timeout: 20000 });
const unblack = p => p.evaluate(() => { if (SSAV.flags.blackout) SSAV.setBlack(false); });

await test('midi-off-until-enable', async () => {
  const { ctx, p } = await open('?i=m-off&world=nashua&seed=1');
  const before = await snap(p);
  await cc(p, 3, 127); await press(p, 46);   // nothing is wired until Enable
  await p.waitForTimeout(300);
  const after = await snap(p);
  const asked = await p.evaluate(() => window.__midiAsked);
  await ctx.close();
  assert(asked === 0, 'requestMIDIAccess called before Enable');
  assert(before === after, 'state changed with MIDI off');
  return { asked };
});

await test('preset-by-port-name', async () => {
  const names = {};
  for (const [port, want] of [['nanoKONTROL 1 SLIDER/KNOB', 'korg-nanokontrol'], ['nanoKONTROL2 1 SLIDER/KNOB', 'korg-nanokontrol2'], ['Some Pads', 'generic']]) {
    const { ctx, p } = await open('?i=m-pre-' + want + '&world=shanshui&seed=2', port);
    await enable(p);
    names[port] = await p.evaluate(() => ({ preset: SSAV.midi.presetName, play: SSAV.midi.map.play, out: document.getElementById('m-out').textContent }));
    await ctx.close();
    assert(names[port].preset === want, port + ' picked ' + names[port].preset);
    assert(names[port].out === 'MIDI out off', 'MIDI out not off by default');
  }
  return names;
});

await test('every-binding-fires', async () => {
  const { ctx, p } = await open('?i=m-all&world=nashua&seed=1');
  await enable(p);
  await p.evaluate(() => { SSAV.reseed('test'); });   // a history to step through
  await quiet(p);
  const fired = [], notes = {};
  // world last: it leaves nashua
  const order = NANO.bindings.filter(b => b.act !== 'world').concat(NANO.bindings.filter(b => b.act === 'world'));
  for (const b of order) {
    await quiet(p); await unblack(p);
    if (b.act === 'back') await p.evaluate(() => { if (SSAV.histIdx <= 0) SSAV.histStep(1); });
    const before = await snap(p);
    if (b.mode === 'momentary') {
      if (b.hold_ms) { await cc(p, b.num, 127); await p.waitForTimeout(b.hold_ms + 200); await cc(p, b.num, 0); }
      else await press(p, b.num);
    } else {
      // pick up at the app's value, then move well away from it
      const cur = await p.evaluate(id => { const a = SSAV.midi.getValue(id); return a == null ? 0.5 : a; }, b.act);
      await cc(p, b.num, Math.round(cur * 127));
      await cc(p, b.num, cur > 0.5 ? 10 : 117);
    }
    await p.waitForTimeout(350);
    const after = await snap(p);
    const note = await p.evaluate(() => document.getElementById('m-note').textContent);
    if (after !== before) fired.push(b.act); else notes[b.act + '@' + b.num] = note || '(no change, no note)';
  }
  await ctx.close();
  const silent = Object.entries(notes).filter(([, n]) => n === '(no change, no note)');
  assert(!silent.length, 'bindings that did nothing and said nothing: ' + JSON.stringify(silent));
  return { fired: fired.length, of: order.length, notes };
});

await test('soft-takeover', async () => {
  const { ctx, p } = await open('?i=m-pick&world=shanshui&seed=3');
  await enable(p);
  await p.evaluate(() => { const e = document.getElementById('b-speed'); SSAV.cfg.speed = 500; SSAV.pb.speed = 500; });
  const s0 = await p.evaluate(() => SSAV.cfg.speed);
  await cc(p, 3, 5);                                  // far below the app's value: ignored
  await p.waitForTimeout(150);
  const s1 = await p.evaluate(() => SSAV.cfg.speed), hint = await p.evaluate(() => document.getElementById('m-note').textContent);
  await cc(p, 3, 40); await cc(p, 3, 90);            // crosses 0.5 (500 px/s), then drives
  await p.waitForTimeout(150);
  const s2 = await p.evaluate(() => SSAV.cfg.speed);
  await ctx.close();
  assert(s1 === s0, 'fader jumped the speed before pickup: ' + s0 + ' -> ' + s1);
  assert(/pickup/i.test(hint), 'no pickup hint: ' + hint);
  assert(s2 !== s0 && s2 > 500, 'fader did not take over after crossing: ' + s2);
  return { s0, s1, s2, hint };
});

await test('panic-hold-and-stop-under-flood', async () => {
  const { ctx, p } = await open('?i=m-panic&world=shanshui&seed=4');
  await enable(p);
  await p.evaluate(() => { SSAV.setPalette('derelict-mono'); SSAV.cfg.speed = 900; SSAV.pb.speed = 900; });
  await cc(p, 44, 127); await p.waitForTimeout(300); await cc(p, 44, 0);   // short press: nothing
  await p.waitForTimeout(1200);
  const short = await p.evaluate(() => SSAV.flags.blackout);
  // a 500 CC/s flood on a fader while STOP and REC are used
  await p.evaluate(() => { let v = 0; window.__flood = setInterval(() => { for (let i = 0; i < 5; i++) __midi([0xb0, 5, (v = (v + 7) % 128)]); }, 10); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { __midi([0xb0, 46, 127]); __midi([0xb0, 46, 0]); });
  const stopNow = await p.evaluate(() => SSAV.flags.blackout);
  await p.evaluate(() => { __midi([0xb0, 46, 127]); __midi([0xb0, 46, 0]); });
  const stopAgain = await p.evaluate(() => SSAV.flags.blackout);
  await cc(p, 44, 127); await p.waitForTimeout(1250); await cc(p, 44, 0);
  const r = await p.evaluate(() => { clearInterval(window.__flood); return { black: SSAV.flags.blackout, pal: SSAV.palette, speed: SSAV.cfg.speed, fx: SSAV.cfg.fx.mode, wm: SSAV.cfg.weather.mode }; });
  await ctx.close();
  assert(!short, 'a 0.3 s REC press fired the panic');
  assert(stopNow === true && stopAgain === false, 'STOP blackout not instant under the flood: ' + stopNow + ', ' + stopAgain);
  assert(r.black && r.pal === 'original' && r.speed === 120 && r.fx === 'off' && r.wm === 'auto', 'panic state ' + JSON.stringify(r));
  return r;
});

await test('reseed-debounce', async () => {
  const { ctx, p } = await open('?i=m-deb&world=shanshui&seed=5');
  await enable(p);
  const h0 = await p.evaluate(() => SSAV.hist.length);
  for (let i = 0; i < 10; i++) { await press(p, 33); await p.waitForTimeout(100); }
  await quiet(p);
  const h1 = await p.evaluate(() => SSAV.hist.length), note = await p.evaluate(() => document.getElementById('m-note').textContent);
  await ctx.close();
  assert(h1 - h0 <= 2 && h1 - h0 >= 1, '10 presses in 1 s made ' + (h1 - h0) + ' generations');
  return { generations: h1 - h0, note };
});

await test('hot-unplug-and-learn-persists', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
  const { p } = await open('?i=m-learn&world=shanshui&seed=6', 'nanoKONTROL', { ctx });
  await enable(p);
  await p.evaluate(() => { SSAV.midi.startLearn('speed'); __midi([0xb0, 99, 64]); });
  const learned = await p.evaluate(() => SSAV.midi.map.speed);
  await p.evaluate(() => __unplug());
  await p.waitForTimeout(300);
  const dev = await p.textContent('#m-dev');
  await p.evaluate(() => SSAV.setBlack(true)); await p.evaluate(() => SSAV.setBlack(false));   // still alive
  await p.reload();
  await p.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  await enable(p);
  const after = await p.evaluate(() => SSAV.midi.map.speed);
  await ctx.close();
  assert(learned === 'cc:0:99', 'learn ' + learned);
  assert(/No MIDI inputs/.test(dev), 'device list after unplug: ' + dev);
  assert(after === 'cc:0:99', 'learned binding lost after reload: ' + after);
  return { learned, dev, after };
});

await test('output-follows-never-asks', async () => {
  const { ctx, p } = await open('?i=m-out&world=shanshui&seed=7');
  await enable(p);
  const popP = ctx.waitForEvent('page');
  await p.keyboard.press('o');
  const out = await popP;
  await out.waitForFunction(() => window.SSOUT && SSOUT.msg, null, { timeout: 20000 });
  await press(p, 46);
  await out.waitForFunction(() => SSOUT.flags.blackout === true, null, { timeout: 5000 });
  const asked = await out.evaluate(() => window.__midiAsked);
  await press(p, 46);
  await out.close(); await ctx.close();
  assert(asked === 0, 'the output asked for MIDI');
  return { asked };
});

await test('midi-out', async () => {
  const { ctx, p } = await open('?i=m-mo&world=nashua&seed=1');
  await enable(p);
  await p.waitForTimeout(500);
  const offSent = await p.evaluate(() => window.__sent.length);
  await p.click('#m-out');
  // drive the playhead across the first bridge (Canal St, s 869.7 m) on the left bank
  await p.evaluate(() => SSAV.pb.pause());
  const x0 = await p.evaluate(async () => { const m = await import(new URL('src/worlds/nashua/pack.js', location.href).href); return m.xOf(SSAV.world().pack, 869.7, 'L') - SSAV.viewW() / 2 - 400; });
  await p.evaluate(x => { SSAV.pb.x = x; }, x0);
  await p.waitForTimeout(300);
  for (let i = 0; i < 20; i++) { await p.evaluate(() => { SSAV.pb.x += 40; }); await p.waitForTimeout(40); }
  await p.waitForTimeout(1000);
  const sent = await p.evaluate(() => window.__sent);
  await p.click('#m-out');
  await ctx.close();
  const ccs = new Set(sent.filter(m => (m[0] & 0xf0) === 0xb0).map(m => m[1]));
  const ons = sent.filter(m => (m[0] & 0xf0) === 0x90 && m[2] > 0).length, offs = sent.filter(m => (m[0] & 0xf0) === 0x80).length;
  assert(offSent === 0, 'MIDI out sent ' + offSent + ' messages while off');
  for (const n of [20, 21, 22, 23, 24, 26]) assert(ccs.has(n), 'CC ' + n + ' never sent: ' + [...ccs]);
  assert(ons >= 1 && offs >= 1, 'no note for the bridge (on ' + ons + ', off ' + offs + ')');
  return { messages: sent.length, ccs: [...ccs].sort((a, b) => a - b), noteOns: ons };
});

await browser.close();
const failed = results.filter(r => !r.pass);
const summary = { date: new Date().toISOString(), base: BASE, pass: failed.length === 0 && consoleProblems.length === 0, tests: results.length, failed: failed.map(f => f.name), consoleProblems };
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', 'midi.json'), JSON.stringify({ summary, results }, null, 1));
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed; console problems: ' + consoleProblems.length);
if (consoleProblems.length) console.log(consoleProblems.slice(0, 10));
process.exit(summary.pass ? 0 : 1);
