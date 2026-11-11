// Tag stream for a score (P5.3, ?tags=1, controller only, off by default). The sonar score on score-v01 is not merged;
// this is the offer it can read later. Two shapes, both documented in docs/nashua/score-tags.md:
//  1. events, once each, when a feature crosses the playhead (the view centre) or the shown water level reaches
//     another named level:  {type: 'tag', kind, name, s, bank, side, dir, t}  and  {type: 'tag', kind: 'level', ...}
//  2. a scene snapshot in the shape the score's scene() already takes:
//     {kind: 'nashua', x, velocity, tags: {kind: count in view}, entered: [kinds whose s crossed the right edge], weather,
//      level, levelName, s}
// Delivery: BroadcastChannel 'shanshui-av:<instance>:tags' (events, and the snapshot at most 10 times a second),
// a 'ssav-tag' DOM event on window per event, and SSAV.tags (the last 64 events) / SSAV.tagScene().
import { crossed } from '../../ui/midiout.js';
export const TAG_KINDS = ['dam', 'bridge', 'rail-bridge', 'confluence', 'cso', 'outfall', 'level'];
const JUMP_M = 1000;   // a jump of more than 1 km of s in one frame is a seek or a world change, not travel

// the features of a pack along the reach, in s order
export function tagFeatures(P) {
  const fs = [];
  if (P.dam) fs.push({ kind: 'dam', name: P.dam.label || 'dam', s: P.dam.s });
  for (const b of P.bridges || []) fs.push({ kind: b.kind === 'rail bridge' ? 'rail-bridge' : 'bridge', name: b.name, s: b.s, river: b.river });
  for (const l of P.landmarks || []) if (l.id !== 'dam') fs.push({ kind: l.id, name: l.name || l.id, s: l.s });
  for (const c of P.cso || []) fs.push({ kind: 'cso', name: c.id, s: c.s, side: c.side });
  for (const o of P.outfalls || []) fs.push({ kind: 'outfall', name: o.id, s: o.s, side: o.side });
  return fs.sort((a, b) => a.s - b.s);
}

export class TagStream {
  constructor(instance) {
    this.chan = new BroadcastChannel('shanshui-av:' + instance + ':tags');
    this.ring = []; this.scene = null;
    this.P = null; this.feats = []; this.lastS = null; this.lastR = null; this.lastLv = null; this.sceneAt = 0;
  }
  emit(ev) {
    this.ring.push(ev); if (this.ring.length > 64) this.ring.shift();
    try { this.chan.postMessage(ev); } catch {}
    try { dispatchEvent(new CustomEvent('ssav-tag', { detail: ev })); } catch {}
  }
  reset() { this.lastS = this.lastR = this.lastLv = null; }
  // o: {P, bank, s (playhead), sL, sR (view edges), lv (shown level, 0..n-1), x, velocity, weather, now}
  frame(o) {
    const { P } = o;
    if (P !== this.P) { this.P = P; this.feats = tagFeatures(P); this.reset(); }
    const t = Date.now(), lo = Math.min(o.sL, o.sR), hi = Math.max(o.sL, o.sR), right = o.sR;
    const entered = [];
    if (this.lastS != null && Math.abs(o.s - this.lastS) < JUMP_M) {
      const dir = Math.sign(o.s - this.lastS);
      for (const f of this.feats) if (crossed(this.lastS, o.s, f.s)) this.emit({ type: 'tag', kind: f.kind, name: f.name, s: f.s, bank: o.bank, side: f.side ?? null, dir, t });
    }
    if (this.lastR != null && Math.abs(right - this.lastR) < JUMP_M) for (const f of this.feats) if (crossed(this.lastR, right, f.s)) entered.push(f.kind);
    // level: the nearest named level of the shown (eased) level
    const n = (P.levels || []).length, li = n ? Math.max(0, Math.min(n - 1, Math.round(o.lv))) : 0;
    if (n && this.lastLv != null && li !== this.lastLv) this.emit({ type: 'tag', kind: 'level', name: P.levels[li].name, id: P.levels[li].id, from: this.lastLv, to: li, rising: li > this.lastLv, t });
    this.lastS = o.s; this.lastR = right; this.lastLv = li;
    const tags = {};
    for (const f of this.feats) if (f.s >= lo && f.s <= hi) tags[f.kind] = (tags[f.kind] || 0) + 1;
    this.scene = { kind: 'nashua', x: o.x, velocity: o.velocity, tags, entered, weather: o.weather, level: o.lv, levelName: n ? P.levels[li].name : null, s: o.s };
    if (o.now - this.sceneAt >= 100) { this.sceneAt = o.now; try { this.chan.postMessage({ type: 'scene', ...this.scene, t }); } catch {} }
  }
}
