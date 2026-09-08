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
 * Zoekt het kortste fragment uit de passage dat het document maar één keer bevat.
 *
 * ── HET VENSTER GROEIT (8 september 2026) ───────────────────────────────────
 *
 * Dit keek alleen naar vensters van vier woorden. Was daar geen unieke bij, dan gaf het
 * het minst voorkomende terug — nog altijd dubbelzinnig, en de viewer markeerde dus
 * alsnog een plek die de verkeerde kon zijn.
 *
 * Het idee om door te groeien komt van de gebruiker en is precies de goede: komt een
 * fragment meer dan eens voor, neem er dan een woord bij. Bij "De ouder waar het" (dat
 * in een ouderschapsplan overal staat) levert vijf woorden meestal al één treffer op, en
 * die is dan aantoonbaar de juiste in plaats van de eerste de beste.
 *
 * Twee grenzen. Komt bij een bepaalde lengte GEEN enkel venster meer voor, dan stoppen we:
 * langer maken kan dan alleen maar naar nul. En blijft alles dubbelzinnig, dan komt het
 * minst voorkomende terug — met `voorkomens` erbij, zodat de aanroeper weet dat hij het
 * niet zeker weet.
 *
 * @param {string} passage        het citaat uit de bevinding
 * @param {string} documentTekst  de volledige tekst waarin gezocht wordt
 * @param {{venster?: number, maxVenster?: number}} opties
 * @returns {{fragment: string, voorkomens: number, index: number, venster: number} | null}
 *   `fragment` is genormaliseerd; `index` is de positie in de genormaliseerde tekst.
 */
export function kiesUniekFragment(passage, documentTekst, { venster = 4, maxVenster = 14 } = {}) {
  const doc = normaliseer(documentTekst);
  const woorden = normaliseer(passage).split(' ').filter(Boolean);
  if (!doc || woorden.length < venster) return null;

  let beste = null;

  for (let v = venster; v <= Math.min(maxVenster, woorden.length); v++) {
    let ietsGevonden = false;

    for (let i = 0; i + v <= woorden.length; i++) {
      const fragment = woorden.slice(i, i + v).join(' ');
      const voorkomens = telVoorkomens(doc, fragment);
      if (voorkomens === 0) continue;
      ietsGevonden = true;

      // Eén treffer: dit is aantoonbaar de juiste plek. Klaar.
      if (voorkomens === 1) return { fragment, voorkomens, index: doc.indexOf(fragment), venster: v };

      // Anders onthouden als hij scherper is dan wat we hadden. Bij gelijk aantal wint
      // het kortste fragment: dat overleeft kleine verschillen in de viewertekst beter.
      if (!beste || voorkomens < beste.voorkomens) {
        beste = { fragment, voorkomens, index: doc.indexOf(fragment), venster: v };
      }
    }

    // Kwam bij deze lengte niets meer voor, dan levert langer maken alleen nul op.
    if (!ietsGevonden) break;
  }

  return beste;
}
