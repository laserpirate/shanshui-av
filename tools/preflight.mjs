// Preflight every palette on this machine's real GPU: renders non-blank, holds frame rate, no console
// errors. Writes test-results/preflight.json and docs/palettes/<id>.jpg (320 x 180 stills).
//   node tools/serve.mjs --port 8093 &   then   node tools/preflight.mjs [http://localhost:8093/] [--seed=1] [--thumbs]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const SEED = (args.find(a => a.startsWith('--seed=')) || '--seed=1').slice(7);
const THUMBS = args.includes('--thumbs');

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}?i=preflight&seed=${SEED}`);
await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 3, null, { timeout: 30000 });
await page.evaluate(() => { document.body.classList.add('uihidden'); SSAV.pb.x = 300; });
await page.waitForTimeout(1500);
const gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); });
const ids = await page.evaluate(() => SSAV.palettes.palettes.map(p => p.id));
fs.mkdirSync(path.join(ROOT, 'docs', 'palettes'), { recursive: true });
const rows = [];
for (const id of ids) {
  const e0 = errors.length;
  await page.evaluate(id => SSAV.setPalette(id), id);
  await page.waitForFunction(() => !SSAV.fading, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
  const png = PNG.sync.read(buf);
  let mn = 255, mx = 0, sum = 0, sum2 = 0, n = 0;
  for (let i = 0; i < png.data.length; i += 16) { const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; mn = Math.min(mn, l); mx = Math.max(mx, l); sum += l; sum2 += l * l; n++; }
  const mean = sum / n, sd = Math.sqrt(sum2 / n - mean * mean);
  const fps = await page.evaluate(() => SSAV.scene.fps);
  const blank = sd < 4 || mx - mn < 12;
  const row = { id, mean: +mean.toFixed(1), sd: +sd.toFixed(1), range: [Math.round(mn), Math.round(mx)], fps: +fps.toFixed(1), blank, errors: errors.slice(e0) };
  rows.push(row);
  const tf = path.join(ROOT, 'docs', 'palettes', id + '.jpg');
  if (THUMBS || !fs.existsSync(tf)) {
    const jpg = await page.screenshot({ type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 1280, height: 720 }, scale: 'css' });
    // downscale through the page canvas
    const small = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = 320; c.height = 180; c.getContext('2d').drawImage(img, 0, 0, 320, 180);
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    }, jpg.toString('base64'));
    fs.writeFileSync(tf, Buffer.from(small, 'base64'));
  }
  console.log(id.padEnd(18), `mean ${row.mean} sd ${row.sd} range ${row.range.join('-')} fps ${row.fps}`, blank ? ' BLANK' : '', row.errors.length ? ' errors: ' + row.errors.join(' | ') : '');
}
await browser.close();
const report = { gpu, date: new Date().toISOString(), seed: SEED, palettes: rows, blank: rows.filter(r => r.blank).map(r => r.id), consoleErrors: errors };
fs.mkdirSync(path.join(ROOT, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test-results', 'preflight.json'), JSON.stringify(report, null, 1));
console.log('GPU', gpu, '\nblank:', report.blank.length, report.blank.join(', '), '\nconsole errors:', errors.length);
process.exit(report.blank.length || errors.length ? 1 : 0);
