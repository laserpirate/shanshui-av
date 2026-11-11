// Review strips for the P5 work, appended to docs/nashua/index.md between markers (the P1 strips are left as made):
// the night river (day cycle at 22:00, bridge lamps and their reflections), and the second reach (the Merrimack)
// by day and by night. Each strip is the whole reach in one viewport as wide as the reach, rendered by the app.
//   node tools/serve.mjs --port 8093 &   then   node tools/nashua/review-p5.mjs [http://localhost:8093/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pngjs from 'pngjs';
const { PNG } = pngjs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://localhost:8093/';
const OUT = path.join(ROOT, 'docs', 'nashua');
const WORLD_H = 800 / 1.142, PAD = 24, H = 720;
const A = '<!-- p5 strips: made by tools/nashua/review-p5.mjs -->', B = '<!-- end p5 strips -->';

// q: extra URL; light: weather light hold (null = the day cycle drives it)
const RUNS = [
  { name: 'nashua_720p_bank-L_daycycle-2200_level-0.jpg', what: 'Nashua, left bank, day cycle at 22:00 EST on 2024-07-01, Median Water', q: '&t=2024-07-01&daycycle=1&hour=22', light: null },
  { name: 'nashua_720p_bank-L_daycycle-1200_level-0.jpg', what: 'Nashua, left bank, day cycle at 12:00 EST on 2024-07-01, Median Water', q: '&t=2024-07-01&daycycle=1&hour=12', light: null },
  { name: 'merrimack_720p_bank-L_day_level-0.jpg', what: 'Merrimack, left bank, day, Median Water', q: '&reach=merrimack', light: 1 },
  { name: 'merrimack_720p_bank-L_night_level-0.jpg', what: 'Merrimack, left bank, night, Median Water', q: '&reach=merrimack', light: 0 },
  { name: 'merrimack_720p_bank-R_day_level-2.jpg', what: 'Merrimack, right bank, day, level 2', q: '&reach=merrimack&bank=R&level=2', light: 1, level: 2 },
  { name: 'nashua_720p_bank-L_day_level-0_ticks.jpg', what: 'Nashua, left bank, day, `?ticks=1` (a tick every 100 m, a label every 500 m)', q: '&ticks=1', light: 1 },
  // output pages (clock mode at speed 0: the reach from s = 0), the second at &cap=0.6
  { name: 'output_720p_nashua_day.jpg', what: 'Output window, Nashua, day, no cap', page: 'output.html', q: '&speed=0&light=1&fog=0.25' },
  { name: 'output_720p_nashua_day_cap-60.jpg', what: 'Output window, Nashua, day, `&cap=0.6`', page: 'output.html', q: '&speed=0&light=1&fog=0.25&cap=0.6' },
  // one element only: the hydrograph at the 1936 flood
  { name: 'hydrograph_1936-03-19.png', what: '`?hydro=1` at 1936-03-19 (the hydrograph only, 480 x 132 css px)', q: '&t=1936-03-19&hydro=1', el: '#hud-hydro' },
];

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const rows = [], problems = [];
for (const r of RUNS) {
  if (r.page || r.el) { rows.push(await special(r)); continue; }
  const page = await browser.newPage({ viewport: { width: 1280, height: H } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  await page.goto(`${BASE}?i=review-p5&seed=1&world=nashua${r.q}`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  const len = await page.evaluate(() => SSAV.world().pack.route_len_m);
  const W = Math.ceil((len * 2 + 2 * PAD) * H / WORLD_H);
  await page.setViewportSize({ width: W, height: H });
  await page.evaluate(({ r, PAD }) => {
    document.body.classList.add('uihidden');
    SSAV.pb.pause(); SSAV.pb.k = 0; SSAV.pb.x = -PAD;
    SSAV.cfg.weather.mode = 'dry';
    SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: r.light == null ? 1 : r.light, wind: 0.2 };
    SSAV.cfg.nashua.labels = false;
    if (r.level != null) SSAV.setLevel(r.level);
  }, { r, PAD });
  if (r.level != null) await page.waitForFunction(lv => Math.abs(SSAV.lvShown - lv) < 0.01, r.level, { timeout: 30000 });
  await page.waitForFunction(() => !SSAV.fading && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const fact = await page.evaluate(() => { const P = SSAV.world().pack; return { hash: P.hash, len: P.route_len_m, buildings: P.counts && P.counts.buildings }; });
  const png = PNG.sync.read(await page.screenshot({ type: 'png' }));
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] > 110) lit++;
  await page.screenshot({ path: path.join(OUT, r.name), type: 'jpeg', quality: 82 });
  const kb = Math.round(fs.statSync(path.join(OUT, r.name)).size / 1024);
  rows.push({ ...r, w: W, kb, lit: lit / (png.width * png.height), ...fact });
  console.log(r.name, W + 'x' + H, kb + ' KB', 'lit ' + (lit / (png.width * png.height)).toFixed(4));
  await page.close();
}
await browser.close();

// an output page as wide as a 720p strip, or one element of the controller
async function special(r) {
  const page = await browser.newPage({ viewport: { width: r.page ? 5104 : 1280, height: H } });
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  if (r.page) {
    await page.goto(`${BASE}${r.page}?world=nashua&seed=1&t0=${Date.now()}${r.q}`);
    await page.waitForFunction(() => window.SSOUT && SSOUT.scene.stats().tiles >= 8, null, { timeout: 120000 });
    await page.waitForTimeout(4000);
  } else {
    await page.goto(`${BASE}?i=review-p5&seed=1&world=nashua${r.q}`);
    await page.waitForFunction(sel => window.SSAV && document.querySelector(sel) && !document.querySelector(sel).hidden, r.el, { timeout: 60000 });
    await page.waitForTimeout(1000);
  }
  const shot = r.el ? await page.locator(r.el).screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' });
  const png = PNG.sync.read(shot);
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) if (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] > 110) lit++;
  if (r.el) fs.writeFileSync(path.join(OUT, r.name), shot); else await page.screenshot({ path: path.join(OUT, r.name), type: 'jpeg', quality: 82 });
  const kb = Math.round(fs.statSync(path.join(OUT, r.name)).size / 1024);
  await page.close();
  console.log(r.name, png.width + 'x' + png.height, kb + ' KB', 'lit ' + (lit / (png.width * png.height)).toFixed(4));
  return { ...r, w: png.width, h: png.height, kb, lit: lit / (png.width * png.height), hash: r.page ? 'output' : 'controller', len: '' };
}

let md = `${A}\n## P5 strips\n\nMade with \`node tools/nashua/review-p5.mjs\`, the same way as the strips above (seed 1, nashua-kit, Vertical Exaggeration 10x, dry, fog 0.25, 720 px high, the whole reach in one viewport). "Lit" is the share of pixels brighter than 110 of 255 (luma), so the day and the night strips can be compared by one number.\n\n`;
md += `| Strip | px | What | Pack | Lit | KB |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const r of rows) md += `| [${r.name}](${r.name}) | ${r.w} x ${r.h || H} | ${r.what} | ${r.len ? r.hash + ', ' + r.len + ' m' : r.hash} | ${r.lit.toFixed(4)} | ${r.kb} |\n`;
md += `\nThe Merrimack reach: 5008 m below the confluence, from the same DEM, land cover and footprints as the Nashua, by \`tools/nashua/build-reach.py\`. No measured bed (the proxy only), no dam, lot, stations or outfalls in it, and its water levels are the Nashua's carried unchanged (the fact line says so).\n\n`;
for (const r of rows) md += `![${r.what}](${r.name})\n\n`;
md += B + '\n';
const f = path.join(OUT, 'index.md');
let s = fs.readFileSync(f, 'utf8');
const i = s.indexOf(A), j = s.indexOf(B);
s = i >= 0 && j > i ? s.slice(0, i) + md + s.slice(j + B.length + 1) : s.replace(/\n*$/, '\n\n') + md;
fs.writeFileSync(f, s);
console.log(problems.length ? 'console:\n' + [...new Set(problems)].join('\n') : 'console: clean');
