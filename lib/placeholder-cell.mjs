/**
 * lib/placeholder-cell.mjs — is a tracker cell a PLACEHOLDER rather than a value?
 *
 * A company cell carrying no letter and no digit names nothing: `?` is the
 * documented marker for an undisclosed end employer (#1596), and `—` / `-` are
 * the tracker's no-data sentinels (#1799). They must never be treated as an
 * identity. Two ways that goes wrong, both already paid for:
 *
 *   - substring-matching `?` turns punctuation into a company signal. Because
 *     replies ask questions, it matched almost every mail, scored 2, and reached
 *     confidence `high` next to any post-application keyword (#3001).
 *   - normalizing it to a key yields the EMPTY STRING, which reads as "unusable
 *     row" to a caller that skips falsy keys — so the row is dropped silently
 *     rather than handled.
 *
 * One definition because there were two. reply-matcher.mjs and
 * process-quality.mjs each grew the same body with the same rationale,
 * independently, while rejection-latency.mjs — the third reader of the same two
 * files — had neither and took the second failure above. A helper that exists
 * twice is a helper the next caller can miss a third time.
 *
 * Lives in lib/ rather than tracker-parse.mjs deliberately: reply-matcher.mjs
 * has no imports at all today, and tracker-parse.mjs reads the filesystem.
 * Pointing a pure matcher at an fs-importing module to share four characters of
 * regex is the wrong trade. This file, like lib/local-today.mjs and
 * lib/ascii-fold.mjs, imports nothing.
 */

/**
 * @param {unknown} value - Raw cell text.
 * @returns {boolean} true when the cell carries no letter and no digit.
 */
export function isPlaceholderCompany(value) {
  return !/[\p{L}\p{N}]/u.test(String(value ?? ''));
}
