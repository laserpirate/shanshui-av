// Screen captures per mode (P2 checkpoint): one WebM per nashua layer mode and per slit-scan mode, recorded by
// Playwright from the live page while the scroll plays. Local only: write them outside the repo (or under media/,
// which is gitignored); never commit them.
//   node tools/capture.mjs [http://localhost:8096/] --out=C:/_av/captures/p2 [--secs=20] [--only=built,strip]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8096/';
const OUT = path.resolve(opt('out', 'media/captures'));
const SECS = +opt('secs', 20);
const ONLY = opt('only', '').split(',').filter(Boolean);
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const W = 1280, H = 720;
// layer modes (no slit-scan), then the slit-scan modes over the built mode; sections mode shows the live inset
const RUNS = [
  ...['nature', 'built', 'design', 'sections'].map(m => ({ name: 'mode-' + m, q: '&mode=' + m, fx: 'off' })),
  ...['strip', 'smear', 'displace'].map(m => ({ name: 'fx-' + m, q: '&mode=built', fx: m })),
].filter(r => !ONLY.length || ONLY.some(o => r.name.endsWith(o)));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: [...GPU, `--window-size=${W + 20},${H + 140}`] });
const made = [];
for (const r of RUNS) {
  const dir = path.join(OUT, '.tmp-' + r.name);
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const p = await ctx.newPage();
  await p.goto(BASE + '?i=cap-' + r.name + '&world=nashua&seed=1&ends=pingpong&level=2' + r.q);
  await p.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.world().pack && SSAV.scene.stats().tiles >= 1, null, { timeout: 60000 });
  // hide the panels so the capture is the stage
  await p.keyboard.press('h');
  await p.evaluate(fx => { document.body.classList.add('clean'); SSAV.setFxMode(fx); SSAV.cfg.speed = 120; SSAV.pb.speed = 120; SSAV.pb.play(); }, r.fx);
  await p.waitForTimeout(SECS * 1000);
  const v = p.video();
  await ctx.close();
  const src = await v.path(), dst = path.join(OUT, r.name + '.webm');
  fs.renameSync(src, dst); fs.rmSync(dir, { recursive: true, force: true });
  made.push({ name: r.name, file: dst, MB: +(fs.statSync(dst).size / 1e6).toFixed(1) });
  console.log('captured', r.name, made[made.length - 1].MB + ' MB');
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'captures.json'), JSON.stringify({ date: new Date().toISOString(), base: BASE, secs: SECS, size: [W, H], made }, null, 1));
console.log(made.length + ' captures in ' + OUT);
