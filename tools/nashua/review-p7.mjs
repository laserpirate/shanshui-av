// Review frames for P7 (ADDENDUM-B), written into docs/nashua/index.md between markers, the earlier strips left as made.
// B7: the mouth before (the .p6 state, served from its own worktree) and after, both banks: a manual check for the
// owner (does the confluence read as two rivers meeting?). B8: each landmark glyph. B9: runoff in rain and in flood.
// B5 and B6: the mini menu and the quick guide. 1280 x 720 controller frames, seed 1, nashua-kit (original), day,
// labels on, the bar hidden except for the interface frames. JPEG quality 82.
//   node tools/nashua/review-p7.mjs [after=http://localhost:8093/] [--before=http://localhost:8099/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const AFTER = argv.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const BEFORE = (argv.find(a => a.startsWith('--before=')) || '--before=http://localhost:8099/').slice(9);
const OUT = path.join(ROOT, 'docs', 'nashua');
const A = '<!-- p7 frames: made by tools/nashua/review-p7.mjs -->', B = '<!-- end p7 frames -->';

// [file, base, bank, s (or 'mouth'), {rain, level, reach, ui}, caption]
const SHOTS = [
  ['p7_mouth_bank-L_before.jpg', BEFORE, 'L', 'mouth', {}, 'B7 before (.p6): the section runs on past the mouth into S6'],
  ['p7_mouth_bank-L_after.jpg', AFTER, 'L', 'mouth', {}, 'B7 after: the section stops at the mouth; the Merrimack in forced perspective, not to scale'],
  ['p7_mouth_bank-R_before.jpg', BEFORE, 'R', 'mouth', {}, 'B7 before (.p6), right bank'],
  ['p7_mouth_bank-R_after.jpg', AFTER, 'R', 'mouth', {}, 'B7 after, right bank'],
  ['p7_glyph_dam.jpg', AFTER, 'L', 30, {}, 'B8 Dam: a wide body, the crest gate, the spillway face with falling water, the headpond above the tailwater'],
  ['p7_glyph_factory.jpg', AFTER, 'L', 420, {}, 'B8 Factory: the long mill, a sawtooth roof, the smokestack (not in the data; Owner\'s call); a boxcar on the rail bridge'],
  ['p7_glyph_canal-st.jpg', AFTER, 'L', 870, {}, 'B8 Canal St: a bolder deck and pier, a car'],
  ['p7_glyph_church.jpg', AFTER, 'L', 1110, {}, 'B8 Church: a nave, a steeple, a cross'],
  ['p7_glyph_rail-bridge.jpg', AFTER, 'L', 1706, {}, 'B8 rail bridge at s 1706: a boxcar'],
  ['p7_glyph_cso-6.jpg', AFTER, 'R', 1691, {}, 'B8 CSO #6 on the right bank: a pipe mouth in a headwall'],
  ['p7_glyph_levee.jpg', AFTER, 'R', 2, { reach: 'merrimack' }, 'B8 Levee (approximate), the Merrimack reach, right bank'],
  ['p7_runoff_lot_rain.jpg', AFTER, 'L', 1052, { rain: 0.85 }, 'B9 Rain on: sheet runoff from the lot down the bank, a plume in the water'],
  ['p7_runoff_cso-9_rain.jpg', AFTER, 'L', 1262, { rain: 0.85 }, 'B9 Rain on: CSO #9 running, a plume drifting downstream'],
  ['p7_runoff_cso-9_flood.jpg', AFTER, 'L', 1262, { rain: 0.85, level: 2 }, 'B9 Rain on at Minor Flood: the mouth under water, a stronger plume'],
  ['p7_ui_mini-menu.jpg', AFTER, 'L', 1110, { ui: 'mini' }, 'B5 the mini menu: Play, Speed, World, Guide, Full screen, Labels, Map'],
  ['p7_ui_guide.jpg', AFTER, 'L', 1110, { ui: 'guide' }, 'B6 the quick guide: keys, the bar, URL parameters, a pair'],
  ['p7_ui_map-float.jpg', AFTER, 'L', 1110, { ui: 'map' }, 'B1 the map floated over the header'],
];

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const problems = [], rows = [];
for (const [file, base, bank, s, o, cap] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
  await page.goto(`${base}?i=review-p7&seed=1&world=nashua&palette=original&bank=${bank}${o.reach ? '&reach=' + o.reach : ''}`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 60000 });
  await page.evaluate(([bank, s, o]) => {
    if (!o.ui) document.body.classList.add('uihidden');
    SSAV.pb.pause(); SSAV.pb.k = 0;
    SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: o.rain || 0, fog: 0, light: 1, wind: 0.2 };
    SSAV.setLevel(o.level || 0); SSAV.setLabels('labels', true);
    const P = SSAV.world().pack, sx = s === 'mouth' ? P.nashua_len_m : s, x = (bank === 'R' ? P.route_len_m - sx : sx) * P.hx;
    SSAV.pb.x = x - SSAV.viewW() / 2;
  }, [bank, s, o]);
  if (o.ui === 'mini') await page.click('#b-full');
  if (o.ui === 'guide') await page.click('#b-guide');
  if (o.ui === 'map') {
    await page.click('#b-map'); await page.waitForTimeout(400);
    const g = await page.locator('.map-grip').boundingBox();
    await page.mouse.move(g.x + 20, g.y + 20); await page.mouse.down(); await page.mouse.move(820, 30, { steps: 8 }); await page.mouse.up();
  }
  await page.waitForFunction(() => !SSAV.fading && SSAV.world().coverage(SSAV.x, SSAV.x + SSAV.viewW()) >= 0.999 && !SSAV.world().pendingRaster, null, { timeout: 120000 });
  await page.waitForTimeout(o.level ? 4000 : 2000);
  await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82 });
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
  rows.push({ file, cap, base: base === AFTER ? 'after' : 'before (.p6)', kb });
  console.log(file, kb + ' KB');
  await ctx.close();
}
await browser.close();

let md = `${A}\n## P7 frames (ADDENDUM-B)\n\n`;
md += `Made with \`node tools/nashua/review-p7.mjs\`. 1280 x 720 controller frames, seed 1, nashua-kit, day, labels on, fog 0. Before is the \`.p6\` state served from its own worktree.\n\n`;
md += `**Manual check for the owner (B7):** do the two after frames at the mouth read as two rivers meeting? The perspective past the mouth is forced and not to scale; the fact line says so while it is in view.\n\n`;
md += `| Frame | State | What | KB |\n| --- | --- | --- | --- |\n`;
for (const r of rows) md += `| [${r.file}](${r.file}) | ${r.base} | ${r.cap} | ${r.kb} |\n`;
md += `\n`;
for (const r of rows) md += `![${r.cap}](${r.file})\n\n`;
md += B + '\n';
const f = path.join(OUT, 'index.md');
let s = fs.readFileSync(f, 'utf8');
const i = s.indexOf(A), j = s.indexOf(B);
s = i >= 0 && j > i ? s.slice(0, i) + md + s.slice(j + B.length + 1) : s.replace(/\n*$/, '\n\n') + md;
fs.writeFileSync(f, s);
console.log(problems.length ? 'console:\n' + [...new Set(problems)].join('\n') : 'console: clean');
