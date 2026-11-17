// Look at the nashua world in headed Chromium on the real GPU: frames at chosen s, banks, levels, day and night.
//   node tools/nashua/look.mjs [--base=http://localhost:8094/] [--w=1280 --h=720] [--s=0,870,1260,2158] [--bank=L,R]
//                              [--level=0] [--night] [--out=<folder>] [--ve=10] [--labels]
// Writes PNGs named nashua_<bank>_s<s>_lv<level>_<day|night>_<w>x<h>.png and prints console errors.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : (process.argv.includes('--' + k) ? true : d); };
const BASE = arg('base', 'http://localhost:8094/');
const W = +arg('w', 1280), H = +arg('h', 720);
const SS = String(arg('s', '0,870,1260,1706,2158,2400')).split(',').map(Number);
const BANKS = String(arg('bank', 'L')).split(',');
const LV = +arg('level', 0), VE = +arg('ve', 10), NIGHT = !!arg('night', false), LABELS = !!arg('labels', false);
const OUT = path.resolve(arg('out', path.join(HERE, '..', '..', 'test-results', 'nashua-look')));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W + 20},${H + 140}`] });
const errors = [];
for (const bank of BANKS) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  await page.goto(`${BASE}?i=look-${bank}&seed=1&world=nashua&bank=${bank}&ve=${VE}&level=${LV}`);
  await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack, null, { timeout: 30000 });
  await page.evaluate(({ night, labels }) => {
    document.body.classList.add('uihidden');
    SSAV.cfg.weather.mode = 'dry'; SSAV.cfg.weather.holds = { rain: 0, fog: 0.25, light: night ? 0 : 1, wind: 0.2 };
    SSAV.cfg.nashua.labels = labels;
  }, { night: NIGHT, labels: LABELS });
  for (const s of SS) {
    await page.evaluate(s => {
      const P = SSAV.world().pack, vw = SSAV.frameState && window.innerWidth / (window.innerHeight / (800 / 1.142));
      const x = (SSAV.cfg.nashua.bank === 'R' ? P.route_len_m - s : s) * 2 - vw / 2;
      SSAV.pb.pause(); SSAV.pb.k = 0; SSAV.pb.x = x;
    }, s);
    await page.waitForFunction(() => { const w = SSAV.world(), v = window.innerWidth / (window.innerHeight / (800 / 1.142)); return w.coverage(SSAV.x, SSAV.x + v) >= 0.99 && !w.pendingRaster; }, null, { timeout: 30000 }).catch(() => errors.push('tiles not ready at s ' + s));
    await page.waitForTimeout(1600);
    const f = path.join(OUT, `nashua_${bank}_s${s}_lv${LV}_ve${VE}_${NIGHT ? 'night' : 'day'}_${W}x${H}.png`);
    await page.screenshot({ path: f });
    console.log(f);
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? 'console:\n' + [...new Set(errors)].join('\n') : 'console: clean');
