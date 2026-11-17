// Slit-scan and time-smear, all on the GPU, after the scene is drawn (no readback). Off = not run at all, so the
// normal frame path is untouched.
//   source: the scene's own frame (a texture) or a video element (uploaded per new video frame)
//   strip     : one slit column of the source per frame, appended sideways; the strip scrolls (x = time)
//   smear     : the live frame up to the slit, the strip beyond it: still things become lines
//   displace  : each column (or row) shows a different moment from a ring of past frames, delay = slope x position
// state (fs.fx): {mode, slit 0..1, width px per frame, dir +1|-1, depth frames 2..128, mix 0..1, freeze, axis 'x'|'y', slope}
const VS = `#version 300 es
layout(location = 0) in vec2 aP;
out vec2 vUv;
void main() { vUv = aP; gl_Position = vec4(aP * 2.0 - 1.0, 0.0, 1.0); }`;

// the source, fitted to the output (cover), so video and scene are addressed alike
const SRC = `
uniform sampler2D uSrc; uniform vec4 uFit;   // uv' = uFit.xy + uv * uFit.zw
vec3 src(vec2 uv) { return texture(uSrc, uFit.xy + uv * uFit.zw).rgb; }`;

// accumulation: shift the strip by one step and write the slit column into the freed edge
const ACC_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPrev; uniform vec2 uSize; uniform float uSlit, uStep, uDir;
${SRC}
void main() {
  float px = vUv.x * uSize.x;
  // dir +1: new columns enter at the right edge, the strip moves left; -1: the mirror
  float edge = uDir > 0.0 ? uSize.x - uStep : uStep;
  bool fresh = uDir > 0.0 ? px >= edge : px < edge;
  if (fresh) {
    // spread the slit column over the step: a slit of uStep px, centred on uSlit
    float f = uDir > 0.0 ? (px - edge) / uStep : px / uStep;
    o = vec4(src(vec2(uSlit + (f - 0.5) * uStep / uSize.x, vUv.y)), 1.0);
  } else {
    o = vec4(texture(uPrev, vec2((px + uDir * uStep) / uSize.x, vUv.y)).rgb, 1.0);
  }
}`;

// history: the source, downscaled, into one layer of the ring
const HIST_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${SRC}
void main() { o = vec4(src(vUv), 1.0); }`;

// display
const OUT_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUv; out vec4 o;
uniform sampler2D uAcc; uniform sampler2DArray uHist;
uniform int uMode; uniform float uMix, uSlit, uDir, uSlope, uAxisY, uHead, uDepth, uN;
${SRC}
void main() {
  vec3 live = src(vUv), c = live;
  if (uMode == 1) c = texture(uAcc, vUv).rgb;
  else if (uMode == 2) {
    // the live frame on the near side of the slit, the strip (its newest column at the slit) beyond it
    // dir +1: the strip's newest column is at its right edge, so a pixel d past the slit reads x = 1 - d; dir -1: x = d
    bool beyond = uDir > 0.0 ? vUv.x > uSlit : vUv.x < uSlit;
    float d = abs(vUv.x - uSlit);
    c = beyond ? texture(uAcc, vec2(uDir > 0.0 ? 1.0 - d : d, vUv.y)).rgb : live;
  } else if (uMode == 3) {
    float p = uAxisY > 0.5 ? 1.0 - vUv.y : vUv.x;
    float d = floor(clamp(p * uSlope, 0.0, 1.0) * (uDepth - 1.0) + 0.5);
    float layer = mod(uHead - d + uN, uN);
    c = texture(uHist, vec3(vUv, layer)).rgb;
  }
  o = vec4(mix(live, c, uMix), 1.0);
}`;

export class SlitScan {
  constructor(gl) {
    this.gl = gl;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error('slitscan: ' + gl.getShaderInfoLog(x)); return x; };
    const prog = fs => {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('slitscan: ' + gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    };
    this.acc = prog(ACC_FS); this.hist = prog(HIST_FS); this.out = prog(OUT_FS);
    this.A = null; this.B = null; this.ring = null; this.head = 0; this.frames = 0;
    this.videoTex = null; this.videoFrame = -1;
  }

  _tex(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: t, fbo, w, h };
  }
  _free(t) { if (!t) return; const gl = this.gl; gl.deleteTexture(t.tex); if (t.fbo) gl.deleteFramebuffer(t.fbo); if (t.fbos) t.fbos.forEach(f => gl.deleteFramebuffer(f)); }

  _ensure(W, H, depth) {
    const gl = this.gl;
    if (!this.A || this.A.w !== W || this.A.h !== H) { this._free(this.A); this._free(this.B); this.A = this._tex(W, H); this.B = this._tex(W, H); this.frames = 0; }
    // the ring: quarter size per side (a 1080p frame is 480 x 270 per layer), up to 128 layers
    const hw = Math.max(64, Math.round(W / 4)), hh = Math.max(36, Math.round(H / 4)), n = Math.max(2, Math.min(128, depth | 0));
    if (!this.ring || this.ring.w !== hw || this.ring.h !== hh || this.ring.n !== n) {
      this._free(this.ring);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, hw, hh, n);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbos = [];
      for (let i = 0; i < n; i++) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, i); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); fbos.push(f); }
      this.ring = { tex: t, fbos, w: hw, h: hh, n }; this.head = 0;
    }
  }

  // a video element as the source; the texture is refreshed only when the video has a new frame
  videoSource(video) {
    const gl = this.gl;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    if (!this.videoTex) { this.videoTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.videoTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    const t = video.currentTime;
    if (t !== this.videoFrame) {
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.videoFrame = t;
    }
    return { tex: this.videoTex, w: video.videoWidth, h: video.videoHeight };
  }

  _fit(u, sw, sh, W, H) {
    // cover: crop the source to the output's aspect
    const a = (sw / sh) / (W / H);
    if (a > 1) this.gl.uniform4f(u.uFit, (1 - 1 / a) / 2, 0, 1 / a, 1); else this.gl.uniform4f(u.uFit, 0, (1 - a) / 2, 1, a);
  }

  // src: {tex, w, h}; target: framebuffer or null (screen); fx: state
  run(src, W, H, fx, target = null) {
    const gl = this.gl;
    const mode = { strip: 1, smear: 2, displace: 3 }[fx.mode] || 0;
    this._ensure(W, H, fx.depth || 64);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    if (!fx.freeze) {
      if (mode === 1 || mode === 2) {
        const { p, u } = this.acc;
        gl.useProgram(p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.B.fbo); gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.A.tex);
        gl.uniform1i(u.uSrc, 0); gl.uniform1i(u.uPrev, 1); this._fit(u, src.w, src.h, W, H);
        gl.uniform2f(u.uSize, W, H); gl.uniform1f(u.uSlit, fx.slit ?? 0.5); gl.uniform1f(u.uStep, Math.max(1, fx.width || 2)); gl.uniform1f(u.uDir, fx.dir < 0 ? -1 : 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        [this.A, this.B] = [this.B, this.A];
      }
      if (mode === 3) {
        const { p, u } = this.hist, r = this.ring;
        this.head = (this.head + 1) % r.n;
        gl.useProgram(p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, r.fbos[this.head]); gl.viewport(0, 0, r.w, r.h);
        gl.uniform1i(u.uSrc, 0); this._fit(u, src.w, src.h, W, H);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      this.frames++;
    }
    const { p, u } = this.out;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.A.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.ring.tex);
    gl.uniform1i(u.uSrc, 0); gl.uniform1i(u.uAcc, 1); gl.uniform1i(u.uHist, 2); this._fit(u, src.w, src.h, W, H);
    gl.uniform1i(u.uMode, mode); gl.uniform1f(u.uMix, fx.mix ?? 1); gl.uniform1f(u.uSlit, fx.slit ?? 0.5); gl.uniform1f(u.uDir, fx.dir < 0 ? -1 : 1);
    gl.uniform1f(u.uSlope, fx.slope ?? 1); gl.uniform1f(u.uAxisY, fx.axis === 'y' ? 1 : 0);
    gl.uniform1f(u.uHead, this.head); gl.uniform1f(u.uDepth, Math.min(this.ring.n, Math.max(2, fx.depth || 64))); gl.uniform1f(u.uN, this.ring.n);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose() { this._free(this.A); this._free(this.B); this._free(this.ring); if (this.videoTex) this.gl.deleteTexture(this.videoTex); this.A = this.B = this.ring = this.videoTex = null; }
}
