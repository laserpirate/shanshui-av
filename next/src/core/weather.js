// Weather and water cycle for worlds that have it (derelict). One cycle position p in [0, 1):
// dry, drizzle, downpour, flood, night, smoothstepped between keyframes like the Kodama cparams.
// Auto runs the loop (6 min by default); a phase can be pinned; each parameter can be held at a
// slider value until released (Follow). All values 0..1:
//   rain   streak density        wind  slant of the rain     water  flood level (0 dry, 1 apron flooded)
//   fog    haze per depth layer  light daylight (0 = night: lights glow full)
// Water level is a visual control only: no years, no sea-level figures anywhere.

export const PHASES = ['dry', 'drizzle', 'downpour', 'flood', 'night'];
export const PARAMS = ['rain', 'wind', 'water', 'fog', 'light'];
export const KEYS_W = [
  { p: 0.0, rain: 0.0, wind: 0.2, water: 0.08, fog: 0.25, light: 1.0 },    // dry
  { p: 0.2, rain: 0.35, wind: 0.35, water: 0.25, fog: 0.5, light: 0.72 },  // drizzle
  { p: 0.4, rain: 1.0, wind: 0.8, water: 0.55, fog: 0.8, light: 0.42 },    // downpour
  { p: 0.6, rain: 0.45, wind: 0.5, water: 1.0, fog: 0.55, light: 0.45 },   // flood
  { p: 0.8, rain: 0.0, wind: 0.15, water: 0.42, fog: 0.3, light: 0.0 },    // night
];
const ss = t => t * t * (3 - 2 * t);

export function cycleValues(p) {
  p = ((p % 1) + 1) % 1;
  let i = 0;
  for (let k = 0; k < KEYS_W.length; k++) if (KEYS_W[k].p <= p) i = k;
  const A = KEYS_W[i], B = KEYS_W[(i + 1) % KEYS_W.length];
  let span = B.p - A.p; if (span <= 0) span += 1;
  let f = p - A.p; if (f < 0) f += 1;
  // hold each phase for the middle of its span, ease across the rest
  f = ss(Math.min(1, Math.max(0, (f / span - 0.35) / 0.65)));
  const o = {};
  for (const k of PARAMS) o[k] = A[k] + (B[k] - A[k]) * f;
  return o;
}
export const phaseAt = p => PHASES[Math.floor((((p % 1) + 1) % 1) * PHASES.length + 1e-9) % PHASES.length];
export const phasePos = name => Math.max(0, PHASES.indexOf(name)) / PHASES.length;

// world y of the water line for a water level (dry: a puddle line at the bottom; 1: the apron)
export const waterY = w => 700 - w * 190;

export class Weather {
  constructor(cfg) {
    this.cfg = cfg;               // {mode:'auto'|<phase>, period (s), holds:{param: value}}
    this.p = cfg.p || 0;          // cycle position
    this.shown = cycleValues(this.p);
  }
  step(dt) {
    const c = this.cfg;
    if (c.mode === 'auto') this.p = (this.p + dt / Math.max(10, c.period || 360)) % 1;
    else if (c.mode === 'scrub') { /* position set from MIDI CC 4 */ }
    else {
      // ease toward the pinned phase instead of jumping
      const t = phasePos(c.mode);
      let d = t - this.p; if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
      this.p = (((this.p + d * Math.min(1, dt * 0.8)) % 1) + 1) % 1;
    }
    const v = cycleValues(this.p);
    for (const k of PARAMS) {
      const want = c.holds && c.holds[k] !== undefined ? c.holds[k] : v[k];
      this.shown[k] += (want - this.shown[k]) * Math.min(1, dt * 3);
    }
    return this.shown;
  }
  get phase() { return phaseAt(this.p + 0.1); }   // the phase whose hold we are in or nearest
  values() { return { ...this.shown, p: this.p }; }
}
