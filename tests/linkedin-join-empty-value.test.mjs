// tests/linkedin-join-empty-value.test.mjs — `--csv ""` and `--company ""` are
// usage errors, as `--csv=` and `--company=` already are.
//
// requireOperand refuses the `=` form and a swallowed flag, but an empty string
// after the flag (a shell variable that expanded to nothing) read as absent:
// `--csv ""` joined data/Connections.csv instead of the export asked for, and
// `--company ""` listed every company instead of one, at exit 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'linkedin-join-empty-value-'));
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
mkdirSync(join(root, 'data'), { recursive: true });

function run(...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CAREER_OPS_')) delete env[key];
  env.CAREER_OPS_ROOT = root;
  const r = spawnSync(process.execPath, [join(ROOT, 'linkedin-join.mjs'), ...args], { cwd: root, encoding: 'utf-8', env, timeout: 60_000 });
  assert.equal(r.error, undefined, describeSpawn(r));
  return r;
}

const csv = join(root, 'export.csv');
writeFileSync(csv, 'First Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Lovelace,https://example.com/in/ada,,Acme,Engineer,01 Jan 2024\n');
// The default export exists, so a `--csv ""` read as absent succeeds on it.
writeFileSync(join(root, 'data', 'Connections.csv'), 'First Name,Last Name,URL,Email Address,Company,Position,Connected On\nGrace,Hopper,https://example.com/in/grace,,Globex,Engineer,01 Jan 2024\n');

test('an empty --csv or --company exits 1 instead of falling back', () => {
  for (const args of [['--csv', ''], ['--csv', csv, '--company', '']]) {
    const r = run('--summary', ...args);
    assert.equal(r.status, 1, `${args.join(' ')}\n${describeSpawn(r)}`);
    assert.match(r.stderr, /--(csv|company) requires a value/);
    assert.doesNotMatch(r.stdout, /warm-intro join/);
  }
});

test('control: a real --csv and --company still run', () => {
  const r = run('--summary', '--csv', csv, '--company', 'Acme');
  assert.equal(r.status, 0, describeSpawn(r));
});
