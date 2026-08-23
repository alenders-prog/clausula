/**
 * src/assistent/clausule-delen.js
 * Knipt het antwoord van een clausule-generatie in zijn onderdelen.
 *
 * Aanleiding (23 augustus 2026). De prompt vraagt het model om na de clausuletekst
 * `---TOELICHTING---` op een eigen regel te zetten, en binnen de toelichting
 * `---MINIMALE TEKST---` vóór de korte variant. De client zocht daar letterlijk naar:
 *
 *     tekst.indexOf('\n---TOELICHTING---')
 *
 * Het model schreef `--- TOELICHTING---`. Eén spatie, en de hele constructie viel
 * stil: de minimale tekst kwam niet bovenaan, valkuilen en discussiepunten stonden
 * uitgeklapt in plaats van inklapbaar, de uitgebreide versie was niet weg te klappen,
 * en de vier knoppen (kopieer/issue × minimaal/uitgebreid) werden er twee.
 *
 * Erger was de tweede plek met dezelfde exacte match: `_assistVoegToeAlsIssue` knipt
 * de clausule uit de toelichting vóór het issue wordt opgeslagen. Die faalde ook, dus
 * gingen de valkuilen, de discussiepunten én de markering mee het dossier in.
 *
 * Daarom: één plek, en herkennen op patroon in plaats van op tekens. Meer streepjes,
 * spaties eromheen, andere hoofdletters — allemaal dezelfde bedoeling. Een parser die
 * op één spatie omvalt is de fout, niet het model.
 */

// Bewust niet aan een regelbegin gebonden. `---TOELICHTING---` staat in de praktijk
// op een eigen regel, maar `---MINIMALE TEKST---` schrijft het model geregeld mét de
// zin erachter op dezelfde regel — ondanks de instructie.
const RE_TOELICHTING = /-{3,}\s*TOELICHTING\s*-{3,}/i;
const RE_MINIMAAL    = /-{3,}\s*MINIMALE\s+TEKST\s*-{3,}/i;

/** Losse streepjeslijnen die het model als scheiding tussen secties zet. */
const RE_STREEPLIJN = /^\s*-{3,}\s*$/gm;

/**
 * Splitst het antwoord in de clausuletekst en de toelichting voor de mediator.
 *
 * @returns {{clausule: string, toelichting: string, gevonden: boolean}}
 *   `gevonden` is false als de scheiding ontbreekt — dan is alles clausule. Dat is
 *   geen fout maar wel iets om te melden: het betekent dat het model de instructie
 *   niet volgde, of dat de prompt gewijzigd is.
 */
export function splitsClausuleAntwoord(tekst) {
  const bron = String(tekst ?? '');
  const m = bron.match(RE_TOELICHTING);
  if (!m) return { clausule: bron.trim(), toelichting: '', gevonden: false };
  return {
    clausule:    bron.slice(0, m.index).trim(),
    toelichting: bron.slice(m.index + m[0].length).trim(),
    gevonden:    true,
  };
}

/**
 * Splitst de toelichting in secties. Het model kopt elke sectie met **vet**.
 *
 * @returns {Array<{kop: string, body: string}>}
 */
export function splitsToelichting(toelichting) {
  const bron = String(toelichting ?? '').trim();
  if (!bron) return [];
  return bron
    .split(/\n(?=\*\*)/)
    .map(deel => {
      const kopMatch = deel.match(/^\*\*(.*?)\*\*\n?/);
      const kop  = kopMatch ? kopMatch[1].trim() : 'Toelichting';
      const body = (kopMatch ? deel.slice(kopMatch[0].length) : deel)
        .replace(RE_STREEPLIJN, '')   // scheidingslijnen tussen secties weg
        .trim();
      return { kop, body };
    })
    .filter(s => s.body || s.kop !== 'Toelichting');
}

/**
 * Haalt uit de sectie "Minimale vereisten" de drie delen die de UI apart toont.
 *
 * @returns {{onderbouwing: string, minimaleTekst: string, meerwaarde: string}}
 */
export function splitsMinimaleVereisten(body) {
  const bron = String(body ?? '');
  const m = bron.match(RE_MINIMAAL);
  if (!m) return { onderbouwing: bron.trim(), minimaleTekst: '', meerwaarde: '' };

  const onderbouwing = bron.slice(0, m.index).trim();
  const rest = bron.slice(m.index + m[0].length).trim();

  // De minimale clausule is de eerste alinea; wat daarna komt legt uit waarom de
  // uitgebreide versie meerwaarde heeft.
  const grens = rest.indexOf('\n\n');
  return {
    onderbouwing,
    minimaleTekst: (grens === -1 ? rest : rest.slice(0, grens)).trim(),
    meerwaarde:    (grens === -1 ? ''   : rest.slice(grens)).trim(),
  };
}

/** Herkent de sectie waarin de minimale tekst hoort te staan. */
export function isMinimaleVereistenKop(kop) {
  return /minimale/i.test(String(kop ?? ''));
}
