// Review strips for P8 (ADDENDUM-B B11, the mirror), written into docs/nashua/index.md between markers, the earlier
// sections left as made. One mirrored strip of each world, and the nashua alternates. 1280 x 720 controller frames,
// seed 1, palette original (nashua-kit for nashua), day, fog 0, the bar hidden. JPEG quality 82.
//   node tools/nashua/review-p8.mjs [http://localhost:8100/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const BASE = argv.find(a => a.startsWith('http')) || 'http://localhost:8100/';
const OUT = path.join(ROOT, 'docs', 'nashua');
const A = '<!-- p8 strips: made by tools/nashua/review-p8.mjs -->', B = '<!-- end p8 strips -->';

// [file, query, x (world px at the left edge, or s in m for nashua), caption]
const SHOTS = [
  ['p8_mirror_shanshui.jpg', 'seed=1&palette=original&malt=other&mscroll=with', 3000, 'shanshui: the next seed (2) below the water line, scrolling with'],
  ['p8_mirror_derelict.jpg', 'world=derelict&seed=1&palette=original&malt=other&mscroll=with', 3000, 'derelict: the next seed (2) below the water line'],
  ['p8_mirror_nashua_other-bank.jpg', 'world=nashua&seed=1&malt=other&mscroll=with', 1110, 'nashua: the other bank (right) below the north bank, turned so each column is the same station'],
  ['p8_mirror_nashua_axis-80.jpg', 'world=nashua&seed=1&malt=other&mscroll=with&maxis=80', 1110, 'nashua: the axis at 80 px below the water line'],
  ['p8_mirror_nashua_alt-shanshui.jpg', 'world=nashua&seed=1&malt=shanshui&mscroll=against&mstr=0.6', 1110, 'nashua over shanshui (seed 1), scrolling against, strength 0.6'],
];

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const problems = [], rows = [];
for (const [file, q, x, cap] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}?i=review-p8&mirror=1&mon=1&${q}`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && (!/world=nashua/.test(location.search) || SSAV.world().pack), null, { timeout: 60000 });
  await page.evaluate(x => {
    document.body.classList.add('uihidden');
    SSAV.pb.pause(); SSAV.pb.k = 0;
    SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0, light: 1, wind: 0.2 };
    if (SSAV.world().pack) { SSAV.setLabels('labels', false); const P = SSAV.world().pack; SSAV.pb.x = x * P.hx - SSAV.viewW() / 2; }
    else SSAV.pb.x = x;
  }, x);
  await page.waitForFunction(() => !SSAV.fading && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 120000 });
  await page.waitForFunction(() => { for (const [k, w] of SSAV.scene.worlds) if (k.startsWith('mirror:')) return !w.world.pendingRaster && w.world.tiles.size > 0; return false; }, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82 });
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
  rows.push({ file, cap, kb });
  console.log(file, kb + ' KB');
  await ctx.close();
}
await browser.close();

let md = `${A}\n## P8 strips (ADDENDUM-B B11, the mirror)\n\n`;
md += `Made with \`node tools/nashua/review-p8.mjs\`. 1280 x 720 controller frames with \`?mirror=1&mon=1\`, seed 1, day, fog 0, the default axis (20 px below the water line) and strength (0.85) unless the row says otherwise.\n\n`;
md += `| Frame | What | KB |\n| --- | --- | --- |\n`;
for (const r of rows) md += `| [${r.file}](${r.file}) | ${r.cap} | ${r.kb} |\n`;
md += `\n`;
for (const r of rows) md += `![${r.cap}](${r.file})\n\n`;
md += B + '\n';
const f = path.join(OUT, 'index.md');
let s = fs.readFileSync(f, 'utf8');
const i = s.indexOf(A), j = s.indexOf(B);
s = i >= 0 && j > i ? s.slice(0, i) + md + s.slice(j + B.length + 1) : s.replace(/\n*$/, '\n\n') + md;
fs.writeFileSync(f, s);
console.log(problems.length ? 'console:\n' + [...new Set(problems)].join('\n') : 'console: clean');
