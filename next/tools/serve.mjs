// Local static server for offline shows: no internet, no dependencies.
// Adapted from posthuman-vj/serve.mjs (laserpirate/posthuman).
//   node tools/serve.mjs [--port 8080] [--host 0.0.0.0]   ->  http://localhost:8080/
// The default listens on this machine only; --host 0.0.0.0 serves a LAN wall (a closed show network: no auth).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--port');
const PORT = i > -1 ? Number(process.argv[i + 1]) : 8080;
const hi = process.argv.indexOf('--host');
const HOST = hi > -1 ? process.argv[hi + 1] : '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.bin': 'application/octet-stream',
};
const VIDEO = /\.(mp4|m4v|webm|mov)$/i;
http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  // media/ (local videos for the slit-scan source, gitignored, never published) is listed as media/list.json
  if (rel === '/media/list.json') {
    const dir = path.join(ROOT, 'media');
    const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => VIDEO.test(f)).sort() : [];
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(list));
  }
  const p = path.join(ROOT, rel.replace(/\/$/, '/index.html'));
  // inside the folder only; never git, packages or the local source paths (tools/nashua/sources.local.json)
  if (!p.startsWith(ROOT + path.sep) || /[\/\\](node_modules|\.git)([\/\\]|$)|\.local\.json$/i.test(p) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const type = TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', size = fs.statSync(p).size;
  // byte ranges, so a video can seek and loop
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    const a = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    const b = Math.min(m[1] && m[2] ? +m[2] : size - 1, size - 1);
    if (a >= size || a > b) { res.writeHead(416, { 'content-range': 'bytes */' + size }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1, 'cache-control': 'no-store' });
    return fs.createReadStream(p, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, HOST, () => console.log(`serving ${ROOT} at http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}/  (Ctrl+C to stop)`));
