// Gate before every push: node --check on all JS, local links resolve, zero console errors on load.
//   node tools/serve.mjs --port 8093 &   then   node tools/gate.mjs [http://localhost:8093/]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://localhost:8093/';
const problems = [];

// 1. syntax
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.js', '*.mjs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => f && !f.startsWith('vendor/'));
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { problems.push('syntax ' + f + ': ' + String(e.stderr).split('\n').slice(0, 3).join(' ')); }
}
console.log('node --check:', files.length, 'files');

// 2. local links in html, css, md
const docs = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.html', '*.css', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => f && !f.startsWith('upstream/') && !f.startsWith('tools/node_modules'));
let links = 0;
for (const f of docs) {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /(?:href|src)="([^"#?]+)[^"]*"|url\('([^')]+)'\)|\]\(([^)#\s]+)\)/g;
  let m;
  while ((m = re.exec(txt))) {
    const u = m[1] || m[2] || m[3];
    if (/^(https?:|data:|mailto:|javascript:)/.test(u)) continue;
    links++;
    const p = path.resolve(path.dirname(path.join(ROOT, f)), u);
    if (!fs.existsSync(p)) problems.push(`link ${f} -> ${u}`);
  }
}
console.log('local links:', links);

// 3. console errors on load (controller and output)
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const offline = /^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
for (const url of ['?i=gate&seed=1', 'output.html?i=gate']) {
  const page = await browser.newPage();
  // against localhost, prove the app runs with no internet: block and report anything external
  if (offline) await page.route('**/*', r => { const u = r.request().url(); if (/^(https?:\/\/(localhost|127\.0\.0\.1)|data:|blob:)/.test(u)) return r.continue(); problems.push('external request ' + u); return r.abort(); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${url}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => problems.push(`pageerror ${url}: ${e.message}`));
  page.on('requestfailed', r => problems.push(`request failed ${url}: ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + url);
  await page.waitForTimeout(4000);
  if (url.startsWith('?')) {   // exercise the lazy PDF libraries too
    await page.evaluate(() => { Object.assign(SSAV.cfg.exp, { format: 'view' }); return SSAV.runExport('pdf'); });
    const st = await page.evaluate(() => window.__lastExport);
    if (!st || st.error) problems.push('pdf export on load check: ' + (st && st.error));
  }
  await page.close();
}
await browser.close();
console.log('offline check:', offline ? 'on (external requests blocked)' : 'off (remote base)');
console.log(problems.length ? 'GATE FAILED\n' + problems.join('\n') : 'gate passed');
process.exit(problems.length ? 1 : 0);
