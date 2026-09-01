/**
 * tests/e2e/helpers/paginafouten.js
 *
 * Vangt fouten op die pas ontstaan als iemand de pagina daadwerkelijk gebruikt.
 *
 * Aanleiding (23 augustus 2026). Twee fouten haalden op één dag productie:
 *
 *     bouwVerificatieContext is not defined      (ESM-import niet aan window gehangen)
 *     STREAM_ONDERDELEN is not defined           (declaratie bij een refactor meegeknipt)
 *
 * Beide zijn geen syntaxfout — de pagina laadt gewoon — dus de parse-controles en de
 * unittests zagen er niets van. Ze braken pas bij de eerste klik, en de mediator kreeg
 * "Er is een fout opgetreden" te zien.
 *
 * `pageerror` vuurt bij precies dat: een onafgevangen fout in de pagina. Eén regel per
 * test, en deze hele klasse is gedekt.
 *
 * Gebruik:
 *   const fouten = volgPaginafouten(page);
 *   … de test …
 *   verwachtGeenPaginafouten(fouten);
 */

import { expect } from '@playwright/test';

/**
 * Meldingen die niet van ons zijn en die de test niet horen te laten falen.
 * Elke uitzondering staat hier één keer, met de reden erbij — groeit deze lijst,
 * dan is dat zichtbaar in de diff.
 */
const NEGEER = [
  // pdf.js en docx-preview klagen over ontbrekende fonts in de headless browser.
  /Warning: TT: undefined function/i,
  /fetchStandardFontData/i,
  // De mock-Supabase geeft geen realtime-kanaal; de app probeert dat wel te openen.
  /realtime/i,
];

/**
 * Begint met verzamelen. Geeft een array terug die tijdens de test volloopt.
 * @param {import('@playwright/test').Page} page
 */
export function volgPaginafouten(page) {
  const fouten = [];

  // Onafgevangen fouten in de pagina — hier komt een ReferenceError terecht.
  page.on('pageerror', err => {
    const melding = err?.message || String(err);
    if (!NEGEER.some(re => re.test(melding))) fouten.push(`pageerror: ${melding}`);
  });

  // console.error is zwakker bewijs (de app logt bewust fouten die niet fataal zijn),
  // maar een ReferenceError die in een try/catch belandt komt hier wél langs.
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const tekst = msg.text();
    if (NEGEER.some(re => re.test(tekst))) return;
    // Alleen echte JS-fouten; netwerk- en applicatiemeldingen zijn ruis.
    if (/is not defined|is not a function|Cannot read propert|undefined is not/i.test(tekst)) {
      fouten.push(`console: ${tekst}`);
    }
  });

  return fouten;
}

/**
 * Laat de test falen met de fout erbij, in plaats van met een vage assertie.
 *
 * @param {string[]} fouten
 * @param {RegExp[]} verwacht  meldingen die déze test bewust uitlokt. Een test die een
 *   mislukking naspeelt hóórt een foutregel op te leveren; die hier benoemen is eerlijker
 *   dan hem aan de algemene NEGEER-lijst toevoegen, want daar zou hij álle tests blind
 *   maken voor dezelfde fout.
 */
export function verwachtGeenPaginafouten(fouten, verwacht = []) {
  const over = fouten.filter(f => !verwacht.some(re => re.test(f)));
  expect(over, `\nRuntime-fouten in de pagina:\n  ${over.join('\n  ')}\n`).toEqual([]);
}

/**
 * Controleert of een bericht in de UI geen verklede fout is.
 *
 * `pageerror` vuurt alleen bij een ónafgevangen fout. De assistent vangt alles af in
 * een try/catch en toont "Er is een fout opgetreden: …" — dat is precies wat de
 * mediator op 23 augustus 2026 zag bij `STREAM_ONDERDELEN is not defined`. Van buiten
 * is dat een normaal bericht; alleen de inhoud verraadt het.
 *
 * @param {import('@playwright/test').Locator} bericht
 */
export async function verwachtGeenFoutbericht(bericht) {
  const tekst = (await bericht.textContent()) || '';
  const fout = tekst.match(/Er is een fout opgetreden:[^\n]*/i)
    || tekst.match(/\b\w+ is not (defined|a function)\b/i)
    || tekst.match(/Cannot read propert[^\n]*/i);
  expect(fout?.[0] ?? null, `\nDe assistent toonde een foutbericht:\n  ${fout?.[0]}\n`).toBe(null);
}
