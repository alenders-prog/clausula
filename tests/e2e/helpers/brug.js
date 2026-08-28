/**
 * tests/e2e/helpers/brug.js — wachten tot de ESM-brug onderaan index.html heeft gedraaid
 *
 * Aanleiding (26 augustus 2026): zes smoketests vielen tegelijk om met meldingen als
 * `maakGrad is not defined`. Er was niets kapot — de brug werkte, alles stond op
 * `window`. Wat er gebeurde: die tests wachtten op `#dossierLijst` en riepen daarna
 * meteen een paginafunctie aan. `#dossierLijst` staat in de HTML en is er dus vrijwel
 * meteen; het module-script laadt asynchroon en is er later.
 *
 * Die race zat er altijd al in en werd altijd gewonnen, omdat de modulegraaf klein
 * genoeg was. Toen het dashboard er vier bestanden bij zette, werd hij verloren.
 *
 * Wachten op een element dat toevallig in de buurt staat is dus geen wachten op de
 * voorwaarde. Deze helper wacht op de voorwaarde zelf.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string[]} namen  extra globals waar deze test op leunt
 */
export async function wachtOpBrug(page, namen = []) {
  // maakGrad is de laatste van een lange rij toewijzingen en dus een goede kanarie:
  // staat die er, dan is het hele moduleblok doorlopen.
  const vereist = ['maakGrad', ...namen];
  await page.waitForFunction(
    (lijst) => lijst.every(n => typeof window[n] !== 'undefined'),
    vereist,
    { timeout: 20_000 },
  );
}
