// ADDENDUM-B B11, the mirror: a second world drawn flipped about an axis, from the water line to AXIS_MAX css px below
// it, over the lower part of the picture. Without ?mirror=1, or with the mirror off, the frame is the .p7 frame.
// The alternate: for a data world (nashua) the other bank, for shanshui and derelict another seed, or any world by
// name. Its scroll: with the main world, against it, or free at its own speed. The controller (app.js) and a
// clock-mode node (wall.js) build the same spec; the scene places its camera (core/scene.js); the renderer flips it.
import { WORLD_H } from './constants.js';
export const MIRROR_ALTS =['other', 'shanshui', 'derelict', 'nashua'];
export const MIRROR_SCROLL = ['with', 'against', 'free'];
export const MIRROR_DEF = { on: false, axis: 20, strength: 0.85, scroll: 'with', alt: 'other' };
export const AXIS_MAX = 80;
// The water line each world is mirrored about, in world y: nashua's Median Water (600); derelict's moves with the
// weather ('water': the renderer reads it), framed at its lowest (WORLD_H) so the view does not change with it;
// shanshui has no water, so the two pictures meet at the foot of the scroll (WORLD_H).
export const mirrorBase = world => (world === 'nashua' ? { base: 600, frame: 600 } : world === 'derelict' ? { base: 'water', frame: WORLD_H } : { base: WORLD_H, frame: WORLD_H });
export const altSeed = s => (/^\d{1,15}$/.test(s) ? String(Number(s) + 1) : String(s).slice(0, 60) + '-m');

// main: {world, seed, opts}; M: the mirror settings; isData(world); optsFor(world).
// Returns {world, seed, opts, flip}: flip when it is the other bank scrolling with the main world, so each column
// shows the other bank at the same station s
export function mirrorWorld(main, M, isData, optsFor) {
  const alt = MIRROR_ALTS.includes(M.alt) && M.alt !== 'other' ? M.alt : main.world;
  let seed = main.seed, opts = alt === main.world ? main.opts : optsFor(alt), other = false;
  if (alt === main.world) {
    if (isData(alt)) { opts = { ...(opts || {}), bank: opts && opts.bank === 'R' ? 'L' : 'R' }; other = true; }
    else seed = altSeed(main.seed);
  }
  return { world: alt, seed, opts, flip: other && M.scroll === 'with' };
}
// The frame state's fs.mirror, the same on the controller, the output (it is in the posted frame) and a clock node.
// main: the top world's {world, seed, opts, layers, all}; data: the main world is a data world; span: its reach
// width in world px (data worlds) or 0; viewW: the view width in world px; t: seconds on the shared clock; speed: px/s.
// Free: its own camera from the clock at half the speed (a triangle wave over a data reach), so a wall agrees.
export function mirrorSpec(main, M, { isData, optsFor, span = 0, viewW = 0, t = 0, speed = 60 }) {
  if (!M || !M.on || !(M.strength > 0.001)) return null;
  const alt = mirrorWorld(main, M, isData, optsFor);
  const altData = isData(alt.world);
  const sp = altData && alt.world === main.world ? span : 0;
  let x = 0, d = 0;
  if (M.scroll === 'free') {
    d = t * speed * 0.5;
    if (sp > viewW) { const s2 = sp - viewW, p = ((d % (2 * s2)) + 2 * s2) % (2 * s2); x = p < s2 ? p : 2 * s2 - p; } else x = d;
  }
  const o = alt.opts;
  const key = 'mirror:' + alt.world + ':' + alt.seed + (o ? ':' + [o.bank, o.hx, o.ve, o.spread ? 's' : '', o.reach || '', o.morph || ''].join(':') : '');
  return {
    key, seed: alt.seed, world: alt.world, opts: o,
    ...(altData && main.layers ? { layers: main.layers, all: main.all } : {}),
    alpha: M.strength, axis: M.axis, mode: M.scroll, flip: alt.flip && sp > 0, ...mirrorBase(main.world),
    span: sp, c: sp > viewW ? sp - viewW : 1e5, x, d,
  };
}
// URL form, for the pair and clock links: mirror=1 (the flag) and mon=1 (on), maxis, mstr, mscroll, malt
export function mirrorQuery(M) {
  if (!M || !M.on) return {};
  return { mirror: '1', mon: '1', maxis: String(Math.round(M.axis)), mstr: String(Math.round(M.strength * 100) / 100), mscroll: M.scroll, malt: M.alt };
}
export function mirrorFromQuery(search) {
  const q = new URLSearchParams(search);
  return cleanMirror({ on: q.get('mirror') === '1' && q.get('mon') === '1', axis: q.get('maxis') ?? MIRROR_DEF.axis, strength: q.get('mstr') ?? MIRROR_DEF.strength, scroll: q.get('mscroll') || MIRROR_DEF.scroll, alt: q.get('malt') || MIRROR_DEF.alt });
}
// a clamp of the settings, from storage, a URL or MIDI
export function cleanMirror(M = {}) {
  const n = (v, a, b, d) => (isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d);
  return {
    on: !!M.on,
    axis: n(M.axis, 0, AXIS_MAX, MIRROR_DEF.axis),
    strength: n(M.strength, 0, 1, MIRROR_DEF.strength),
    scroll: MIRROR_SCROLL.includes(M.scroll) ? M.scroll : MIRROR_DEF.scroll,
    alt: MIRROR_ALTS.includes(M.alt) ? M.alt : MIRROR_DEF.alt,
  };
}
