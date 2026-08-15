// Status alias → canonical stage, mirroring `templates/states.yml`.
//
// Pure JS (no TS types) so it can be imported both by format.ts and by a
// `node --test` unit test, matching funnel-tiles.mjs / clean-chips.mjs /
// stream-parse.mjs.
//
// This map is a LITERAL rather than a read of states.yml because format.ts is
// node-free on purpose — it is imported by client components, so it cannot
// touch fs at runtime. The map has to ship in the bundle as data.
//
// Moved here verbatim; the alias list is unchanged by this commit.

/** @type {Record<string, string>} */
export const STATUS_ALIAS = {
  evaluada: "EVALUATED",
  evaluado: "EVALUATED",
  condicional: "EVALUATED",
  hold: "EVALUATED",
  evaluar: "EVALUATED",
  verificar: "EVALUATED",
  aplicada: "APPLIED",
  aplicado: "APPLIED",
  enviada: "APPLIED",
  sent: "APPLIED",
  respondida: "RESPONDED",
  respondido: "RESPONDED",
  contestada: "RESPONDED",
  entrevista: "INTERVIEW",
  oferta: "OFFER",
  rechazada: "REJECTED",
  rechazado: "REJECTED",
  descartada: "DISCARDED",
  descartado: "DISCARDED",
  cerrada: "DISCARDED",
  cancelada: "DISCARDED",
  duplicado: "DISCARDED",
  repost: "DISCARDED",
  monitor: "SKIP",
  no_aplicar: "SKIP",
  "no aplicar": "SKIP",
  // Hired — terminal success (offer accepted), added to states.yml in #2050.
  contratado: "HIRED",
  contratada: "HIRED",
  accepted: "HIRED",
  accept: "HIRED",
};

/**
 * Normalize a raw tracker status to a canonical stage token.
 *
 * Unknown input is passed through uppercased rather than rejected, so a status
 * this map has never seen still renders as itself. Consumers substring-test the
 * result, which is why an alias missing from the map above resolves to no stage
 * at all — see tests/lib/status-alias.test.mjs.
 *
 * @param {string} s - Raw status text from the tracker.
 * @returns {string} Canonical stage token, or the uppercased input.
 */
export function canonStatus(s) {
  const k = String(s ?? "").trim().toLowerCase();
  if (k === "" || k === "—" || k === "-") return "DISCARDED";
  return STATUS_ALIAS[k] ?? String(s ?? "").toUpperCase();
}
