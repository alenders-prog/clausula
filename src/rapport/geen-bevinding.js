/**
 * src/rapport/geen-bevinding.js — bevindingen die zelf zeggen dat er niets aan de hand is
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * Een mediator kreeg dit als bevinding met ernst HOOG:
 *
 *     "Behoefte partneralimentatie: berekening is rekenkundig correct"
 *     … "De uitkomst klopt rekenkundig. De berekening is intern consistent.
 *        Geen rekenkundig conflict."
 *     Aanbeveling: "Geen aanpassing vereist; de berekening is correct."
 *
 * De prompt verbiedt dit met zoveel woorden: *"ALLEEN echte problemen rapporteren. Leg
 * NOOIT een issue vast als het document aan de eis voldoet. Positieve bevestigingen horen
 * NIET in de issues-lijst."* Toch gebeurt het, en dan het liefst met een hoge ernst.
 *
 * Dat is schadelijker dan het lijkt. Een lijst waar bevestigingen in staan dwingt de
 * mediator elk punt te lezen om te ontdekken of er iets moet gebeuren — precies het werk
 * dat de screening zou besparen. En een HOOG dat "geen aanpassing vereist" zegt ondermijnt
 * het vertrouwen in de andere HOOG-meldingen.
 *
 * ── WAAROM IN CODE EN NIET IN DE PROMPT ─────────────────────────────────────
 *
 * De promptregel staat er al en werkt meestal. Dit is het vangnet eronder, in dezelfde
 * geest als het IBAN- en bijlagefilter: goedkoop, deterministisch en te toetsen.
 *
 * ── DE TOETS IS MET OPZET SMAL ──────────────────────────────────────────────
 *
 * Alleen de AANBEVELING telt, en alleen als die in zijn geheel zegt dat er niets hoeft. Een
 * bevinding mag "correct" in zijn uitleg gebruiken — "het bedrag is correct maar de datum
 * ontbreekt" is een echt punt. Zou de toets op de bevindingstekst kijken, dan sneuvelt dat.
 *
 * Bij twijfel blijft het issue staan. Een overbodige kaart is hinderlijk; een weggegooide
 * bevinding is een gemist gebrek in een document dat naar de rechter gaat.
 */

/**
 * Aanbevelingen die zeggen dat er niets hoeft. Bewust letterlijk en kort gehouden: elk
 * patroon hier is er een dat in een echte analyse is voorgekomen.
 */
const NIETS_TE_DOEN = [
  /^\s*geen\s+(aanpassing|actie|wijziging|correctie|maatregel)\b[^.]*\b(vereist|nodig|noodzakelijk)\b/i,
  /^\s*geen\s+(aanpassing|actie|wijziging|correctie)\s*(nodig|vereist)?\s*[.;]?\s*$/i,
  /^\s*(dit|deze|het)\s+(punt|issue)?\s*(is|behoeft)\s+(geen|correct)\b/i,
  /^\s*niets\s+te\s+doen\b/i,
];

/** Zegt deze aanbeveling dat er niets hoeft te gebeuren? */
export function isBevestiging(issue) {
  const aanbeveling = String(issue?.aanbeveling ?? '').trim();
  if (!aanbeveling) return false;
  return NIETS_TE_DOEN.some((rx) => rx.test(aanbeveling));
}

/**
 * Haalt bevestigingen uit de lijst.
 *
 * @returns {{issues: Array, verwijderd: Array}} `verwijderd` zodat de aanroeper ze kan
 *   loggen — stil weggooien is hoe dit soort filters onbetrouwbaar wordt.
 */
export function filterBevestigingen(issues) {
  const lijst = Array.isArray(issues) ? issues : [];
  const verwijderd = lijst.filter(isBevestiging);
  return {
    issues: verwijderd.length ? lijst.filter((i) => !isBevestiging(i)) : lijst,
    verwijderd,
  };
}
