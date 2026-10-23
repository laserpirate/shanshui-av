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
  exp: { format: 'archd', portrait: false, fit: 1, yAlign: 0.5, margin: 0.5, border: false, label: false, dpi: 150 },
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
  const o = { seed: cur.seed, pal: pal.target, cfg, stars, palStars, hist };
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
const cur = { seed: urlSeed() || saved.seed || newSeed(), key: '' };
cur.seed = cleanSeed(cur.seed);
cur.key = cur.seed + '#' + (++epoch);
let outgoing = null;          // {key, seed, x}
let fade = null;              // {t0, dur, ready}
const pal = { a: byId.has(saved.pal) ? saved.pal : 'original', b: null, t0: 0, dur: 1.2, mix: 0 };
pal.target = pal.a;
const Qpal = new URLSearchParams(location.search).get('palette');
if (Qpal && byId.has(Qpal)) { pal.a = Qpal; pal.target = Qpal; }

const flags = { blackout: false, card: false, panic: false, hold: false, uiHidden: false };
pushHist(cur.seed);

// ---------- seeds ----------
function pushHist(seed) {
  if (hist[histIdx] === seed) return;
  hist = hist.slice(0, histIdx + 1);
  hist.push(seed);
  if (hist.length > 20) hist = hist.slice(-20);
  histIdx = hist.length - 1;
}
function setSeed(seed, { history = true, why = '' } = {}) {
  seed = cleanSeed(seed);
  if (!seed) return;
  if (outgoing) { outgoing = null; fade = null; }
  outgoing = { key: cur.key, seed: cur.seed, x: pb.x };
  cur.seed = seed; cur.key = seed + '#' + (++epoch);
  pb.x = 0; pb.pull = 0; pb.tween = null;
  fade = { t0: 0, dur: cfg.show.fade, wait: performance.now() };
  if (history) pushHist(seed);
  resetAuto();
  updateUrl();
  persist();
  renderSeed();
  log('info', 'seed ' + seed + (why ? ' (' + why + ')' : ''));
}
function reseed(why) { setSeed(newSeed(), { why }); }
function histStep(d) {
  const i = histIdx + d;
  if (i < 0 || i >= hist.length) return toast(d < 0 ? 'Start of history' : 'End of history');
  histIdx = i; setSeed(hist[i], { history: false, why: 'history' });
}
function toggleStar() {
  const i = stars.indexOf(cur.seed);
  if (i >= 0) stars.splice(i, 1); else stars.unshift(cur.seed);
  persist(); renderSeed();
  toast(i >= 0 ? 'Unstarred' : 'Starred');
}
function stop() {
  const w = scene.peek(cur.key);
  const culled = w && w.culledBelow > -2000;   // the start of the seed was dropped by the memory cap
  if (Math.abs(pb.x) > CULL * 0.9 || culled) { pb.pause(); pb.k = 0; setSeed(cur.seed, { history: false, why: 'stop, restart from 0' }); }
  else pb.goTo(0);
  renderPlay();
}
function updateUrl() {
  const q = new URLSearchParams(location.search);
  q.delete('seed');
  let s = '?seed=' + cur.seed;
  const rest = q.toString();
  if (rest) s += '&' + rest;
  try { history.replaceState(null, '', location.pathname + s); } catch (e) { /* file:// or sandbox */ }
}
function shareUrl() { return location.origin + location.pathname + '?seed=' + cur.seed; }

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
    setSeed(stars[auto.starIdx], { why: 'auto, starred' });
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
let autoQ = 1, lowSince = 0;
function qualityTick(now) {
  const want = cfg.q === 'auto' ? autoQ : +cfg.q;
  if (cfg.q === 'auto') {
    if (scene.fps < 45 && !flags.blackout && !document.hidden) { if (!lowSince) lowSince = now; if (now - lowSince > 5000 && autoQ > 0.5) { autoQ = autoQ > 0.75 ? 0.75 : 0.5; lowSince = 0; log('warn', 'quality lowered to ' + autoQ + ' (fps under 45)'); } }
    else lowSince = 0;
  }
  scene.q = want * (out.connected && !out.fullPreview ? 0.5 : 1);
}

// ---------- output window ----------
const chanName = 'shanshui-av:' + INSTANCE;
const chan = 'BroadcastChannel' in window ? new BroadcastChannel(chanName) : null;
const out = { win: null, connected: false, last: 0, info: null, fullPreview: false };
if (chan) chan.onmessage = e => {
  const m = e.data;
  if (m.type === 'hello' || m.type === 'beat') { out.connected = true; out.last = performance.now(); out.info = m; }
  if (m.type === 'log') log(m.level, 'output: ' + m.msg);
  if (m.type === 'bye') out.connected = false;
  if (m.type === 'key') {   // keys pressed while the output window has focus
    if (m.key === 'b' || m.key === 'B') setBlack();
    else if (m.key === 'panic') setPanic(true);
    else if (m.key === 'Escape' && flags.panic) setPanic(false);
    else if (['r', 'R', ' ', 'p', 'P', 'g', 'G', 't', 'T', 'Home', '[', ']'].includes(m.key)) onKey({ key: m.key, shiftKey: m.shift, target: document.body, preventDefault() {} });
  }
};
function openOutput() {
  const url = new URL('output.html', location.href);
  if (INSTANCE !== 'main') url.searchParams.set('i', INSTANCE);
  out.win = window.open(url.href, 'shanshui-out-' + INSTANCE, 'popup,width=1280,height=720');
  if (!out.win) toast('Popup blocked: allow popups for this page');
  else log('info', 'output window opened');
}

// ---------- frame state ----------
let time0 = performance.now();
function frameState(now) {
  const worlds = [];
  if (outgoing) worlds.push({ key: outgoing.key, seed: outgoing.seed, x: outgoing.x, alpha: 1 });
  let a = 1;
  if (fade && fade.t0) { const t = Math.min(1, (now - fade.t0) / (fade.dur * 1000)); a = t * t * (3 - 2 * t); }
  else if (fade) a = 0;
  worlds.push({ key: cur.key, seed: cur.seed, x: pb.x, alpha: outgoing ? a : 1 });
  return {
    worlds, dir: pb.dir,
    pal: { a: pal.a, b: pal.b || pal.a, mix: pal.mix },
    u: { contrast: cfg.contrast, ink: cfg.ink, paper: cfg.paper, vignette: cfg.vignette, zoom: cfg.zoom, yAlign: cfg.yAlign },
    time: (now - time0) / 1000,
    v: pb.velocity, t: Date.now(),
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
    if (!flags.panic) pb.step(dt, now);
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
    if (chan) chan.postMessage({ type: 'frame', fs, flags: { ...flags }, custom: cfg.gradient ? { ...cfg.gradient, rev: gradRev } : null });
    if (out.connected && now - out.last > 3500) { out.connected = false; log('warn', 'output window stopped answering'); }
    hudTick(now);
    frameTick();
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
bindSeg('s-q', () => cfg.q, v => { cfg.q = v; autoQ = 1; });
bindCheck('s-big', 'big', cfg, () => { body.classList.toggle('big', cfg.big); layoutPanels(); });
body.classList.toggle('big', cfg.big);
$('s-inst').textContent = 'Instance ' + INSTANCE + '   channel ' + chanName;

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
      if (g.x0 < world.culledBelow || g.x0 + g.worldW < world.xmin) throw new Error('frame is behind the memory cap; move it nearer the view');
      st.textContent = 'Generating to x ' + Math.round(g.x0 + g.worldW) + ' ...';
      await world.ensureRight(g.x0 + g.worldW);
    }
    const look = scene.look(frameState(performance.now()));
    const p = byId.get(pal.target);
    const o = { seed: cur.seed, paletteId: pal.target, paletteName: p ? p.name : pal.target, border: E.border, label: E.label, viewScale: 2 };
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
  const starred = stars.includes(cur.seed);
  $('b-star').classList.toggle('on', starred);
  $('b-star').querySelector('.m').innerHTML = starred ? '&#9733;' : '&#9734;';
  $('b-back').disabled = histIdx <= 0; $('b-fwd').disabled = histIdx >= hist.length - 1;
  const hl = $('hist'); hl.textContent = '';
  hist.slice().reverse().forEach((s, ri) => {
    const i = hist.length - 1 - ri;
    hl.appendChild(item(s, i === histIdx, () => { histIdx = i; setSeed(s, { history: false, why: 'history' }); }));
  });
  const sl = $('stars'); sl.textContent = '';
  stars.forEach(s => sl.appendChild(item(s, s === cur.seed, () => setSeed(s, { why: 'starred' }), () => { stars = stars.filter(x => x !== s); persist(); renderSeed(); })));
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
  $('hud-flags').textContent = f.join('   ');
  // countdown to the next automatic change
  const n = [];
  if (cfg.show.auto) n.push(cfg.show.mode === 'min' ? 'Reseed ' + clock((auto.nextAt - now) / 1000) : 'Reseed ' + Math.max(0, Math.round(cfg.show.every * 1000 - auto.travelled)) + ' px');
  if (cfg.show.autoPal) n.push('Palette ' + clock((auto.palAt - now) / 1000));
  $('b-next').textContent = n.join('   ');
  renderPlay();
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
renderSeed(); renderPal(); renderPlay(); renderExport(); updateUrl(); layoutPanels();
log('info', 'v' + VERSION + ' ready, instance ' + INSTANCE + ', seed ' + cur.seed);
requestAnimationFrame(tick);

// test and console hooks
window.SSAV = {
  get seed() { return cur.seed; }, get key() { return cur.key; }, get x() { return pb.x; }, get playing() { return pb.playing; },
  get palette() { return pal.target; }, get flags() { return { ...flags }; }, get hist() { return hist.slice(); }, get histIdx() { return histIdx; },
  get stars() { return stars.slice(); }, get fading() { return !!fade || !!pal.b; }, get outConnected() { return out.connected; },
  pb, scene, cfg, palettes, setSeed, reseed, setPalette, palStep, histStep, stop, setBlack, setPanic, setCard, setHold, toggleStar, togglePalStar,
  openOutput, runExport, geom, frameState: () => frameState(performance.now()), world: () => scene.peek(cur.key), version: VERSION,
};
