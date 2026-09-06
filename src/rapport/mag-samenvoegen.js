/**
 * src/rapport/mag-samenvoegen.js — mogen deze twee issues op titelgelijkenis samen?
 *
 * ── AANLEIDING (6 september 2026) ───────────────────────────────────────────
 *
 * De browser-ontdubbelaar (`dedupIssues`, pass 4) voegde issues samen op woordoverlap in
 * de TITEL. De passage kwam er niet aan te pas. Dat gaat mis, en dat is niet theoretisch —
 * het staat gemeten in `api/_prompts/consolidatie.js`:
 *
 *     echte dubbeling   "Informatie- en consultatieverplichting"
 *                     ≈ "Informatieplicht (art. 1:377b BW)"        0,40
 *     VERSCHILLEND      "Ingangsdatum kinderalimentatie"
 *                     ≈ "Ingangsdatum partneralimentatie"          0,50
 *
 * Het valse paar scoort hóger dan het echte. Er is dus geen drempel op woordoverlap die
 * ze scheidt — en 0,50 is precies de drempel die pass 4 gebruikt, dus dat valse paar
 * wordt samengevoegd.
 *
 * ── DE REGEL ────────────────────────────────────────────────────────────────
 *
 * Wijzen twee issues elk een EIGEN, ANDERE zin aan, dan zijn het twee vindplaatsen en
 * twee correcties. Dan mogen ze niet samen, hoe erg de titels ook op elkaar lijken.
 *
 * Heeft één van beide géén passage, dan zegt de passage niets. Dat is geen randgeval maar
 * de normale vorm bij een gemis: een ontbrekende afspraak heeft van nature geen zin om
 * naar te wijzen. De serverprompt zegt het met zoveel woorden — "de passage is hier dus
 * geen bruikbaar onderscheid — het onderwerp wel". In dat geval beslist de titel, zoals
 * voorheen.
 *
 * ── WAT DIT KOST EN OPLEVERT ────────────────────────────────────────────────
 *
 * Het levert hooguit een dubbele kaart op waar er één had gekund. Het voorkomt dat een
 * vindplaats verdwijnt uit het rapport van de mediator. Die afweging staat al in
 * `consolidatie.js`: "een dubbele kaart is hooguit hinderlijk", een verdwenen bevinding
 * is onzichtbaar.
 */

/** Normaliseert een passage tot vergelijkbare vorm: kleine letters, witruimte gelijk. */
function kaal(p) {
  return String(p ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Wijzen deze twee issues aantoonbaar naar verschillende plekken in het document?
 *
 * Alleen `true` als beide een passage hebben én die passages elkaar niet overlappen.
 * Een deelstring telt als dezelfde plek: analyse-calls citeren dezelfde zin soms korter.
 */
export function wijstNaarAndereplek(a, b) {
  const pa = kaal(a?.passage);
  const pb = kaal(b?.passage);
  if (!pa || !pb) return false;            // zonder passage zegt de passage niets
  if (pa === pb) return false;
  if (pa.includes(pb) || pb.includes(pa)) return false;
  return true;
}

/**
 * Mag pass 4 deze twee samenvoegen, gegeven dat de titels genoeg op elkaar lijken?
 *
 * @param {{passage?: string, artikel?: string}} a
 * @param {{passage?: string, artikel?: string}} b
 */
export function magSamenvoegen(a, b) {
  if (wijstNaarAndereplek(a, b)) return false;

  // Twee verschillende artikelnummers wijzen ook op twee plekken, ook als de passage
  // ontbreekt. "Spelfout in artikel 21" en "Spelfout in artikel 22" zijn twee correcties.
  const aa = String(a?.artikel ?? '').trim();
  const ab = String(b?.artikel ?? '').trim();
  if (aa && ab && aa !== ab) return false;

  return true;
}
