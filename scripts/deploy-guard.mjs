// Run by `npm run deploy` before the build. `tgcloud push` uploads whatever is on disk, and
// sessions switch branches in the linked folder, so refuse unless this is a clean main level
// with origin/main. Emergency override: DEPLOY_FORCE=1 npm run deploy (not `-- --force`,
// which npm hands to `tgcloud push`, where it skips the concurrency check).
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function refusal() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') return branch === 'HEAD' ? 'detached HEAD, not main' : `on branch '${branch}', not main`;
  if (git('status', '--porcelain')) return 'uncommitted or untracked changes';
  try {
    git('fetch', '--quiet', 'origin', 'main');
  } catch {
    return 'could not fetch origin/main';
  }
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) return 'not level with origin/main';
  return null;
}

let why;
try {
  why = refusal();
} catch (e) {
  why = `git failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`;
}
if (why && process.env.DEPLOY_FORCE === '1') {
  console.warn(`deploy-guard: ${why}; deploying anyway (DEPLOY_FORCE=1)`);
} else if (why) {
  console.error(`deploy-guard: refusing to deploy: ${why} (DEPLOY_FORCE=1 to override)`);
  process.exit(1);
}
