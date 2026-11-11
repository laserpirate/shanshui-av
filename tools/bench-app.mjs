// App benchmark: the real app scrolling, per world, at 1080p and 4K, and 1080p with the CPU slowed 4x.
// Derelict runs at the heaviest weather (downpour rain and wind, full flood, night, fog 0.8, held).
//   node tools/serve.mjs --port 8093 &   then   node tools/bench-app.mjs [http://localhost:8093/] [--speed=600] [--secs=12]
// Writes test-results/bench-app.json.
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const opt = (k, d) => Number((args.find(a => a.startsWith('--' + k + '=')) || '=' + d).split('=')[1]);
const SPEED = opt('speed', 600), SECS = opt('secs', 12);
const RUNS = [];
for (const world of ['shanshui', 'derelict']) for (const [h, cpu] of [[1080, 1], [2160, 1], [1080, 4]]) RUNS.push({ world, h, cpu });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const out = [];
for (const r of RUNS) {
  const page = await browser.newPage({ viewport: { width: Math.round(r.h * 16 / 9), height: r.h } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  if (r.cpu > 1) { const c = await page.context().newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: r.cpu }); }
  await page.goto(`${BASE}?i=bench-${r.world}&seed=2026${r.world === 'shanshui' ? '' : '&world=' + r.world}`);
  await page.waitForFunction(() => window.SSAV && SSAV.scene.stats().tiles >= 2, null, { timeout: 60000 });
  await page.evaluate(sp => {
    document.body.classList.add('uihidden');
    if (SSAV.worldName === 'derelict') { SSAV.cfg.weather.mode = 'downpour'; Object.assign(SSAV.cfg.weather.holds, { rain: 1, wind: 0.8, water: 1, fog: 0.8, light: 0 }); }
    SSAV.cfg.speed = sp; SSAV.pb.speed = sp; SSAV.pb.play();
  }, SPEED);
  await page.waitForTimeout(3000);
  const res = await page.evaluate(secs => new Promise(done => {
    const dts = []; let last = performance.now(); const t0 = last;
    const f = now => { dts.push(now - last); last = now; if (now - t0 < secs * 1000) requestAnimationFrame(f); else done(dts); };
    requestAnimationFrame(f);
  }), SECS);
  const sorted = [...res].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const row = { ...r, fps: +(1000 * res.length / res.reduce((a, b) => a + b, 0)).toFixed(1), p95: +p95.toFixed(1), over25: res.filter(d => d > 25).length, frames: res.length, errors: errs.length };
  out.push(row); console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/bench-app.json', JSON.stringify({ date: new Date().toISOString(), speed: SPEED, secs: SECS, rows: out }, null, 1));
