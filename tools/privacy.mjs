// Privacy gate: no personal names, personal email, school or course ids, or local user paths in anything that
// can go public. Zero hits or no push.
//   node tools/privacy.mjs              every tracked and untracked (not ignored) file in the repo
//   node tools/privacy.mjs <folder>     every file under a folder (a built preview, a pages tree)
// Text files are grepped whole. PNG and JPEG files are checked in their text chunks and metadata segments only,
// since compressed bytes match short words by chance. Third-party license headers in vendor/ are listed, not failed.
// The pattern is assembled from pieces so this file never matches itself.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = [['man', 'riquez'], ['mar', 'ko'], ['kih', 'ara'], ['mman', 'riquez'], ['gmail', '\\.com'], ['harv', 'ard'], ['\\bg', 'sd\\b'], ['stu ?', '1211'], ['c3-', 'e[0-9]'], ['C:\\\\\\\\', 'Users'], ['C:\\\\', 'Users']];
export const PRIVACY = new RegExp(P.map(p => p.join('')).join('|'), 'i');

const IMG = /\.(png|jpe?g)$/i, BIN = /\.(woff2?|ico|bin|pdf|gif|webp|mp4|webm|npz|tif)$/i;

function pngText(buf) {
  const out = [];
  let i = 8;
  while (i + 8 <= buf.length) {
    const n = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8);
    if (/^(tEXt|iTXt|zTXt|eXIf)$/.test(type)) out.push(buf.toString('latin1', i + 8, i + 8 + n));
    i += 12 + n;
    if (type === 'IEND') break;
  }
  return out.join('\n');
}
function jpegText(buf) {
  const out = [];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xFF) {
    const m = buf[i + 1], n = buf.readUInt16BE(i + 2);
    if (m === 0xDA) break;                                   // start of scan: image data follows
    if ((m >= 0xE0 && m <= 0xEF) || m === 0xFE) out.push(buf.toString('latin1', i + 4, i + 2 + n));
    i += 2 + n;
  }
  return out.join('\n');
}
export function scanFile(abs, rel) {
  const hits = [];
  if (BIN.test(abs)) return hits;
  const buf = fs.readFileSync(abs);
  const txt = IMG.test(abs) ? (/\.png$/i.test(abs) ? pngText(buf) : jpegText(buf)) : buf.toString('utf8');
  txt.split('\n').forEach((l, k) => { const m = PRIVACY.exec(l); if (m) hits.push(`${rel}:${k + 1}: ${m[0]}`); });
  return hits;
}
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules') walk(p, base, out); }
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const files = dir ? walk(dir) : execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const base = dir || ROOT;
  const hits = [], vendor = [];
  for (const f of files) {
    if (!fs.existsSync(path.join(base, f))) continue;
    const h = scanFile(path.join(base, f), f);
    if (/(^|\/)(vendor|upstream|node_modules)\//.test(f)) vendor.push(...h); else hits.push(...h);
  }
  console.log('privacy grep:', files.length, 'files in', dir || 'the repo', ',', hits.length, 'hits,', vendor.length, 'in third-party headers (exempt)');
  if (hits.length) { console.log(hits.join('\n')); process.exit(1); }
}
