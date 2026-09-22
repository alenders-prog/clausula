/**
 * src/analyse/bekende-fouten.js — is dit gebrek gemeld?
 *
 * ── WAAROM ÉÉN PLEK ─────────────────────────────────────────────────────────
 *
 * Deze toets stond op twee plekken: in `scripts/meet-signalen.mjs` en in
 * `scripts/vergelijk-modellen.mjs`, allebei als `f.zoek.some(z => tekst.includes(z))`.
 * Twee kopieën van de maat waarop een leverancierskeuze rust, en dat is precies vraag 1
 * uit CLAUDE.md. Vandaar dit bestand, met een test eronder.
 *
 * ── WAAROM HET FORMAAT UITGEBREID IS (22 september 2026) ────────────────────
 *
 * De zes bekende fouten in `tests/golden/meting/twee-documenten.json` zijn alle zes
 * táálfouten: een aaneengeschreven woord, twee spelfouten, een congruentiefout, een
 * dubbel woord, een leesteken. Op die dimensie scoren de vergeleken modellen gelijk
 * (19, 18 en 20 bevindingen). Het verschil dat er wél is — volledigheid en balans, en
 * het narekenen van bedragen — viel volledig buiten de maat.
 *
 * De maat wees dus niet de verkeerde kant op; hij keek de verkeerde kant op. Een
 * scorebord van 4-3-2 zag eruit als een kwaliteitsoordeel en was ruis op één dimensie.
 *
 * Een taalfout is met één woord te vinden: staat "gezamelijke" in de bevinding, dan is
 * hij gemeld. Een inhoudelijk gebrek niet. "De peildatum voor de vermogensverdeling
 * ontbreekt" kan op tien manieren worden opgeschreven, en het woord "peildatum" alleen
 * komt ook voor in bevindingen die er niets mee te maken hebben. Vandaar twee vormen
 * naast elkaar:
 *
 *   zoek        ÉÉN van deze termen volstaat  — goed voor taalfouten
 *   zoek_alle   ÁLLE termen moeten voorkomen  — goed voor inhoudelijke gebreken
 *   dimensie    optioneel: de bevinding moet deze dimensie dragen
 *
 * `zoek_alle` is met opzet streng. Een gemiste melding is hinderlijk; een valse
 * treffer maakt een model ten onrechte goed, en dat is erger — dan denk je dat een
 * gebrek gevonden wordt terwijl er iets anders werd gemeld.
 */

/** De tekst van een bevinding waarin gezocht wordt. */
export function bevindingTekst(issue) {
  return [issue?.onderwerp, issue?.bevinding, issue?.passage, issue?.aanbeveling]
    .filter(Boolean).join(' ').toLowerCase();
}

/**
 * Meldt deze bevinding het gegeven gebrek?
 *
 * @param {{zoek?: string[], zoek_alle?: string[], dimensie?: string}} fout
 * @param {object} issue
 */
export function meldtGebrek(fout, issue) {
  if (!fout || !issue) return false;

  if (fout.dimensie) {
    const dims = Array.isArray(issue.dimensies) ? issue.dimensies : [];
    if (!dims.includes(fout.dimensie)) return false;
  }

  const tekst = bevindingTekst(issue);
  if (!tekst) return false;

  const alle = Array.isArray(fout.zoek_alle) ? fout.zoek_alle : null;
  if (alle && alle.length) {
    if (!alle.every((t) => tekst.includes(String(t).toLowerCase()))) return false;
  }

  const enig = Array.isArray(fout.zoek) ? fout.zoek : null;
  if (enig && enig.length) {
    if (!enig.some((t) => tekst.includes(String(t).toLowerCase()))) return false;
  }

  // Een gebrek zonder enige zoekterm zou op álles matchen. Dat is bijna zeker een
  // fout in de fixture, en stil `true` teruggeven zou elk model perfect laten scoren.
  if (!alle?.length && !enig?.length) return false;

  return true;
}

/** Is dit gebrek in déze lijst bevindingen gemeld? */
export const isGemeld = (fout, issues = []) =>
  (Array.isArray(issues) ? issues : []).some((i) => meldtGebrek(fout, i));

/**
 * In hoeveel van de runs is het gebrek gemeld?
 *
 * @param {object} fout
 * @param {Array<Array<object>>} runs  per run de bevindingen
 */
export const aantalRunsGemeld = (fout, runs = []) =>
  (Array.isArray(runs) ? runs : []).filter((issues) => isGemeld(fout, issues)).length;

/**
 * Controleert of een fixture geen gebreken bevat die nooit kunnen matchen.
 *
 * Een gebrek zonder zoektermen matcht nergens op en is dus onzichtbaar stuk: het staat
 * er, het gaat nooit af, en aan de uitslag is dat niet te zien. Dezelfde klasse fout
 * als de dode rijen in de skill-tabel en de tags met een streepje in de kennisbank.
 *
 * @returns {string[]} de sleutels van gebreken die nergens op kunnen matchen
 */
export function onbruikbareGebreken(bekendeFouten = []) {
  return (Array.isArray(bekendeFouten) ? bekendeFouten : [])
    .filter((f) => !(f?.zoek?.length) && !(f?.zoek_alle?.length))
    .map((f) => f?.sleutel ?? '(zonder sleutel)');
}
