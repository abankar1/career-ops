// Runtime validation for the body of POST /api/profile.
//
// Pure .mjs so the route can import it and `node --test` can cover it, matching
// clean-chips.mjs / funnel-tiles.mjs.
//
// ── Why a cast was not enough ───────────────────────────────────────────────
//
// The route did `(await req.json()) as ProfilePatch`, which is a compile-time
// assertion about a value that arrives at runtime. Three shapes got through and
// were written into config/profile.yml — a USER-LAYER file that feeds every
// evaluation:
//
//   {"roles":"backend"}        -> 200, target_roles.primary: backen
//   {"name":{"bad":"object"}}  -> 200, candidate.full_name: {bad: object}
//   null                       -> 500 (TypeError before the write handler)
//
// The first is the worst of the three and the least visible. `p.roles?.length`
// is 7 for the string "backend", so the guard passes, and `.slice(0, 6)` then
// takes the first six CHARACTERS rather than the first six roles — the profile
// records a role the user never typed, truncated, as a string where every
// consumer expects a list.
//
// This matters more than a shape nit because the caller is the ASSISTANT:
// writeProfile() posts a patch the model produced, so a model that emits a bare
// string instead of an array is the ordinary path into this bug, not an
// adversarial one.
//
// Validation happens BEFORE any filesystem access, so a rejected request leaves
// the file untouched — no backup, no temp file, nothing to clean up.

/** Fields written as plain strings. */
const STRING_FIELDS = ["name", "email", "location", "currency", "remote"];
/** Fields written as numbers. */
const NUMBER_FIELDS = ["compMin", "compMax"];

/**
 * @typedef {{ok: true, patch: Record<string, unknown>}} Ok
 * @typedef {{ok: false, error: string}} Err
 */

/**
 * Validate and narrow an incoming profile patch.
 *
 * Unknown keys are IGNORED rather than rejected: the assistant sends fields this
 * writer deliberately does not persist (`seniority` has no canonical home in
 * profile.yml, and archetypes live in modes/_profile.md), so rejecting extras
 * would break the caller that exists today.
 *
 * `null` and `undefined` for a known key are treated as "not supplied", which
 * keeps a client that spreads a partial form object from being rejected for
 * fields the user simply left blank.
 *
 * @param {unknown} body - Parsed JSON body.
 * @returns {Ok|Err}
 */
export function validateProfilePatch(body) {
  // `typeof null === "object"`, and an array is an object too. Both reached
  // patchToProfile() and threw or wrote nonsense.
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object with profile fields." };
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  const src = /** @type {Record<string, unknown>} */ (body);

  for (const key of STRING_FIELDS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") {
      return { ok: false, error: `"${key}" must be a string, received ${describe(v)}.` };
    }
    // Whitespace-only is "not supplied" rather than an error: the route's own
    // truthiness checks already skipped empty strings, and a blank form field
    // should not be a 400.
    if (v.trim() !== "") out[key] = v;
  }

  if (src.roles !== undefined && src.roles !== null) {
    const roles = src.roles;
    if (!Array.isArray(roles)) {
      // Named explicitly because a string here is the failure that silently
      // wrote a truncated role, and "must be an array" is the one sentence that
      // tells the caller how to fix it.
      return { ok: false, error: `"roles" must be an array of strings, received ${describe(roles)}.` };
    }
    if (roles.some((r) => typeof r !== "string")) {
      return { ok: false, error: '"roles" must contain only strings.' };
    }
    const cleaned = roles.map((r) => r.trim()).filter((r) => r !== "");
    if (cleaned.length) out.roles = cleaned;
  }

  for (const key of NUMBER_FIELDS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    // Number.isFinite rejects NaN and both infinities, and a numeric STRING:
    // "120000" interpolated into the target_range template would have produced
    // a range that looks right and is not a number anywhere.
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false, error: `"${key}" must be a finite number, received ${describe(v)}.` };
    }
    if (v < 0) return { ok: false, error: `"${key}" must not be negative.` };
    out[key] = v;
  }

  if (typeof out.compMin === "number" && typeof out.compMax === "number" && out.compMin > out.compMax) {
    return { ok: false, error: '"compMin" must not be greater than "compMax".' };
  }

  return { ok: true, patch: out };
}

/**
 * A short, safe description of a rejected value for the error message.
 *
 * Deliberately reports the TYPE and never echoes the value: the body is
 * untrusted input and the response is rendered by a client.
 *
 * @param {unknown} v
 * @returns {string}
 */
export function describe(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  const t = typeof v;
  // "a object" reads as a typo in a message the user sees, and the only vowel
  // case among the typeof results is "object" ("undefined" never reaches here —
  // an absent field is not an error).
  return `${t === "object" ? "an" : "a"} ${t}`;
}
