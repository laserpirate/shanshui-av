// Bake tiles for weak show machines: renders the tiles of one world, seed and mode in the browser (the same raster
// worker the live page uses) and writes them to baked/<key>/<k>.bin.gz with an index. A page opened with ?baked=1
// then uploads those tiles instead of generating and rastering them; palettes, weather, fog, water and the slit-scan
// stay live. Anything not baked (another seed, mode or bank, or past the baked span) is drawn live as usual.
//   node tools/bake.mjs [http://localhost:8093/] [--world=nashua] [--seed=1] [--bank=L] [--ve=10] [--mode=built]
//        [--height=1080] [--k0=0 --k1=39 (endless worlds; nashua bakes its whole reach)] [--out=baked] [--headed]
// Also writes precache.json (every runtime file plus the baked tiles), which sw.js caches for ?offline=1.
// baked/ and precache.json are local build products (gitignored).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from './node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TILE_W, WORLD_H } = await import(pathToFileURL(path.join(ROOT, 'src', 'core', 'constants.js')).href);
const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = args.find(a => a.startsWith('http')) || 'http://localhost:8093/';
const world = arg('world', 'nashua'), seed = arg('seed', '1'), height = +arg('height', 1080);
const OUT = path.resolve(ROOT, arg('out', 'baked'));
const scale = Math.round((height / WORLD_H) * 64) / 64;   // the live renderer's quantized raster scale at that height
const q = new URLSearchParams({ i: 'bake', world, seed, palette: 'original' });
for (const k of ['bank', 've', 'mode', 'morph']) { const v = arg(k, null); if (v != null) q.set(k, v); }

const browser = await chromium.launch({ headless: !args.includes('--headed'), args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(BASE + '?' + q);
await page.waitForFunction(() => window.SSAV && SSAV.world() && SSAV.scene.stats().tiles >= 1 && (!SSAV.world().meta.data || SSAV.world().pack), null, { timeout: 120000 });
await page.waitForTimeout(1500);
// stop the loop: nothing culls or re-rasters while we bake
await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
const info = await page.evaluate(() => { const w = SSAV.world(); return { key: w.bakeKey(), keep: w.keepK || null, opts: w.opts }; });
const [k0, k1] = info.keep || [+arg('k0', 0), +arg('k1', 39)];
const dir = path.join(OUT, info.key);
fs.mkdirSync(dir, { recursive: true });
console.log('baking', info.key, 'tiles', k0, 'to', k1, 'at scale', scale, '->', path.relative(ROOT, dir));

const tiles = {};
let bytes = 0;
const t0 = Date.now();
for (let k = k0; k <= k1; k++) {
  const r = await page.evaluate(async ({ k, TILE_W, WORLD_H, scale }) => {
    const w = SSAV.world();
    await w.ensureRight((k + 1) * TILE_W, 120000, k * TILE_W);
    const g = await w.rasterRect(k * TILE_W, 0, TILE_W, WORLD_H, scale);
    const a = g.aux || null, gn = g.width * g.height, an = a ? a.width * a.height * 4 : 0;
    const buf = new Uint8Array(20 + gn + an);
    new Uint32Array(buf.buffer, 0, 5).set([0x31425353, g.width, g.height, a ? a.width : 0, a ? a.height : 0]);
    buf.set(g.data, 20); if (a) buf.set(a.data, 20 + gn);
    const gz = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let s = ''; for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
    return { b64: btoa(s), hash: g.hash, w: g.width, h: g.height };
  }, { k, TILE_W, WORLD_H, scale });
  const b = Buffer.from(r.b64, 'base64');
  fs.writeFileSync(path.join(dir, k + '.bin.gz'), b);
  tiles[k] = r.hash; bytes += b.length;
  process.stdout.write(`\r  tile ${k} (${r.w} x ${r.h}) ${(bytes / 1e6).toFixed(1)} MB`);
}
await browser.close();
const index = { key: info.key, world, seed, opts: info.opts, scale, height, k0, k1, tiles, bytes, made: new Date().toISOString() };
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1));
console.log(`\n${k1 - k0 + 1} tiles, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// precache.json: the runtime files (tracked) plus every baked tile on disk
const tracked = execFileSync('git', ['ls-files', 'index.html', 'output.html', 'manifest.webmanifest', 'icon.svg', 'palettes.json', 'src', 'fonts', 'vendor', 'data/nashua'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const baked = [];
if (fs.existsSync(OUT)) for (const d of fs.readdirSync(OUT)) for (const f of fs.readdirSync(path.join(OUT, d))) baked.push(path.relative(ROOT, path.join(OUT, d, f)).split(path.sep).join('/'));
fs.writeFileSync(path.join(ROOT, 'precache.json'), JSON.stringify({ made: index.made, files: [...tracked, ...baked] }, null, 1));
console.log('precache.json:', tracked.length, 'runtime files and', baked.length, 'baked files');
