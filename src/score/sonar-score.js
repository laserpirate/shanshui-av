// sonar score for shanshui-av, behind ?score=1. Controller window only; the output window never
// loads this file. The score module comes from laserpirate/sonar's Pages site when online, from
// the vendored copy in vendor/sonar/ otherwise, or always with ?offline=1.
//
// attach(host) returns {frame(now, dt), stop(), score}. app.js calls frame() from its tick and
// stop() from Home. Everything the score reads is already in the controller (see
// laserpirate/sonar :: docs/notes/shanshui-mechanics_v01.md, section 6): pb.x, pb.velocity, the
// world's elements in view (World.elementsIn), weather.values() on worlds that have weather.
// Audio starts on the first click or key press (one gesture, as MIDI waits for its Enable).
const ONLINE = 'https://laserpirate.github.io/sonar/js/score.js';
const VENDOR = new URL('../../vendor/sonar/score.js', import.meta.url).href;

export async function loadScoreModule(q = new URLSearchParams(location.search)) {
  if (q.get('offline') !== '1') {
    try { return { mod: await import(ONLINE), from: 'online' }; } catch (e) { /* fall through to the vendored copy */ }
  }
  return { mod: await import(VENDOR), from: 'vendor' };
}

export function attach(h) {
  // h: {pb, weather, flags, cur, scene, worldOf, view: () => lastView, log}
  const api = { score: null, from: null, frame() {}, stop() {} };
  let ids = null, seedSeen = null, keySeen = null, wasDark = false, wasPlaying = false, strip = null, stripAt = 0;
  loadScoreModule().then(({ mod, from }) => {
    const score = new mod.Score();
    api.score = score; api.from = from;
    seedSeen = h.cur.seed; keySeen = h.cur.key;
    score.seed(seedSeen);
    score.play();
    h.log('info', 'score ' + from + ', seed ' + seedSeen + ', ' + score.state().plant);
    strip = document.createElement('div');
    strip.id = 'hud-score';
    Object.assign(strip.style, { whiteSpace: 'pre', color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' });
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(strip);
    // audio on the first gesture
    const enable = () => {
      removeEventListener('pointerdown', enable, true); removeEventListener('keydown', enable, true);
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
        ctx.resume().catch(() => {});
        score.attach(mod.createEngines(ctx));
        h.log('info', 'score audio on');
      } catch (e) { h.log('error', 'score audio: ' + (e && e.message || e)); }
    };
    addEventListener('pointerdown', enable, true); addEventListener('keydown', enable, true);
    api.stop = () => { try { score.stop(); } catch (e) {} };
    api.frame = (now) => {
      try {
        if (h.cur.seed !== seedSeen) { seedSeen = h.cur.seed; score.seed(seedSeen); ids = null; }
        if (h.cur.key !== keySeen) { keySeen = h.cur.key; ids = null; }
        const dark = h.flags.blackout || h.flags.panic;
        if (dark && !wasDark) score.panic();
        if (!dark && wasDark && h.pb.playing) score.play();
        if (!dark && h.pb.playing && !wasPlaying) score.play();
        wasDark = dark; wasPlaying = h.pb.playing;
        if (now - stripAt > 250) { stripAt = now; strip.textContent = score.strip(); }
        if (dark) return;
        const w = h.scene.peek(h.cur.key), v = h.view();
        if (!w || !v) return;
        // in view: elements whose extent overlaps the view; entered: elements whose anchor x crossed
        // the view's right edge since the last frame (geometry only, so the generator worker's timing
        // never decides what enters; generation runs 3500 px ahead of the view)
        const right = h.pb.x + v.viewW;
        const tags = {}, entered = [];
        for (const e of w.elementsIn(h.pb.x, right)) { if (e.y < -5000) continue; tags[e.tag] = (tags[e.tag] || 0) + 1; }
        if (ids !== null && right > ids) {
          for (const e of w.elementsIn(ids, right)) if (e.y > -5000 && e.x > ids && e.x <= right) entered.push(e.tag);
        }
        ids = right;                             // the right edge last frame (null after a seed or world change)
        score.scene({ kind: 'shanshui', x: h.pb.x, velocity: h.pb.velocity, tags, entered,
          weather: h.worldOf(h.cur.world).weather ? h.weather.values() : undefined });
      } catch (e) { if (!api.errAt || now - api.errAt > 2000) { h.log('error', 'score: ' + (e && e.message || e)); api.errAt = now; } }
    };
  }).catch(e => h.log('error', 'score load: ' + (e && e.message || e)));
  return api;
}
