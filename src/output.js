// Output window: no UI, no storage writes. Renders the controller's frame state (BroadcastChannel
// shanshui-av:<instance>) with its own Scene and workers; the same seed draws the same landscape.
// F or double-click: full screen. Other show keys are sent to the controller.
import { loadPalettes } from './core/palettes.js';
import { Scene } from './core/scene.js';
import { drawTestCard } from './ui/testcard.js';

const INSTANCE = (new URLSearchParams(location.search).get('i') || 'main').replace(/[^\w-]/g, '').slice(0, 32) || 'main';
const $ = id => document.getElementById(id);
const chan = new BroadcastChannel('shanshui-av:' + INSTANCE);
const say = (level, msg) => chan.postMessage({ type: 'log', level, msg });
const palettes = await loadPalettes(new URL('../palettes.json', import.meta.url).href);
const scene = new Scene($('gl'), palettes, { onLog: say, still: $('still') });
scene.onStuck = () => { say('error', 'blank for 15 s, reloading the output window'); location.reload(); };

let msg = null, msgAt = 0, gradRev = -1;
const flags = { blackout: false, card: false, panic: false };
chan.onmessage = e => {
  const m = e.data;
  if (m.type !== 'frame') return;
  msg = m; msgAt = performance.now();
  if (m.custom && m.custom.rev !== gradRev) {
    gradRev = m.custom.rev;
    const base = palettes.palettes.find(p => p.id === 'gradient');
    if (base) scene.setPalette({ ...base, ...m.custom, id: 'gradient', _rev: 'o' + gradRev });
  }
  if (m.flags.blackout !== flags.blackout) { flags.blackout = m.flags.blackout; $('black').classList.toggle('on', flags.blackout); }
  if (m.flags.panic !== flags.panic) { flags.panic = m.flags.panic; $('still').classList.toggle('on', flags.panic); }
  if (m.flags.card !== flags.card) { flags.card = m.flags.card; if (flags.card) drawTestCard($('card')); $('card').classList.toggle('on', flags.card); }
};
chan.postMessage({ type: 'hello', w: innerWidth, h: innerHeight, fps: 0 });

function tick() {
  requestAnimationFrame(tick);
  if (!msg) return;
  try {
    // extrapolate from the controller's clock, for up to 1 s without news
    const lag = Math.min(1, (Date.now() - msg.fs.t) / 1000);
    const fs = { ...msg.fs, worlds: msg.fs.worlds.map(w => ({ ...w, x: w.x + msg.fs.v * lag })) };
    if (!flags.panic) scene.frame(fs, { blackout: flags.blackout, panic: flags.panic });
  } catch (e) { say('error', 'frame: ' + (e && e.message || e)); }
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
  if (e.key === 'Escape') { if (!e.repeat) { escAt = performance.now(); escT = setTimeout(() => { escAt = 0; chan.postMessage({ type: 'key', key: 'panic' }); }, 1000); } return; }
  if (e.key === ' ') e.preventDefault();
  chan.postMessage({ type: 'key', key: e.key, shift: e.shiftKey });
});
addEventListener('keyup', e => { if (e.key === 'Escape') { clearTimeout(escT); if (escAt) chan.postMessage({ type: 'key', key: 'Escape' }); escAt = 0; } });
addEventListener('resize', () => { if (flags.card) drawTestCard($('card')); });
let idleT = 0;
addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2000); });
addEventListener('beforeunload', () => chan.postMessage({ type: 'bye' }));
window.SSOUT = { scene, get msg() { return msg; }, flags };
