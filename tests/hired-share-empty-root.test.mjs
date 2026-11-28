// tests/hired-share-empty-root.test.mjs — `--root ""` is a usage error, as
// `--root=` already is.
//
// requireOperand refuses `--root=` and a swallowed flag, but an empty string
// after the flag (a shell variable that expanded to nothing) read as absent,
// so the configured data root's tracker was read, and `--mark` wrote that
// root's share state, instead of the workspace asked for.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'hired-share-empty-root-'));
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
mkdirSync(join(root, 'data'), { recursive: true });

function run(...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CAREER_OPS_')) delete env[key];
  env.CAREER_OPS_ROOT = root;
  const r = spawnSync(process.execPath, [join(ROOT, 'hired-share.mjs'), ...args], { cwd: root, encoding: 'utf-8', env, timeout: 60_000 });
  assert.equal(r.error, undefined, describeSpawn(r));
  return r;
}

test('--root "" exits 1 instead of reading the configured data root', () => {
  for (const args of [['--root', ''], ['--root=']]) {
    const r = run('--status', ...args);
    assert.equal(r.status, 1, `${args.join(' ')}\n${describeSpawn(r)}`);
    assert.match(r.stderr, /--root requires a value/);
    assert.doesNotMatch(r.stdout, /"hires"/);
  }
});

test('control: an explicit --root still reports its hires', () => {
  const r = run('--status', '--root', root);
  assert.equal(r.status, 0, describeSpawn(r));
  assert.match(r.stdout, /"hires"/);
});
