// Output window: no UI, no storage writes. Renders the controller's frame state (BroadcastChannel
// shanshui-av:<instance>) with its own Scene and workers; the same seed draws the same landscape.
// F or double-click: full screen. Other show keys are sent to the controller.
import { loadPalettes } from './core/palettes.js';
import { Scene, viewOf } from './core/scene.js';
import { ReachOverlay, factLine } from './ui/reach.js';
import { SectionInset } from './ui/section.js';
import { sOf } from './worlds/nashua/pack.js';
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
const sync = Q.get('sync') ? wsSync(Q.get('sync'), 'output', m => onMsg(m), s => say('info', 'wall sync ' + s)) : null;
const clock = Q.has('t0');
const now = () => (sync ? sync.serverNow() : Date.now());
chan.onmessage = e => { if (!sync && !clock) onMsg(e.data); else if (e.data.type === 'fxvideo') onMsg(e.data); };
function onMsg(m) {
  if (m.type === 'fxvideo') {
    if (fxVideo.src) URL.revokeObjectURL(fxVideo.src);
    if (m.file) { fxVideo.src = URL.createObjectURL(m.file); fxVideo.play().catch(() => {}); } else fxVideo.removeAttribute('src');
    return;
  }
  if (m.type !== 'frame') return;
  if (m.fs.fx && m.fs.fx.source === 'video' && fxVideo.readyState >= 2 && performance.now() - fxSeekAt > 1000 && Math.abs(fxVideo.currentTime - m.fs.fx.vt) > 0.2) { fxVideo.currentTime = m.fs.fx.vt; fxSeekAt = performance.now(); }
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
function tick() {
  requestAnimationFrame(tick);
  if (clock) msg = { fs: clockFs(), flags };
  if (!msg) return;
  try {
    // extrapolate from the controller's clock (server time on the LAN), for up to 1 s without news
    const lag = clock ? 0 : Math.max(0, Math.min(1, (now() - msg.fs.t) / 1000));
    const fs = { ...msg.fs, worlds: msg.fs.worlds.map(w => ({ ...w, x: w.x + msg.fs.v * lag })) };
    // this output's own quality ladder (the projector is the machine that matters)
    const rung = ladder.tick(performance.now(), scene.fps, !flags.blackout && !document.hidden);
    scene.q = rung.q;
    if (fs.fx && fs.fx.depth > rung.depth) fs.fx = { ...fs.fx, depth: rung.depth };
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
const section = new SectionInset($('section'), $('playhead'));
let factAt = 0;
function reach(fs) {
  const top = fs.worlds[fs.worlds.length - 1], w = top ? scene.peek(top.key) : null;
  const R = fs.reach || {}, data = !!(w && w.meta && w.meta.data);
  const c = $('gl'), LF = scene.lastFrame, q = scene.q || 1;
  // on a wall node, the scene's own view (its slice); css px = buffer px / q
  const v = LF && LF.v ? { scale: LF.v.scale / q, viewW: LF.v.viewW, camY: LF.v.camY } : viewOf(c.clientWidth, c.clientHeight, fs.u.zoom, fs.u.yAlign);
  const camX = (top ? top.x : 0) + (LF ? LF.dx || 0 : 0);
  overlay.update(w, { cssScale: v.scale, camX, camY: v.camY, W: c.clientWidth }, data && R.labels && !flags.blackout);
  const P = data ? w.pack : null, o = (top && top.opts) || {};
  section.update(P, { s: P ? sOf(P, top.x + v.viewW / 2, o.bank) : 0, lv: fs.level || 0, ve: o.ve || 10, show: data && !flags.blackout && !!(top.layers && top.layers.includes('sections')), W: c.clientWidth });
  const f = $('facts'), on = data && R.facts && !flags.blackout;
  if (f.hidden === on) f.hidden = !on;
  const now = performance.now();
  if (on && now - factAt > 250) { factAt = now; const t = factLine(w, top.x + v.viewW / 2, fs.level || 0, v.scale, fs.reach && fs.reach.time); if (f.textContent !== t) f.textContent = t; }
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
window.SSOUT = { scene, get msg() { return msg; }, flags, wall, get sync() { return sync; }, clock };
