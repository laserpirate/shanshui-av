// Playback clock (controller only). Position x is the left edge of the view in world px.
// Speed is px/s on a 1080 px tall screen at zoom 1, so it looks the same on any output.
import { WORLD_H, REF_H } from './constants.js';

const PX = WORLD_H / REF_H; // world px per reference screen px

export class Playback {
  constructor() {
    this.x = 0;
    this.speed = 120;        // px/s
    this.dir = 1;
    this.playing = false;    // target
    this.k = 0;              // eased 0..1 (play/pause ramp)
    this.ease = 0.6;         // seconds to most of the way
    this.pull = 0;           // pending manual offset (wheel, arrows), eased in
    this.tween = null;       // {from, to, t, dur}
    this.autoResume = false;
    this.resumeSecs = 8;
    this.resumeAt = 0;
    this.lastManual = 0;
  }

  get velocity() { return this.dir * this.speed * PX * this.k; } // world px/s now

  play() { this.playing = true; this.resumeAt = 0; this.tween = null; }
  pause() { this.playing = false; this.resumeAt = 0; }
  toggle() { this.playing ? this.pause() : this.play(); }

  // any hand input: pause, and maybe resume later
  manual(now) {
    this.lastManual = now;
    this.tween = null;
    if (this.playing) { this.playing = false; this.k = Math.min(this.k, 0.3); if (this.autoResume) this.resumeAt = now + this.resumeSecs * 1000; }
    else if (this.resumeAt) this.resumeAt = now + this.resumeSecs * 1000;
  }
  drag(dxWorld, now) { this.manual(now); this.x += dxWorld; }
  nudge(dxWorld, now) { this.manual(now); this.pull += dxWorld; }

  // ease back to x = 0 (Stop)
  goTo(x, dur) { this.playing = false; this.resumeAt = 0; this.pull = 0; this.tween = { from: this.x, to: x, t: 0, dur: dur || Math.min(3, 0.8 + Math.abs(x - this.x) / 4000) }; }

  step(dt, now) {
    if (this.resumeAt && now >= this.resumeAt) { this.resumeAt = 0; this.playing = true; }
    const a = 1 - Math.exp(-dt / (this.ease / 3));
    this.k += ((this.playing ? 1 : 0) - this.k) * a;
    if (Math.abs(this.k) < 1e-4 && !this.playing) this.k = 0;
    if (this.tween) {
      const T = this.tween; T.t += dt / T.dur;
      const e = T.t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * T.t);
      this.x = T.from + (T.to - T.from) * e;
      if (T.t >= 1) this.tween = null;
      return;
    }
    this.x += this.velocity * dt;
    if (this.pull) { const b = 1 - Math.exp(-dt / 0.09); const d = this.pull * b; this.x += d; this.pull -= d; if (Math.abs(this.pull) < 0.05) { this.x += this.pull; this.pull = 0; } }
  }
}

export function pxToWorld(px) { return px * PX; }
