// Greyscale test strips of the derelict world (preflight images).
//   node tools/serve.mjs --port 8093 &   then   node tools/strip.mjs [base] [--seeds=1,2,3] [--w=6000] [--h=360] [--out=dir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const opt = (k, d) => (args.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1] || d;
const seeds = opt('seeds', '1,7,1729700000000,derelict,42').split(',');
const W = opt('w', '6000'), H = opt('h', '360'), X0 = opt('x0', '0'), OUT = opt('out', 'test-results/strips');
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
for (const s of seeds) {
  await page.goto(`${BASE}tools/strip.html?seed=${s}&x0=${X0}&w=${W}&h=${H}`);
  await page.waitForFunction(() => window.STRIP, null, { timeout: 120000 });
  const r = await page.evaluate(() => window.STRIP);
  const f = path.join(OUT, `derelict-strip_seed-${s}_x${X0}.png`);
  fs.writeFileSync(f, Buffer.from(r.url.split(',')[1], 'base64'));
  console.log(f, `gen ${r.genMs.toFixed(0)} ms for ${r.chunks} chunks, raster ${r.rasterMs.toFixed(0)} ms, ${r.prims} prims`);
}
await b.close();
