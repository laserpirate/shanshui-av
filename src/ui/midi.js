// Web MIDI (opt-in). Nothing is requested until the user presses Enable. Controller window only.
// A binding is "<kind>:<channel>:<number>" (kind cc or note); a target holds one binding or a list of them.
// Continuous targets take a CC value 0..1 with soft takeover (ignored until the control crosses the app's value);
// trigger targets fire on note-on or on a CC crossing 64 upward; hold targets (panic) fire only after hold_ms held.
// The app's action seam (app.js ACT) does the work; this file only maps messages to target ids.
// Presets are JSON in data/midi-maps/ (one per controller, plus generic), picked by port name on Enable and
// changeable in the panel; learned maps are kept per device and per instance.
export const MIDI_TARGETS = [
  { id: 'speed', label: 'Speed', cont: true },
  { id: 'play', label: 'Play' },
  { id: 'reseed', label: 'Reseed' },
  { id: 'palNext', label: 'Palette +' },
  { id: 'palPrev', label: 'Palette -' },
  { id: 'black', label: 'Blackout' },
  { id: 'world', label: 'World' },
  { id: 'weather', label: 'Weather cycle', cont: true },
  { id: 'rain', label: 'Rain', cont: true },
  { id: 'wind', label: 'Wind', cont: true },
  { id: 'water', label: 'Water', cont: true },
  { id: 'fog', label: 'Fog', cont: true },
  { id: 'light', label: 'Light', cont: true },
  { id: 'level', label: 'Water level', cont: true },
  { id: 've', label: 'Exaggeration', cont: true },
  { id: 'bank', label: 'Bank' },
  { id: 'mode', label: 'Mode' },
  { id: 'morph', label: 'Morph', cont: true },
  { id: 'fxMode', label: 'FX mode' },
  { id: 'fxFreeze', label: 'FX freeze' },
  { id: 'fxDir', label: 'FX direction' },
  { id: 'fxSlit', label: 'Slit position', cont: true },
  { id: 'fxWidth', label: 'Slit width', cont: true },
  { id: 'fxDepth', label: 'History depth', cont: true },
  { id: 'fxSlope', label: 'Time slope', cont: true },
  { id: 'fxMix', label: 'FX mix', cont: true },
  { id: 'sections', label: 'Sections' },
  { id: 'time', label: 'Time (date)', cont: true },
  { id: 'timeRun', label: 'Time run' },
  { id: 'panic', label: 'Panic (hold 1 s)', hold: 1000 },
  { id: 'back', label: 'Seed back' },
  { id: 'forward', label: 'Seed forward' },
  { id: 'clean', label: 'Clean full-window' },
  { id: 'speedReset', label: 'Reset speed' },
  { id: 'dir', label: 'Direction' },
  { id: 'ink', label: 'Ink weight', cont: true },
  { id: 'contrast', label: 'Contrast', cont: true },
  { id: 'weatherAuto', label: 'Weather auto' },
  { id: 'master', label: 'Master dim', cont: true },
  { id: 'drift', label: 'Gradient drift', cont: true },
  { id: 'hold', label: 'Hold' },
  { id: 'star', label: 'Star seed' },
  { id: 'hide', label: 'Hide controls' },
  { id: 'palPick', label: 'Palette pick', cont: true },
  // P6 (ADDENDUM-A): horizontal scale, the two label toggles, the map inset
  { id: 'hx', label: 'Horizontal scale', cont: true },
  { id: 'labels', label: 'Labels (controller)' },
  { id: 'outLabels', label: 'Labels (output)' },
  { id: 'mapInset', label: 'Map inset' },
];
const BY_ID = new Map(MIDI_TARGETS.map(t => [t.id, t]));
export const PRESETS = ['korg-nanokontrol', 'korg-nanokontrol2', 'generic'];
// by port name: nanoKONTROL2 before nanoKONTROL (the longer name first)
export function presetFor(name) { return /nanokontrol\s*2/i.test(name || '') ? 'korg-nanokontrol2' : /nanokontrol/i.test(name || '') ? 'korg-nanokontrol' : 'generic'; }
// a preset file -> {target: binding | [bindings]}
export function mapOf(preset) {
  const m = {};
  for (const b of preset.bindings || []) {
    if (!BY_ID.has(b.act)) continue;
    const key = `${b.type}:${b.ch | 0}:${b.num}`;
    m[b.act] = m[b.act] ? [].concat(m[b.act], key) : key;
  }
  return m;
}
const keysOf = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const PICK = 0.03;   // a control within this of the app's value has picked it up

export class Midi {
  // getValue(id) -> 0..1 or null (no soft takeover); onPickup(id, hw, app) while a control waits to cross
  constructor({ map = {}, onAction, onChange, onLog, getValue = () => null, onPickup = () => {}, onMonitor = () => {} }) {
    this.map = { ...map };            // target id -> binding or bindings
    this.onAction = onAction; this.onChange = onChange; this.onLog = onLog;
    this.getValue = getValue; this.onPickup = onPickup; this.onMonitor = onMonitor;
    this.access = null; this.learn = null; this.last = new Map(); this.devices = [];
    this.picked = new Map();          // target id -> {ok, set} soft takeover state
    this.holds = new Map();           // binding key -> timer of a held trigger
    this.monitor = [];                // the last 10 messages
    this.presetName = null;
  }
  get supported() { return typeof navigator.requestMIDIAccess === 'function'; }
  async enable() {
    if (this.access) return true;
    if (!this.supported) { this.onLog('warn', 'Web MIDI not available in this browser (Chrome or Edge needed)'); return false; }
    try { this.access = await navigator.requestMIDIAccess(); }
    catch (e) { this.onLog('warn', 'MIDI refused: ' + e.message); return false; }
    this.access.onstatechange = e => {
      try { const p = e && e.port; if (p) this.onLog('info', 'MIDI ' + (p.type || 'port') + ' ' + (p.name || '') + ' ' + (p.state || '')); } catch {}
      this._wire();
    };
    this._wire();
    return true;
  }
  _wire() {
    this.devices = [];
    try {
      for (const input of this.access.inputs.values()) {
        const name = input.name || 'MIDI input';
        input.onmidimessage = e => { try { this.message(e.data, name); } catch (err) { this.onLog('error', 'MIDI message: ' + (err && err.message || err)); } };
        this.devices.push(name);
      }
    } catch (e) { this.onLog('warn', 'MIDI ports: ' + (e && e.message || e)); }
    this.onChange();
  }
  get outputs() { try { return this.access && this.access.outputs ? [...this.access.outputs.values()] : []; } catch { return []; } }
  setMap(map, presetName = null) { this.map = { ...map }; this.picked.clear(); this.presetName = presetName; this.onChange(); }
  startLearn(id) { this.learn = this.learn === id ? null : id; this.onChange(); }
  clear(id) { delete this.map[id]; this.picked.delete(id); this.onChange(); }
  bound(id, key) { return keysOf(this.map[id]).includes(key); }
  message(data, port = '') {
    const [st, num, val = 0] = data;
    const type = st & 0xf0, ch = st & 0x0f;
    let kind, v, release = false;
    if (type === 0xb0) { kind = 'cc'; v = val / 127; }
    else if (type === 0x90 && val > 0) { kind = 'note'; v = 1; }
    else if (type === 0x80 || type === 0x90) { kind = 'note'; v = 0; release = true; }
    else return;
    const key = `${kind}:${ch}:${num}`;
    this.monitor.unshift({ port, ch: ch + 1, kind, num, val: kind === 'cc' ? val : release ? 'off' : val });
    if (this.monitor.length > 10) this.monitor.length = 10;
    this.onMonitor();
    // the control's last position (kept while learning too, so its first move after learn can pick up)
    const prev = this.last.get(key);
    this.last.set(key, v);
    if (this.learn) {
      if (release) return;
      for (const id in this.map) {
        const ks = keysOf(this.map[id]).filter(k => k !== key);
        if (ks.length === keysOf(this.map[id]).length) continue;
        if (ks.length) this.map[id] = ks.length === 1 ? ks[0] : ks; else delete this.map[id];
      }
      this.map[this.learn] = key; this.picked.delete(this.learn); this.learn = null; this.onChange();
      return;
    }
    for (const t of MIDI_TARGETS) {
      if (!this.bound(t.id, key)) continue;
      if (t.cont) { if (kind === 'cc') this._cont(t, v, prev); continue; }
      const down = kind === 'note' ? !release : (prev ?? 0) < 0.5 && v >= 0.5;
      const up = kind === 'note' ? release : (prev ?? 0) >= 0.5 && v < 0.5;
      if (t.hold) {
        if (down && !this.holds.has(key)) this.holds.set(key, setTimeout(() => { this.holds.delete(key); this.onAction(t.id, 1); }, t.hold));
        else if (up && this.holds.has(key)) { clearTimeout(this.holds.get(key)); this.holds.delete(key); this.onLog('info', t.label + ': hold 1 s to fire'); }
      } else if (down) this.onAction(t.id, 1);
    }
  }
  // soft takeover: a control drives its target only once it reaches or crosses the app's value; a change from
  // elsewhere (keys, panel, another control) drops the pickup again
  _cont(t, v, prev) {
    const cur = this.getValue(t.id);
    if (cur == null) { this.onAction(t.id, v); return; }
    let p = this.picked.get(t.id);
    if (p && p.ok && Math.abs(cur - p.set) > PICK * 2) p.ok = false;
    if (!p || !p.ok) {
      const near = Math.abs(v - cur) <= PICK, crossed = prev != null && (prev - cur) * (v - cur) <= 0;
      if (!near && !crossed) { this.onPickup(t.id, v, cur); return; }
      p = { ok: true, set: v }; this.picked.set(t.id, p);
    }
    this.onAction(t.id, v);
    const after = this.getValue(t.id);
    p.set = after == null ? v : after;
  }
}
