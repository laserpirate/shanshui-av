// Review sheet for the derelict world: 1:1 full-height frames (1920 x 1080), JPG under 1 MB each, into
// docs/derelict/ with an index.md. Per seed one quiet and one busy passage (found from the planner),
// then night frames with lights in derelict-rust, derelict-rain and one Megacity arc palette.
//   node tools/serve.mjs --port 8093 &   then   node tools/review.mjs [http://localhost:8093/] [--seeds=1,7,42,2026,derelict]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { density } from '../src/worlds/derelict/planner.js';
import { seedInt } from '../src/worlds/derelict/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const SEEDS = ((args.find(a => a.startsWith('--seeds=')) || '').slice(8) || '1,7,42,2026,derelict').split(',');
const OUT = path.join(ROOT, 'docs', 'derelict');
const W = 1920, H = 1080, CW = 512;
const VIEW_W = W * 700.5 / H;                      // world px across a 1080p frame at zoom 1
const NCH = Math.ceil(VIEW_W / CW);

// the run of chunks (one frame wide) with the lowest / highest mean density in the first 160 chunks
function pick(seed, busy) {
  const s = seedInt(seed);
  let best = null;
  for (let c = 1; c < 160; c++) {
    let d = 0; for (let k = 0; k < NCH; k++) d += density(s, c + k);
    d /= NCH;
    if (!best || (busy ? d > best.d : d < best.d)) best = { c, d };
  }
  return { x: best.c * CW, dens: +best.d.toFixed(2) };
}

fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
page.on('pageerror', e => errs.push(e.message));
const ready = () => {
  const w = SSAV.world(); if (!w || SSAV.fading || !SSAV.scene.lastFrame) return false;
  const v = SSAV.scene.lastFrame.v;
  for (let k = Math.floor(SSAV.x / 512); k <= Math.floor((SSAV.x + v.viewW) / 512); k++) { const t = w.tiles.get(k); if (!t || !t.tex || t.pending || t.dirty) return false; }
  return true;
};
async function shot(name, { seed, palette, x, phase, holds }) {
  await page.goto(`${BASE}?i=review&seed=${seed}&world=derelict&palette=${palette}`);
  await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2, null, { timeout: 60000 });
  await page.evaluate(o => {
    document.body.classList.add('uihidden');
    SSAV.pb.x = o.x; SSAV.cfg.weather.mode = o.phase;
    SSAV.weather.p = ['dry', 'drizzle', 'downpour', 'flood', 'night'].indexOf(o.phase) / 5;
    SSAV.cfg.weather.holds = o.holds || {};
  }, { x, phase, holds });
  await page.waitForTimeout(600);
  await page.waitForFunction(ready, null, { timeout: 120000 });
  await page.waitForTimeout(1800);
  let q = 88, buf;
  do { buf = await page.screenshot({ type: 'jpeg', quality: q }); q -= 6; } while (buf.length > 990000 && q > 40);
  fs.writeFileSync(path.join(OUT, name), buf);
  return { name, kb: Math.round(buf.length / 1024) };
}

const rows = [];
for (const seed of SEEDS) {
  for (const kind of ['quiet', 'busy']) {
    const p = pick(seed, kind === 'busy');
    const f = `derelict_seed-${seed}_${kind}_x${p.x}.jpg`;
    rows.push({ ...await shot(f, { seed, palette: 'derelict-rust', x: p.x, phase: 'dry' }), seed, kind, x: p.x, dens: p.dens, palette: 'derelict-rust', phase: 'dry' });
    console.log(rows.at(-1));
  }
}
const NIGHT = [['derelict-rust', '7'], ['derelict-rain', '42'], ['arc-21', '2026']];
for (const [palette, seed] of NIGHT) {
  const p = pick(seed, true);
  const f = `derelict_night_${palette}_seed-${seed}_x${p.x}.jpg`;
  rows.push({ ...await shot(f, { seed, palette, x: p.x, phase: 'night', holds: { light: 0, rain: 0 } }), seed, kind: 'night', x: p.x, dens: p.dens, palette, phase: 'night' });
  console.log(rows.at(-1));
}
await b.close();

const md = [
  '# Derelict review sheet',
  '',
  `1:1 frames at ${W} x ${H} (the full world height), made with \`node tools/review.mjs\`. Busy and quiet passages are the frame-wide runs with the highest and lowest planner density in the first 160 chunks of each seed. Day frames: dry phase, derelict-rust. Night frames: night phase, lights on, rain held at 0.`,
  '',
  '| Frame | Seed | Passage | x (world px) | Density | Palette |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(r => `| [${r.name}](${r.name}) | ${r.seed} | ${r.kind} | ${r.x} | ${r.dens} | ${r.palette} |`),
  '',
  ...rows.map(r => `![${r.seed} ${r.kind} ${r.palette}](${r.name})\n`),
];
fs.writeFileSync(path.join(OUT, 'index.md'), md.join('\n'));
console.log(errs.length ? 'console problems: ' + errs.slice(0, 5).join(' | ') : 'no console problems', rows.length, 'frames');
process.exit(errs.length ? 1 : 0);
