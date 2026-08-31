/**
 * src/analyse/afgekapt.js — is de analyse wel afgemaakt?
 *
 * Aanleiding (31 augustus 2026). Een analyse van twee documenten werd na 120 seconden
 * door Vercel doodgeschoten. Voor één van de twee documenten ontbraken daardoor álle
 * juridische, balans-, grammatica- en conflictbevindingen, en de consolidatie draaide
 * voor geen van beide.
 *
 * De app merkte er niets van. De leeslus is:
 *
 *     let _klaar = false;
 *     while (!_klaar) { const { done } = await lees(); if (done) break; … }
 *
 * Valt de server weg, dan eindigt de stroom, `break`, en `_klaar` blijft `false` — maar
 * niemand keek daarnaar. De code voegde samen wat er binnen was en toonde een rapport
 * dat er compleet uitzag. Voor een mediator die op die lijst afgaat is dat het gevaar:
 * niet dat er iets misging, maar dat het er niet aan te zien was.
 *
 * Daarom wordt hier niet alleen vastgesteld DAT er iets ontbreekt, maar ook wát. "De
 * analyse is niet afgemaakt" is een melding waar je niets mee kunt; "voor het
 * ouderschapsplan ontbreken de juridische toets en de balans" zegt precies welk deel
 * van het rapport je niet moet vertrouwen.
 */

/** Wat er per document binnen hoort te komen, met de naam zoals de gebruiker die kent. */
export const VERWACHT_PER_DOC = [
  ['structuur', 'volledigheid'],
  ['juridisch', 'juridische toets'],
  ['balans',    'balans'],
];

/**
 * Welke delen er per document ontbreken.
 *
 * @param {object} acc          `_sseAcc`: bestandsnaam → { structuur, juridisch, … }
 * @param {string[]} bestanden  de hoofddocumenten van deze analyse
 * @returns {Array<{bestandsnaam: string, ontbreekt: string[]}>}
 */
export function ontbrekendeDelen(acc = {}, bestanden = []) {
  const uit = [];
  for (const bn of Array.isArray(bestanden) ? bestanden : []) {
    const deel = acc?.[bn] || {};
    // `null` betekent bij deze accumulator "aangevraagd, nog niet binnen"; alleen een
    // ontbrekende of null-waarde telt als ontbrekend. Een leeg resultaat is een
    // geldige uitkomst — een document zónder juridische bevindingen bestaat.
    const ontbreekt = VERWACHT_PER_DOC
      .filter(([sleutel]) => deel[sleutel] == null)
      .map(([, label]) => label);
    if (ontbreekt.length) uit.push({ bestandsnaam: bn, ontbreekt });
  }
  return uit;
}

/**
 * Beoordeelt de afloop van de stroom.
 *
 * @param {object} p
 * @param {boolean} p.klaarOntvangen  is het `klaar`-event binnengekomen?
 * @param {object}  p.acc
 * @param {string[]} p.bestanden
 * @returns {{volledig: boolean, ontbrekend: Array, melding: string}}
 */
export function beoordeelAfloop({ klaarOntvangen = false, acc = {}, bestanden = [] } = {}) {
  const ontbrekend = ontbrekendeDelen(acc, bestanden);

  // Beide kanten tellen. Kwam `klaar` niet binnen, dan is de stroom afgebroken — ook
  // als er toevallig niets ontbreekt. En ontbreekt er iets terwijl `klaar` wél kwam,
  // dan is er iets anders misgegaan en is het rapport net zo goed onvolledig.
  if (klaarOntvangen && ontbrekend.length === 0) {
    return { volledig: true, ontbrekend: [], melding: '' };
  }

  return { volledig: false, ontbrekend, melding: afkappingMelding(ontbrekend) };
}

/** De tekst voor de gebruiker: wat er mist, en wat dat betekent. */
export function afkappingMelding(ontbrekend = []) {
  if (!ontbrekend.length) {
    return 'De analyse is niet volledig afgerond. Draai hem opnieuw voordat u op deze '
         + 'lijst afgaat.';
  }
  const delen = ontbrekend.map(({ bestandsnaam, ontbreekt }) =>
    `${bestandsnaam}: ${ontbreekt.join(', ')}`);
  return 'De analyse is niet afgemaakt — deze onderdelen ontbreken: '
       + `${delen.join(' · ')}. Wat hieronder staat klopt, maar is onvolledig. `
       + 'Draai de analyse opnieuw.';
}
