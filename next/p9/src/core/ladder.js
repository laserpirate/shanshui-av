// Quality ladder, used by the controller and by every output on its own. Each rung lowers the render scale and caps
// the slit-scan history; nothing that changes the picture's content (rain, fog, elements) is dropped.
// Down one rung after 5 s under 24 fps (the handoff's rule); up one after 20 s at 58 fps or more, never sooner than
// `hold` after a step down. A step down soon after a step up doubles the hold (up to 30 min), so a machine that
// cannot hold a rung stops trying it.
// Start rung from the GPU renderer string (startFrom): a Pi (VideoCore, V3D) starts at the bottom, other phone-class
// GPUs (Mali, Adreno, PowerVR) one above, Intel HD / UHD integrated graphics in the middle, anything else at the top.
// A software renderer (SwiftShader, llvmpipe) starts at the top: here it is the test harness, and the fps rule
// steps it down if it is a real machine.
// Tile size is fixed by the chunk grid and the band count is content, so neither changes with the rung.
//   ?quality=auto (default) | high | medium | low     fixed rungs 0, 2, 4
export const RUNGS = [
  { q: 1, depth: 128 },
  { q: 0.85, depth: 128 },
  { q: 0.75, depth: 64 },
  { q: 0.6, depth: 48 },
  { q: 0.5, depth: 32 },
];
const FIXED = { high: 0, medium: 2, low: 4 };
export const DOWN_FPS = 24, DOWN_MS = 5000, UP_FPS = 58, UP_MS = 20000;

export function rungForRenderer(s) {
  s = String(s || '');
  if (/swiftshader|llvmpipe|softpipe|software/i.test(s)) return 0;
  if (/videocore|v3d/i.test(s)) return 4;
  if (/mali|adreno|powervr/i.test(s)) return 3;
  if (/intel.*\b(u?hd) graphics/i.test(s)) return 2;
  return 0;
}
export function rendererOf(gl) {
  try {
    const x = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '') : '';
  } catch { return ''; }
}

export class Ladder {
  constructor(log = () => {}, mode = new URLSearchParams(location.search).get('quality') || 'auto') {
    this.log = log;
    this.fixed = mode in FIXED ? FIXED[mode] : null;
    this.start = 0; this.gpu = '';
    this.i = this.fixed ?? 0;
    this.low = 0; this.high = 0; this.lastDown = -1e9; this.lastUp = -1e9; this.hold = 60000;
  }
  get rung() { return RUNGS[this.i]; }
  get auto() { return this.fixed == null; }
  // pick the start rung from the renderer string (once the GL context exists)
  startFrom(gl) {
    this.gpu = rendererOf(gl);
    this.start = rungForRenderer(this.gpu);
    if (this.auto) { this.i = this.start; if (this.start) this.log('info', 'quality starts at ' + this.rung.q + ' for ' + this.gpu); }
  }
  reset() { this.i = this.fixed ?? this.start; this.low = this.high = 0; this.hold = 60000; }
  // fps measured over the last second; active = false while blacked out or hidden (no judgement then)
  tick(now, fps, active) {
    if (!this.auto || !active || !(fps > 0)) { this.low = this.high = 0; return this.rung; }
    if (fps < DOWN_FPS) {
      this.high = 0;
      if (!this.low) this.low = now;
      if (now - this.low > DOWN_MS && this.i < RUNGS.length - 1) {
        if (now - this.lastUp < 60000) this.hold = Math.min(30 * 60000, this.hold * 2);
        this.i++; this.low = 0; this.lastDown = now;
        this.log('warn', 'quality down to ' + this.rung.q + ' (fps ' + fps.toFixed(0) + ')');
      }
    } else if (fps >= UP_FPS) {
      this.low = 0;
      if (!this.high) this.high = now;
      if (now - this.high > UP_MS &&now - this.lastDown > this.hold && this.i > 0) {
        this.i--; this.high = 0; this.lastUp = now;
        this.log('info', 'quality up to ' + this.rung.q);
      }
    } else { this.low = 0; this.high = 0; }
    return this.rung;
  }
}
