// Review sheet for the nashua world: strips of the whole reach, rendered by the real app in one wide viewport
// (so the shader, water level, night and lights are the ones on screen), into docs/nashua/ with an index.md.
//   node tools/serve.mjs --port 8093 &   then   node tools/nashua/review.mjs [http://localhost:8093/]
// 720p: both banks x day and night x Median, Minor Flood, 1936 (12 strips) + both banks with labels.
// 1080p: both banks, day at Median and night at the 1% flood. JPG, quality 82.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://localhost:8093/';
const OUT = path.join(ROOT, 'docs', 'nashua');
fs.mkdirSync(OUT, { recursive: true });
const WORLD_H = 800 / 1.142, PAD = 24;   // world px of paper either side of the reach

const RUNS = [];
for (const bank of ['L', 'R']) for (const night of [0, 1]) for (const level of [0, 2, 4]) RUNS.push({ h: 720, bank, night, level, labels: 0 });
for (const bank of ['L', 'R']) RUNS.push({ h: 720, bank, night: 0, level: 0, labels: 1 });
for (const bank of ['L', 'R']) { RUNS.push({ h: 1080, bank, night: 0, level: 0, labels: 0 }); RUNS.push({ h: 1080, bank, night: 1, level: 3, labels: 0 }); }

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const rows = [], problems = [];
let levelNames = null, reachM = null, packHash = null;
for (const r of RUNS) {
  const cs = r.h / WORLD_H;
  const W = Math.ceil((4917.6 + 2 * PAD) * cs);
  const page = await browser.newPage({ viewport: { width: W, height: r.h } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  // P6: pinned to the P1 scale (2 world px per m, 10x) so the sheet it writes stays what its text says; the P6
  // strips at the new defaults are made by tools/nashua/review-p6.mjs
  await page.goto(`${BASE}?i=review-${r.bank}&seed=1&world=nashua&bank=${r.bank}&level=${r.level}&hx=2&ve=10`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  await page.evaluate(({ r, PAD }) => {
    document.body.classList.add('uihidden');
    SSAV.pb.pause(); SSAV.pb.k = 0; SSAV.pb.x = -PAD;
    SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: r.night ? 0 : 1, wind: 0.2 };
    SSAV.cfg.nashua.labels = !!r.labels;
    SSAV.setLevel(r.level);
  }, { r, PAD });
  await page.waitForFunction(lv => Math.abs(SSAV.lvShown - lv) < 0.01 && !SSAV.fading, r.level, { timeout: 30000 });
  await page.waitForFunction(() => { const w = SSAV.world(); return w.coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !w.pendingRaster; }, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => { const P = SSAV.world().pack; return { names: P.levels.map(l => l.name), len: P.route_len_m, hash: P.hash }; });
  levelNames = info.names; reachM = info.len; packHash = info.hash;
  const name = `nashua_${r.h}p_bank-${r.bank}_${r.night ? 'night' : 'day'}_level-${r.level}${r.labels ? '_labels' : ''}.jpg`;
  await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 82 });
  const kb = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
  rows.push({ ...r, name, w: W, kb });
  console.log(name, W + 'x' + r.h, kb + ' KB');
  await page.close();
}
await browser.close();

const bankName = b => (b === 'L' ? 'left bank' : 'right bank');
let md = `# Nashua review sheet\n\n`;
md += `Strips of the whole reach (${reachM} m, ${(reachM * 2).toFixed(1)} world px, plus ${PAD} px of paper at each end), rendered by the app in one viewport as wide as the reach. Made with \`node tools/nashua/review.mjs\`. Palette nashua-kit, seed 1, Vertical Exaggeration 10x, dry, fog 0.25. Day: light 1. Night: light 0, lights on. Pack hash ${packHash}.\n\n`;
md += `Left bank: downstream to the right. Right bank: downstream to the left (the mirror).\n\n`;
md += `| Strip | px | Bank | Light | Water level | Labels | KB |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const r of rows) md += `| [${r.name}](${r.name}) | ${r.w} x ${r.h} | ${bankName(r.bank)} | ${r.night ? 'night' : 'day'} | ${levelNames[r.level]} | ${r.labels ? 'on' : 'off'} | ${r.kb} |\n`;
md += `\n`;
for (const r of rows) md += `![${r.h}p ${bankName(r.bank)} ${r.night ? 'night' : 'day'} ${levelNames[r.level]}${r.labels ? ' labels' : ''}](${r.name})\n\n`;
fs.writeFileSync(path.join(OUT, 'index.md'), md);
console.log(problems.length ? 'console:\n' + [...new Set(problems)].join('\n') : 'console: clean');
