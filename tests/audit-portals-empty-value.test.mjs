// tests/audit-portals-empty-value.test.mjs — an empty --file, --company or
// --baseline is a usage error, as the `=` form already is.
//
// requireOperand refuses `--file=` and a swallowed flag, but an empty string
// after the flag (a shell variable that expanded to nothing) read as absent:
// `--file ""` audited the default portals.yml, `--company ""` audited every
// board, and `--baseline ""` skipped the comparison, all at exit 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'audit-portals-empty-value-'));
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
mkdirSync(join(root, 'data'), { recursive: true });

function run(...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CAREER_OPS_')) delete env[key];
  env.CAREER_OPS_ROOT = root;
  const r = spawnSync(process.execPath, [join(ROOT, 'audit-portals.mjs'), ...args], { cwd: root, encoding: 'utf-8', env, timeout: 60_000 });
  assert.equal(r.error, undefined, describeSpawn(r));
  return r;
}

// No tracked companies, so nothing is fetched.
writeFileSync(join(root, 'portals.yml'), 'tracked_companies: []\n');

test('an empty --file, --company or --baseline exits 1', () => {
  for (const flag of ['--file', '--company', '--baseline']) {
    const r = run('--summary', flag, '');
    assert.equal(r.status, 1, `${flag} ""\n${describeSpawn(r)}`);
    assert.match(r.stderr, new RegExp(`${flag} requires a value`));
  }
});

test('control: the default portals.yml is still audited without the flags', () => {
  const r = run('--summary');
  assert.equal(r.status, 0, describeSpawn(r));
});
