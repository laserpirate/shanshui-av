// Local static server for offline shows: no internet, no dependencies.
// Adapted from posthuman-vj/serve.mjs (laserpirate/posthuman).
//   node tools/serve.mjs [--port 8080]   ->  http://localhost:8080/
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--port');
const PORT = i > -1 ? Number(process.argv[i + 1]) : 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const p = path.join(ROOT, rel.replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || /[\/\\](node_modules|\.git)([\/\\]|$)/.test(p) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://localhost:${PORT}/  (Ctrl+C to stop)`));
