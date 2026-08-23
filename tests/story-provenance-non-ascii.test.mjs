// tests/story-provenance-non-ascii.test.mjs — the provenance checker must
// reach the same verdict whatever script the CV is written in.
//
// contextWords() stripped with `[^a-z0-9\s]`, the last surviving instance in
// the repo of the ASCII-only strip #2393/#2429/#2569/#2666 replaced everywhere
// else. Both of this checker's context consumers read the result as a list:
// hasScopedNumberMatch does `claimWords.includes(w)` and hasContextOverlap
// does `words.some(...)`. An EMPTY list makes both unconditionally false, so
// on a Cyrillic/Greek/Hebrew/Arabic/CJK CV the `existing` and
// `supportedByResume` buckets are unreachable and every extracted claim lands
// in `derived-unverified` — a figure sitting verbatim in cv.md included.
//
// That bucket is not a quiet one. AGENTS.md's "Confirmation UX invariant"
// hands derived-unverified findings to the user to confirm or deny, and names
// the risk: a confirmed guess launders the guess into a verified fact. A list
// where 100% of the entries are noise is how a user learns not to read it.
//
// The tests below pin the fix in BOTH directions — a real trace must verify,
// and the scoping guards that keep `existing` honest must still fire — because
// "keep every letter" would also be satisfied by a change that simply says yes
// to everything.
//
// Run:  node --test tests/story-provenance-non-ascii.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStoryBank } from '../story-provenance-check.mjs';

/** Bucket name a single-claim classification landed in. */
function verdict(storyBank, cv) {
  const b = classifyStoryBank(storyBank, cv);
  const hits = Object.entries(b).filter(([, v]) => v.length > 0);
  assert.equal(hits.length, 1, `expected exactly one non-empty bucket, got ${JSON.stringify(b)}`);
  assert.equal(hits[0][1].length, 1, `expected exactly one claim, got ${hits[0][1].length}`);
  return hits[0][0];
}

// ── The number is in cv.md, in context, in a non-Latin script ──────────

test('a Cyrillic CV verifies a claim its own prose supports', () => {
  const cv = [
    '# Иван Петров',
    '',
    '- Сократил расходы на инфраструктуру на 40% за один год.',
  ].join('\n');
  const story = [
    '### [Leadership] Масштабирование платформы',
    '',
    '**Result:** Сократил расходы на инфраструктуру на 40% за год.',
  ].join('\n');

  assert.equal(verdict(story, cv), 'existing');
});

test('a Greek CV verifies a claim its own prose supports', () => {
  const cv = '# Βιογραφικό\n\n- Μείωσε το κόστος υποδομής κατά 40% σε έναν χρόνο.';
  const story = '### [Impact] Μείωση κόστους\n\n**Result:** Μείωσε το κόστος υποδομής κατά 40%.';

  assert.equal(verdict(story, cv), 'existing');
});

// ── …and the scoping guards still fire in those scripts ───────────────

test('a bare digit coincidence in a Cyrillic CV is NOT verified', () => {
  // 40 appears in cv.md, but as a page count in an unrelated sentence. This is
  // the #2947 CodeRabbit finding (unscoped number matching) expressed in
  // Cyrillic: keeping the letters must not also drop the context requirement.
  const cv = '# Иван Петров\n\n- Опубликовал руководство объёмом 40 страниц.';
  const story = '### [Impact] Снижение затрат\n\n**Result:** Сократил расходы на инфраструктуру на 40%.';

  assert.equal(verdict(story, cv), 'derivedUnverified');
});

test('an accented word is no longer re-cut into a different real word', () => {
  // The old strip turned "évaluation" into " valuation" — a DIFFERENT English
  // word. Against a finance CV that legitimately says "valuation", the claim
  // then read as supportedByResume on a token the story never contained.
  const cv = '# Jane Roe\n\n- Built discounted cash flow valuation models for the M&A desk.';
  const story = '### [Risk] Revue annuelle\n\n**Result:** Réduit les incidents de 40% après une évaluation complète.';

  assert.equal(verdict(story, cv), 'derivedUnverified');
});

// ── The ASCII path is untouched ───────────────────────────────────────

test('the English behaviour the checker shipped with is unchanged', () => {
  const cv = '# Ivan Petrov\n\n- Cut infrastructure costs by 40% in one year.';
  const story = '### [Impact] Cost reduction\n\n**Result:** Cut infrastructure costs by 40% in one year.';
  assert.equal(verdict(story, cv), 'existing');

  const unrelated = '# Ivan Petrov\n\n- Published a 40 page onboarding guide.';
  assert.equal(verdict(story, unrelated), 'derivedUnverified');
});

test('a Turkish dotted capital folds to the same word as its plain i', () => {
  // `'İ'.toLowerCase()` is `i` + U+0307, and \p{M} in the new strip would have
  // KEPT that combining dot — so the fix has to drop it explicitly or
  // "İstanbul" and "Istanbul" stop comparing equal.
  // (Written `40%` rather than the Turkish `%40`: the percent pattern requires
  // the sign to FOLLOW the number, so `%40` extracts no claim at all. That is a
  // real gap for tr/de-style prose and a separate one — this test is about the
  // fold, so it uses a shape the extractor already sees.)
  const cv = '# CV\n\n- İstanbul ekibinde maliyetleri 40% azalttı.';
  const story = '### [Impact] Maliyet\n\n**Result:** Istanbul ekibinde maliyetleri 40% azalttı.';

  assert.equal(verdict(story, cv), 'existing');
});
