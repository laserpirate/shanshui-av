// Publish the preview at <site>/next/ without touching main or the site root.
// The Pages branch `pages-preview` is built with git plumbing (no checkout): its root is origin/main's tree, byte for
// byte, and next/ is this branch's committed tree with ?v=<sha> stamped on the two entry modules. Each deploy is a
// new commit on top of the last one, so the push is always a fast-forward (never a force push).
//   node tools/deploy-next.mjs [--dry] [--check-live] [--site=https://laserpirate.github.io/shanshui-av/]
//   --dry         build the commit and print it, push nothing
//   --check-live  hash every root file on the live site against origin/main (before and after the push)
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
  git(['read-tree', '--prefix=next/', 'HEAD'], { env });
  for (const [file, entry] of [['index.html', 'src/app.js'], ['output.html', 'src/output.js']]) {
    const src = git(['show', 'HEAD:' + file]);
    const tag = `src="${entry}"`, n = src.split(tag).length - 1;
    if (n !== 1) die(`${file}: expected one ${tag}, found ${n}`);
    const stamped = src.replace(tag, `src="${entry}?v=${short}"`);
    const blob = git(['hash-object', '-w', '--stdin'], { input: stamped }).trim();
    git(['update-index', '--cacheinfo', `100644,${blob},next/${file}`], { env });
  }
  const tree = git(['write-tree'], { env }).trim();
  // the root of the new tree must be origin/main's tree exactly
  const rootNow = out(['ls-tree', tree]).split('\n').filter(l => !/\tnext$/.test(l)).join('\n');
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
