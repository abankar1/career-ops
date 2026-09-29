// POST /api/profile must not write a shape it was never given.
//
// config/profile.yml is a user-layer file that feeds every evaluation, and the
// caller is the assistant — writeProfile() posts a patch the MODEL produced. A
// model emitting a bare string where an array belongs is the ordinary path into
// this bug, not an adversarial one, which is why the string case is pinned
// first and hardest.

import test from "node:test";
import assert from "node:assert/strict";
import { validateProfilePatch, describe as describeValue } from "../../src/lib/profile-patch.mjs";

test("a string where roles belongs is rejected, not sliced", () => {
  // The reported failure: `"backend".length` is 7, so the route's truthiness
  // guard passed, and `.slice(0, 6)` then took the first six CHARACTERS —
  // writing `target_roles.primary: backen`, a role the user never typed,
  // truncated, as a string where every consumer expects a list.
  const r = validateProfilePatch({ roles: "backend" });
  assert.equal(r.ok, false);
  assert.match(r.error, /"roles" must be an array/);
  assert.doesNotMatch(r.error, /backend/, "the error must not echo the untrusted value");
});

test("an object where a string belongs is rejected", () => {
  const r = validateProfilePatch({ name: { bad: "object" } });
  assert.equal(r.ok, false);
  assert.match(r.error, /"name" must be a string/);
  assert.match(r.error, /an object/);
});

test("null and non-objects are rejected before anything is written", () => {
  for (const body of [null, undefined, 7, "patch", true, ["roles"]]) {
    const r = validateProfilePatch(body);
    assert.equal(r.ok, false, `${JSON.stringify(body) ?? "undefined"} must be rejected`);
    assert.match(r.error, /Expected a JSON object/);
  }
  // `null` previously reached patchToProfile() and threw a TypeError outside the
  // write handler, so the client got a 500 with nothing actionable in it.
});

test("a valid patch survives intact", () => {
  const r = validateProfilePatch({
    name: "Ada", email: "ada@example.com", location: "Lisbon",
    roles: ["Backend Engineer", "Platform Engineer"],
    compMin: 90000, compMax: 120000, currency: "EUR", remote: "remote-first",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, {
    name: "Ada", email: "ada@example.com", location: "Lisbon",
    roles: ["Backend Engineer", "Platform Engineer"],
    compMin: 90000, compMax: 120000, currency: "EUR", remote: "remote-first",
  });
});

test("a partial patch stays partial", () => {
  // The route deep-merges only the keys it is given, so dropping or defaulting
  // an absent field here would overwrite settings the caller never mentioned.
  const r = validateProfilePatch({ location: "Berlin" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, { location: "Berlin" });
});

test("absent, null and blank fields are 'not supplied', not errors", () => {
  // A client spreading a partial form object sends nulls and empty strings for
  // fields the user left alone; a 400 for those would make the form unusable.
  const r = validateProfilePatch({ name: null, email: undefined, location: "   ", roles: [], compMin: null });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, {}, "nothing supplied means nothing to write");
});

test("unknown keys are ignored, because the assistant sends them", () => {
  // `seniority` has no canonical home in profile.yml and archetypes live in
  // modes/_profile.md — this writer deliberately persists neither, and the
  // caller sends them anyway. Rejecting extras would break it.
  const r = validateProfilePatch({ name: "Ada", seniority: "staff", archetypes: ["x"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, { name: "Ada" });
});

test("compensation must be finite numbers, and ordered", () => {
  for (const bad of [NaN, Infinity, -Infinity, "120000", {}, []]) {
    const r = validateProfilePatch({ compMin: bad });
    assert.equal(r.ok, false, `compMin=${String(bad)} must be rejected`);
    assert.match(r.error, /"compMin" must be a finite number|must not be negative/);
  }
  // A numeric STRING is the sharp one: it would interpolate into the
  // `${compMin}-${compMax}` template and produce a range that looks correct and
  // is a number nowhere.
  assert.equal(validateProfilePatch({ compMin: "90000", compMax: 120000 }).ok, false);

  assert.equal(validateProfilePatch({ compMin: -1 }).ok, false);
  const inverted = validateProfilePatch({ compMin: 150000, compMax: 90000 });
  assert.equal(inverted.ok, false);
  assert.match(inverted.error, /must not be greater than/);

  // Equal bounds are a legitimate fixed number, not an error.
  assert.equal(validateProfilePatch({ compMin: 100000, compMax: 100000 }).ok, true);
});

test("roles must contain only strings, and blanks are dropped", () => {
  assert.equal(validateProfilePatch({ roles: ["Backend", 7] }).ok, false);
  assert.equal(validateProfilePatch({ roles: [{ r: "x" }] }).ok, false);
  const r = validateProfilePatch({ roles: ["  Backend Engineer  ", "", "   "] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch.roles, ["Backend Engineer"]);
});

test("describe() names the type and never echoes the value", () => {
  // The body is untrusted and the message is rendered by a client.
  assert.equal(describeValue(null), "null");
  assert.equal(describeValue([1]), "an array");
  assert.equal(describeValue({}), "an object");
  assert.equal(describeValue("secret-token"), "a string");
  assert.equal(describeValue(7), "a number");
});
