// Crawl a deployed site (the live preview): every world page and the output page on the real GPU, every request
// they make, the console, rendered tiles non-blank; then every file linked from the review sheets.
//   node tools/crawl.mjs [https://laserpirate.github.io/shanshui-av/next/] [--out=crawl.json]
// Prints counts; exit 1 when anything is broken (HTTP >= 400, failed request, console error, blank frame).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import pngjs from 'pngjs';
const { PNG } = pngjs;

const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'https://laserpirate.github.io/shanshui-av/next/';
const OUT = (args.find(a => a.startsWith('--out=')) || '--out=crawl.json').slice(6);
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1300,860'] });
const pages = [], broken = [], consoleErrs = [];
const requested = new Set();
for (const q of ['?i=crawl&seed=1', '?i=crawl-d&seed=1&world=derelict', '?i=crawl-n&seed=1&world=nashua', '?i=crawl-n2&seed=1&world=nashua&bank=R&level=3']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('response', r => { requested.add(r.url()); if (r.status() >= 400) broken.push(r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => broken.push('failed ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(q + ' ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrs.push(q + ' pageerror ' + e.message));
  const t0 = Date.now();
  await page.goto(BASE + q, { waitUntil: 'load' });
  let tiles = 0, sd = 0, version = '', world = '';
  try {
    await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2, null, { timeout: 60000 });
    await page.evaluate(() => document.body.classList.add('uihidden'));
    await page.waitForTimeout(2500);
    ({ tiles, version, world } = await page.evaluate(() => ({ tiles: SSAV.scene.stats().tiles, version: SSAV.version, world: SSAV.worldName })));
    const png = PNG.sync.read(await page.screenshot());
    let s = 0, s2 = 0, n = 0; for (let i = 0; i < png.data.length; i += 16) { const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; s += l; s2 += l * l; n++; }
    sd = Math.sqrt(s2 / n - (s / n) ** 2);
  } catch (e) { broken.push('no tiles on ' + q + ': ' + e.message.split('\n')[0]); }
  if (sd <= 4) broken.push('blank frame on ' + q + ' (sd ' + sd.toFixed(1) + ')');
  pages.push({ q, world, version, tiles, sd: +sd.toFixed(1), ms: Date.now() - t0 });
  await page.close();
}
// the output window page on its own (no controller: it must load clean and wait)
{
  const page = await browser.newPage();
  page.on('response', r => { requested.add(r.url()); if (r.status() >= 400) broken.push(r.status() + ' ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push('output ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrs.push('output pageerror ' + e.message));
  await page.goto(BASE + 'output.html?i=crawl', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  pages.push({ q: 'output.html', ok: await page.evaluate(() => !!window.SSOUT) });
  await page.close();
}
await browser.close();
// files linked from the review sheets and the pack
const linked = [];
for (const sheet of ['docs/nashua/index.md', 'docs/derelict/index.md']) {
  const r = await fetch(BASE + sheet);
  if (!r.ok) { broken.push(r.status + ' ' + BASE + sheet); continue; }
  const md = await r.text();
  for (const m of md.matchAll(/\]\(([^)\s]+\.(?:jpg|png))\)/g)) linked.push(BASE + path.posix.join(path.posix.dirname(sheet), m[1]));
}
for (const u of [...new Set(linked)]) { const r = await fetch(u, { method: 'HEAD' }); if (!r.ok) broken.push(r.status + ' ' + u); }
const summary = { base: BASE, date: new Date().toISOString(), pages: pages.length, requests: requested.size, linkedFiles: new Set(linked).size, broken: broken.length, consoleErrors: consoleErrs.length };
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync(path.join('test-results', OUT), JSON.stringify({ summary, pages, broken, consoleErrs }, null, 1));
console.log(JSON.stringify(pages));
console.log('CRAWL', JSON.stringify(summary));
if (broken.length) console.log('broken:\n' + broken.slice(0, 20).join('\n'));
if (consoleErrs.length) console.log('console:\n' + consoleErrs.slice(0, 20).join('\n'));
process.exit(broken.length || consoleErrs.length ? 1 : 0);
