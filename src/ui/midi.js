// Web MIDI learn (opt-in). Nothing is requested until the user presses Enable.
// A binding is "<kind>:<channel>:<number>" (kind cc or note). Continuous targets take a CC value 0..1;
// trigger targets fire on note-on or on a CC crossing 64 upward.
export const MIDI_TARGETS = [
  { id: 'speed', label: 'Speed', cont: true },
  { id: 'play', label: 'Play' },
  { id: 'reseed', label: 'Reseed' },
  { id: 'palNext', label: 'Palette +' },
  { id: 'palPrev', label: 'Palette -' },
  { id: 'black', label: 'Blackout' },
];

export class Midi {
  constructor({ map = {}, onAction, onChange, onLog }) {
    this.map = { ...map };            // target id -> binding
    this.onAction = onAction; this.onChange = onChange; this.onLog = onLog;
    this.access = null; this.learn = null; this.last = new Map(); this.devices = [];
  }
  get supported() { return typeof navigator.requestMIDIAccess === 'function'; }
  async enable() {
    if (this.access) return true;
    if (!this.supported) { this.onLog('warn', 'Web MIDI not available in this browser'); return false; }
    try { this.access = await navigator.requestMIDIAccess(); }
    catch (e) { this.onLog('warn', 'MIDI refused: ' + e.message); return false; }
    this.access.onstatechange = () => this._wire();
    this._wire();
    return true;
  }
  _wire() {
    this.devices = [];
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = e => this.message(e.data);
      this.devices.push(input.name || 'MIDI input');
    }
    this.onChange();
  }
  startLearn(id) { this.learn = this.learn === id ? null : id; this.onChange(); }
  clear(id) { delete this.map[id]; this.onChange(); }
  message(data) {
    const [st, num, val = 0] = data;
    const type = st & 0xf0, ch = st & 0x0f;
    let kind, v;
    if (type === 0xb0) { kind = 'cc'; v = val / 127; }
    else if (type === 0x90 && val > 0) { kind = 'note'; v = 1; }
    else return;
    const key = `${kind}:${ch}:${num}`;
    if (this.learn) {
      for (const id in this.map) if (this.map[id] === key) delete this.map[id];
      this.map[this.learn] = key; this.learn = null; this.onChange();
      return;
    }
    const prev = this.last.get(key) ?? 0;
    this.last.set(key, v);
    for (const t of MIDI_TARGETS) {
      if (this.map[t.id] !== key) continue;
      if (t.cont) { if (kind === 'cc') this.onAction(t.id, v); }
      else if (kind === 'note' || (prev < 0.5 && v >= 0.5)) this.onAction(t.id, 1);
    }
  }
}
