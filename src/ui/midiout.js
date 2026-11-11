// MIDI out (AV standard section 6): off by default, controller window only, on the port named av-out if there is
// one (loopMIDI on Windows, IAC on a Mac), else the first output. Channel set in the panel.
// Scene data as CCs, at most 60 per second and only on change (0..127):
//   CC 20 terrain height at the playhead   CC 21 building density   CC 22 water level   CC 23 light   CC 24 rain
//   CC 25 seed (a byte of the seed hash; changes on reseed)   CC 26 playing (127) / paused (0)
//   program change: palette index
// Passing features as notes (nashua, in order along the reach on a minor pentatonic from C3): the dam, bridges and
// the confluence are long notes (800 ms), CSOs and outfalls short ones (200 ms). Same reach and bank, same notes.
export const OUT_CC = { terrain: 20, density: 21, level: 22, light: 23, rain: 24, seed: 25, play: 26 };
const SCALE = [0, 3, 5, 7, 10];
// a move from a to b passes p: landing exactly on p counts once, leaving it does not count again
export const crossed = (a, b, p) => (a < p && b >= p) || (a > p && b <= p);

export class MidiOut {
  constructor({ onLog = () => {} } = {}) {
    this.onLog = onLog; this.on = false; this.ch = 0; this.access = null; this.port = null;
    this.sent = new Map(); this.lastS = null; this.offs = [];
  }
  enable(access) { this.access = access; }
  _pick() {
    let outs = [];
    try { outs = this.access && this.access.outputs ? [...this.access.outputs.values()] : []; } catch {}
    this.port = outs.find(o => /av-out/i.test(o.name || '')) || outs[0] || null;
  }
  setOn(v) {
    if (v && !this.access) { this.onLog('warn', 'MIDI out: enable MIDI first'); return; }
    this.on = !!v;
    if (this.on) {
      this._pick(); this.sent.clear(); this.lastS = null;
      this.onLog(this.port ? 'info' : 'warn', this.port ? 'MIDI out on: ' + (this.port.name || 'output') + ', channel ' + (this.ch + 1) : 'MIDI out: no output port (loopMIDI av-out on Windows, IAC Driver on a Mac)');
    } else this._allOff();
  }
  send(b) { try { if (this.port) this.port.send(b); } catch {} }
  note(n, vel, ms) { this.send([0x90 | this.ch, n & 127, vel & 127]); this.offs.push({ n, t: performance.now() + ms }); }
  _allOff() { for (const o of this.offs) this.send([0x80 | this.ch, o.n & 127, 0]); this.offs = []; }
  // sc: {cc: {num: 0..1 | null}, s, features: [{s, note, vel, ms}], prog}
  tick(sc) {
    if (!this.on || !this.port) return;
    for (const k in sc.cc) {
      const v = sc.cc[k];
      if (v == null || !isFinite(v)) continue;
      const b = Math.round(Math.max(0, Math.min(1, v)) * 127);
      if (this.sent.get(k) !== b) { this.sent.set(k, b); this.send([0xb0 | this.ch, +k, b]); }
    }
    if (sc.prog != null && this.sent.get('prog') !== sc.prog) { this.sent.set('prog', sc.prog); this.send([0xc0 | this.ch, sc.prog & 127]); }
    // every feature passed since the last tick sounds, even when a hidden window's timers run slow (a jump of
    // more than 1 km is a world change or a jump, not travel, and plays nothing)
    if (sc.s != null && this.lastS != null && sc.features && Math.abs(sc.s - this.lastS) < 1000) {
      for (const f of sc.features) if (crossed(this.lastS, sc.s, f.s)) this.note(f.note, f.vel, f.ms);
    }
    this.lastS = sc.s;
    const now = performance.now();
    this.offs = this.offs.filter(o => { if (now < o.t) return true; this.send([0x80 | this.ch, o.n & 127, 0]); return false; });
  }
}

// the passing features of a nashua pack and bank, in order along the reach, with their notes
export function featureNotes(P, side) {
  const fs = [];
  if (P.dam) fs.push({ s: P.dam.s, long: true });
  for (const b of P.bridges || []) fs.push({ s: b.s, long: true });
  for (const l of P.landmarks || []) if (l.id !== 'dam') fs.push({ s: l.s, long: true });
  for (const c of P.cso || []) if (c.side == null || c.side === side) fs.push({ s: c.s, long: false });
  for (const o of P.outfalls || []) if (o.side == null || o.side === side) fs.push({ s: o.s, long: false });
  fs.sort((a, b) => a.s - b.s);
  return fs.map((f, i) => ({ s: f.s, note: 48 + SCALE[i % 5] + 12 * Math.floor(i / 5), vel: f.long ? 100 : 70, ms: f.long ? 800 : 200 }));
}
