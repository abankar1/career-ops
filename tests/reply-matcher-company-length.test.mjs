// tests/reply-matcher-company-length.test.mjs — the short-name gate measures a
// company name in the same unit the rest of the file uses for "word material".
//
// checkCompanyMatch routes short names -- the two- and three-letter acronyms
// where `HP` could match inside `PHP` -- to a word-boundary test, and RETURNS
// that result, so the substring paths below never run for them. Which names are
// "short" is therefore a routing decision with teeth, and it was made by a count
// that discarded combining marks. Devanagari and Bengali write most vowels as
// marks, so ordinary company names counted 2 or 3 and were handed the acronym
// rule, while their Latin transliterations were long enough to skip it.
//
// This file asserts the count, the mentions that used to be refused because of
// it, and -- separately -- every short-name behaviour the fix must NOT weaken.

import { checkCompanyMatch } from '../reply-matcher.mjs';
import { pass, fail } from './helpers.mjs';

console.log('\nreply-matcher — company length counts word material, not just letters');

/** A mention that must be found, with the reason it is not a stylistic choice. */
const MUST_MATCH = [
  // Marathi and Bengali attach case suffixes to the noun. This is standard
  // orthography, not informal writing, so it is how a real reply is worded.
  ['विप्रो', 'विप्रोमध्ये तुमच्या अर्जाबद्दल धन्यवाद.', 'Marathi -मध्ये locative glued to the name'],
  ['टाटा', 'टाटामध्ये तुमची निवड झाली आहे.', 'Tata, 4 code points counted 2'],
  ['টাটা', 'টাটাতে আপনার আবেদনের জন্য ধন্যবাদ।', 'Bengali -তে locative glued to the name'],
  ['ज़ोमैटो', 'ज़ोमैटोमध्ये तुमची मुलाखत ठरली आहे.', 'Zomato, 7 code points counted 3'],
  ['क्रेड', 'क्रेडमध्ये अर्ज केल्याबद्दल आभार.', 'CRED, 5 code points counted 3'],
  // Plain, space-separated mentions must keep working too -- these passed before
  // the fix, and a fix that traded them away would be no fix at all.
  ['विप्रो', 'विप्रो में आपके आवेदन के लिए धन्यवाद।', 'Devanagari, space-separated'],
  ['टाटा', 'टाटा में आपका साक्षात्कार तय हुआ है।', 'Devanagari, space-separated'],
];

for (const [company, text, why] of MUST_MATCH) {
  if (checkCompanyMatch(text, company)) pass(`matches: ${company} — ${why}`);
  else fail(`missed ${company} in ${JSON.stringify(text)} — ${why}`);
}

// ── the asymmetry that shows the UNIT is wrong, not the threshold ────────────
//
// Two Bengali names, one script, one grammatical construction. Before the fix
// the longer one matched and the shorter one did not, because mark-stripping
// pushed only the shorter one under SHORT_NAME_MAX. And the Latin spelling of
// the same company never met the rule at all. After the fix all three agree.
{
  const bengaliLong = checkCompanyMatch('উইপ্রোতে আপনার আবেদন গৃহীত হয়েছে।', 'উইপ্রো');
  const bengaliShort = checkCompanyMatch('টাটাতে আপনার আবেদনের জন্য ধন্যবাদ।', 'টাটা');
  if (bengaliLong && bengaliShort) {
    pass('two Bengali names in the same construction behave the same way');
  } else {
    fail(`Bengali names disagree — উইপ্রো: ${bengaliLong}, টাটা: ${bengaliShort}; `
      + 'the gate is still measuring in a script-dependent unit');
  }

  const latin = checkCompanyMatch('Thanks for applying to Tatawards.', 'Tata');
  const devanagari = checkCompanyMatch('टाटामध्ये अर्ज केल्याबद्दल आभार.', 'टाटा');
  if (latin === devanagari) pass('a company spelled in Latin and in Devanagari is treated alike');
  else fail(`Tata matches (${latin}) but टाटा does not (${devanagari}) — same name, same length`);
}
