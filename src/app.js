// Controller. Owns the clock, seeds, palettes and show logic; renders a preview with the same
// Scene the output window uses, and sends that window a frame state every frame.
import { VERSION, WORLD_H, CULL, UPSTREAM_SITE } from './core/constants.js';
import { loadPalettes, hexRgb } from './core/palettes.js';
import { Scene, viewOf } from './core/scene.js';
import { Playback, pxToWorld } from './core/playback.js';
import { INSTANCE, load, save, saveNow } from './core/store.js';
import { frameGeom, buildSVG, buildPNG, buildPDF, fileName, download } from './export/export.js';
import { drawTestCard } from './ui/testcard.js';
import { KEYS } from './ui/keys.js';
import { Midi, MIDI_TARGETS, NANOKONTROL2 } from './ui/midi.js';
import { WORLDS, WORLD_NAMES, worldOf } from './worlds/registry.js';
import { Weather, PHASES, PARAMS } from './core/weather.js';
import { ReachOverlay, factLine } from './ui/reach.js';
import { SectionInset } from './ui/section.js';
import { xOf, sOf, reachW } from './worlds/nashua/pack.js';
import { MODES, MODE_ORDER, MODE_DEFAULT, LAYERS, layersOf } from './worlds/nashua/modes.js';
import { wsSync } from './wall.js';
import { offline } from './offline.js';
import { Ladder } from './core/ladder.js';

const $ = id => document.getElementById(id);
const body = document.body;

// ---------- state ----------
const DEF = {
  speed: 120, dir: 1,
  contrast: 1, ink: 1, zoom: 1, yAlign: 0.5, paper: true, vignette: false,
  palStarredOnly: false,
  show: { auto: false, mode: 'min', every: 5, src: 'new', autoPal: false, palEvery: 3, resume: false, resumeS: 8, fade: 2.5 },
  q: 'auto', big: false,
  gradient: null,
  midi: {},
  exp: { format: 'archd', portrait: false, fit: 1, yAlign: 0.5, margin: 0.5, border: false, label: false, dpi: 150, lights: true, rain: false },
  weather: { mode: 'auto', period: 360, holds: {} },
  // slit-scan / time-smear (off by default): mode off|strip|smear|displace, source scroll|video
  fx: { mode: 'off', source: 'scroll', slit: 0.5, width: 2, dir: 1, depth: 64, mix: 1, freeze: false, axis: 'x', slope: 1 },
  // data world (nashua): bank in view, vertical exaggeration, water level position (0 = first named level),
  // what happens at the ends of the reach, labels in the controller and on the output, fact line on the output
  // mode: a list of layers (modes.js); sections: the live section toggle (X) on top of any mode
  nashua: { bank: 'L', ve: 10, level: 0, ends: 'handover', labels: true, outLabels: false, outFacts: false, mode: MODE_DEFAULT, sections: false, morph: 0 },
};
const saved = load();
const cfg = deepMerge(structuredClone(DEF), saved.cfg || {});
let stars = Array.isArray(saved.stars) ? saved.stars.slice(0, 200) : [];
let palStars = Array.isArray(saved.palStars) ? saved.palStars : [];
let hist = Array.isArray(saved.hist) ? saved.hist.slice(-20) : [];
let histIdx = hist.length - 1;
const logs = [];
let errCount = 0;

function deepMerge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else if (b[k] !== undefined) a[k] = b[k];
  }
  return a;
}
function persist(now) {
  const o = { seed: cur.seed, world: cur.world, pal: pal.target, cfg, stars, palStars, hist };
  now ? saveNow(o) : save(o);
}

function log(level, msg) {
  const t = new Date().toTimeString().slice(0, 8);
  logs.unshift({ level, msg, t });
  if (logs.length > 200) logs.pop();
  if (level === 'error') errCount++;
  renderLog();
}

// raw seed token from the URL, exactly as upstream reads it (no decoding)
function urlSeed() {
  const q = location.href.split('?')[1];
  if (!q) return null;
  for (const kv of q.split('#')[0].split('&')) { const [k, v] = kv.split('='); if (k === 'seed' && v) return v.slice(0, 64); }
  return null;
}
const cleanSeed = s => String(s).trim().slice(0, 64).replace(/\s/g, '%20').replace(/[#&?]/g, '');
const newSeed = () => String(Date.now());
// history and star entries: a shanshui seed is stored as itself (as in v0.2.0), other worlds as "world:seed"
const tok = (world, seed) => world === 'shanshui' ? seed : world + ':' + seed;
function untok(t) { const i = t.indexOf(':'); const w = i > 0 ? t.slice(0, i) : ''; return w && WORLDS[w] && w !== 'shanshui' ? { world: w, seed: t.slice(i + 1) } : { world: 'shanshui', seed: t }; }
function urlWorld() { const w = new URLSearchParams(location.search).get('world'); return w && WORLDS[w] ? w : null; }

// ---------- palettes ----------
const palettes = await loadPalettes(new URL('../palettes.json', import.meta.url).href).catch(e => { showFatal(e); throw e; });
const byId = new Map(palettes.palettes.map(p => [p.id, p]));
function cycleList() {
  if (cfg.palStarredOnly && palStars.length) return palettes.palettes.filter(p => palStars.includes(p.id));
  return palettes.palettes.filter(p => p.cycle);
}
let gradRev = 0;
function applyGradient() {
  const base = byId.get('gradient');
  if (!base) return;
  const g = cfg.gradient;
  const p = { ...base, ...(g || {}), id: 'gradient', _rev: ++gradRev };
  scene.setPalette(p);
  if (scene2) scene2.setPalette(p);
}

// ---------- scene ----------
const canvas = $('gl');
const scene = new Scene(canvas, palettes, { onLog: log, still: $('still') });
let scene2 = null;
applyGradient();

const pb = new Playback();
pb.speed = cfg.speed; pb.dir = cfg.dir; pb.autoResume = cfg.show.resume; pb.resumeSecs = cfg.show.resumeS;

let epoch = 0;
{ // URL overrides for the data world
  const q = new URLSearchParams(location.search), N = cfg.nashua;
  if (q.get('bank') === 'L' || q.get('bank') === 'R') N.bank = q.get('bank');
  if (q.get('ve') && isFinite(+q.get('ve'))) N.ve = Math.max(1, Math.min(20, Math.round(+q.get('ve'))));
  if (['handover', 'loop', 'pingpong'].includes(q.get('ends'))) N.ends = q.get('ends');
  if (q.get('level') && isFinite(+q.get('level'))) N.level = Math.max(0, +q.get('level'));
  if (MODES[q.get('mode')]) N.mode = q.get('mode');
  if (q.get('morph') && isFinite(+q.get('morph'))) N.morph = Math.max(0, Math.min(1, +q.get('morph')));
}
const modeLayers = () => layersOf(cfg.nashua.mode, cfg.nashua.sections || cfg.nashua.mode === 'sections');
// morph is quantized to 5% steps: each step is a regenerated reach (pure function of bank, ve, morph)
const morphQ = v => Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
const optsFor = world => WORLDS[world] && WORLDS[world].data ? (morphQ(cfg.nashua.morph) > 0 ? { bank: cfg.nashua.bank, ve: cfg.nashua.ve, morph: morphQ(cfg.nashua.morph) } : { bank: cfg.nashua.bank, ve: cfg.nashua.ve }) : undefined;
const cur = { seed: urlSeed() || saved.seed || newSeed(), key: '', world: urlWorld() || (WORLDS[saved.world] ? saved.world : 'shanshui') };
cur.opts = optsFor(cur.world);
let lvShown = cfg.nashua.level, lvScrub = false;   // water level position shown (eases to cfg.nashua.level)
cur.seed = cleanSeed(cur.seed);
const keyOf = (world, seed) => (world === 'shanshui' ? '' : world + ':') + seed + '#' + (++epoch);
cur.key = keyOf(cur.world, cur.seed);
let outgoing = null;          // {key, seed, world, x}
let fade = null;              // {t0, dur, ready}
const pal = { a: byId.has(saved.pal) ? saved.pal : 'original', b: null, t0: 0, dur: 1.2, mix: 0 };
pal.target = pal.a;
const Qpal = new URLSearchParams(location.search).get('palette');
if (Qpal && byId.has(Qpal)) { pal.a = Qpal; pal.target = Qpal; }
// the nashua world opens in its own palette (the kit), unless the URL names one
const NASHUA_PAL = 'nashua-kit';
if (!Qpal && cur.world === 'nashua' && byId.has(NASHUA_PAL)) { pal.a = NASHUA_PAL; pal.target = NASHUA_PAL; }

const flags = { blackout: false, card: false, panic: false, hold: false, uiHidden: false };
pushHist(tok(cur.world, cur.seed));
const weather = new Weather(cfg.weather);

// ---------- seeds ----------
function pushHist(seed) {
  if (hist[histIdx] === seed) return;
  hist = hist.slice(0, histIdx + 1);
  hist.push(seed);
  if (hist.length > 20) hist = hist.slice(-20);
  histIdx = hist.length - 1;
}
// a new seed, a world switch, or both: the new landscape generates behind the old one and crossfades in
function setSeed(seed, { history = true, why = '', world = cur.world, keepX } = {}) {
  seed = cleanSeed(seed);
  if (!seed) return;
  if (!WORLDS[world]) world = 'shanshui';
  if (outgoing) { outgoing = null; fade = null; }
  outgoing = { key: cur.key, seed: cur.seed, world: cur.world, x: pb.x, opts: cur.opts };
  cur.seed = seed; cur.world = world; cur.key = keyOf(world, seed); cur.opts = optsFor(world);
  pb.x = keepX !== undefined ? keepX : 0; pb.pull = 0; pb.tween = null;
  fade = { t0: 0, dur: cfg.show.fade, wait: performance.now() };
  if (history) pushHist(tok(world, seed));
  resetAuto();
  updateUrl();
  persist();
  renderSeed(); renderWorld();
  log('info', (world !== 'shanshui' ? world + ' ' : '') + 'seed ' + seed + (why ? ' (' + why + ')' : ''));
}
offline();
const wallUrl = new URLSearchParams(location.search).get('sync');
const wall = wallUrl ? wsSync(wallUrl, 'controller', null, s => log('info', 'wall relay ' + s)) : null;
let wallSent = 0;
function reseed(why) { setSeed(newSeed(), isData() ? { why, keepX: pb.x } : { why }); }
function setWorld(w, why = 'world') {
  if (!WORLDS[w] || w === cur.world) return;
  setSeed(cur.seed, { world: w, why });
  if (w === 'nashua' && byId.has(NASHUA_PAL) && pal.target !== NASHUA_PAL) setPalette(NASHUA_PAL, 'nashua default');
}
function nextWorld() { setWorld(WORLD_NAMES[(WORLD_NAMES.indexOf(cur.world) + 1) % WORLD_NAMES.length], 'world'); }
function playTok(t, opts) { const e = untok(t); setSeed(e.seed, { ...opts, world: e.world }); }
function histStep(d) {
  const i = histIdx + d;
  if (i < 0 || i >= hist.length) return toast(d < 0 ? 'Start of history' : 'End of history');
  histIdx = i; playTok(hist[i], { history: false, why: 'history' });
}
function toggleStar() {
  const t = tok(cur.world, cur.seed);
  const i = stars.indexOf(t);
  if (i >= 0) stars.splice(i, 1); else stars.unshift(t);
  persist(); renderSeed();
  toast(i >= 0 ? 'Unstarred' : 'Starred');
}
function stop() {
  const w = scene.peek(cur.key);
  const cap = worldOf(cur.world).cull;
  // the start of the seed was dropped by the memory cap; chunk-seeded worlds regenerate it exactly
  const culled = w && w.culledBelow > -2000 && !w.meta.chunked;
  if (Math.abs(pb.x) > cap * 0.9 || culled) { pb.pause(); pb.k = 0; setSeed(cur.seed, { history: false, why: 'stop, restart from 0' }); }
  else pb.goTo(0);
  renderPlay();
}
function updateUrl() {
  const q = new URLSearchParams(location.search);
  q.delete('seed'); q.delete('world');
  let s = '?seed=' + cur.seed;
  if (cur.world !== 'shanshui') s += '&world=' + cur.world;
  const rest = q.toString();
  if (rest) s += '&' + rest;
  try { history.replaceState(null, '', location.pathname + s); } catch (e) { /* file:// or sandbox */ }
}
function shareUrl() { return location.origin + location.pathname + '?seed=' + cur.seed + (cur.world !== 'shanshui' ? '&world=' + cur.world : ''); }

// ---------- palettes ----------
function setPalette(id, why) {
  if (!byId.has(id) || id === pal.target) return;
  const shown = pal.b && pal.mix > 0.5 ? pal.b : pal.a;
  pal.a = shown; pal.b = id; pal.t0 = performance.now(); pal.mix = 0; pal.target = id;
  persist(); renderPal();
  if (why) log('info', 'palette ' + byId.get(id).name + ' (' + why + ')');
}
function palStep(d) {
  const list = cycleList();
  if (!list.length) return;
  let i = list.findIndex(p => p.id === pal.target);
  i = i < 0 ? 0 : (i + d + list.length) % list.length;
  setPalette(list[i].id);
}
function togglePalStar(id) {
  const i = palStars.indexOf(id);
  if (i >= 0) palStars.splice(i, 1); else palStars.push(id);
  persist(); renderPalList();
}

// ---------- show timers ----------
const auto = { nextAt: 0, travelled: 0, palAt: 0, starIdx: 0 };
function resetAuto() { auto.nextAt = performance.now() + cfg.show.every * 60000; auto.travelled = 0; }
function resetAutoPal() { auto.palAt = performance.now() + cfg.show.palEvery * 60000; }
resetAuto(); resetAutoPal();
function autoReseed() {
  if (cfg.show.src === 'starred' && stars.length) {
    auto.starIdx = (auto.starIdx + 1) % stars.length;
    playTok(stars[auto.starIdx], { why: 'auto, starred' });
  } else reseed('auto');
}
function showTick(now, dt, vWorld) {
  if (flags.hold || flags.panic) { auto.nextAt += dt * 1000; auto.palAt += dt * 1000; return; }
  if (cfg.show.auto) {
    if (cfg.show.mode === 'min') { if (now >= auto.nextAt) autoReseed(); }
    else { auto.travelled += Math.abs(vWorld * dt) / pxToWorld(1); if (auto.travelled >= cfg.show.every * 1000) autoReseed(); }
  }
  if (cfg.show.autoPal && now >= auto.palAt) { resetAutoPal(); palStep(1); }
}

// ---------- quality ----------
// the ladder (core/ladder.js) when quality is auto; the output runs its own
const ladder = new Ladder((l, m) => log(l, m));
function qualityTick(now) {
  const want = cfg.q === 'auto' ? ladder.tick(now, scene.fps, !flags.blackout && !document.hidden).q : +cfg.q;
  scene.q = want * (out.connected && !out.fullPreview ? 0.5 : 1);
}

// ---------- output window ----------
const chanName = 'shanshui-av:' + INSTANCE;
const chan = 'BroadcastChannel' in window ? new BroadcastChannel(chanName) : null;
const out = { connected: false, last: 0, info: null, fullPreview: false };
if (chan) chan.onmessage = e => {
  const m = e.data;
  if (m.type === 'hello' || m.type === 'beat') { out.connected = true; out.last = performance.now(); out.info = m; }
  if (m.type === 'log') log(m.level, 'output: ' + m.msg);
  if (m.type === 'bye') out.connected = false;
  if (m.type === 'key') {   // keys pressed while the output window has focus
    if (m.key === 'b' || m.key === 'B') setBlack();
    else if (m.key === 'panic') setPanic(true);
    else if (m.key === 'Escape' && flags.panic) setPanic(false);
    else if (['r', 'R', ' ', 'p', 'P', 'g', 'G', 't', 'T', 'Home', '[', ']', 'w', 'W', 'k', 'K', 'l', 'L', ',', '.', '1', '2', '3', '4', '5', '6'].includes(m.key)) onKey({ key: m.key, shiftKey: m.shift, target: document.body, preventDefault() {} });
  }
};
function openOutput() {
  const url = new URL('output.html', location.href);
  if (INSTANCE !== 'main') url.searchParams.set('i', INSTANCE);
  // the output draws baked tiles and works offline when the controller does
  for (const k of ['baked', 'offline']) { const v = new URLSearchParams(location.search).get(k); if (v) url.searchParams.set(k, v); }
  if (out.connected) return toast('Output window already open');
  // noopener: the output gets its own browsing context group, so Chrome gives it its own process and
  // main thread and a busy controller never stalls the projector. Everything goes over BroadcastChannel.
  window.open(url.href, '_blank', 'popup,noopener,width=1280,height=720');
  log('info', 'output window requested');
  const t = performance.now();
  setTimeout(() => { if (!out.connected || out.last < t) toast('No output window: allow popups for this page'); }, 4000);
}

// ---------- frame state ----------
let time0 = performance.now();
function frameState(now) {
  const worlds = [];
  if (outgoing) worlds.push({ key: outgoing.key, seed: outgoing.seed, world: outgoing.world, x: outgoing.x, alpha: 1, opts: outgoing.opts });
  let a = 1;
  if (fade && fade.t0) { const t = Math.min(1, (now - fade.t0) / (fade.dur * 1000)); a = t * t * (3 - 2 * t); }
  else if (fade) a = 0;
  worlds.push({ key: cur.key, seed: cur.seed, world: cur.world, x: pb.x, alpha: outgoing ? a : 1, opts: cur.opts });
  for (const w of worlds) if (WORLDS[w.world] && WORLDS[w.world].data) { w.layers = modeLayers(); w.all = LAYERS; }
  return {
    level: lvShown,
    reach: { labels: cfg.nashua.outLabels, facts: cfg.nashua.outFacts },
    worlds, dir: pb.dir,
    pal: { a: pal.a, b: pal.b || pal.a, mix: pal.mix },
    u: { contrast: cfg.contrast, ink: cfg.ink, paper: cfg.paper, vignette: cfg.vignette, zoom: cfg.zoom, yAlign: cfg.yAlign },
    time: (now - time0) / 1000,
    weather: weather.values(),
    v: pb.velocity, t: Date.now(),
    fx: cfg.fx.mode !== 'off' ? { ...cfg.fx, vt: fxVideo.currentTime || 0 } : null,
  };
}

// ---------- loop ----------
let last = performance.now();
let lastView = null;
function tick(now) {
  requestAnimationFrame(tick);
  try {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const v0 = pb.velocity;
    if (!flags.panic) { pb.step(dt, now); weather.step(dt); }
    if (!lvScrub) lvShown += (cfg.nashua.level - lvShown) * Math.min(1, dt * 1.5);
    if (Math.abs(cfg.nashua.level - lvShown) < 1e-4) lvShown = cfg.nashua.level;
    endsTick();
    if (outgoing) outgoing.x += v0 * dt;
    // reseed fade starts when the new world covers the view (or after 4 s)
    if (fade && !fade.t0) {
      const w = scene.peek(cur.key);
      const vw = lastView ? lastView.viewW : 2000;
      if ((w && w.coverage(pb.x, pb.x + vw) >= 0.99) || now - fade.wait > 4000) fade.t0 = now;
    }
    if (fade && fade.t0 && now - fade.t0 >= fade.dur * 1000) { fade = null; outgoing = null; }
    // palette fade
    if (pal.b) {
      const t = Math.min(1, (now - pal.t0) / (pal.dur * 1000));
      pal.mix = t * t * (3 - 2 * t);
      if (t >= 1) { pal.a = pal.b; pal.b = null; pal.mix = 0; }
    }
    showTick(now, dt, pb.velocity);
    qualityTick(now);
    const fs = frameState(now);
    lastView = scene.frame(fs, { blackout: flags.blackout, panic: flags.panic });
    lastView.W = canvas.clientWidth; lastView.H = canvas.clientHeight;
    const msgOut = { type: 'frame', fs, flags: { ...flags }, custom: cfg.gradient ? { ...cfg.gradient, rev: gradRev } : null };
    if (chan) chan.postMessage(msgOut);
    // the LAN wall (?sync=ws://host:port): the same frame, stamped in the relay's clock, at most 30 per second
    if (wall && now - wallSent >= 33) { wallSent = now; wall.send({ ...msgOut, fs: { ...fs, t: wall.serverNow() } }); }
    if (out.connected && now - out.last > 3500) { out.connected = false; log('warn', 'output window stopped answering'); }
    hudTick(now);
    frameTick();
    reachTick();
  } catch (e) {
    if (!tick.errAt || now - tick.errAt > 2000) { log('error', 'frame: ' + (e && e.message || e)); tick.errAt = now; }
  }
}

// ---------- blackout, panic, card, full screen, hide ----------
function setBlack(on) {
  flags.blackout = on === undefined ? !flags.blackout : on;
  $('black').classList.toggle('on', flags.blackout);
  $('b-black').classList.toggle('on', flags.blackout);
}
function setPanic(on) {
  flags.panic = on;
  $('still').classList.toggle('on', on);
  if (on) { pb.pause(); pb.k = 0; log('warn', 'panic: holding last good frame'); }
  renderPlay();
}
function setCard(on) {
  flags.card = on === undefined ? !flags.card : on;
  const c = $('card');
  if (flags.card) drawTestCard(c);
  c.classList.toggle('on', flags.card);
  $('s-card').classList.toggle('on', flags.card);
}
function setHold(on) { flags.hold = on === undefined ? !flags.hold : on; $('b-hold').classList.toggle('on', flags.hold); }
function toggleUI() { flags.uiHidden = !flags.uiHidden; body.classList.toggle('uihidden', flags.uiHidden); }
function toggleFull() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  if (body.classList.contains('fullwin')) { body.classList.remove('fullwin'); return; }
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { body.classList.add('fullwin'); log('warn', 'full screen refused, using full window'); });
  else body.classList.add('fullwin');
}
document.addEventListener('fullscreenchange', () => {
  $('b-full').classList.toggle('on', !!document.fullscreenElement); idle(); if (flags.card) drawTestCard($('card'));
  // keep Esc for the panic key while in full screen (Chrome: hold Esc 2 s to leave full screen)
  if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
});
// auto-hide after 3 s in full screen; only real movement brings the UI back
let idleTimer = 0, lastMove = [-1, -1];
function idle() {
  clearTimeout(idleTimer); body.classList.remove('hide');
  if (document.fullscreenElement || body.classList.contains('fullwin')) idleTimer = setTimeout(() => body.classList.add('hide'), 3000);
}
addEventListener('mousemove', e => { if (e.screenX === lastMove[0] && e.screenY === lastMove[1]) return; lastMove = [e.screenX, e.screenY]; idle(); });
addEventListener('resize', () => { if (flags.card) drawTestCard($('card')); layoutPanels(); });

// ---------- input on the stage ----------
const stage = $('stage');
let drag = null;
const cssScale = () => (canvas.clientHeight / WORLD_H) * cfg.zoom;
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const onFrame = e.target.closest('#frame');
  drag = { x: e.clientX, frame: !!onFrame };
  stage.setPointerCapture(e.pointerId); stage.classList.add('drag');
});
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x; drag.x = e.clientX;
  if (drag.frame) { cfg.exp.x0 = (cfg.exp.x0 || 0) + dx / cssScale(); persist(); }
  else pb.drag(-dx / cssScale(), performance.now());
});
const endDrag = () => { drag = null; stage.classList.remove('drag'); };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', e => { e.preventDefault(); const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; pb.nudge(d * (e.deltaMode ? 40 : 1) / cssScale(), performance.now()); }, { passive: false });
stage.addEventListener('dblclick', toggleFull);

// ---------- keys ----------
let escAt = 0, escTimer = 0;
const isField = el => el && (el.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(el.type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
addEventListener('keydown', e => {
  // blackout first, before anything that could throw
  if ((e.key === 'b' || e.key === 'B') && !isField(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); try { setBlack(); } catch (err) { $('black').classList.toggle('on'); } return; }
  try { onKey(e); } catch (err) { log('error', 'key ' + e.key + ': ' + err.message); }
});
addEventListener('keyup', e => {
  if (e.key === 'Escape') {
    clearTimeout(escTimer);
    if (escAt && performance.now() - escAt < 1000) {
      if (flags.panic) setPanic(false);
      else closePanels();
    }
    escAt = 0;
  }
});
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (!e.repeat) { escAt = performance.now(); clearTimeout(escTimer); escTimer = setTimeout(() => { if (escAt) { escAt = 0; setPanic(true); } }, 1000); }
    return;
  }
  if (isField(e.target)) { if (e.key === 'Enter') { e.target.blur(); if (e.target.id === 'seed-in') setSeed(e.target.value, { why: 'typed' }); } return; }
  const k = e.key;
  const step = e.shiftKey ? 600 : 150;
  switch (k) {
    case ' ': e.preventDefault(); if (flags.panic) setPanic(false); else pb.toggle(); renderPlay(); break;
    case 'Home': stop(); break;
    case 'd': case 'D': setDir(-pb.dir); break;
    case '-': case '_': setSpeed(cfg.speed / 1.25); break;
    case '=': case '+': setSpeed(cfg.speed * 1.25); break;
    case 'ArrowLeft': e.preventDefault(); pb.nudge(-pxToWorld(step), performance.now()); renderPlay(); break;
    case 'ArrowRight': e.preventDefault(); pb.nudge(pxToWorld(step), performance.now()); renderPlay(); break;
    case 'r': case 'R': reseed('key'); break;
    case '[': histStep(-1); break;
    case ']': histStep(1); break;
    case 's': star(); break;
    case 'S': togglePalStar(pal.target); toast(palStars.includes(pal.target) ? 'Palette starred' : 'Palette unstarred'); break;
    case 'p': palStep(1); break;
    case 'P': palStep(-1); break;
    case 'f': case 'F': toggleFull(); break;
    case 'h': case 'H': toggleUI(); break;
    case 'g': case 'G': setHold(); break;
    case 't': case 'T': setCard(); break;
    case 'o': case 'O': openOutput(); break;
    case 'w': case 'W': nextWorld(); break;
    case 'k': case 'K': setBank(cfg.nashua.bank === 'L' ? 'R' : 'L'); break;
    case ',': setVE(cfg.nashua.ve - 1, true); break;
    case '.': setVE(cfg.nashua.ve + 1, true); break;
    case 'm': case 'M': setMode(MODE_ORDER[(MODE_ORDER.indexOf(cfg.nashua.mode) + 1) % MODE_ORDER.length]); break;
    case 'v': case 'V': setFxMode(FX_MODES[(FX_MODES.indexOf(cfg.fx.mode) + 1) % FX_MODES.length]); break;
    case 'z': case 'Z': cfg.fx.freeze = !cfg.fx.freeze; persist(); renderFx(); toast(cfg.fx.freeze ? 'FX frozen' : 'FX running'); break;
    case 'x': case 'X': cfg.nashua.sections = !cfg.nashua.sections; persist(); renderReach(); toast(cfg.nashua.sections ? 'Sections on' : 'Sections off'); break;
    case 'l': case 'L': cfg.nashua.labels = !cfg.nashua.labels; persist(); renderReach(); toast(cfg.nashua.labels ? 'Labels on' : 'Labels off'); break;
    case '1': case '2': case '3': case '4': case '5': case '6': setLevel(+k - 1); break;
    case '?': case '/': togglePanel('p-keys'); break;
    default: return;
  }
  function star() { toggleStar(); }
}

// ---------- controls ----------
const SPEED_MAX = 2000;
const speedToSlider = s => Math.sqrt(Math.max(0, s) / SPEED_MAX);
const sliderToSpeed = v => Math.round(v * v * SPEED_MAX);
function setSpeed(s) { cfg.speed = Math.max(0, Math.min(SPEED_MAX, s)); pb.speed = cfg.speed; $('b-speed').value = speedToSlider(cfg.speed); $('b-speed-o').textContent = Math.round(cfg.speed) + ' px/s'; persist(); }
function setDir(d) { cfg.dir = d; pb.dir = d; $('b-dir-m').innerHTML = d > 0 ? '&#8594;' : '&#8592;'; persist(); }
$('b-speed').addEventListener('input', e => setSpeed(sliderToSpeed(+e.target.value)));
$('b-play').onclick = () => { if (flags.panic) setPanic(false); else pb.toggle(); renderPlay(); };
$('b-stop').onclick = stop;
$('b-dir').onclick = () => setDir(-pb.dir);
$('b-reseed').onclick = () => reseed('button');
$('b-back').onclick = () => histStep(-1);
$('b-fwd').onclick = () => histStep(1);
$('b-star').onclick = toggleStar;
$('b-palprev').onclick = () => palStep(-1);
$('b-palnext').onclick = () => palStep(1);
$('b-pal').onclick = () => togglePanel('p-look');
$('b-hold').onclick = () => setHold();
$('b-out').onclick = openOutput;
$('s-out').onclick = openOutput;
$('b-full').onclick = toggleFull;
$('b-black').onclick = () => setBlack();
$('s-card').onclick = () => setCard();
$('seed-go').onclick = () => setSeed($('seed-in').value, { why: 'typed' });
$('seed-copy').onclick = async () => { try { await navigator.clipboard.writeText(shareUrl()); toast('Link copied'); } catch (e) { $('seed-in').value = shareUrl(); $('seed-in').select(); toast('Copy the link from the field'); } };
$('log-clear').onclick = () => { logs.length = 0; errCount = 0; renderLog(); };
document.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => togglePanel(b.dataset.panel));

function togglePanel(id) {
  const el = $(id); const open = el.hidden;
  closePanels();
  el.hidden = !open;
  document.querySelector(`[data-panel="${id}"]`)?.classList.toggle('on', open);
  if (id === 'p-look' && open) renderPalList();
  if (id === 'p-log' && open) { errCount = 0; renderLog(); }
  if (id === 'p-export' && open) renderExport();
  layoutPanels();
}
function closePanels() { document.querySelectorAll('.panel').forEach(p => p.hidden = true); document.querySelectorAll('[data-panel]').forEach(b => b.classList.remove('on')); }
function layoutPanels() { const h = $('bar').getBoundingClientRect().height; $('panels').style.bottom = (h + 24) + 'px'; }

// sliders bound to cfg
function bindRange(id, key, fmt, obj = cfg, after) {
  const el = $(id), o = el.parentElement.querySelector('output');
  const show = () => { if (o) o.textContent = fmt(+el.value); };
  el.value = obj[key]; show();
  el.addEventListener('input', () => { obj[key] = +el.value; show(); persist(); if (after) after(); });
}
function bindCheck(id, key, obj = cfg, after) { const el = $(id); el.checked = !!obj[key]; el.addEventListener('change', () => { obj[key] = el.checked; persist(); if (after) after(); }); }
function bindNum(id, key, obj, after) { const el = $(id); el.value = obj[key]; el.addEventListener('change', () => { const v = parseFloat(el.value); if (isFinite(v) && v >= +el.min) { obj[key] = v; persist(); if (after) after(); } else el.value = obj[key]; }); }
function bindSeg(id, get, set) {
  const el = $(id);
  const paint = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(get()) === b.dataset.v));
  el.querySelectorAll('button').forEach(b => b.onclick = () => { set(b.dataset.v); paint(); persist(); });
  paint();
  return paint;
}
const f2 = v => v.toFixed(2);
bindRange('u-contrast', 'contrast', f2);
bindRange('u-ink', 'ink', f2);
bindRange('u-zoom', 'zoom', f2);
bindRange('u-yalign', 'yAlign', f2);
bindCheck('u-paper', 'paper');
bindCheck('u-vignette', 'vignette');
$('u-reset').onclick = () => { for (const k of ['contrast', 'ink', 'zoom', 'yAlign', 'paper', 'vignette']) cfg[k] = DEF[k]; syncInputs(); persist(); };
bindCheck('pal-starred-only', 'palStarredOnly');
bindCheck('s-auto', 'auto', cfg.show, resetAuto);
bindSeg('s-mode', () => cfg.show.mode, v => { cfg.show.mode = v; $('s-unit').textContent = v === 'min' ? 'min' : 'x1000 px'; resetAuto(); });
$('s-unit').textContent = cfg.show.mode === 'min' ? 'min' : 'x1000 px';
bindNum('s-every', 'every', cfg.show, resetAuto);
bindSeg('s-src', () => cfg.show.src, v => cfg.show.src = v);
bindCheck('s-autopal', 'autoPal', cfg.show, resetAutoPal);
bindNum('s-palevery', 'palEvery', cfg.show, resetAutoPal);
bindCheck('s-resume', 'resume', cfg.show, () => { pb.autoResume = cfg.show.resume; });
bindNum('s-resume-s', 'resumeS', cfg.show, () => { pb.resumeSecs = cfg.show.resumeS; });
bindNum('s-fade', 'fade', cfg.show);
bindSeg('s-q', () => cfg.q, v => { cfg.q = v; ladder.reset(); });
bindCheck('s-big', 'big', cfg, () => { body.classList.toggle('big', cfg.big); layoutPanels(); });
body.classList.toggle('big', cfg.big);
$('s-inst').textContent = 'Instance ' + INSTANCE + '   channel ' + chanName;

// ---------- MIDI (opt-in learn) ----------
// CC 4 on channel 1 drives the weather cycle unless that control or target was learned elsewhere
if (cfg.midi && !cfg.midi.weather && !Object.values(cfg.midi).includes('cc:0:4')) cfg.midi.weather = 'cc:0:4';
const midi = new Midi({
  map: cfg.midi, onLog: log,
  onAction(id, v) {
    if (id === 'black') return setBlack();
    if (flags.blackout) return;
    if (id === 'speed') setSpeed(sliderToSpeed(v));
    else if (id === 'play') { if (flags.panic) setPanic(false); else pb.toggle(); renderPlay(); }
    else if (id === 'reseed') reseed('midi');
    else if (id === 'palNext') palStep(1);
    else if (id === 'palPrev') palStep(-1);
    else if (id === 'world') nextWorld();
    else if (id === 'weather' && WORLDS[cur.world].data) scrubLevel(v);    // CC 4: the water level in a data world
    else if (id === 'weather') { cfg.weather.mode = 'scrub'; weather.p = v * 0.9999; persist(); renderWeather(); }
    else if (id === 'level') scrubLevel(v);
    else if (id === 've') setVE(1 + Math.round(v * 19), false);
    else if (id === 'bank') setBank(cfg.nashua.bank === 'L' ? 'R' : 'L');
    else if (id === 'morph') setMorph(v);
    else if (id === 'fxMode') setFxMode(FX_MODES[(FX_MODES.indexOf(cfg.fx.mode) + 1) % FX_MODES.length]);
    else if (id === 'fxFreeze') { cfg.fx.freeze = !cfg.fx.freeze; persist(); renderFx(); }
    else if (id === 'fxDir') { cfg.fx.dir = -cfg.fx.dir; persist(); renderFx(); }
    else if (id === 'fxSlit') { cfg.fx.slit = v; persist(); renderFx(); }
    else if (id === 'fxWidth') { cfg.fx.width = 1 + Math.round(v * 15); persist(); renderFx(); }
    else if (id === 'fxDepth') { cfg.fx.depth = 2 + Math.round(v * 126); persist(); renderFx(); }
    else if (id === 'fxSlope') { cfg.fx.slope = 0.1 + v * 3.9; persist(); renderFx(); }
    else if (id === 'fxMix') { cfg.fx.mix = v; persist(); renderFx(); }
    else if (id === 'mode') setMode(MODE_ORDER[(MODE_ORDER.indexOf(cfg.nashua.mode) + 1) % MODE_ORDER.length]);
    else if (id === 'sections') { cfg.nashua.sections = !cfg.nashua.sections; persist(); renderReach(); }
    else if (PARAMS.includes(id)) { cfg.weather.holds[id] = v; persist(); renderWeather(); }
  },
  onChange() { cfg.midi = { ...midi.map }; persist(); renderMidi(); },
});
function renderMidi() {
  $('m-enable').classList.toggle('on', !!midi.access);
  $('m-enable').textContent = midi.access ? 'MIDI on' : 'Enable MIDI';
  $('m-out').classList.toggle('on', midi.out); $('m-out').textContent = midi.out ? 'MIDI out on' : 'MIDI out off';
  $('m-dev').textContent = !midi.supported ? 'Web MIDI not available' : midi.access ? (midi.devices.length ? midi.devices.join(', ') : 'No MIDI inputs') : '';
  $('m-map').replaceChildren(...MIDI_TARGETS.map(t => {
    const b = document.createElement('button');
    b.textContent = midi.learn === t.id ? t.label + ': move a control' : t.label + (midi.map[t.id] ? ' ' + midi.map[t.id].replace(/:(\d+):/, (m, c) => ' ch' + (+c + 1) + ' ') : '');
    b.classList.toggle('on', midi.learn === t.id);
    b.disabled = !midi.access;
    b.onclick = () => midi.startLearn(t.id);
    b.oncontextmenu = e => { e.preventDefault(); midi.clear(t.id); };
    return b;
  }));
}
$('m-enable').onclick = () => midi.enable();
$('m-nano').onclick = () => { midi.preset(NANOKONTROL2); log('info', 'MIDI map: nanoKONTROL2 factory layout'); };
// MIDI out (LEDs of toggles) stays off unless switched on here; the state is sent again on every change
$('m-out').onclick = () => { midi.out = !midi.out; ledState = ''; renderMidi(); };
let ledState = '';
setInterval(() => {
  if (!midi.out) return;
  const s = { play: pb.playing, black: flags.blackout, fxFreeze: !!cfg.fx.freeze, sections: !!cfg.nashua.sections }, k = JSON.stringify(s);
  if (k === ledState) return;
  ledState = k;
  for (const id in s) midi.feedback(id, s[id]);
}, 250);
renderMidi();

function syncInputs() {
  for (const [id, k] of [['u-contrast', 'contrast'], ['u-ink', 'ink'], ['u-zoom', 'zoom'], ['u-yalign', 'yAlign']]) { $(id).value = cfg[k]; $(id).dispatchEvent(new Event('input')); }
  $('u-paper').checked = cfg.paper; $('u-vignette').checked = cfg.vignette;
}

// ---------- gradient editor ----------
const gradBase = () => byId.get('gradient');
function gradDef() { const b = gradBase(); return cfg.gradient || { ramp: b.ramp.map(s => s.slice()), drift: b.drift, period: b.period, rate: b.rate }; }
function setGrad(g) { cfg.gradient = g; applyGradient(); persist(); }
function renderGrad() {
  const show = byId.get(pal.target)?.type === 'gradient' && byId.get(pal.target)?.editable;
  $('grad-edit').hidden = !show;
  if (!show) return;
  const g = gradDef();
  const box = $('grad-stops'); box.textContent = '';
  g.ramp.forEach((st, i) => {
    const row = document.createElement('div'); row.className = 'gs';
    const c = document.createElement('input'); c.type = 'color'; c.value = st[1].length === 7 ? st[1].toLowerCase() : '#888888'; c.setAttribute('aria-label', 'stop colour');
    const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.01; r.value = st[0]; r.setAttribute('aria-label', 'stop position');
    const x = document.createElement('button'); x.textContent = 'Remove'; x.disabled = g.ramp.length <= 2;
    c.oninput = () => { const d = gradDef(); d.ramp[i][1] = c.value.toUpperCase(); setGrad(d); };
    r.oninput = () => { const d = gradDef(); d.ramp[i][0] = +r.value; setGrad(d); };
    x.onclick = () => { const d = gradDef(); d.ramp.splice(i, 1); setGrad(d); renderGrad(); };
    row.append(c, r, x); box.appendChild(row);
  });
  paintDrift();
  $('grad-rate').value = g.drift === 'time' ? Math.sqrt(g.rate / 0.2) : 1 - Math.sqrt((g.period - 500) / 40000);
  $('grad-rate-o').textContent = g.drift === 'time' ? g.rate.toFixed(3) + ' /s' : Math.round(g.period) + ' px';
}
const paintDrift = bindSeg('grad-drift', () => gradDef().drift, v => { const d = gradDef(); d.drift = v; setGrad(d); renderGrad(); });
$('grad-rate').addEventListener('input', e => {
  const d = gradDef(), v = +e.target.value;
  if (d.drift === 'time') d.rate = +(v * v * 0.2).toFixed(4); else d.period = Math.round(500 + (1 - v) * (1 - v) * 40000);
  setGrad(d);
  $('grad-rate-o').textContent = d.drift === 'time' ? d.rate.toFixed(3) + ' /s' : Math.round(d.period) + ' px';
});
$('grad-add').onclick = () => { const d = gradDef(); d.ramp.push([0.5, '#FFFFFF']); d.ramp.sort((a, b) => a[0] - b[0]); setGrad(d); renderGrad(); };
$('grad-reset').onclick = () => { cfg.gradient = null; applyGradient(); persist(); renderGrad(); };

// ---------- export ----------
const E = cfg.exp;
bindSeg('e-format', () => E.format, v => { E.format = v; renderExport(); });
bindSeg('e-orient', () => E.portrait ? 'portrait' : 'landscape', v => { E.portrait = v === 'portrait'; renderExport(); });
bindRange('e-fit', 'fit', f2, E, renderExport);
bindRange('e-yalign', 'yAlign', f2, E, renderExport);
bindNum('e-margin', 'margin', E, renderExport);
bindCheck('e-border', 'border', E);
bindCheck('e-label', 'label', E);
bindSeg('e-dpi', () => String(E.dpi), v => { E.dpi = +v; renderExport(); });
bindCheck('e-lights', 'lights', E);
bindCheck('e-rain', 'rain', E);
$('e-here').onclick = () => { const g = geom(); E.x0 = pb.x + (lastView.viewW - g.worldW) / 2; persist(); };
$('e-svg').onclick = () => runExport('svg');
$('e-png').onclick = () => runExport('png');
$('e-pdf').onclick = () => runExport('pdf');
if (E.x0 === undefined) E.x0 = 0;

function viewForExport() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const v = viewOf(W, H, cfg.zoom, cfg.yAlign);
  return { W, H, scale: v.scale, camX: pb.x, camY: v.camY };
}
function geom() { return frameGeom(E, viewForExport()); }
function renderExport() {
  const g = geom();
  const dpi = E.dpi;
  const px = g.unit === 'in' ? [Math.round(g.pageW * dpi), Math.round(g.pageH * dpi)] : [g.pageW * 2, g.pageH * 2];
  $('e-info').textContent = (g.unit === 'in' ? `Arch D ${g.pageW} x ${g.pageH} in, print ${g.printW} x ${g.printH} in, ` : `View ${g.pageW} x ${g.pageH}, `) +
    `scroll ${Math.round(g.worldW)} px wide, PNG ${px[0]} x ${px[1]}`;
  $('e-orient').style.display = $('e-margin').parentElement.style.display = $('e-dpi').style.display = $('e-here').style.display = g.unit === 'in' ? '' : 'none';
  $('e-fit').parentElement.style.display = $('e-yalign').parentElement.style.display = g.unit === 'in' ? '' : 'none';
}
// frame overlay: what an Arch D export will contain, in screen space
function frameTick() {
  const el = $('frame');
  const show = !$('p-export').hidden && E.format === 'archd' && lastView;
  el.hidden = !show;
  if (!show) return;
  const g = geom(), s = cssScale(), v = viewForExport();
  el.style.left = ((g.x0 - pb.x) * s) + 'px';
  el.style.top = ((g.y0 - v.camY) * s) + 'px';
  el.style.width = (g.worldW * s) + 'px';
  el.style.height = (g.worldH * s) + 'px';
  $('frame-tag').textContent = `Arch D ${g.pageW} x ${g.pageH} in   x ${Math.round(g.x0)}`;
}
let exporting = false;
async function runExport(kind) {
  if (exporting) return;
  exporting = true;
  const st = $('e-status');
  const t0 = performance.now();
  try {
    const world = scene.peek(cur.key);
    if (!world) throw new Error('no landscape yet');
    const g = geom();
    if (g.unit === 'in') {
      if (!world.meta.chunked && (g.x0 < world.culledBelow || g.x0 + g.worldW < world.xmin)) throw new Error('frame is behind the memory cap; move it nearer the view');
      st.textContent = 'Generating to x ' + Math.round(g.x0 + g.worldW) + ' ...';
      await world.ensureRight(g.x0 + g.worldW, 60000, world.meta.chunked ? g.x0 : Infinity);
    }
    const look = { ...scene.look(frameState(performance.now())), rainOn: !!E.rain };
    const p = byId.get(pal.target);
    const o = { seed: cur.seed, world: cur.world, paletteId: pal.target, paletteName: p ? p.name : pal.target, border: E.border, label: E.label, viewScale: 2, lights: E.lights, rain: E.rain };
    let name, blob, extra = '';
    if (kind === 'png') {
      st.textContent = 'PNG 0 %';
      const files = await buildPNG(world, scene.renderer, g, look, o, E.dpi, f => st.textContent = 'PNG ' + Math.round(f * 100) + ' %');
      for (const fl of files) { name = fileName(o, g, 'png').replace(/\.png$/, fl.suffix + '.png'); download(fl.blob, name); }
      blob = files[0].blob; extra = ` ${files[0].w} x ${files[0].h} px` + (files.length > 1 ? `, ${files.length} tiles` : '');
      window.__lastExport = { kind, name, size: blob.size, w: files[0].w, h: files[0].h, tiles: files.length };
    } else {
      st.textContent = 'Building SVG ...';
      await new Promise(r => setTimeout(r, 0));
      const svg = buildSVG(world, g, look, o);
      if (kind === 'svg') { blob = new Blob([svg], { type: 'image/svg+xml' }); name = fileName(o, g, 'svg'); }
      else { st.textContent = 'Building PDF ...'; blob = await buildPDF(svg, g); name = fileName(o, g, 'pdf'); }
      download(blob, name);
      window.__lastExport = { kind, name, size: blob.size };
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    st.textContent = `Saved ${name}${extra}, ${(blob.size / 1048576).toFixed(1)} MB, ${secs} s`;
    log('info', 'export ' + name + ' ' + secs + ' s');
  } catch (e) {
    st.textContent = 'Export failed: ' + e.message;
    log('error', 'export: ' + e.message);
    window.__lastExport = { kind, error: e.message };
  } finally { exporting = false; }
}

// ---------- world and weather ----------
function renderWorld() {
  document.querySelectorAll('#b-world button').forEach(b => b.classList.toggle('on', b.dataset.v === cur.world));
  $('hud-world').textContent = 'World: ' + cur.world;
  $('weather-off').hidden = worldOf(cur.world).weather;
  if ($('r-off')) $('r-off').hidden = !!worldOf(cur.world).data;
}
document.querySelectorAll('#b-world button').forEach(b => b.onclick = () => setWorld(b.dataset.v));
const paintCycle = bindSeg('w-cycle', () => cfg.weather.mode === 'scrub' ? '' : cfg.weather.mode, v => { cfg.weather.mode = v; renderWeather(); });
bindNum('w-period', 'period', cfg.weather);
function renderWeather() {
  paintCycle();
  for (const k of PARAMS) {
    const held = cfg.weather.holds[k] !== undefined;
    $('w-' + k + '-f').classList.toggle('on', !held);
    $('w-' + k + '-f').textContent = held ? 'Follow' : 'Cycle';
  }
}
for (const k of PARAMS) {
  const el = $('w-' + k);
  el.addEventListener('input', () => { cfg.weather.holds[k] = +el.value; persist(); renderWeather(); });
  $('w-' + k + '-f').onclick = () => { delete cfg.weather.holds[k]; persist(); renderWeather(); };
}
function weatherTick() {
  if ($('p-weather').hidden) return;
  const v = weather.values();
  for (const k of PARAMS) {
    const el = $('w-' + k);
    if (document.activeElement !== el || cfg.weather.holds[k] === undefined) el.value = cfg.weather.holds[k] !== undefined ? cfg.weather.holds[k] : v[k];
    el.parentElement.querySelector('output').textContent = v[k].toFixed(2);
  }
  $('w-phase').textContent = 'Phase ' + weather.phase;
}

// ---------- data world (nashua): bank, exaggeration, water level, ends, labels ----------
const overlay = new ReachOverlay($('labels'));
const section = new SectionInset($('section'), $('playhead'));
const isData = () => !!(WORLDS[cur.world] && WORLDS[cur.world].data);
const curPack = () => { const w = scene.peek(cur.key); return w && w.pack ? w.pack : null; };
const nLevels = () => (curPack() ? curPack().levels.length : 5);
const viewW = () => (lastView ? lastView.viewW : 1245);
function setBank(b) {
  if (b !== 'L' && b !== 'R') return;
  const P = curPack(), old = cfg.nashua.bank;
  cfg.nashua.bank = b; persist(); renderReach();
  if (!isData() || b === old) return;
  // keep the same s at the view centre; the mirror puts downstream on the other side
  const s = P ? sOf(P, pb.x + viewW() / 2, old) : null;
  const keepX = P ? xOf(P, s, b) - viewW() / 2 : pb.x;
  setSeed(cur.seed, { world: cur.world, keepX, history: false, why: (b === 'L' ? 'left' : 'right') + ' bank' });
}
let veTimer = 0;
function setVE(v, now) {
  v = Math.max(1, Math.min(20, Math.round(v)));
  if (v === cfg.nashua.ve && !now) return;
  cfg.nashua.ve = v; persist(); renderReach();
  clearTimeout(veTimer);
  // a new exaggeration redraws the reach: debounced, then crossfaded at the same x
  veTimer = setTimeout(() => { if (isData() && cur.opts && cur.opts.ve !== cfg.nashua.ve) setSeed(cur.seed, { world: cur.world, keepX: pb.x, history: false, why: 'Vertical Exaggeration ' + cfg.nashua.ve + 'x' }); }, now ? 0 : 350);
}
let morphTimer = 0;
function setMorph(v) {
  cfg.nashua.morph = Math.max(0, Math.min(1, v)); persist(); renderReach();
  clearTimeout(morphTimer);
  morphTimer = setTimeout(() => { const want = morphQ(cfg.nashua.morph), have = (cur.opts && cur.opts.morph) || 0; if (isData() && want !== have) setSeed(cur.seed, { world: cur.world, keepX: pb.x, history: false, why: 'morph ' + Math.round(want * 100) + '%' }); }, 250);
}
function setMode(m) { if (!MODES[m]) return; cfg.nashua.mode = m; persist(); renderReach(); toast('Mode: ' + m); }
function setLevel(i) { cfg.nashua.level = Math.max(0, Math.min(nLevels() - 1, i)); lvScrub = false; persist(); renderReach(); }
function scrubLevel(v) { cfg.nashua.level = lvShown = Math.max(0, Math.min(1, v)) * (nLevels() - 1); renderReach(); persist(); }
let endsArmed = true, pingLogged = -Infinity;
function endsTick() {
  if (!isData()) return;
  const P = curPack(); if (!P) return;
  const W = reachW(P), vw = viewW(), xc = pb.x + vw / 2, v = pb.velocity, mode = cfg.nashua.ends;
  // ping-pong is a rule on the travel direction, so it holds through fades and reseeds: past an end and heading out,
  // turn back (setting the direction again is harmless)
  if (mode === 'pingpong') {
    const turn = xc < 0 && pb.dir < 0 ? 1 : xc > W && pb.dir > 0 ? -1 : 0;
    if (turn) {
      setDir(turn); pb.k = 0;
      const now = performance.now();
      if (now - pingLogged > 60000) { pingLogged = now; log('info', 'ping-pong at the ' + (turn > 0 ? 'left' : 'right') + ' end (logged once a minute)'); }
    }
    return;
  }
  if (fade) return;
  const out = (xc > W && v > 0) || (xc < 0 && v < 0);
  if (!out) { if (xc >= 0 && xc <= W) endsArmed = true; return; }
  if (!endsArmed) return;
  endsArmed = false;
  const right = xc > W;
  if (mode === 'loop') setSeed(cur.seed, { world: cur.world, keepX: right ? -vw / 2 : W - vw / 2, history: false, why: 'loop' });
  else setSeed(cur.seed, { world: 'shanshui', history: false, why: 'end of the reach, hand over' });
}
let factAt = 0;
function reachTick() {
  const w = scene.peek(cur.key);
  // sizes from this frame (read once in tick), so the overlay never forces a layout after its own writes
  const vs = lastView ? (lastView.H / WORLD_H) * cfg.zoom : cssScale();
  if (lastView) overlay.update(w, { cssScale: vs, camX: pb.x, camY: lastView.camY, W: lastView.W }, isData() && cfg.nashua.labels);
  const SP = w && w.pack ? w.pack : null, so = cur.opts || {};
  section.update(SP, { s: SP ? sOf(SP, pb.x + viewW() / 2, so.bank) : 0, lv: lvShown, ve: so.ve || 10, show: isData() && !flags.blackout && modeLayers().includes('sections'), W: lastView ? lastView.W : 1280 });
  const now = performance.now();
  if (now - factAt < 250) return;
  factAt = now;
  const P = curPack();
  if (P && levelsBuilt !== P.hash) renderReach();
  const t = isData() ? factLine(w, pb.x + viewW() / 2, lvShown, vs) : '';
  if ($('hud-facts').textContent !== t) $('hud-facts').textContent = t;
  if (!$('p-reach').hidden) { $('r-facts').textContent = t; $('r-level').parentElement.querySelector('output').textContent = lvShown.toFixed(2); }
}
const paintBank = bindSeg('r-bank', () => cfg.nashua.bank, v => setBank(v));
const paintMode = bindSeg('r-mode', () => cfg.nashua.mode, v => setMode(v));
bindCheck('r-sections', 'sections', cfg.nashua, () => renderReach());
$('r-morph').addEventListener('input', e => setMorph(+e.target.value));
const paintEnds = bindSeg('r-ends', () => cfg.nashua.ends, v => { cfg.nashua.ends = v; });
$('r-ve').addEventListener('input', e => setVE(+e.target.value, false));
$('r-level').addEventListener('input', e => { cfg.nashua.level = lvShown = +e.target.value; persist(); renderReach(); });
bindCheck('r-labels', 'labels', cfg.nashua);
bindCheck('r-outlabels', 'outLabels', cfg.nashua);
bindCheck('r-outfacts', 'outFacts', cfg.nashua);
let levelsBuilt = '';
function renderReach() {
  paintBank(); paintEnds(); paintMode();
  $('r-sections').checked = cfg.nashua.sections || cfg.nashua.mode === 'sections';
  if (document.activeElement !== $('r-morph')) $('r-morph').value = cfg.nashua.morph;
  $('r-morph').parentElement.querySelector('output').textContent = Math.round(morphQ(cfg.nashua.morph) * 100) + '%';
  { const w = scene.peek(cur.key), miss = !!(w && w.designMissing); $('r-morph-note').hidden = !miss; $('r-morph-note').textContent = miss ? 'Design pack not loaded (local only): the morph stays at Existing Grade (before landform)' : ''; }
  $('r-off').hidden = isData();
  $('r-ve').value = cfg.nashua.ve; $('r-ve').parentElement.querySelector('output').textContent = cfg.nashua.ve + 'x';
  $('r-labels').checked = cfg.nashua.labels;
  const P = curPack();
  $('r-level').max = nLevels() - 1;
  if (document.activeElement !== $('r-level')) $('r-level').value = cfg.nashua.level;
  if (P && levelsBuilt !== P.hash) {
    levelsBuilt = P.hash;
    $('r-levels').replaceChildren(...P.levels.map((L, i) => { const b = document.createElement('button'); b.className = 'main'; b.dataset.i = i; b.textContent = (i + 1) + '  ' + L.name; b.onclick = () => setLevel(i); return b; }));
  }
  $('r-levels').querySelectorAll('button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.i - cfg.nashua.level) < 0.02));
}

// ---------- render UI ----------
function renderPlay() {
  const on = pb.playing;
  $('b-play').classList.toggle('on', on);
  $('b-play').querySelector('.m').innerHTML = on ? '&#10074;&#10074;' : '&#9654;';
  $('b-play').querySelector('.t').textContent = on ? 'Pause' : 'Play';
}
function renderSeed() {
  $('seed-in').value = decodeSafe(cur.seed);
  $('hud-seed').textContent = 'seed ' + cur.seed;
  $('seed-orig').href = UPSTREAM_SITE + '?seed=' + cur.seed;
  $('seed-orig').hidden = cur.world !== 'shanshui';
  const starred = stars.includes(tok(cur.world, cur.seed));
  $('b-star').classList.toggle('on', starred);
  $('b-star').querySelector('.m').innerHTML = starred ? '&#9733;' : '&#9734;';
  $('b-back').disabled = histIdx <= 0; $('b-fwd').disabled = histIdx >= hist.length - 1;
  const hl = $('hist'); hl.textContent = '';
  hist.slice().reverse().forEach((s, ri) => {
    const i = hist.length - 1 - ri;
    hl.appendChild(item(s, i === histIdx, () => { histIdx = i; playTok(s, { history: false, why: 'history' }); }));
  });
  const sl = $('stars'); sl.textContent = '';
  stars.forEach(s => sl.appendChild(item(s, s === tok(cur.world, cur.seed), () => playTok(s, { why: 'starred' }), () => { stars = stars.filter(x => x !== s); persist(); renderSeed(); })));
  if (!stars.length) { const li = document.createElement('li'); li.className = 'kv'; li.textContent = 'None'; sl.appendChild(li); }
}
function decodeSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
function item(text, isCur, onPick, onRemove) {
  const li = document.createElement('li');
  const b = document.createElement('button'); b.className = 'main' + (isCur ? ' cur' : ''); b.textContent = text; b.onclick = onPick;
  li.appendChild(b);
  if (onRemove) { const x = document.createElement('button'); x.className = 'x'; x.textContent = 'Remove'; x.onclick = onRemove; li.appendChild(x); }
  return li;
}
function swatch(p) {
  const s = document.createElement('span'); s.className = 'sw';
  const cols = p.type === 'gradient' ? [p.ground, ...p.ramp.map(r => r[1])] : p.stops.map(r => r[1]);
  for (const c of cols) { const i = document.createElement('i'); i.style.background = c; s.appendChild(i); }
  return s;
}
function renderPal() {
  const p = byId.get(pal.target);
  $('b-pal-n').textContent = p ? p.name : pal.target;
  $('hud-pal').textContent = p ? p.name : '';
  if (!$('p-look').hidden) renderPalList();
}
function renderPalList() {
  const box = $('pal-list'); box.textContent = '';
  let group = '';
  for (const p of palettes.palettes) {
    if (p.group !== group) { group = p.group; const h = document.createElement('div'); h.className = 'g'; h.textContent = group; box.appendChild(h); }
    const row = document.createElement('div'); row.className = 'pal';
    const b = document.createElement('button'); b.className = 'main' + (p.id === pal.target ? ' on' : ''); b.dataset.id = p.id;
    b.append(swatch(p), document.createTextNode(p.name));
    b.onclick = () => setPalette(p.id);
    const st = document.createElement('button'); st.className = 'star' + (palStars.includes(p.id) ? ' on' : ''); st.innerHTML = palStars.includes(p.id) ? '&#9733;' : '&#9734;';
    st.title = 'Star palette'; st.setAttribute('aria-label', 'star ' + p.name);
    st.onclick = () => togglePalStar(p.id);
    row.append(b, st); box.appendChild(row);
  }
  renderGrad();
}
function renderLog() {
  const l = $('log'); if (!l) return;
  l.textContent = '';
  for (const e of logs.slice(0, 120)) { const li = document.createElement('li'); li.className = e.level; li.textContent = e.t + '  ' + e.msg; l.appendChild(li); }
  $('log-n').textContent = errCount && $('p-log').hidden ? ' ' + errCount : '';
}
let hudAt = 0;
function hudTick(now) {
  if (now - hudAt < 250) return;
  hudAt = now;
  const s = scene.stats();
  $('hud-stats').textContent = `${s.fps.toFixed(0)} fps   ${s.chunks} chunks   ${s.tiles} tiles   x ${Math.round(pb.x)}   q ${scene.q}`;
  const f = [];
  f.push(pb.playing ? 'playing' : (pb.resumeAt ? 'resume in ' + Math.ceil((pb.resumeAt - now) / 1000) + ' s' : 'paused'));
  if (flags.hold) f.push('hold');
  if (flags.blackout) f.push('blackout');
  if (flags.panic) f.push('panic');
  if (out.connected && out.info) f.push(`output ${out.info.w} x ${out.info.h} ${Math.round(out.info.fps || 0)} fps${out.info.blank ? ' BLANK' : ''}`);
  if (scene.watch.blank) f.push('watchdog: blank');
  if (worldOf(cur.world).weather) f.push('weather ' + weather.phase + (cfg.weather.mode === 'auto' ? '' : ' (' + (cfg.weather.mode === 'scrub' ? 'MIDI' : 'pinned') + ')'));
  $('hud-flags').textContent = f.join('   ');
  // countdown to the next automatic change
  const n = [];
  if (cfg.show.auto) n.push(cfg.show.mode === 'min' ? 'Reseed ' + clock((auto.nextAt - now) / 1000) : 'Reseed ' + Math.max(0, Math.round(cfg.show.every * 1000 - auto.travelled)) + ' px');
  if (cfg.show.autoPal) n.push('Palette ' + clock((auto.palAt - now) / 1000));
  $('b-next').textContent = n.join('   ');
  renderPlay();
  weatherTick();
}
const clock = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600); }
function showFatal(e) { document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;background:#07090e;font:20px sans-serif">Could not start: ${String(e.message || e)}</div>`); }

// key card
(() => { const t = $('keys'); for (const [k, d] of KEYS) { const tr = document.createElement('tr'); tr.innerHTML = '<td></td><td></td>'; tr.children[0].textContent = k; tr.children[1].textContent = d; t.appendChild(tr); } })();
$('ver').textContent = 'v' + VERSION;

addEventListener('beforeunload', () => { persist(true); if (chan) chan.postMessage({ type: 'bye' }); });
document.addEventListener('visibilitychange', () => { last = performance.now(); });

setSpeed(cfg.speed); setDir(cfg.dir);
renderSeed(); renderPal(); renderPlay(); renderExport(); renderWorld(); renderWeather(); renderReach(); updateUrl(); layoutPanels();
log('info', 'v' + VERSION + ' ready, instance ' + INSTANCE + ', world ' + cur.world + ', seed ' + cur.seed);
requestAnimationFrame(tick);

// test and console hooks
// ---------- slit-scan and time-smear (GPU, after the scene; see render/slitscan.js) ----------
// sources: the scroll itself, a video dropped on the stage or listed in media/ (local, never committed), or a camera
// granted in this window. The output follows the mode on its own frames; it never asks for a camera.
const FX_MODES = ['off', 'strip', 'smear', 'displace'];
const fxVideo = document.createElement('video');
fxVideo.muted = true; fxVideo.loop = true; fxVideo.playsInline = true; fxVideo.crossOrigin = 'anonymous';
scene.video = fxVideo;
let fxVideoName = '', fxCam = null;
function setFxMode(m) { if (!FX_MODES.includes(m)) return; cfg.fx.mode = m; persist(); renderFx(); toast('FX: ' + m); }
function fxUseVideo(url, name, file) {
  if (fxCam) { fxCam.getTracks().forEach(t => t.stop()); fxCam = null; fxVideo.srcObject = null; }
  fxVideo.src = url; fxVideo.play().catch(() => {});
  fxVideoName = name; cfg.fx.source = 'video'; persist(); renderFx();
  if (chan && file) chan.postMessage({ type: 'fxvideo', file, name });   // the output plays its own copy
  log('info', 'FX source: ' + name);
}
async function fxCamera() {
  try {
    fxCam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    fxVideo.removeAttribute('src'); fxVideo.srcObject = fxCam; fxVideo.play().catch(() => {});
    fxVideoName = 'camera (this window only)'; cfg.fx.source = 'video'; persist(); renderFx();
    if (chan) chan.postMessage({ type: 'fxvideo', file: null, name: 'camera' });
  } catch (e) { log('warn', 'Camera not granted: ' + (e && e.name || e)); }
}
stage.addEventListener('dragover', e => { if ([...(e.dataTransfer.items || [])].some(i => i.type.startsWith('video/'))) e.preventDefault(); });
stage.addEventListener('drop', e => {
  const f = [...(e.dataTransfer.files || [])].find(x => x.type.startsWith('video/'));
  if (!f) return;
  e.preventDefault();
  fxUseVideo(URL.createObjectURL(f), f.name, f);
});
$('f-media').onclick = async () => {
  // tools/serve.mjs lists media/ as media/list.json; on a static host there is no media/ (it is never published)
  const box = $('f-medialist');
  try {
    const r = await fetch('media/list.json', { cache: 'no-store' });
    const list = r.ok ? await r.json() : [];
    box.replaceChildren(...(list.length ? list : ['(no videos in media/)']).map(n => { const b = document.createElement('button'); b.textContent = n; if (list.length) b.onclick = () => fxUseVideo('media/' + encodeURIComponent(n), n, null); return b; }));
  } catch { box.textContent = '(media/ is only on a local server)'; }
};
$('f-cam').onclick = fxCamera;
const paintFxMode = bindSeg('f-mode', () => cfg.fx.mode, v => setFxMode(v));
const paintFxSrc = bindSeg('f-src', () => cfg.fx.source, v => { cfg.fx.source = v; renderFx(); });
const paintFxDir = bindSeg('f-dir', () => cfg.fx.dir, v => { cfg.fx.dir = +v; });
const paintFxAxis = bindSeg('f-axis', () => cfg.fx.axis, v => { cfg.fx.axis = v; });
bindRange('f-slit', 'slit', v => Math.round(v * 100) + '%', cfg.fx);
bindRange('f-width', 'width', v => v + ' px', cfg.fx);
bindRange('f-depth', 'depth', v => v + ' frames', cfg.fx);
bindRange('f-slope', 'slope', f2, cfg.fx);
bindRange('f-mix', 'mix', v => Math.round(v * 100) + '%', cfg.fx);
bindCheck('f-freeze', 'freeze', cfg.fx);
function renderFx() {
  paintFxMode(); paintFxSrc(); paintFxDir(); paintFxAxis();
  for (const k of ['slit', 'width', 'depth', 'slope', 'mix']) { const el = $('f-' + k); if (document.activeElement !== el) { el.value = cfg.fx[k]; el.dispatchEvent(new Event('input')); } }
  $('f-freeze').checked = cfg.fx.freeze;
  $('f-video').textContent = cfg.fx.source === 'video' ? (fxVideoName ? 'Video: ' + fxVideoName : 'No video yet: drop a file on the stage, or pick one from media/') : 'Source: the scroll';
}
renderFx();

window.SSAV = {
  get seed() { return cur.seed; }, get key() { return cur.key; }, get x() { return pb.x; }, get playing() { return pb.playing; },
  get worldName() { return cur.world; }, setWorld, nextWorld, weather, renderWeather,
  get palette() { return pal.target; }, get flags() { return { ...flags }; }, get hist() { return hist.slice(); }, get histIdx() { return histIdx; },
  get stars() { return stars.slice(); }, get fading() { return !!fade || !!pal.b; }, get outConnected() { return out.connected; },
  pb, scene, cfg, palettes, setSeed, reseed, setPalette, palStep, histStep, stop, setBlack, setPanic, setCard, setHold, toggleStar, togglePalStar,
  openOutput, runExport, geom, midi, resetAuto, resetAutoPal, frameState: () => frameState(performance.now()), world: () => scene.peek(cur.key), version: VERSION,
  setBank, setVE, setLevel, scrubLevel, setMode, setMorph, setFxMode, fxUseVideo, get lvShown() { return lvShown; }, viewW: () => viewW(), get opts() { return cur.opts; },
};
