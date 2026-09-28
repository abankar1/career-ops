// tests/outcome-archive-local-dates.test.mjs — the outcome and archival path
// dates records by the user's calendar, not by UTC's.
//
// lib/local-today.mjs exists because "what day is it" has a wrong answer:
// `new Date().toISOString().slice(0, 10)` is the UTC day, so west of Greenwich
// an evening run answers with TOMORROW. #2765 fixed followup-seed, #2932
// set-status, #3070 the gates. outcome.mjs, archive-posting.mjs and
// application-answers.mjs were not in those sweeps, and outcome.mjs is the worst
// of the three: it writes its journal with the UTC day and, in the same
// invocation, spawns set-status.mjs, which writes data/status-log.tsv with the
// LOCAL day. One event, two records, a day apart.
//
// ── How these assertions avoid the trap that hid the bug ────────────────────
//
// The window where the UTC day and the local day disagree covers only part of
// the UTC day, so a test that reads the wall clock passes for most of the day
// whether the fix is present or not. tests/local-today-gates.test.mjs solves
// that by pinning a frozen instant into a `node -e` child, which works when the
// thing under test is an EXPORT. Two of these three are only reachable through
// their CLI, and freezing a CLI's clock needs either a --import preload (Node
// 18.19+, above this project's `>=18`) or an argv[1]-rewriting launcher, which
// tests/main-guard-convention.test.mjs gates behind a named exemption.
//
// So: run the same command in TWO timezones 25 hours apart. Pacific/Kiritimati
// is UTC+14 and Pacific/Midway is UTC-11, and two local times 25 hours apart
// cannot share a calendar date -- at any instant, on any day of the year. A
// UTC-derived date is identical in both runs; a local one cannot be. The
// assertion therefore discriminates at every hour of the day, with no frozen
// clock and no wall-clock literal to go stale.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { pass, fail, ROOT, NODE } from './helpers.mjs';
import { formatApplicationAnswersSection } from '../application-answers.mjs';

console.log('\noutcome + archival path — dates follow the local calendar');

// 25 hours apart, so never the same calendar day.
const EAST = 'Pacific/Kiritimati';   // UTC+14
const WEST = 'Pacific/Midway';       // UTC-11

/** The calendar day in `tz` right now, computed independently of the code under test. */
function dayIn(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const utcDay = new Date().toISOString().slice(0, 10);

// The premise the whole file rests on, asserted rather than assumed: if these
// two zones ever agreed, every assertion below would pass vacuously.
if (dayIn(EAST) !== dayIn(WEST)) {
  pass(`${EAST} and ${WEST} are on different calendar days (${dayIn(EAST)} vs ${dayIn(WEST)})`);
} else {
  fail(`${EAST} and ${WEST} report the same day — the discriminator is broken, not the code`);
}

const TRACKER = [
  '# Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|------|---------|------|-------|--------|-----|--------|-------|',
  '| 1 | 2026-07-01 | Acme Corp | Senior Backend Engineer | 4.5/5 | Interview | local:output/acme.pdf | local:reports/1-acme.md | Screen passed |',
  '',
].join('\n');

const cleanup = [];

function makeWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'outcome-local-dates-'));
  cleanup.push(dir);
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data', 'applications.md'), TRACKER);
  writeFileSync(join(dir, 'cv.md'), '# Candidate CV\n\nSenior Engineer.\n');
  return dir;
}

/** Record a hire in `tz`, returning the journal's own date and the ledger's. */
function recordHire(tz) {
  const dir = makeWorkspace();
  execFileSync(NODE, [join(ROOT, 'outcome.mjs'), '1', 'hired', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    env: {
      ...process.env,
      TZ: tz,
      CAREER_OPS_ROOT: dir,
      CAREER_OPS_DATA_DIR: '',
      CAREER_OPS_TRACKER: join(dir, 'data', 'applications.md'),
    },
  });

  const outcomesDir = join(dir, 'data', 'outcomes');
  const entryDir = readdirSync(outcomesDir)[0];
  const journal = readFileSync(join(outcomesDir, entryDir, 'outcome.md'), 'utf8');
  const journalDate = (journal.match(/^## Entry: (\d{4}-\d{2}-\d{2})/m) || [])[1] ?? null;

  const ledgerPath = join(dir, 'data', 'status-log.tsv');
  const ledgerDate = existsSync(ledgerPath)
    ? (readFileSync(ledgerPath, 'utf8').trim().split('\n').pop().split('\t')[1] ?? null)
    : null;

  return { journalDate, ledgerDate };
}

// ── outcome.mjs: one event, one date ────────────────────────────────────────
{
  const east = recordHire(EAST);
  const west = recordHire(WEST);

  // The heart of it: the journal and the ledger are written by the same
  // invocation, so they cannot disagree about when the user was hired.
  for (const [tz, r] of [[EAST, east], [WEST, west]]) {
    if (r.journalDate && r.ledgerDate && r.journalDate === r.ledgerDate) {
      pass(`${tz}: the journal and status-log agree on the hire date (${r.journalDate})`);
    } else {
      fail(`${tz}: one invocation wrote two dates — journal ${r.journalDate}, `
        + `status-log ${r.ledgerDate}`);
    }
  }

  // …and each is the day the user was actually living through.
  for (const [tz, r] of [[EAST, east], [WEST, west]]) {
    if (r.journalDate === dayIn(tz)) pass(`${tz}: the journal entry is dated ${dayIn(tz)}, the local day`);
    else fail(`${tz}: journal dated ${r.journalDate}, but the local calendar day is ${dayIn(tz)}`);
  }

  // The discriminator. A UTC-derived date is the same string in both zones.
  if (east.journalDate !== west.journalDate) {
    pass('the journal date moves with the timezone, so it is not the UTC day');
  } else {
    fail(`both zones wrote ${east.journalDate} — that is the UTC day (${utcDay}), not a local one`);
  }
}

// ── archive-posting.mjs: the capture filename ───────────────────────────────
//
// captureFilename() is not exported and archiveUrl() needs a browser, so drive
// today() where it is reachable: --help exits before any browser work, so the
// module's own date helper is exercised by importing it in a child pinned to a
// timezone. This asserts the FUNCTION the filename is built from.
{
  const dateFromModule = (tz) => execFileSync(NODE, [
    '--input-type=module', '-e',
    `import { localToday } from ${JSON.stringify(new URL('../lib/local-today.mjs', import.meta.url).href)};`
    + 'process.stdout.write(localToday());',
  ], { encoding: 'utf8', env: { ...process.env, TZ: tz }, timeout: 30_000 }).trim();

  const east = dateFromModule(EAST);
  const west = dateFromModule(WEST);
  if (east === dayIn(EAST) && west === dayIn(WEST) && east !== west) {
    pass('archive-posting/outcome share localToday(), which tracks the local day in both zones');
  } else {
    fail(`localToday() gave ${east} in ${EAST} and ${west} in ${WEST}; `
      + `expected ${dayIn(EAST)} and ${dayIn(WEST)}`);
  }

  // The capture name must carry that date. Source-level, because the function is
  // module-private: assert it is built from today() and that today() is local.
  const src = readFileSync(join(ROOT, 'archive-posting.mjs'), 'utf8');
  if (/const base = `\$\{today\(\)\}_/.test(src) && /function today\(\)\s*\{\s*return localToday\(\);/.test(src)) {
    pass('the capture filename is built from today(), and today() returns localToday()');
  } else {
    fail('archive-posting.mjs no longer builds the capture name from a local today()');
  }
}

// ── application-answers.mjs: the default date ──────────────────────────────
//
// formatApplicationAnswersSection is exported, so this one is a direct call in a
// child pinned to each zone -- no source reading needed.
{
  const renderedDate = (tz) => {
    const out = execFileSync(NODE, [
      '--input-type=module', '-e',
      `import { formatApplicationAnswersSection } from ${JSON.stringify(new URL('../application-answers.mjs', import.meta.url).href)};`
      + 'process.stdout.write(formatApplicationAnswersSection({ state: "filled" }));',
    ], { encoding: 'utf8', env: { ...process.env, TZ: tz }, timeout: 30_000 });
    return (out.match(/\d{4}-\d{2}-\d{2}/) || [])[0] ?? null;
  };

  const east = renderedDate(EAST);
  const west = renderedDate(WEST);

  for (const [tz, got] of [[EAST, east], [WEST, west]]) {
    if (got === dayIn(tz)) pass(`${tz}: the default answer date is ${dayIn(tz)}, the local day`);
    else fail(`${tz}: default answer date was ${got}, local calendar day is ${dayIn(tz)}`);
  }
  if (east !== west) pass('the default answer date moves with the timezone');
  else fail(`both zones rendered ${east} — the UTC day (${utcDay}), not a local one`);

  // Guard: an explicit date is passed through untouched. The fix changes only
  // what "no date given" resolves to.
  const explicit = formatApplicationAnswersSection({ state: 'filled', date: '2026-01-02' });
  if (explicit.includes('2026-01-02')) pass('an explicit date is still passed through unchanged');
  else fail(`explicit date was rewritten: ${explicit.slice(0, 200)}`);
}

for (const dir of cleanup) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
