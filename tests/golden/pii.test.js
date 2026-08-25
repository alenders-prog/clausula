/**
 * Fixtures bevatten geen persoonsgegevens — deterministisch, geen API-calls.
 *
 * Aanleiding (25 augustus 2026): de eerste `sample-output-*.json` kwam uit een echte
 * screening en bevatte drie rekeningidentificaties, letterlijk in de issue-titels:
 * `NL046344501`, `NL414678501` en `60.75.97.461`. Ze stonden op het punt de
 * git-historie in te gaan, waar ze niet meer uit weg te krijgen zijn.
 *
 * Ze waren bovendien onvervangen naar de Anthropic API gegaan: geen van drieën
 * voldoet aan het IBAN-formaat, dus de pseudonimisering zag ze niet. Dat gat zit
 * inmiddels dicht (`rekeningOverigRe` in src/iban-patroon.js), maar deze test staat
 * hier voor het andere risico — dat iemand een bewaard rapport in de repo zet.
 *
 * Waarom een test en niet een leesronde: de eerste keer viel het op omdat er iemand
 * expliciet naar zocht. Dat is precies het soort controle dat één keer gebeurt.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Elk patroon met een naam, zodat de melding zegt wát er gevonden is en niet
// alleen dát er iets is.
const PATRONEN = [
  ['IBAN',            /\b[A-Z]{2}\d{2}\s?[A-Z]{4}(?:\s?\d){10}\b/g],
  ['rekening (NL+cijfers)', /\bNL\d{6,12}\b/g],
  ['rekening (oude notatie)', /\b\d{2}\.\d{2}\.\d{2}\.\d{3}\b/g],
  ['BSN',             /(?<![A-Z]{4} )\b\d{9}\b/g],
  ['postcode',        /\b\d{4}\s?[A-Z]{2}\b/g],
  ['e-mailadres',     /[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g],
  ['telefoonnummer',  /(?<![A-Z\d[])(?:0[1-9]\d{1,2}[-.\s]?\d{6,8}|\+31[-.\s]?[1-9]\d{8})(?!\d)/g],
];

// Placeholders zijn juist het bewijs dát er gepseudonimiseerd is — die mogen blijven
// staan en moeten dus niet als treffer meetellen.
const PLACEHOLDER = /\[(?:IBAN|REKENING|POSTCODE|ADRES|PERSOON|WOONPLAATS)[-_]?\d*\]|\[(?:BSN|TEL|EMAIL)\]/g;

// Bewust verzonnen waarden die in de documenttekst van een fixture móéten staan.
// `NL91INGB0001234567` is het algemeen gebruikte dummy-nummer (rekeningdeel 0001234567);
// zonder een IBAN in de tekst heeft `filterIssuesOpIban` niets om op te toetsen en zou
// convenant-tegenstrijdig.json zijn doel verliezen.
//
// Deze lijst is expres kort en per stuk beredeneerd. Groeit hij, dan is dat een teken
// dat er echte gegevens worden goedgepraat in plaats van vervangen.
// `9999 ZZ` valt buiten elk uitgegeven Nederlands postcodebereik en is dus per
// definitie van niemand. cross-doc-hoofdverblijf.json kán er niet zonder: die fixture
// bestaat om te toetsen dat één gedeeld woonadres géén tegenstrijdigheid oplevert,
// dus er moet een adres in de documenttekst staan.
const TOEGESTAAN = [
  'NL91INGB0001234567',
  '9999 ZZ',
];

const bestanden = (() => {
  try { return readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json')); }
  catch { return []; }
})();

describe('Fixtures bevatten geen persoonsgegevens', () => {
  it('er zijn fixtures om te controleren', () => {
    expect(bestanden.length).toBeGreaterThan(0);
  });

  for (const bestand of bestanden) {
    it(`${bestand} is vrij van herleidbare gegevens`, () => {
      let ruw = readFileSync(join(FIXTURES_DIR, bestand), 'utf8').replace(PLACEHOLDER, '');
      for (const waarde of TOEGESTAAN) ruw = ruw.split(waarde).join('');

      const gevonden = [];
      for (const [naam, re] of PATRONEN) {
        const treffers = [...new Set(ruw.match(re) || [])];
        if (treffers.length) gevonden.push(`${naam}: ${treffers.slice(0, 5).join(', ')}`);
      }

      expect(
        gevonden,
        `${bestand} bevat gegevens die niet in de git-historie horen. `
        + `Vervang ze door placeholders ([REKENING_0], [POSTCODE_0], …) voordat je commit.`,
      ).toEqual([]);
    });
  }
});
