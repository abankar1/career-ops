// tests/reply-watch-data-root.test.mjs — the reply-watch pair reads and writes the
// USER's data directory, not the directory the scripts live in.
//
// reply-watch.mjs resolved three user-layer paths against __dirname: the tracker,
// data/follow-ups.md, and data/reply-candidates.json. DATA_CONTRACT.md resolves
// the user layer through CAREER_OPS_ROOT / CAREER_OPS_DATA_DIR / a
// .career-ops-data marker, and none of those reached this script.
//
// It failed SILENTLY, which is why it needs tests rather than a bug report: an
// empty tracker is a legal state, and the classifier runs off the email alone, so
// the digest still printed a type, evidence and a suggested status. Only the match
// to an application was missing -- the one thing the tracker is consulted for.
//
// paste-reply.mjs shared the defect, and its header said so ("next to this
// script, matching reply-watch.mjs's default"). The two agreed with each other,
// which is what made the pair look correct, so both legs are asserted here: a fix
// to one alone splits the documented handoff.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { pass, fail, warn, ROOT, NODE } from './helpers.mjs';

console.log('\nreply-watch + paste-reply — user-layer paths follow the data root');

const TRACKER = [
  '# Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|------|---------|------|-------|--------|-----|--------|-------|',
  '| 1 | 2026-09-01 | Acme Corp | Senior Backend Engineer | 4.5/5 | Applied | ✅ | [1](reports/001-acme.md) | Applied online |',
  '',
].join('\n');

const CANDIDATE = [{
  message_id: 'm1',
  subject: 'Your application to Acme Corp',
  from: 'recruiting@acmecorp.com',
  body_snippet: 'We would like to schedule an interview with you.',
  date: '2026-09-20',
}];

// The shape reply-watch.mjs's own loadFollowups() parses, not the one
// data/follow-ups.md shows a human. It reads positionally and REQUIRES
// `parts[2]` to be an integer application number:
//
//     num | appNum | date | company | role | channel | contact | notes
//
// The first version of this fixture put the company in that column, so
// `parseInt('Acme Corp')` was NaN and every row was skipped — the file was
// written to the data root and then parsed into nothing, which made the
// follow-up leg of this suite assert about an empty list.
const FOLLOWUPS = [
  '# Follow-ups',
  '',
  '| # | App | Date | Company | Role | Channel | Contact | Notes |',
  '|---|-----|------|---------|------|---------|---------|-------|',
  '| 1 | 1 | 2026-09-08 | Acme Corp | Senior Backend Engineer | Email | recruiting@acmecorp.com | seeded |',
  '',
].join('\n');

const cleanup = [];

/** A data root laid out the way a user with CAREER_OPS_ROOT set has one. */
function makeDataRoot({ withCandidates = true, withFollowups = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reply-watch-root-'));
  cleanup.push(dir);
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data', 'applications.md'), TRACKER);
  if (withCandidates) {
    writeFileSync(join(dir, 'data', 'reply-candidates.json'), JSON.stringify(CANDIDATE, null, 2));
  }
  if (withFollowups) writeFileSync(join(dir, 'data', 'follow-ups.md'), FOLLOWUPS);
  return dir;
}

// CAREER_OPS_TRACKER is cleared deliberately: it outranks the resolved root
// (DATA_CONTRACT.md), so leaving a developer's own export in place would both
// mask the bug and point these scripts at their real tracker (#3988). Clearing it
// is also what makes the assertion meaningful -- the point is that the ROOT
// variables work on their own.
function env(root, extra = {}) {
  return {
    ...process.env,
    CAREER_OPS_ROOT: root,
    CAREER_OPS_DATA_DIR: '',
    CAREER_OPS_TRACKER: '',
    CAREER_OPS_REPLY_CANDIDATES: '',
    ...extra,
  };
}

// The checkout's own ledger. Only ever probed with existsSync — never read,
// never written, never restored. A suite must not touch a developer's data even
// to prove that the code under test does not.
const REPO_LEDGER = join(ROOT, 'data', 'reply-candidates.json');
function runScript(script, args, environment) {
  try {
    return {
      code: 0,
      stdout: execFileSync(NODE, [join(ROOT, script), ...args], {
        env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
      }),
      stderr: '',
    };
  } catch (err) {
    return { code: err.status ?? 1, stdout: String(err.stdout || ''), stderr: String(err.stderr || '') };
  }
}

// ── the tracker: a matched reply names the ROW, not the email ───────────────
{
  const dir = makeDataRoot();
  const r = runScript('reply-watch.mjs', [], env(dir));

  // The discriminator. Unmatched, reply-watch falls back to the email's subject
  // for the header; matched, it prints "{company} — {role}" from the tracker row.
  // Both render a digest, which is why the old behaviour looked like success.
  if (r.stdout.includes('Acme Corp — Senior Backend Engineer')) {
    pass('a reply is matched to its tracker row with CAREER_OPS_ROOT alone');
  } else {
    fail('reply not matched to the tracker row — reply-watch read a tracker that '
      + `is not the user's. Digest said: ${JSON.stringify(r.stdout.slice(0, 220))}`);
  }

  // Guard: the classifier itself is unaffected by the path fix; it reads the
  // email. If this ever fails alongside the assertion above, the cause is the
  // classifier, not the root.
  if (/Type: Interview/.test(r.stdout)) pass('classification still comes from the email (Interview)');
  else fail(`classification changed: ${r.stdout.slice(0, 220)}`);
}

// ── CAREER_OPS_DATA_DIR, the sibling variable ──────────────────────────────
//
// Its own leg: resolveTrackerPath consults CAREER_OPS_TRACKER before the root it
// is handed, so a suite that set only that variable would pass with the bug
// intact. Each root mechanism is exercised on its own.
{
  const dir = makeDataRoot();
  const r = runScript('reply-watch.mjs', [], {
    ...process.env,
    CAREER_OPS_ROOT: '',
    CAREER_OPS_DATA_DIR: dir,
    CAREER_OPS_TRACKER: '',
    CAREER_OPS_REPLY_CANDIDATES: '',
  });
  if (r.stdout.includes('Acme Corp — Senior Backend Engineer')) {
    pass('CAREER_OPS_DATA_DIR resolves the tracker too');
  } else {
    fail(`CAREER_OPS_DATA_DIR did not reach reply-watch: ${JSON.stringify(r.stdout.slice(0, 220))}`);
  }
}

// ── the .career-ops-data marker, the third mechanism ───────────────────────
//
// Deliberately NOT exercised here. The marker is read from the repository root,
// so testing it means writing a file into the checkout the suite is running from
// — the hazard tests/stats.test.mjs has to work around for its own live-file
// assertions. The two env legs above cover the same resolver; the marker is
// path-resolver.mjs's own contract and is tested there.

// ── the candidates ledger: written and read in the same place ──────────────
{
  const dir = makeDataRoot({ withCandidates: false });
  writeFileSync(join(dir, 'mail.txt'),
    'Subject: Interview at Acme Corp\nFrom: recruiting@acmecorp.com\n\nWe would like to schedule an interview.\n');

  const repoLedgerExisted = existsSync(REPO_LEDGER);
  const pasted = runScript('paste-reply.mjs', ['--file', join(dir, 'mail.txt')], env(dir));
  if (pasted.code === 0) pass('paste-reply accepts a pasted reply');
  else fail(`paste-reply failed: ${pasted.stderr.slice(0, 200)}`);

  const ledger = join(dir, 'data', 'reply-candidates.json');
  if (existsSync(ledger)) pass('the ledger is written under the data root');
  else fail(`paste-reply wrote no ledger at ${ledger} — it went somewhere else`);

  // Nothing may be written into the checkout: that is the Data Contract's
  // system/user split, and the old default put user content in the system layer.
  //
  // The first version of this SNAPSHOTTED the developer's real ledger and
  // restored it on failure. That is a repair, not a prevention — a regression
  // still wrote into their file first, and a run killed between the write and
  // the restore left the damage behind. (It happened to me once while writing
  // this.) So the assertion no longer touches that file at all.
  //
  // Where the checkout ledger does NOT exist — CI, a fresh clone — absence after
  // the run is a clean, strong assertion. Where it DOES exist, it is the
  // developer's own data in the default layout, and nothing can distinguish our
  // write from their content without reading and rewriting it, so the check is
  // skipped and says so. The positive assertion above (the ledger landed under
  // the data root) carries the invariant in both cases: one write, one path.
  if (!repoLedgerExisted) {
    if (!existsSync(REPO_LEDGER)) {
      pass('nothing was written into the repository checkout');
    } else {
      fail('paste-reply created data/reply-candidates.json in the repo — '
        + 'user content in the system layer');
    }
  } else {
    warn('the checkout has its own data/reply-candidates.json (default layout) — '
      + 'skipping the untouched-checkout check rather than reading or rewriting a developer\'s ledger');
  }

  // The handoff paste-reply's own output promises: "Next: run node reply-watch.mjs".
  const watched = runScript('reply-watch.mjs', [], env(dir));
  if (/1 application updates? need review/.test(watched.stdout)) {
    pass('reply-watch picks up the ledger paste-reply just wrote (the documented handoff)');
  } else {
    fail(`the handoff is split — reply-watch saw: ${JSON.stringify(watched.stdout.slice(0, 220))}`);
  }

  // Guard: the explicit override still wins over the data root.
  const custom = join(dir, 'elsewhere.json');
  const overridden = runScript('paste-reply.mjs', ['--file', join(dir, 'mail.txt')],
    env(dir, { CAREER_OPS_REPLY_CANDIDATES: custom }));
  if (overridden.code === 0 && existsSync(custom)) {
    pass('CAREER_OPS_REPLY_CANDIDATES still outranks the data root');
  } else {
    fail('the explicit candidates override stopped working');
  }
}

// ── follow-ups.md: the file followup-seed writes ───────────────────────────
//
// followup-seed.mjs writes join(getCareerOpsRoot(), 'data/follow-ups.md'), so
// before the fix one script wrote a file the other could not see. Asserted at the
// source, because reply-watch surfaces follow-up context only for a matched row
// with a due date, and pinning that output would test the cadence logic rather
// than the path.
{
  const src = readFileSync(join(ROOT, 'reply-watch.mjs'), 'utf8');
  const seed = readFileSync(join(ROOT, 'followup-seed.mjs'), 'utf8');

  if (/FOLLOWUPS_FILE = path\.join\(DATA_ROOT, 'data', 'follow-ups\.md'\)/.test(src)) {
    pass('reply-watch resolves follow-ups.md against the data root');
  } else {
    fail('reply-watch no longer resolves follow-ups.md against the data root');
  }

  // The pair, not just the one file: this is the assertion that catches the two
  // drifting apart again, in either direction.
  const bothUseDataRoot = /getCareerOpsRoot\(\)/.test(src) && /getCareerOpsRoot\(\)/.test(seed);
  if (bothUseDataRoot) pass('reply-watch and followup-seed resolve follow-ups.md through the same root');
  else fail('reply-watch and followup-seed disagree about where follow-ups.md lives');

  if (!/__dirname/.test(src)) pass('reply-watch no longer references its own directory at all');
  else fail('reply-watch still resolves a path against __dirname');
}

for (const dir of cleanup) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

// ── the census: no user-layer path resolves against the script's directory ──
//
// The assertions above name the four paths this bug touched. They cannot catch the
// NEXT one — a new data/ path added on __dirname passes all of them, which is
// exactly how these four survived while sibling scripts were converted.
//
// A lint over these two files only. Other scripts resolve paths against their own
// directory for good reasons (a shipped template, a sibling module, .env), and
// judging those needs the context each one carries.
{
  for (const file of ['reply-watch.mjs', 'paste-reply.mjs']) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const offenders = src.split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => line.includes('__dirname'))
      .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*'));

    if (offenders.length === 0) {
      pass(`${file} builds no path from __dirname`);
    } else {
      fail(`${file} still resolves a path against its own directory — if one is `
        + 'deliberate, say so in a comment on that line so this check can be '
        + `narrowed rather than deleted:\n    ${offenders.map(({ n, line }) => `${n}: ${line}`).join('\n    ')}`);
    }

    // The positive form, so the check above cannot be satisfied by deleting
    // __dirname and hardcoding a path some other way.
    if (/getCareerOpsRoot\(\)/.test(src)) pass(`${file} resolves its user-layer paths through getCareerOpsRoot()`);
    else fail(`${file} no longer calls getCareerOpsRoot()`);
  }
}
