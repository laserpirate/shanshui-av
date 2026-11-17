// Publish the preview at <site>/next/ without touching main or the site root.
// The Pages branch `pages-preview` is built with git plumbing (no checkout): its root is origin/main's tree, byte for
// byte, and next/ is this branch's committed tree with ?v=<sha> stamped on the two entry modules. Each deploy is a
// new commit on top of the last one, so the push is always a fast-forward (never a force push).
//   node tools/deploy-next.mjs [--dry] [--check-live] [--site=https://laserpirate.github.io/shanshui-av/]
//   --dry         build the commit and print it, push nothing
//   --check-live  hash every root file on the live site against origin/main (before and after the push)
//   --keep=<k>    keep only the last k frozen copies next/p<n>/ (ADDENDUM-D D3; all of them by default)
// Refuses to run when: the worktree is dirty, user.email is not a noreply address, or the privacy grep has hits.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry'), LIVE = args.includes('--check-live');
const SITE = (args.find(a => a.startsWith('--site=')) || '--site=https://laserpirate.github.io/shanshui-av/').slice(7);
const BRANCH = 'pages-preview';
const git = (a, opt = {}) => execFileSync('git', a, { cwd: ROOT, encoding: opt.raw ? 'buffer' : 'utf8', env: { ...process.env, ...(opt.env || {}) }, input: opt.input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] });
const out = a => git(a).trim();
const die = m => { console.error('deploy-next: ' + m); process.exit(1); };

if (out(['status', '--porcelain', '--untracked-files=no'])) die('worktree has uncommitted changes');
const email = out(['config', 'user.email']);
if (!/@users\.noreply\.github\.com$/.test(email)) die('user.email is not a GitHub noreply address');
try { execFileSync('node', [path.join(ROOT, 'tools', 'privacy.mjs')], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { die('privacy grep failed:\n' + (e.stdout || '') + (e.stderr || '')); }

git(['fetch', 'origin', 'main', '--quiet']);
let hasPrev = true;
try { git(['fetch', 'origin', BRANCH, '--quiet']); } catch { hasPrev = false; }
const mainSha = out(['rev-parse', 'origin/main']);
const headSha = out(['rev-parse', 'HEAD']);
const short = headSha.slice(0, 7);

// root files and their bytes, from origin/main
const rootFiles = out(['ls-tree', '-r', '--format=%(objectname) %(path)', 'origin/main']).split('\n').map(l => { const i = l.indexOf(' '); return { blob: l.slice(0, i), path: l.slice(i + 1) }; });
async function checkLive(tag) {
  let ok = 0, bad = [];
  for (const f of rootFiles) {
    const want = crypto.createHash('sha256').update(git(['cat-file', 'blob', f.blob], { raw: true })).digest('hex');
    const r = await fetch(SITE + f.path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
    const got = r.ok ? crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex') : 'HTTP ' + r.status;
    if (got === want) ok++; else bad.push(f.path + ' ' + got.slice(0, 12));
  }
  console.log(`live root ${tag}: ${ok}/${rootFiles.length} files byte-identical to origin/main ${mainSha.slice(0, 7)}` + (bad.length ? '\n  differ: ' + bad.slice(0, 20).join('\n  ') : ''));
  return bad.length;
}
if (LIVE) await checkLive('before');

// build the tree in a private index
const idx = path.join(os.tmpdir(), 'deploy-next-' + process.pid + '.index');
const env = { GIT_INDEX_FILE: idx };
try {
  git(['read-tree', 'origin/main'], { env });
  // a copy of commit `rev` at `prefix`, with ?v=<its sha> stamped on the two entry modules
  const place = (prefix, rev) => {
    const sha = out(['rev-parse', rev + '^{commit}']).slice(0, 7);
    git(['read-tree', '--prefix=' + prefix, rev], { env });
    for (const [file, entry] of [['index.html', 'src/app.js'], ['output.html', 'src/output.js']]) {
      const src = git(['show', rev + ':' + file]);
      const tag = `src="${entry}"`, n = src.split(tag).length - 1;
      if (n !== 1) die(`${rev} ${file}: expected one ${tag}, found ${n}`);
      const stamped = src.replace(tag, `src="${entry}?v=${sha}"`);
      const blob = git(['hash-object', '-w', '--stdin'], { input: stamped }).trim();
      git(['update-index', '--cacheinfo', `100644,${blob},${prefix}${file}`], { env });
    }
    return sha;
  };
  place('next/', 'HEAD');
  // ADDENDUM-D D3: every version from .p9 on stays viewable on its own at next/p<n>/, frozen at its tag, beside the
  // moving next/. --keep=<k> keeps only the last k (used when the site nears the Pages size limit).
  git(['fetch', 'origin', '--tags', '--quiet']);
  const KEEP = +((args.find(a => a.startsWith('--keep=')) || '').slice(7) || 0);
  // a fix to a tagged phase is a patch tag (.p10.1), frozen beside it at next/p10.1/; tags never move
  let frozen = out(['tag', '--list', 'shanshui-av-v0.4.0-nashua.p*']).split('\n').map(t => { const m = /\.p(\d+)(?:\.(\d+))?$/.exec(t) || []; return [t, m[2] ? `${m[1]}.${m[2]}` : m[1], +m[1], +(m[2] || 0)]; })
    .filter(([, , n]) => n >= 9).sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  if (KEEP > 0) frozen = frozen.slice(-KEEP);
  for (const [t, n] of frozen) console.log(`frozen next/p${n}/ = ${t} ${place(`next/p${n}/`, t)}`);
  const tree = git(['write-tree'], { env }).trim();
  // the published size (every blob once): GitHub Pages sites are limited to 1 GB
  const seen = new Set(); let bytes = 0;
  for (const l of out(['ls-tree', '-r', '-l', tree]).split('\n')) { const m = /^\S+ blob (\S+)\s+(\d+)\t/.exec(l); if (m && !seen.has(m[1])) { seen.add(m[1]); bytes += +m[2]; } }
  console.log(`site size ${(bytes / 1048576).toFixed(1)} MB (unique blobs; Pages limit 1024 MB)` + (bytes > 800 * 1048576 ? ' NEAR THE LIMIT: deploy again with --keep=3' : ''));
  // the root of the new tree must be origin/main's tree exactly
  const rootNow = out(['ls-tree', tree]).split('\n').filter(l => !/\tnext$/.test(l)).join('\n');
  // next/ itself must be HEAD's tree plus the frozen copies and the two stamped entries (nothing else)
  for (const l of out(['ls-tree', tree + ':next']).split('\n')) { const nm = l.split('\t')[1]; if (/^p\d+(\.\d+)?$/.test(nm) && !frozen.some(([, n]) => 'p' + n === nm)) die('next/' + nm + ' is not a frozen tag'); }
  const rootMain = out(['ls-tree', 'origin/main']);
  if (rootNow !== rootMain) die('root of the preview tree differs from origin/main');
  const parents = hasPrev ? ['-p', 'origin/' + BRANCH] : [];
  if (hasPrev && out(['rev-parse', 'origin/' + BRANCH + '^{tree}']) === tree) { console.log('nothing to deploy: ' + BRANCH + ' already has this tree'); process.exit(0); }
  const msg = `preview: next/ = feat/nashua ${short}, root = main ${mainSha.slice(0, 7)}\n\nBuilt by tools/deploy-next.mjs. The root is origin/main's tree unchanged.`;
  const commit = git(['commit-tree', tree, ...parents, '-m', msg]).trim();
  console.log(`built ${commit.slice(0, 7)} (tree ${tree.slice(0, 7)}): root = main ${mainSha.slice(0, 7)}, next/ = ${short}`);
  if (DRY) process.exit(0);
  git(['push', 'origin', `${commit}:refs/heads/${BRANCH}`]);
  console.log(`pushed ${BRANCH} -> ${commit.slice(0, 7)}`);
} finally { try { fs.unlinkSync(idx); } catch {} }
