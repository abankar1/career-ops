// tests/rejection-latency-placeholder-rows.test.mjs — an Interview-state
// application with a placeholder employer must not vanish from the latency
// signal without a word (#1596 for the marker, #3410's neighbourhood).
//
// companyKey() strips everything that is not a letter or a digit, so `?` — the
// documented marker for an undisclosed end employer — normalizes to the empty
// string, and parseTrackerInterviewRows' `if (!key) continue` discarded the row.
// The `—`/`-` no-data sentinels went the same way.
//
// This is the wrong blind spot for this particular check to have. It exists to
// flag applications that have gone quiet, and agency-brokered roles — the ones
// carrying `?` plus a via= field — are where the candidate has the least
// visibility and ghosting is most common. A report that omits them silently
// reads as "nothing is overdue", not "I did not look at these".
//
// Two sibling readers of the same two files, reply-matcher.mjs and
// process-quality.mjs, each already recognised placeholders explicitly. This
// one had neither copy, which is why lib/placeholder-cell.mjs now holds the
// single definition all three import.
//
// Run:  node --test tests/rejection-latency-placeholder-rows.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const { placeholderInterviewRows, parseTrackerInterviewRows } =
  await import(pathToFileURL(join(ROOT, 'rejection-latency.mjs')).href);

// One named employer and three that name nothing: the `?` of #1596 and both
// no-data sentinels. All four are in Interview state.
const TRACKER = [
  '# Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|---|---|---|---|---|---|---|---|',
  '| 1 | 2026-01-05 | Acme | Backend Engineer | 4.2/5 | Interview | ✅ | [1](r1.md) | n |',
  '| 2 | 2026-01-06 | ? | Staff Engineer | 4.5/5 | Interview | ✅ | [2](r2.md) | via=Hays |',
  '| 3 | 2026-01-07 | — | ML Lead | 4.1/5 | Interview | ✅ | [3](r3.md) | n |',
  '| 4 | 2026-01-08 | - | Platform Lead | 4.0/5 | Interview | ✅ | [4](r4.md) | n |',
  '| 5 | 2026-01-09 | Globex | SRE | 4.3/5 | Applied | ✅ | [5](r5.md) | not interviewing |',
  '',
].join('\n');

test('placeholder employers are reported, not silently dropped', () => {
  const excluded = placeholderInterviewRows(TRACKER);
  assert.equal(excluded.length, 3, `expected the ?/—/- rows to be reported, got ${JSON.stringify(excluded.map(r => r.company))}`);
  assert.deepEqual(excluded.map(r => r.num).sort((a, b) => a - b), [2, 3, 4]);
});

test('only Interview-state rows count — this signal is about interview silence', () => {
  // Row 5 is Applied with a real company; a placeholder in some other state is
  // not something this check would have looked at anyway, so counting it would
  // overstate the gap.
  const applied = TRACKER.replace(
    '| 2 | 2026-01-06 | ? | Staff Engineer | 4.5/5 | Interview |',
    '| 2 | 2026-01-06 | ? | Staff Engineer | 4.5/5 | Applied |',
  );
  assert.equal(placeholderInterviewRows(applied).length, 2, 'a non-Interview placeholder row was counted');
});

test('named companies are untouched by the placeholder path', () => {
  // Guard: the fix must not start excluding real employers. Acme still groups.
  const byCompany = parseTrackerInterviewRows(TRACKER);
  assert.ok(byCompany.has('acme'), 'the named company stopped being grouped');
  assert.equal(byCompany.size, 1, `a placeholder leaked into company grouping: ${[...byCompany.keys()].join(',')}`);
});

test('an empty or malformed tracker returns nothing rather than throwing', () => {
  assert.deepEqual(placeholderInterviewRows(''), []);
  assert.deepEqual(placeholderInterviewRows(null), []);
  assert.deepEqual(placeholderInterviewRows('not a table at all'), []);
});

test('the CLI states the gap in its warnings and metadata', () => {
  // End to end, because the value of this fix is entirely in the user being
  // told. A count that never reaches the report is the same silence.
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-rejlat-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'applications.md'), TRACKER);
    writeFileSync(join(dir, 'data', 'active-interviews.md'), [
      '| Company | Role | Date | Round | Notes |',
      '|---|---|---|---|---|',
      '| Acme | Backend Engineer | 2026-01-20 | 2 | n |',
      '',
    ].join('\n'));
    const r = spawnSync(process.execPath, [join(ROOT, 'rejection-latency.mjs'), '--today', '2026-06-01'], {
      cwd: ROOT, encoding: 'utf-8', timeout: 30_000,
      env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_DATA_DIR: '' },
    });
    assert.equal(r.error, undefined, `spawn failed: ${r.error?.message}`);
    const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    assert.equal(
      out.metadata?.placeholderApplicationsExcluded,
      3,
      `the report does not say how many applications it could not see: ${JSON.stringify(out.metadata)}`,
    );
    assert.ok(
      (out.warnings || []).some((w) => /placeholder/i.test(w) && /#2/.test(w)),
      `no warning named the excluded rows: ${JSON.stringify(out.warnings)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});
