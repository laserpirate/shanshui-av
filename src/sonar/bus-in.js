// sonar bus in, behind ?sonar=1 (app.js imports this file only when the flag is on).
// Listens on BroadcastChannel "sonar-bus" through vendor/sonar/sonar-in.js (laserpirate/sonar dbddf6b).
// When sonar stops (nothing for 2 s, the receiver fires "rest"), every nudge returns to 0, so the app
// behaves as with the flag off.

// ---------- mapping: sonar bus -> shanshui-av ----------
export const MAP = {
  // scroll speed = set speed x (1 + nudge); nudge = bus level x speed.level + (state density - densityMid) x speed.density,
  // clamped to [min, max], eased with a time constant of ease s; 0 at rest. densityMid 0.6 is sonar's default forest density.
  speed: { level: 0.6, density: 0.4, densityMid: 0.6, min: -0.25, max: 0.5, ease: 0.6 },
  // every everyBars-th bar line moves the weather cycle to the start of the next phase; only in the modes listed
  weather: { everyBars: 4, modes: ['auto'] },
  // a note with lead = true flashes the lights: glow x (1 + gain x vel), decaying with time constant decay s
  flash: { leadOnly: true, gain: 3, decay: 0.35, worlds: ['derelict'] },
};

import { createSonarIn } from '../../vendor/sonar/sonar-in.js';
import { PHASES } from '../core/weather.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createBusIn({ channel = 'sonar-bus', stale = 2000 } = {}) {
  const sonar = createSonarIn({ channel, stale });
  const S = { sonar, nudge: 0, flash: 0, pending: 0, steps: 0, skipped: 0, flashes: 0, lastBar: null, map: MAP };
  sonar.on('beat', m => {
    const bar = m.bar;
    if (S.lastBar !== null && bar !== S.lastBar && bar % MAP.weather.everyBars === 0) S.pending++;
    S.lastBar = bar;
  });
  sonar.on('note', m => {
    if (MAP.flash.leadOnly && !m.lead) return;
    S.flash = Math.max(S.flash, clamp(m.vel === undefined ? 1 : +m.vel || 0, 0, 1));
    S.flashes++;
  });
  sonar.on('rest', () => { S.flash = 0; S.pending = 0; S.lastBar = null; });

  // before the playback step: sets pb.speed from cfg.speed and applies pending bar steps
  S.step = (dt, { pb, cfg, weather, speedMax, frozen }) => {
    const st = sonar.state;
    const dens = st && isFinite(st.density) ? st.density : MAP.speed.densityMid;
    const want = sonar.live ? clamp(sonar.level * MAP.speed.level + (dens - MAP.speed.densityMid) * MAP.speed.density, MAP.speed.min, MAP.speed.max) : 0;
    S.nudge += (want - S.nudge) * (1 - Math.exp(-dt / MAP.speed.ease));
    if (!sonar.live && Math.abs(S.nudge) < 1e-4) S.nudge = 0;
    pb.speed = S.nudge === 0 ? cfg.speed : clamp(cfg.speed * (1 + S.nudge), 0, speedMax);
    if (S.flash) { S.flash *= Math.exp(-dt / MAP.flash.decay); if (S.flash < 1e-3) S.flash = 0; }
    if (frozen) { S.pending = 0; return; }
    while (S.pending > 0) {
      S.pending--;
      if (!MAP.weather.modes.includes(cfg.weather.mode)) { S.skipped++; continue; }
      const i = PHASES.indexOf(weather.phase);
      weather.p = ((i + 1) % PHASES.length) / PHASES.length;
      S.steps++;
    }
  };
  // on the frame state sent to the renderer and the output window: the lights flash
  S.decorate = (fs, world) => {
    if (S.flash > 0 && MAP.flash.worlds.includes(world) && fs.weather) fs.weather = { ...fs.weather, flash: S.flash * MAP.flash.gain };
    return fs;
  };
  return S;
}
