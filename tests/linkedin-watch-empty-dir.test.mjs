// tests/linkedin-watch-empty-dir.test.mjs — `--dir ""` is a usage error, as
// `--dir=` already is.
//
// requireOperand refuses `--dir=` and a swallowed flag, but an empty string
// after the flag (a shell variable that expanded to nothing) read as absent,
// so the import ran on data/linkedin-alerts instead of the folder asked for,
// and with that folder missing it exited 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'linkedin-watch-empty-dir-'));
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
mkdirSync(join(root, 'data'), { recursive: true });

function run(...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CAREER_OPS_')) delete env[key];
  env.CAREER_OPS_ROOT = root;
  const r = spawnSync(process.execPath, [join(ROOT, 'linkedin-watch.mjs'), ...args], { cwd: root, encoding: 'utf-8', env, timeout: 60_000 });
  assert.equal(r.error, undefined, describeSpawn(r));
  return r;
}

test('--dir "" exits 1 instead of reading the default alert folder', () => {
  for (const args of [['--dir', ''], ['--dir=']]) {
    const r = run('--dry-run', ...args);
    assert.equal(r.status, 1, `${args.join(' ')}\n${describeSpawn(r)}`);
    assert.match(r.stderr, /--dir requires a value/);
    assert.doesNotMatch(r.stdout, /No alert folder/);
  }
});

test('control: without --dir, a missing default folder still exits 0', () => {
  const r = run('--dry-run');
  assert.equal(r.status, 0, describeSpawn(r));
  assert.match(r.stdout, /No alert folder/);
});
