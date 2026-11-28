// tests/sponsor-check-empty-register.test.mjs — `--register ""` is a usage
// error, as `--register=` already is.
//
// requireOperand refuses `--register=` and a swallowed flag, but an empty
// string after the flag (a shell variable that expanded to nothing) read as
// absent, so the default register was checked instead of the file asked for,
// at exit 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'sponsor-check-empty-register-'));
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
mkdirSync(join(root, 'data'), { recursive: true });

function run(...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CAREER_OPS_')) delete env[key];
  env.CAREER_OPS_ROOT = root;
  const r = spawnSync(process.execPath, [join(ROOT, 'sponsor-check.mjs'), ...args], { cwd: root, encoding: 'utf-8', env, timeout: 60_000 });
  assert.equal(r.error, undefined, describeSpawn(r));
  return r;
}

test('--register "" exits 1 instead of checking the default register', () => {
  for (const args of [['--register', ''], ['--register=']]) {
    const r = run('--company', 'Acme', ...args);
    assert.equal(r.status, 1, `${args.join(' ')}\n${describeSpawn(r)}`);
    assert.match(r.stderr, /--register requires a value/);
    assert.doesNotMatch(r.stdout, /"verdict"/);
  }
});
