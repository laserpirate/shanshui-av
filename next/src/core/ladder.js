// Quality ladder, used by the controller and by every output on its own. Each rung lowers the render scale and caps
// the slit-scan history; nothing that changes the picture's content (rain, fog, elements) is dropped.
// Down one rung after 4 s under 50 fps; up one after 20 s at 58 fps or more, never sooner than `hold` after a step
// down. A step down soon after a step up doubles the hold (up to 30 min), so a machine that cannot hold a rung stops
// trying it.
//   ?quality=auto (default) | high | medium | low     fixed rungs 0, 2, 4
export const RUNGS = [
  { q: 1, depth: 128 },
  { q: 0.85, depth: 128 },
  { q: 0.75, depth: 64 },
  { q: 0.6, depth: 48 },
  { q: 0.5, depth: 32 },
];
const FIXED = { high: 0, medium: 2, low: 4 };

export class Ladder {
  constructor(log = () => {}, mode = new URLSearchParams(location.search).get('quality') || 'auto') {
    this.log = log;
    this.fixed = mode in FIXED ? FIXED[mode] : null;
    this.i = this.fixed ?? 0;
    this.low = 0; this.high = 0; this.lastDown = -1e9; this.lastUp = -1e9; this.hold = 60000;
  }
  get rung() { return RUNGS[this.i]; }
  get auto() { return this.fixed == null; }
  reset() { this.i = this.fixed ?? 0; this.low = this.high = 0; this.hold = 60000; }
  // fps measured over the last second; active = false while blacked out or hidden (no judgement then)
  tick(now, fps, active) {
    if (!this.auto || !active || !(fps > 0)) { this.low = this.high = 0; return this.rung; }
    if (fps < 50) {
      this.high = 0;
      if (!this.low) this.low = now;
      if (now - this.low > 4000 && this.i < RUNGS.length - 1) {
        if (now - this.lastUp < 60000) this.hold = Math.min(30 * 60000, this.hold * 2);
        this.i++; this.low = 0; this.lastDown = now;
        this.log('warn', 'quality down to ' + this.rung.q + ' (fps ' + fps.toFixed(0) + ')');
      }
    } else if (fps >= 58) {
      this.low = 0;
      if (!this.high) this.high = now;
      if (now - this.high > 20000 && now - this.lastDown > this.hold && this.i > 0) {
        this.i--; this.high = 0; this.lastUp = now;
        this.log('info', 'quality up to ' + this.rung.q);
      }
    } else { this.low = 0; this.high = 0; }
    return this.rung;
  }
}
