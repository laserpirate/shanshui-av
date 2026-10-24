// WebGL2 renderer. Tiles are grey (upstream colours on white paper); one fragment shader maps the
// ink amount through two palette tables (crossfade), applies contrast / ink weight, paper texture
// and drift, so geometry never changes with the palette. Worlds (seeds) crossfade by alpha.
import { WORLD_H, TILE_W, PAPER_TILE } from '../core/constants.js';
import { LUT_W, LUT_H, buildLUT, driftOf, paperMode } from '../core/palettes.js';

const VS = `#version 300 es
in vec2 aP;
uniform vec4 uRect;      // screen rect in px: x, y, w, h
uniform vec4 uWorld;     // world rect: x, y, w, h
uniform vec2 uView;      // canvas px
out vec2 vUv; out vec2 vWorld;
void main() {
  vUv = aP;
  vWorld = uWorld.xy + aP * uWorld.zw;
  vec2 q = (uRect.xy + aP * uRect.zw) / uView;
  gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vWorld;
uniform sampler2D uTile, uLutA, uLutB, uPaper;
uniform float uMix, uContrast, uInk, uAlpha, uTime, uPaperOn, uPaperMean, uHasTile;
uniform vec2 uDriftA, uDriftB;
uniform int uPaperA, uPaperB;
out vec4 o;
float curve(float i) {
  i = clamp(i * uInk, 0.0, 1.0);
  if (i > 0.002) i = clamp((i - 0.3) * uContrast + 0.3, 0.0, 1.0);
  return i;
}
vec3 look(sampler2D lut, vec2 drift, int pm, float i, vec3 paper) {
  float u = fract(vWorld.x * drift.x + uTime * drift.y);
  vec3 c = texture(lut, vec2(i * (255.0 / 256.0) + 0.5 / 256.0, u)).rgb;
  if (uPaperOn > 0.5) {
    if (pm == 1) c *= paper;
    else if (pm == 2) { float g = dot(paper, vec3(0.3333)) / uPaperMean; c *= 1.0 + (g - 1.0) * 0.9; }
  }
  return c;
}
void main() {
  float lum = uHasTile > 0.5 ? texture(uTile, vUv).r : 1.0;
  if (vWorld.y < 0.0 || vWorld.y > ${WORLD_H.toFixed(4)}) lum = 1.0;
  float i = curve(1.0 - lum);
  vec3 paper = texture(uPaper, vWorld / ${PAPER_TILE.toFixed(4)}).rgb;
  vec3 a = look(uLutA, uDriftA, uPaperA, i, paper);
  vec3 b = look(uLutB, uDriftB, uPaperB, i, paper);
  o = vec4(mix(a, b, uMix), uAlpha);
}`;

const VIG_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vWorld;
uniform float uAmt; uniform vec2 uView;
out vec4 o;
void main() {
  vec2 p = vUv - 0.5; p.x *= uView.x / uView.y;
  float d = length(p) / length(vec2(0.5 * uView.x / uView.y, 0.5));
  o = vec4(0.0, 0.0, 0.0, uAmt * smoothstep(0.45, 1.05, d));
}`;

export class Renderer {
  constructor(canvas, { onLog } = {}) {
    this.canvas = canvas;
    this.onLog = onLog || (() => {});
    this.lutCache = new Map();  // cacheKey -> texture
    this.lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onLog('error', 'WebGL context lost'); });
    canvas.addEventListener('webglcontextrestored', () => { this.onLog('warn', 'WebGL context restored'); this.init(); if (this.onRestore) this.onRestore(); });
    this.init();
  }

  init() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.lost = false;
    this.lutCache.clear();
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (fs) => {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    };
    this.main = prog(FS);
    this.vig = prog(VIG_FS);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.white = this._tex(gl.R8, gl.RED, 1, 1, new Uint8Array([255]), gl.NEAREST);
    this.plainPaper = this._tex(gl.RGBA8, gl.RGBA, 1, 1, new Uint8Array([240, 232, 214, 255]), gl.NEAREST, gl.REPEAT);
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }

  _tex(ifmt, fmt, w, h, data, filter = gl_LINEAR, wrap) {
    const gl = this.gl;
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
    const f = filter === gl_LINEAR ? gl.LINEAR : filter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    return t;
  }

  // grey bytes {width, height, data} -> single channel texture
  tileTexture(grey, old) {
    const gl = this.gl;
    const t = old || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grey.width, grey.height, 0, gl.RED, gl.UNSIGNED_BYTE, grey.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  deleteTexture(t) { if (t && this.gl && !this.lost) this.gl.deleteTexture(t); }

  // world.onTile / onTileDrop hooks
  attach(world) {
    world.onTile = (tile, grey, scale) => {
      if (this.lost) return;
      tile.tex = this.tileTexture(grey, tile.tex);
      tile.scale = scale;
    };
    world.onTileDrop = tile => { this.deleteTexture(tile.tex); tile.tex = null; };
    world._paperTex = null; world._paperVersion = -1;
  }

  paperTexture(world) {
    if (!world.paper) return this.plainPaper;
    if (world._paperVersion !== world.paperVersion || !world._paperTex) {
      const gl = this.gl;
      if (world._paperTex) gl.deleteTexture(world._paperTex);
      world._paperTex = this._tex(gl.RGBA8, gl.RGBA, world.paper.w, world.paper.h, new Uint8Array(world.paper.data.buffer), gl.LINEAR, gl.REPEAT);
      world._paperVersion = world.paperVersion;
    }
    return world._paperTex;
  }
  releaseWorld(world) { if (world._paperTex) this.deleteTexture(world._paperTex); world._paperTex = null; }

  lut(p, inkRange) {
    const key = p.id + ':' + (p._rev || 0);
    let t = this.lutCache.get(key);
    if (!t) {
      const gl = this.gl;
      t = this._tex(gl.RGBA8, gl.RGBA, LUT_W, LUT_H, buildLUT(p, inkRange), gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.lutCache.set(key, t);
      if (this.lutCache.size > 48) { const [k0, t0] = this.lutCache.entries().next().value; gl.deleteTexture(t0); this.lutCache.delete(k0); }
    }
    return t;
  }

  resize(w, h) { if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; } }

  // frame: {W, H, scale, camY, worlds:[{world, x, alpha}], palA, palB, mix, inkRange, contrast, ink, paperOn, vignette, time}
  draw(f, target) {
    if (this.lost) return false;
    const gl = this.gl;
    const W = f.W, H = f.H;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const { p, u } = this.main;
    gl.useProgram(p);
    gl.uniform2f(u.uView, W, H);
    gl.uniform1i(u.uTile, 0); gl.uniform1i(u.uLutA, 1); gl.uniform1i(u.uLutB, 2); gl.uniform1i(u.uPaper, 3);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lut(f.palA, f.inkRange));
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.lut(f.palB, f.inkRange));
    gl.uniform1f(u.uMix, f.mix);
    gl.uniform1f(u.uContrast, f.contrast); gl.uniform1f(u.uInk, f.ink);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uPaperOn, f.paperOn ? 1 : 0);
    gl.uniform2fv(u.uDriftA, driftOf(f.palA)); gl.uniform2fv(u.uDriftB, driftOf(f.palB));
    gl.uniform1i(u.uPaperA, paperMode(f.palA)); gl.uniform1i(u.uPaperB, paperMode(f.palB));
    const s = f.scale, camY = f.camY;
    let first = true;
    for (const w of f.worlds) {
      if (w.alpha <= 0.001) continue;
      if (first) gl.disable(gl.BLEND); else { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      gl.uniform1f(u.uAlpha, first ? 1 : w.alpha);
      first = false;
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.paperTexture(w.world));
      gl.uniform1f(u.uPaperMean, w.world.paper ? w.world.paper.mean : 0.92);
      // ground: the whole screen as bare paper
      gl.uniform1f(u.uHasTile, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.white);
      gl.uniform4f(u.uRect, 0, 0, W, H);
      gl.uniform4f(u.uWorld, w.x, camY, W / s, H / s);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // tiles; blending stays as set, tiles are opaque within this world's alpha
      gl.uniform1f(u.uHasTile, 1);
      const k0 = Math.floor(w.x / TILE_W), k1 = Math.floor((w.x + W / s) / TILE_W);
      for (let k = k0; k <= k1; k++) {
        const t = w.world.tiles.get(k);
        if (!t || !t.tex) continue;
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        const x0 = k * TILE_W;
        gl.uniform4f(u.uRect, (x0 - w.x) * s, (0 - camY) * s, TILE_W * s, WORLD_H * s);
        gl.uniform4f(u.uWorld, x0, 0, TILE_W, WORLD_H);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    if (first) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (f.vignette > 0) {
      gl.useProgram(this.vig.p);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(this.vig.u.uView, W, H); gl.uniform4f(this.vig.u.uRect, 0, 0, W, H); gl.uniform4f(this.vig.u.uWorld, 0, 0, 1, 1);
      gl.uniform1f(this.vig.u.uAmt, f.vignette);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
    return true;
  }

  // offscreen target for checks and export
  target(w, h) {
    const gl = this.gl;
    const tex = this._tex(gl.RGBA8, gl.RGBA, w, h, null, gl.NEAREST);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }
  freeTarget(t) { const gl = this.gl; gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); if (t.pbo) gl.deleteBuffer(t.pbo); }
  read(t) {
    const gl = this.gl; const px = new Uint8Array(t.w * t.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px; // bottom-up rows
  }
  // non-blocking read: pixels go to a pack buffer, cb(px) runs from poll() once the GPU fence has passed,
  // so the frame never waits on the GPU (a sync readPixels cost a dropped frame each time)
  readAsync(t, cb) {
    if (this.lost) return;
    const gl = this.gl;
    if (!t.pbo) { t.pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, t.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, t.w * t.h * 4, gl.STREAM_READ); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, t.pbo);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    (this.reads || (this.reads = [])).push({ t, cb, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) });
    gl.flush();
  }
  poll() {
    if (!this.reads || !this.reads.length) return;
    if (this.lost) { this.reads.length = 0; return; }
    const gl = this.gl;
    this.reads = this.reads.filter(r => {
      const st = gl.clientWaitSync(r.sync, 0, 0);
      if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) return true;
      gl.deleteSync(r.sync);
      const px = new Uint8Array(r.t.w * r.t.h * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.t.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      r.cb(px);   // bottom-up rows
      return false;
    });
  }

  // colour one grey raster {width, height, data} of world rect [x0,y0,w,h] into RGBA (top-down), for PNG export
  colorize(grey, rect, look, world) {
    const gl = this.gl;
    const W = grey.width, H = grey.height;
    const tgt = this.target(W, H);
    const tex = this.tileTexture(grey);
    const fakeWorld = { tiles: new Map(), paper: world.paper, paperVersion: world.paperVersion, _paperTex: world._paperTex, _paperVersion: world._paperVersion };
    // draw one quad with the raster as its tile
    const { p, u } = this.main;
    this.draw({ ...look, W, H, scale: W / rect.w, camY: rect.y, worlds: [{ world: fakeWorld, x: rect.x, alpha: 1 }], vignette: 0 }, tgt);
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
    gl.uniform1f(u.uHasTile, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform4f(u.uRect, 0, 0, W, H);
    gl.uniform4f(u.uWorld, rect.x, rect.y, rect.w, rect.h);
    gl.uniform1f(u.uAlpha, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = this.read(tgt);
    gl.deleteTexture(tex);
    if (fakeWorld._paperTex !== world._paperTex) gl.deleteTexture(fakeWorld._paperTex);
    this.freeTarget(tgt);
    // flip to top-down
    const row = W * 4, out = new Uint8ClampedArray(px.length);
    for (let y = 0; y < H; y++) out.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    return out;
  }
}
const gl_LINEAR = 'linear';
