// Review strips for P6 (ADDENDUM-A A1 and A6), written into docs/nashua/index.md between markers, the P1 and P5
// strips above them left as made. Before: the .p5 tag (hills, 2 world px per m, 10x), served from its own worktree.
// After: this branch at its defaults (no filled hills, 8 world px per m, 2x). Both reaches, left bank, day, Median
// Water, labels off, 360 px high, the whole reach. A strip wider than one canvas is rendered in tiles of the same
// viewport moved by exactly its world width, then joined in a page canvas and saved as JPEG (quality 82).
// Plus one 1280 x 720 controller frame with labels and the map inset on, at the church behind the lot.
//   node tools/nashua/review-p6.mjs [after=http://localhost:8093/] [--before=http://localhost:8098/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const AFTER = argv.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const BEFORE = (argv.find(a => a.startsWith('--before=')) || '--before=http://localhost:8098/').slice(9);
const OUT = path.join(ROOT, 'docs', 'nashua');
const WORLD_H = 800 / 1.142, PAD = 24, H = 360, TILE = 4000;
const A = '<!-- p6 strips: made by tools/nashua/review-p6.mjs -->', B = '<!-- end p6 strips -->';

const RUNS = [];
for (const reach of ['nashua', 'merrimack']) for (const [when, base] of [['before', BEFORE], ['after', AFTER]]) RUNS.push({ reach, when, base, name: `p6_${reach}_${H}p_bank-L_day_level-0_${when}.jpg` });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const rows = [], problems = [];
for (const r of RUNS) {
  const page = await browser.newPage({ viewport: { width: TILE, height: H } });
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  await page.goto(`${r.base}?i=review-p6&seed=1&world=nashua&bank=L&level=0${r.reach === 'merrimack' ? '&reach=merrimack' : ''}`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  await page.evaluate(() => {
    document.body.classList.add('uihidden');
    SSAV.pb.pause(); SSAV.pb.k = 0;
    SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: 1, wind: 0.2 };
    SSAV.cfg.nashua.labels = false;
  });
  const info = await page.evaluate(() => { const P = SSAV.world().pack; return { hash: P.hash, len: P.route_len_m, hx: P.hx || 2, ve: SSAV.opts.ve, vw: SSAV.viewW() }; });
  const worldW = info.len * info.hx + 2 * PAD, n = Math.ceil(worldW / info.vw), tiles = [];
  for (let k = 0; k < n; k++) {
    await page.evaluate(x => { SSAV.pb.x = x; }, -PAD + k * info.vw);
    await page.waitForFunction(() => !SSAV.fading && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 120000 });
    await page.waitForTimeout(1200);
    tiles.push((await page.screenshot({ type: 'png' })).toString('base64'));
  }
  const W = Math.ceil(worldW * TILE / info.vw);
  const jpg = await page.evaluate(async ({ tiles, W, H, TILE }) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    for (let k = 0; k < tiles.length; k++) {
      const im = new Image(); im.src = 'data:image/png;base64,' + tiles[k]; await im.decode();
      g.drawImage(im, k * TILE, 0);
    }
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  }, { tiles, W, H, TILE });
  fs.writeFileSync(path.join(OUT, r.name), Buffer.from(jpg, 'base64'));
  const kb = Math.round(fs.statSync(path.join(OUT, r.name)).size / 1024);
  rows.push({ ...r, ...info, w: W, tiles: n, kb });
  console.log(r.name, W + 'x' + H, n + ' tiles', kb + ' KB', info.hx + ' px/m', info.ve + 'x', info.hash);
  await page.close();
}

// one controller frame: labels and the map inset on, at the church behind the lot (s 1110)
const MAPSHOT = 'p6_nashua_720p_map-inset_labels.jpg';
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  await page.goto(`${AFTER}?i=review-p6m&seed=1&world=nashua&bank=L&level=0`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  await page.evaluate(() => {
    SSAV.pb.pause(); SSAV.pb.k = 0;
    SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: 1, wind: 0.2 };
    SSAV.setLabels('labels', true); SSAV.setMapInset(true, 'm');
    const P = SSAV.world().pack; SSAV.pb.x = 1110 * P.hx - SSAV.viewW() / 2;
  });
  await page.waitForFunction(() => !SSAV.fading && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, MAPSHOT), type: 'jpeg', quality: 82 });
  await page.close();
  console.log(MAPSHOT);
}
await browser.close();

const reachName = r => (r === 'nashua' ? 'Nashua' : 'Merrimack');
let md = `${A}\n## P6 strips: before and after\n\n`;
md += `Made with \`node tools/nashua/review-p6.mjs\`. Seed 1, nashua-kit, left bank (the north bank, downstream to the right), day, Median Water, dry, fog 0.25, labels off, ${H} px high, the whole reach plus ${PAD} world px of paper at each end. Before: the \`.p5\` tag, with the filled hills, 2 world px per m, Vertical Exaggeration 10x. After: P6 at its defaults, no filled hills (one thin ridgeline of real ground, the near bank, the buildings in rows by distance), 8 world px per m, Vertical Exaggeration 2x. The after strips are four times as long because the horizontal scale is four times larger; the heights are one fifth because the exaggeration is one fifth. Building heights are estimated.\n\n`;
md += `| Strip | px | Reach | When | Scale | Pack | KB |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const r of rows) md += `| [${r.name}](${r.name}) | ${r.w} x ${H} | ${reachName(r.reach)}, ${r.len} m | ${r.when} | ${r.hx} px per m, ${r.ve}x | ${r.hash} | ${r.kb} |\n`;
md += `\n`;
for (const r of rows) md += `![${reachName(r.reach)} ${r.when}: ${r.hx} world px per m, Vertical Exaggeration ${r.ve}x](${r.name})\n\n`;
md += `The controller at s 1110 m (the church behind the lot), labels on, the map inset on at its default size (400 px): north up, the stations, the dot at the playhead.\n\n![Controller with labels and the map inset](${MAPSHOT})\n\n`;
md += B + '\n';
const f = path.join(OUT, 'index.md');
let s = fs.readFileSync(f, 'utf8');
const i = s.indexOf(A), j = s.indexOf(B);
s = i >= 0 && j > i ? s.slice(0, i) + md + s.slice(j + B.length + 1) : s.replace(/\n*$/, '\n\n') + md;
fs.writeFileSync(f, s);
console.log(problems.length ? 'console:\n' + [...new Set(problems)].join('\n') : 'console: clean');
