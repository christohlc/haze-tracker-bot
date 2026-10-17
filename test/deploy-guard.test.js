import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('../scripts/deploy-guard.mjs', import.meta.url));
const run = (cwd) => spawnSync(process.execPath, [guard], { cwd, encoding: 'utf8', env: { ...process.env, DEPLOY_FORCE: '' } });

// A checkout inside a folder that has `.tgcloud/`, as a worktree under .claude/worktrees/ is.
test('refuses unless .tgcloud/ is in the checkout being deployed', (t) => {
  const outer = mkdtempSync(path.join(tmpdir(), 'deploy-guard-'));
  t.after(() => rmSync(outer, { recursive: true, force: true }));
  const repo = path.join(outer, 'worktree');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args]);
  git('init', '--quiet', '--initial-branch', 'feature');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'x');

  let r = run(repo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no \.tgcloud\//);

  mkdirSync(path.join(outer, '.tgcloud'));
  r = run(repo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /tgcloud would deploy .*, not this checkout/);

  mkdirSync(path.join(repo, '.tgcloud'));
  r = run(repo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /on branch 'feature', not main/);
});
