// Writes palettes.json. Hand-authored modes live in the BASE list below; the 25 "Studies" are read
// from the PAL objects of the Kodama Topo pages, exact hex, so they can be rebuilt from source.
//   node tools/build-palettes.mjs [path to All_Kodamas folder]
// After the first build, palettes.json is the file to edit by hand; rerunning this overwrites it.
//
// Palette fields
//   id, name, group, cycle (in the P cycle), ground (hex), paper: tint | grain | none
//   type "ramp":     stops [[t, hex], ...]  t = ink amount, 0 = bare paper, 1 = darkest ink
//   type "gradient": ramp [[u, hex], ...] along u, drift "x" (world px per cycle = period) or "time" (cycles per s = rate);
//                    ink colour at (t, u) = mix(ground, ramp(u), t)
//   raw: true  -> t is the ink amount as drawn (Original, Grayscale); otherwise t = ink / inkRange
//   light, beacon (hex, optional): accents for the light channel (derelict world); default = brightest stop
//   source: where the hex came from
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || 'Z:/_F26_Fall-2026/0_C3-F26/02_Episode 2/C3-E2_landform-tutorial/00_src/All_Kodamas';
const STYLE = 'phylla-kodama-styleguide.html (C3-E2_landform-tutorial/00_src/All_Kodamas/_support)';
const KL = 'C3-E2_kl-1_v03.html (C3-E2/site/kodama-landforms, same block in kl-1 to kl-8)';

const BASE = [
  { id: 'original', name: 'Original', group: 'Core', cycle: true, type: 'ramp', raw: true, ground: '#ffffff', paper: 'tint',
    stops: [[0, '#ffffff'], [1, '#000000']], source: 'upstream {Shan, Shui}* paper and ink' },
  { id: 'dark', name: 'Dark', group: 'Core', cycle: true, type: 'ramp', ground: '#090E08', paper: 'grain',
    stops: [[0, '#090E08'], [1, '#ECEAE0']], source: STYLE + ': soil #090E08, cream #ECEAE0' },
  { id: 'grayscale', name: 'Grayscale', group: 'Core', cycle: true, type: 'ramp', raw: true, ground: '#ffffff', paper: 'none',
    stops: [[0, '#ffffff'], [1, '#000000']], source: 'neutral' },
  { id: 'gradient', name: 'Gradient', group: 'Core', cycle: true, type: 'gradient', ground: '#f4f1ea', paper: 'grain',
    ramp: [[0, '#1E6BC0'], [0.33, '#3E9E6A'], [0.66, '#C9A86A'], [1, '#1E6BC0']], drift: 'x', period: 6000, rate: 0.02,
    editable: true, source: 'default stops from ' + STYLE + ' (deep, summer, gold); edit in the Palette panel' },

  { id: 'kodama-core', name: 'Core Brand', group: 'Kodama Topos', cycle: true, type: 'ramp', ground: '#090E08', paper: 'grain',
    stops: [[0, '#090E08'], [0.35, '#74D6AE'], [0.7, '#C9A86A'], [1, '#ECEAE0']], source: STYLE + ': Core brand (soil, teal, gold, cream)' },
  { id: 'kodama-lunar', name: 'Lunar Monochrome', group: 'Kodama Topos', cycle: true, type: 'ramp', ground: '#05070C', paper: 'grain',
    stops: [[0, '#05070C'], [0.3, '#8A96A2'], [0.6, '#AEC2D6'], [0.85, '#D8DEE6'], [1, '#F4F6F8']], source: STYLE + ': Lunar monochrome (moon-lo, pale, silver, moon) on studies ink #05070C' },
  { id: 'kodama-water', name: 'Water', group: 'Kodama Topos', cycle: true, type: 'ramp', ground: '#05070C', paper: 'grain',
    stops: [[0, '#05070C'], [0.35, '#1E6BC0'], [0.7, '#2E8BE0'], [1, '#7FF0D8']], source: STYLE + ': Water (deep, flow, glow) on studies ink #05070C' },
  { id: 'kodama-spectrum', name: 'Spectrum', group: 'Kodama Topos', cycle: true, type: 'gradient', ground: '#05070C', paper: 'grain',
    ramp: [[0, '#3FA9F0'], [0.2, '#9A6CE8'], [0.4, '#C94FD6'], [0.6, '#F07AB8'], [0.8, '#E8845A'], [1, '#3FA9F0']], drift: 'time', period: 6000, rate: 0.01,
    source: STYLE + ': Spectrum colour-breath (blue, violet, magenta, rose, coral), drifting over time' },
  { id: 'kodama-seasons', name: 'Seasons', group: 'Kodama Topos', cycle: true, type: 'gradient', ground: '#090E08', paper: 'grain',
    ramp: [[0, '#CFE0EA'], [0.25, '#A6DE86'], [0.5, '#3E9E6A'], [0.75, '#E07A42'], [1, '#CFE0EA']], drift: 'x', period: 20000, rate: 0.01,
    source: STYLE + ': Seasons (winter, spring, summer, autumn), drifting with distance' },

  { id: 'kl4-look', name: 'KL-4 Look', group: 'Kodama Landforms', cycle: true, type: 'ramp', ground: '#07090e', paper: 'grain',
    stops: [[0, '#07090e'], [0.15, '#141a2e'], [0.35, '#2a3040'], [0.6, '#4f5a48'], [0.85, '#8c8a70'], [1, '#9fc8f0']], source: KL + ': kl-4 Look (bg, bed, low, mid, high, stream)' },
  { id: 'kl4-flat', name: 'KL-4 Flat', group: 'Kodama Landforms', cycle: true, type: 'ramp', ground: '#0a0814', paper: 'grain',
    stops: [[0, '#0a0814'], [0.12, '#241e3a'], [1, '#e6deff']], source: KL + ': kl-4 Flat (bg, ground, mono ramp to #e6deff)' },
  { id: 'kl-kit', name: 'Kit Gradient', group: 'Kodama Landforms', cycle: true, type: 'ramp', ground: '#231f20', paper: 'grain',
    stops: [[0, '#231f20'], [0.15, '#262a45'], [0.35, '#3a4166'], [0.55, '#555b7e'], [0.8, '#8a8ea6'], [1, '#c4daf1']], source: KL + ': Kit Gradient (K100, bed, low, mid, high, LB)' },
  { id: 'kl-grey', name: 'KL Greyscale', group: 'Kodama Landforms', cycle: true, type: 'ramp', ground: '#212121', paper: 'none',
    stops: [[0, '#212121'], [0.2, '#4d4d4d'], [0.45, '#828282'], [0.7, '#c8c8c8'], [1, '#f2f2f2']], source: KL + ': Greyscale K ramp (K100, K85, K60, K25, K05 from the file\'s KTAB)' },

  // Megacity arc: one per Kodama topo 17 to 24, exact PAL hex (scene background as ground, an ink ramp dark to
  // light, the window colour as light accent, a second accent for beacons). The light fields only show on
  // worlds with lights (derelict).
  ...[
    ['17', 'Ayutthaya', '#060A14', ['#4A4234', '#5A7078', '#B0A088', '#AEC2D6', '#F4F6F8'], '#FFB868', '#C94FD6', 'bg 0x060A14; stoneLo, scaf, stone, pale, moon; win; neon'],
    ['18', 'Neo Bangkok', '#0A1626', ['#2E3644', '#7A8290', '#3A6E8C', '#BFC8D2', '#F4F6F8'], '#FFC98A', '#C94FD6', 'bg 0x0A1626; coreLo, core, waterHi, ring, moon; win; neonM'],
    ['19', 'Nusantara', '#0C1814', ['#2E3644', '#3A6E4A', '#7A8290', '#C8B890', '#F4F6F8'], '#FFC98A', '#F6C544', 'bg 0x0C1814; towerLo, hillHi, tower, stone, moon; win; gold'],
    ['20', 'Singapore', '#0A141A', ['#2E4650', '#8FA6AE', '#A8CAD6', '#DFF4F8'], '#FFD9A0', '#9AF0C8', 'bg 0x0A141A; glassLo, steel, glass, foam; winW; fire'],
    ['21', 'Jakarta', '#070C0A', ['#16333C', '#1E6656', '#3A8CA0', '#AEC2BC', '#DFF6FF'], '#FFC98A', '#FF4A3A', 'bg 0x070C0A; twr, trace, twrHi, pale, head; winW; beacon'],
    ['22', 'Manila', '#101014', ['#4A3A28', '#8FA0AE', '#9AB0BC', '#C6BCB2', '#DFF0F8'], '#FFC98A', '#F6E06A', 'bg 0x101014; stilt, rail, dome, pale, foam; win; fire'],
    ['23', 'Kuala Lumpur', '#0B100E', ['#16333C', '#3A8CA0', '#8FA6AE', '#D8E4E8'], '#FFC98A', '#3FD0E0', 'bg 0x0B100E; twr, twrHi, steel, steelHi; winW; life'],
    ['24', 'Neo Saigon', '#05070C', ['#16303C', '#3A5866', '#3A6A78', '#C6BCB2', '#BFE0E8'], '#FFCC88', '#F6D488', 'bg 0x05070C; towerLo, silt, towerHi, pale, foam; win; gate'],
  ].map(([n, name, ground, ramp, light, beacon, src]) => ({
    id: 'arc-' + n, name: n + ' ' + name, group: 'Megacity arc', cycle: true, type: 'ramp', ground, paper: 'grain',
    stops: [[0, ground], ...ramp.map((h, i) => [+((i + 1) / ramp.length).toFixed(3), h])], light, beacon,
    source: 'phylla-kodama-topo-' + n + ' PAL (' + src + ')' })),

  // working palettes for the derelict world
  { id: 'derelict-rust', name: 'Derelict Rust', group: 'Derelict', cycle: true, type: 'ramp', ground: '#0B0907', paper: 'grain',
    stops: [[0, '#0B0907'], [0.2, '#2A1D16'], [0.4, '#5A3424'], [0.6, '#8C5236'], [0.8, '#B8865A'], [1, '#D9C3A0']], light: '#FF9F3A', beacon: '#E8452C',
    source: 'oxide ramp, sodium light' },
  { id: 'derelict-rain', name: 'Derelict Rain', group: 'Derelict', cycle: true, type: 'ramp', ground: '#0A0E12', paper: 'grain',
    stops: [[0, '#0A0E12'], [0.2, '#1C252D'], [0.4, '#36434D'], [0.6, '#5C6B75'], [0.8, '#94A2AA'], [1, '#C9D3D8']], light: '#3FD0C0', beacon: '#3FD0C0',
    source: 'cold blue-grey ramp, one teal accent' },
  { id: 'derelict-mono', name: 'Derelict Mono', group: 'Derelict', cycle: true, type: 'ramp', ground: '#0A0A0A', paper: 'none',
    stops: [[0, '#0A0A0A'], [0.2, '#2A2A2A'], [0.4, '#555555'], [0.6, '#8A8A8A'], [0.8, '#C8C8C8'], [1, '#F2F2F2']], light: '#FFFFFF', beacon: '#FFFFFF',
    source: 'ink only, lights white' },
];

const hex = n => '#' + n.toString(16).padStart(6, '0').toUpperCase();
const lum = h => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
const studies = [];
for (const f of fs.readdirSync(SRC).filter(f => /^phylla-kodama-topo-\d+-.*\.html$/.test(f)).sort()) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  const m = /PAL\s*=\s*\{([^}]*)\}/.exec(txt);
  if (!m) { console.warn('no PAL in', f); continue; }
  const entries = [...m[1].matchAll(/(\w+)\s*:\s*0x([0-9a-fA-F]{6})/g)].map(e => [e[1], hex(parseInt(e[2], 16))]);
  const [, num, slug] = /topo-(\d+)-(.*)\.html$/.exec(f);
  // ground: bg if the study has one, else its darkest colour; ink ramp: the rest by luminance
  let ground = entries.find(e => /^(bg|sky|deep|board)$/.test(e[0]));
  if (!ground) ground = [...entries].sort((a, b) => lum(a[1]) - lum(b[1]))[0];
  const rest = entries.filter(e => e !== ground).sort((a, b) => lum(a[1]) - lum(b[1]));
  const pick = rest.length <= 6 ? rest : [0, 1, 2, 3, 4, 5].map(i => rest[Math.round(i * (rest.length - 1) / 5)]);
  const stops = [[0, ground[1]], ...pick.map((e, i) => [+((i + 1) / pick.length).toFixed(3), e[1]])];
  const name = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  studies.push({ id: 'topo-' + num, name: num + ' ' + name, group: 'Studies', cycle: false, type: 'ramp', ground: ground[1], paper: 'grain', stops,
    source: f + ' PAL (' + ground[0] + ' as ground; ' + pick.map(e => e[0]).join(', ') + ' by luminance)' });
}
const out = { version: 1, inkRange: 0.75, note: 'Edit by hand. Fields are described at the top of tools/build-palettes.mjs.', palettes: [...BASE, ...studies] };
fs.writeFileSync(path.join(ROOT, 'palettes.json'), JSON.stringify(out, null, 1) + '\n');
console.log('palettes.json:', BASE.length, 'modes +', studies.length, 'studies');
