// Phase 0 render benchmark on this machine's GPU (ANGLE D3D11).
//   node tools/serve.mjs --port 8093 &   then   node tools/bench.mjs [http://localhost:8093/] [--headed] [--modes=a,b,c] [--sizes=1080,2160] [--cpu=4]
// --cpu=N throttles the page CPU N times (CDP) to stand in for a weaker laptop.
// Writes test-results/bench.json.
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const headed = args.includes('--headed');
const opt = k => (args.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const MODES = (opt('modes') || 'a,b,c').split(',');
const SIZES = (opt('sizes') || '1080,2160').split(',').map(Number);
const CPU = Number(opt('cpu') || 1);
const SPEED = Number(opt('speed') || 300), SECS = Number(opt('secs') || 12);

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const out = [];
for (const h of SIZES) {
  for (const mode of MODES) {
    const w = Math.round(h * 16 / 9);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    if (CPU > 1) { const c = await page.context().newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
    await page.goto(`${BASE}tools/bench.html?mode=${mode}&speed=${SPEED}&secs=${SECS}`);
    await page.waitForFunction(() => window.BENCH, null, { timeout: 300000 });
    const r = await page.evaluate(() => window.BENCH);
    r.cpuThrottle = CPU; r.errors = errs;
    if (!out.length) r.gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); });
    console.log(JSON.stringify(r));
    out.push(r);
    await page.close();
  }
}
await browser.close();
fs.mkdirSync('test-results', { recursive: true });
const f = `test-results/bench${CPU > 1 ? '-cpu' + CPU : ''}.json`;
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log('wrote', f);
