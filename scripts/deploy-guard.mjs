// Run by `npm run deploy` before the build. `tgcloud push` uploads whatever is on disk, and
// several sessions switch branches in the same folder, so refuse unless this is a clean main
// that matches origin/main. Emergency override: DEPLOY_FORCE=1 npm run deploy
// (not `-- --force`: npm would hand that to `tgcloud push`, where it skips the concurrency check).
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function reason() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') return `on branch '${branch}', not main`;
  if (git('status', '--porcelain')) return 'uncommitted or untracked changes';
  try {
    git('fetch', '--quiet', 'origin', 'main');
  } catch {
    return 'could not fetch origin/main';
  }
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) return 'not level with origin/main';
  return null;
}

const why = reason();
if (why && process.env.DEPLOY_FORCE === '1') {
  console.warn(`deploy-guard: ${why}; deploying anyway (DEPLOY_FORCE=1)`);
} else if (why) {
  console.error(`deploy-guard: refusing to deploy: ${why} (DEPLOY_FORCE=1 to override)`);
  process.exit(1);
}
