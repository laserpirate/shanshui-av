// Quick load check: console errors, a screenshot, stats.  node tests/smoke.mjs [url] [out.png]
import { chromium } from '../tools/node_modules/playwright/index.mjs';
const url = process.argv[2] || 'http://localhost:8093/?seed=1';
const shot = process.argv[3] || 'scratch/smoke.png';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.goto(url);
await p.waitForTimeout(5000);
const info = await p.evaluate(() => window.SSAV ? { seed: SSAV.seed, x: SSAV.x, stats: SSAV.scene.stats(), log: [...document.querySelectorAll('#log li')].map(l => l.textContent).slice(0, 10) } : 'no SSAV');
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: shot });
console.log('errors:', errs);
await b.close();
