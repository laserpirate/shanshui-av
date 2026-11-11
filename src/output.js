// Output window: no UI, no storage writes. Renders the controller's frame state (BroadcastChannel
// shanshui-av:<instance>) with its own Scene and workers; the same seed draws the same landscape.
// F or double-click: full screen. Other show keys are sent to the controller.
import { loadPalettes } from './core/palettes.js';
import { Scene, viewOf } from './core/scene.js';
import { ReachOverlay, TickOverlay, factLine } from './ui/reach.js';
import { SectionInset } from './ui/section.js';
import { sOf } from './worlds/nashua/pack.js';
import { MapInset } from './ui/mapinset.js';
import { drawTestCard } from './ui/testcard.js';
import { parseWall, blendOverlay, keystone, drawCard, wsSync, clockState, wallView } from './wall.js';
import { WORLD_H } from './core/constants.js';
import { reachW } from './worlds/nashua/pack.js';
import { offline } from './offline.js';
import { Ladder } from './core/ladder.js';
offline();

const INSTANCE = (new URLSearchParams(location.search).get('i') || 'main').replace(/[^\w-]/g, '').slice(0, 32) || 'main';
const $ = id => document.getElementById(id);
const chan = new BroadcastChannel('shanshui-av:' + INSTANCE);
const say = (level, msg) => chan.postMessage({ type: 'log', level, msg });
const palettes = await loadPalettes(new URL('../palettes.json', import.meta.url).href);
const scene = new Scene($('gl'), palettes, { onLog: say, still: $('still') });
scene.onStuck = () => { say('error', 'blank for 15 s, reloading the output window'); location.reload(); };

let msg = null, msgAt = 0, gradRev = -1;
const flags = { blackout: false, card: false, panic: false };
// the slit-scan video source: the controller posts the dropped file; this window plays its own muted copy, kept
// within 0.2 s of the controller's position. A camera stays in the controller (the output shows the scroll instead).
const fxVideo = document.createElement('video');
fxVideo.muted = true; fxVideo.loop = true; fxVideo.playsInline = true;
scene.video = fxVideo;
let fxSeekAt = 0;
// the wall: this node's slice, blend, keystone, calibration card (wall.js)
const wall = parseWall();
if (wall) {
  scene.wall = wall;
  blendOverlay($('wallblend'), wall);
  keystone(document.body, wall.ks, innerWidth, innerHeight);
  if (wall.cal) { $('wallcard').hidden = false; drawCard($('wallcard'), wall); }
}
// sync: the LAN relay (?sync=ws://...), clock mode (?t0=), or the BroadcastChannel (default)
const Q = new URLSearchParams(location.search);
// &cap=0.1..1: this output's brightness ceiling, applied as the master dim (the picture times cap; never brighter than
// the controller's master). For a projector too bright for the room, or to match the projectors of a wall.
const CAP = Q.has('cap') ? Math.max(0.1, Math.min(1, +Q.get('cap') || 1)) : 1;
const sync = Q.get('sync') ? wsSync(Q.get('sync'), 'output', m => onMsg(m), s => say('info', 'wall sync ' + s)) : null;
// ?t0= alone is clock mode; with ?sync= it is the fallback when the relay drops
const clock = Q.has('t0') && !sync, clockBackup = !!sync && Q.has('t0');
const now = () => (sync ? sync.serverNow() : Date.now());
// drift: how far each new frame lands from where this node had extrapolated the last one (px), worst over 10 s
const drift = { log: [], max: 0, last: 0, v: 0 };
function noteDrift(prev, m) {
  const a = prev && prev.fs.worlds[0], b = m.fs.worlds[0];
  if (!a || !b || a.key !== b.key || !(m.fs.t > prev.fs.t)) return;
  const err = Math.abs(b.x - (a.x + prev.fs.v * (m.fs.t - prev.fs.t) / 1000));
  if (err > 500) return; // a seek, a turn at the reach end or a reseed, not drift
  const t = performance.now();
  drift.last = err; drift.v = Math.abs(m.fs.v || 0);
  drift.log.push({ t, err }); while (drift.log.length && t - drift.log[0].t > 10000) drift.log.shift();
  drift.max = drift.log.reduce((s, d) => Math.max(s, d.err), 0);
}
// relay lost for 2 s: run on from the last frame at its speed (turning at the nashua reach ends), or the clock
let fallback = false;
function fold(x, key) {
  const w = scene.peek(key);
  if (!w || !w.pack) return x;
  const W = innerWidth, H = innerHeight, wv = wall ? wallView(wall, W, H) : { VW: W, VH: H };
  const span = Math.max(1, reachW(w.pack) - wv.VW / (wv.VH / WORLD_H)), p = ((x % (2 * span)) + 2 * span) % (2 * span);
  return p < span ? p : 2 * span - p;
}
chan.onmessage = e => { if (!sync && !clock) onMsg(e.data); else if (e.data.type === 'fxvideo') onMsg(e.data); };
function onMsg(m) {
  if (m.type === 'fxvideo') {
    if (fxVideo.src) URL.revokeObjectURL(fxVideo.src);
    if (m.file) { fxVideo.src = URL.createObjectURL(m.file); fxVideo.play().catch(() => {}); } else fxVideo.removeAttribute('src');
    return;
  }
  if (m.type !== 'frame') return;
  if (m.fs.fx && m.fs.fx.source === 'video' && fxVideo.readyState >= 2 && performance.now() - fxSeekAt > 1000 && Math.abs(fxVideo.currentTime - m.fs.fx.vt) > 0.2) { fxVideo.currentTime = m.fs.fx.vt; fxSeekAt = performance.now(); }
  if (!fallback) noteDrift(msg, m);
  msg = m; msgAt = performance.now();
  if (m.custom && m.custom.rev !== gradRev) {
    gradRev = m.custom.rev;
    const base = palettes.palettes.find(p => p.id === 'gradient');
    if (base) scene.setPalette({ ...base, ...m.custom, id: 'gradient', _rev: 'o' + gradRev });
  }
  if (m.flags.blackout !== flags.blackout) { flags.blackout = m.flags.blackout; $('black').classList.toggle('on', flags.blackout); }
  if (m.flags.panic !== flags.panic) { flags.panic = m.flags.panic; $('still').classList.toggle('on', flags.panic); }
  if (m.flags.card !== flags.card) { flags.card = m.flags.card; if (flags.card) drawTestCard($('card')); $('card').classList.toggle('on', flags.card); }
}
chan.postMessage({ type: 'hello', w: innerWidth, h: innerHeight, fps: 0 });

const ladder = new Ladder(say);
ladder.startFrom(scene.renderer.gl);
// what this node drew last: world x and the (server) time it was drawn for, for drift checks
const shown = { x: 0, t: 0, key: null };
// the calibration card's live line: sync, clock offset, drift (redrawn twice a second while the card is up)
function cardStatus() {
  const how = clock ? 'clock mode' : sync ? (fallback ? (clockBackup ? 'relay lost, clock mode' : 'relay lost, running on') : 'relay') : 'same machine';
  const fr = drift.v > 0 ? drift.max / (drift.v / 60) : 0;
  return `${how}   offset ${sync ? sync.offset.toFixed(1) + ' ms' : '0 ms'}   drift ${drift.max.toFixed(1)} px (${fr.toFixed(2)} frames, worst of 10 s)   ${scene.fps.toFixed(0)} fps${CAP < 1 ? "   cap " + Math.round(CAP * 100) + " %" : ""}`;
}
if (wall) setInterval(() => { const cv = $('wallcard'); if (!cv.hidden) drawCard(cv, wall, cardStatus()); }, 500);
function tick() {
  requestAnimationFrame(tick);
  if (clock) msg = { fs: clockFs(), flags };
  if (!msg) return;
  const lost = !!sync && (!sync.open || performance.now() - msgAt > 2000);
  if (lost !== fallback) { fallback = lost; say(lost ? 'warn' : 'info', lost ? 'wall sync lost: ' + (clockBackup ? 'clock mode (?t0=)' : 'running on from the last frame at its speed') : 'wall sync back'); }
  try {
    const fromClock = clock || (fallback && clockBackup);
    const base = fromClock ? { fs: clockFs(), flags } : msg;
    // extrapolate from the controller's clock (server time on the LAN): up to 1 s without news, or without limit
    // once the relay is lost (the last frame's speed, folded at the reach ends)
    const dt = Math.max(0, (now() - base.fs.t) / 1000), lag = fromClock ? 0 : fallback ? dt : Math.min(1, dt);
    const fs = { ...base.fs, worlds: base.fs.worlds.map(w => ({ ...w, x: fallback && !fromClock ? fold(w.x + base.fs.v * lag, w.key) : w.x + base.fs.v * lag })) };
    shown.x = fs.worlds[0] ? fs.worlds[0].x : 0; shown.t = now(); shown.key = fs.worlds[0] && fs.worlds[0].key;
    // this output's own quality ladder (the projector is the machine that matters)
    const rung = ladder.tick(performance.now(), scene.fps, !flags.blackout && !document.hidden);
    scene.q = rung.q;
    if (fs.fx && fs.fx.depth > rung.depth) fs.fx = { ...fs.fx, depth: rung.depth };
    if (CAP < 1) fs.u = { ...fs.u, master: Math.min(fs.u.master == null ? 1 : fs.u.master, CAP) };
    if (!flags.panic) scene.frame(fs, { blackout: flags.blackout, panic: flags.panic });
    reach(fs);
  } catch (e) { say('error', 'frame: ' + (e && e.message || e)); }
}
// clock mode: the view width of the whole wall in world px, so the nashua triangle wave turns at the wall's ends
function clockFs() {
  const W = innerWidth, H = innerHeight, wv = wall ? wallView(wall, W, H) : { VW: W, VH: H };
  const vw = wv.VW / (wv.VH / WORLD_H);
  const top = scene.peek('clock:' + (Q.get('world') || 'shanshui') + ':' + (Q.get('seed') || '1'));
  return clockState(vw, top && top.pack ? reachW(top.pack) : 0);
}
// data worlds: labels and fact line, only when the controller turns them on for the output (off by default)
const overlay = new ReachOverlay($('labels'));
const ticks = new URLSearchParams(location.search).get('ticks') === '1' ? new TickOverlay($('labels').parentElement) : null;   // ?ticks=1 on this output
const section = new SectionInset($('section'), $('playhead'));
// the map inset, when the controller turns it on for the output (off by default; no clicks on an output)
const mapInset = new MapInset($('labels').parentElement, null);
let factAt = 0;
function reach(fs) {
  const top = fs.worlds[fs.worlds.length - 1], w = top ? scene.peek(top.key) : null;
  const R = fs.reach || {}, data = !!(w && w.meta && w.meta.data);
  // labels and the section inset follow the live scroll; over a slit-scan picture they would float, so they rest
  const fxOn = !!(fs.fx && fs.fx.mode && fs.fx.mode !== 'off');
  const c = $('gl'), LF = scene.lastFrame, q = scene.q || 1;
  // on a wall node, the scene's own view (its slice); css px = buffer px / q
  const v = LF && LF.v ? { scale: LF.v.scale / q, viewW: LF.v.viewW, camY: LF.v.camY } : viewOf(c.clientWidth, c.clientHeight, fs.u.zoom, fs.u.yAlign);
  const camX = (top ? top.x : 0) + (LF ? LF.dx || 0 : 0);
  overlay.update(w, { cssScale: v.scale, camX, camY: v.camY, W: c.clientWidth }, data && R.labels && !flags.blackout && !fxOn);
  if (ticks) ticks.update(w, { cssScale: v.scale, camX, W: c.clientWidth }, data && !flags.blackout && !fxOn);
  const P = data ? w.pack : null, o = (top && top.opts) || {};
  mapInset.update(w, P ? { s: sOf(P, top.x + v.viewW / 2, o.bank), sL: sOf(P, top.x, o.bank), sR: sOf(P, top.x + v.viewW, o.bank) } : null, !!P && R.map && !flags.blackout && !fxOn, R.mapSize || 'm');
  section.update(P, { s: P ? sOf(P, top.x + v.viewW / 2, o.bank) : 0, lv: fs.level || 0, ve: o.ve || 2, show: data && !flags.blackout && !fxOn && !!(top.layers && top.layers.includes('sections')), W: c.clientWidth });
  const f = $('facts'), on = data && R.facts && !flags.blackout;
  if (f.hidden === on) f.hidden = !on;
  const now = performance.now();
  if (on && now - factAt > 250) { factAt = now; const t = factLine(w, top.x + v.viewW / 2, fs.level || 0, v.scale, fs.reach && fs.reach.time, v.viewW / 2); if (f.textContent !== t) f.textContent = t; }
}
requestAnimationFrame(tick);
setInterval(() => {
  const r = $('gl');
  chan.postMessage({ type: 'beat', w: r.width, h: r.height, fps: scene.fps, blank: scene.watch.blank, chunks: scene.stats().chunks });
}, 1000);

function full() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().then(() => { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {}); }).catch(() => {}); }
addEventListener('dblclick', full);
let escAt = 0, escT = 0;
addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F') return full();
  if (wall && (e.key === 'c' || e.key === 'C')) { const cv = $('wallcard'); cv.hidden = !cv.hidden; if (!cv.hidden) drawCard(cv, wall); return; }
  if (e.key === 'Escape') { if (!e.repeat) { escAt = performance.now(); escT = setTimeout(() => { escAt = 0; chan.postMessage({ type: 'key', key: 'panic' }); }, 1000); } return; }
  if (e.key === ' ') e.preventDefault();
  chan.postMessage({ type: 'key', key: e.key, shift: e.shiftKey });
});
addEventListener('keyup', e => { if (e.key === 'Escape') { clearTimeout(escT); if (escAt) chan.postMessage({ type: 'key', key: 'Escape' }); escAt = 0; } });
addEventListener('resize', () => { if (flags.card) drawTestCard($('card')); });
let idleT = 0;
addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2000); });
addEventListener('beforeunload', () => chan.postMessage({ type: 'bye' }));
window.SSOUT = { scene, cap: CAP, get msg() { return msg; }, flags, wall, get sync() { return sync; }, clock, drift, shown, get fallback() { return fallback; }, ladder, cardStatus };
