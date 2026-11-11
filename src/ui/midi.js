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
];

// KORG nanoKONTROL2 at its factory settings (CC mode, channel 1). Fader 5 stays on CC 4, the weather (water level
// in nashua). Not tried on the hardware: check the scene with the KORG editor if a control does nothing.
export const NANOKONTROL2 = {
  speed: 'cc:0:0', rain: 'cc:0:1', wind: 'cc:0:2', fog: 'cc:0:3', weather: 'cc:0:4', light: 'cc:0:5', ve: 'cc:0:6', fxMix: 'cc:0:7',
  fxSlit: 'cc:0:16', fxWidth: 'cc:0:17', fxDepth: 'cc:0:18', fxSlope: 'cc:0:19', morph: 'cc:0:20', water: 'cc:0:21', level: 'cc:0:22',
  mode: 'cc:0:32', sections: 'cc:0:33', bank: 'cc:0:34', fxMode: 'cc:0:35', fxFreeze: 'cc:0:36', fxDir: 'cc:0:37',
  world: 'cc:0:64', play: 'cc:0:41', black: 'cc:0:45', reseed: 'cc:0:46', palPrev: 'cc:0:58', palNext: 'cc:0:59',
};

export class Midi {
  constructor({ map = {}, onAction, onChange, onLog }) {
    this.map = { ...map };            // target id -> binding
    this.onAction = onAction; this.onChange = onChange; this.onLog = onLog;
    this.access = null; this.learn = null; this.last = new Map(); this.devices = [];
    this.out = false;                 // MIDI out (button LEDs) is off until switched on
  }
  preset(map) { this.map = { ...map }; this.onChange(); }
  // LED feedback for toggles: CC 127 / 0 on the bound control, to every output port; only when MIDI out is on.
  // A nanoKONTROL2 lights its LEDs from the host only with LED mode set to External in the KORG editor.
  feedback(id, on) {
    if (!this.out || !this.access) return;
    const m = /^cc:(\d+):(\d+)$/.exec(this.map[id] || '');
    if (!m) return;
    for (const o of this.access.outputs.values()) { try { o.send([0xb0 | +m[1], +m[2], on ? 127 : 0]); } catch {} }
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
