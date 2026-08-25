/**
 * src/viewer/uniek-fragment.js
 * Kiest uit een passage een kort fragment dat het document maar één keer bevat.
 *
 * Aanleiding (24 augustus 2026). Klikken op een issue markeerde de verkeerde plek.
 * De passage begon met "De ouder waar het kind 2de kerstdag viert…", en de laatste
 * terugval van het zoeken liep met een venster van vier woorden van links naar
 * rechts door de passage en nam de eerste die ergens raakte:
 *
 *     i = 0  →  "De ouder waar het"
 *
 * Dat staat óók in het artikel over identiteitsbewijzen ("…in beheer bij de ouder
 * waar het kind staat ingeschreven"), twintig regels eerder. De viewer sprong
 * daarheen. De passage stond gewoon in het document; hij werd alleen op de
 * verkeerde plek gevonden.
 *
 * ── Waarom uniekheid en geen woordenlijst ───────────────────────────────────
 * Je zou stopwoorden kunnen wegfilteren, maar "ouder", "kind" en "wissel" zijn
 * geen stopwoorden en tóch nietszeggend in een ouderschapsplan — daar gaat het
 * hele document over. Wat telt is niet of een woord zeldzaam is in het Nederlands,
 * maar of het fragment zeldzaam is in dít document. Dat is meetbaar in plaats van
 * op te sommen, en het past zich vanzelf aan het documenttype aan.
 */

/** Zelfde normalisatie als de viewer: kleine letters, één spatie, geen leestekens. */
export function normaliseer(tekst) {
  return (tekst || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hoe vaak `naald` in `hooiberg` voorkomt (overlappend geteld). */
export function telVoorkomens(hooiberg, naald) {
  if (!naald) return 0;
  let n = 0, i = 0;
  while ((i = hooiberg.indexOf(naald, i)) !== -1) { n++; i += 1; }
  return n;
}

/**
 * Zoekt het meest onderscheidende venster van `venster` woorden uit de passage.
 *
 * Voorkeur: een fragment dat precies één keer voorkomt. Bestaat dat niet, dan het
 * fragment met de mínste voorkomens — nog altijd beter dan het eerste het beste.
 * Komt geen enkel venster voor, dan null: dan valt de aanroeper terug op zijn
 * eigen gedrag in plaats van iets te markeren wat er niet staat.
 *
 * @param {string} passage        het citaat uit de bevinding
 * @param {string} documentTekst  de volledige tekst waarin gezocht wordt
 * @param {{venster?: number}} opties
 * @returns {{fragment: string, voorkomens: number, index: number} | null}
 *   `fragment` is genormaliseerd; `index` is de positie in de genormaliseerde tekst.
 */
export function kiesUniekFragment(passage, documentTekst, { venster = 4 } = {}) {
  const doc = normaliseer(documentTekst);
  const woorden = normaliseer(passage).split(' ').filter(Boolean);
  if (!doc || woorden.length < venster) return null;

  let beste = null;
  for (let i = 0; i + venster <= woorden.length; i++) {
    const fragment = woorden.slice(i, i + venster).join(' ');
    const voorkomens = telVoorkomens(doc, fragment);
    if (voorkomens === 0) continue;
    if (voorkomens === 1) {
      return { fragment, voorkomens, index: doc.indexOf(fragment) };
    }
    if (!beste || voorkomens < beste.voorkomens) {
      beste = { fragment, voorkomens, index: doc.indexOf(fragment) };
    }
  }
  return beste;
}
