import { cpSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadGallery } from '../engine/state.js';

const REPO = 'token-art';
const OWNER = 'RShuken';

export function exportSite(root) {
  const dist = join(root, 'dist');
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  // gallery/* at dist root, engine/ preserved
  cpSync(join(root, 'gallery'), dist, { recursive: true });
  cpSync(join(root, 'engine'), join(dist, 'engine'), { recursive: true });
  const gallery = loadGallery(join(root, 'state'));
  writeFileSync(join(dist, 'gallery.json'), JSON.stringify(gallery));
  writeFileSync(join(dist, '.nojekyll'), '');

  // Rewrite engine import paths in dist/app.js and dist/live.js:
  // gallery/* files use `../engine/` but from the dist root (flat layout)
  // the engine is at `./engine/`, so fix the copied files.
  for (const fname of ['app.js', 'live.js']) {
    const fpath = join(dist, fname);
    try {
      const src = readFileSync(fpath, 'utf8');
      const rewritten = src.replaceAll('../engine/', './engine/');
      writeFileSync(fpath, rewritten);
    } catch {
      // file may not exist (e.g. live.js is optional in some setups)
    }
  }

  return dist;
}

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function deploySite(dist) {
  // ensure repo exists
  try { sh('gh', ['repo', 'view', `${OWNER}/${REPO}`]); }
  catch { sh('gh', ['repo', 'create', `${OWNER}/${REPO}`, '--public', '-d', 'Token Art generative gallery']); }
  // publish dist to gh-pages branch via a throwaway git repo
  const tmp = join(dist, '.git');
  rmSync(tmp, { recursive: true, force: true });
  sh('git', ['init', '-q'], dist);
  sh('git', ['checkout', '-q', '-b', 'gh-pages'], dist);
  sh('git', ['add', '-A'], dist);
  sh('git', ['-c', 'user.name=Token Art', '-c', 'user.email=bot@tokenart.local', 'commit', '-q', '-m', 'publish'], dist);
  sh('git', ['remote', 'add', 'origin', `https://github.com/${OWNER}/${REPO}.git`], dist);
  sh('git', ['push', '-q', '-f', 'origin', 'gh-pages'], dist);
  // enable pages (ignore error if already enabled)
  try { sh('gh', ['api', '-X', 'POST', `repos/${OWNER}/${REPO}/pages`, '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/']); } catch {}
  return { ok: true, url: `https://${OWNER.toLowerCase()}.github.io/${REPO}/` };
}
