// sync-batch-input.mjs parsed argv by hand. A mistyped --dryrun was ignored, so
// the run wrote for real, and --input=path was never seen, so rows went to the
// default batch/batch-input.tsv instead of the file the caller named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn, exitedNonZero } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OVERRIDES = ['CAREER_OPS_DATA_DIR', 'CAREER_OPS_TRACKER', 'CAREER_OPS_PIPELINE', 'CAREER_OPS_SCAN_HISTORY', 'CAREER_OPS_PORTALS', 'CAREER_OPS_PROFILE', 'CAREER_OPS_FOLLOWUPS', 'CAREER_OPS_REPORTS', 'CAREER_OPS_CV', 'CAREER_OPS_JDS', 'CAREER_OPS_ADDITIONS'];

function withPipeline(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sync-batch-flags-'));
  try {
    const pipeline = join(root, 'pipeline.md');
    writeFileSync(pipeline, '# Pipeline\n\n## Pending\n\n- [ ] https://jobs.example.com/acme/1 | Acme | Engineer\n');
    const env = { ...process.env, CAREER_OPS_ROOT: root };
    for (const key of OVERRIDES) env[key] = '';
    const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'sync-batch-input.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 30000, env });
    fn({ root, pipeline, run });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a mistyped --dry-run is refused and writes nothing', () => {
  withPipeline(({ root, pipeline, run }) => {
    const input = join(root, 'input.tsv');
    const result = run('--dryrun', `--pipeline=${pipeline}`, `--input=${input}`, `--state=${join(root, 'state.tsv')}`);
    assert.ok(exitedNonZero(result), describeSpawn(result, 'expected a non-zero exit'));
    assert.match(result.stderr, /--dryrun/);
    assert.equal(existsSync(input), false, 'a mistyped --dry-run wrote the input file');
  });
});

test('--input=path writes to that file, the same as --input path', () => {
  withPipeline(({ root, pipeline, run }) => {
    const spaced = join(root, 'spaced.tsv');
    const equals = join(root, 'equals.tsv');
    const state = join(root, 'state.tsv');
    assert.equal(run('--pipeline', pipeline, '--input', spaced, '--state', state).status, 0);
    const result = run(`--pipeline=${pipeline}`, `--input=${equals}`, `--state=${state}`);
    assert.equal(result.status, 0, describeSpawn(result));
    assert.ok(existsSync(equals), `--input=path was ignored:\n${result.stdout}`);
    assert.equal(readFileSync(equals, 'utf8'), readFileSync(spaced, 'utf8'));
  });
});

test('--help prints usage and exits 0', () => {
  withPipeline(({ run }) => {
    const result = run('--help');
    assert.equal(result.status, 0, describeSpawn(result));
    assert.match(result.stdout, /Usage: node sync-batch-input\.mjs/);
  });
});
