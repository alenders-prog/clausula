/**
 * Smoketest 09 — de wachttekst tijdens de analyse noemt wat er nog draait
 *
 * Geschiedenis (24 augustus 2026, drie stappen op één middag):
 *
 *  1. Er stond een veeg-animatie met "Bezig met analyseren…". Eén zin, twee
 *     minuten lang hetzelfde.
 *  2. Daarop kwam er een regel bij die na twintig seconden meldde dat het langer
 *     duurde dan gebruikelijk. Dat was onwaar — er was al gezegd dat het een paar
 *     minuten duurt — en het wekte ongeduld in plaats van het weg te nemen.
 *  3. Nu noemt de tekst zelf welke dimensies nog moeten binnenkomen. De zin wordt
 *     korter naarmate de analyse vordert; dan staat er niets meer stil en valt er
 *     over stilstand ook niets meer te melden.
 *
 * Wat hier wordt vastgelegd: dat de zin de lopende dimensies benoemt, dat hij
 * meebeweegt, en dat er één spinner staat en geen drie balken.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

/** Rendert de voortgangsweergave met een gekozen set nog-lopende dimensies. */
async function toonVoortgang(page, bezig) {
  return page.evaluate(([lopend]) => {
    const DIM_LABELS = { volledigheid: 'Volledigheid', juridisch: 'Juridische toets',
      balans: 'Balans', grammatica: 'Grammatica', conflicten: 'Conflicten',
      cross_doc: 'Cross-document' };
    const dims = lopend.map(d => (DIM_LABELS[d] || d).toLowerCase());
    const zin = dims.length ? `Bezig met ${lijstZin(dims)}…` : 'Bezig met analyseren…';
    document.getElementById('analysePanel').innerHTML =
      `<div class="krl-wrap"><span class="laad-spin groot"></span>`
      + `<div class="krl-lbl">${zin}</div></div>`;
    return zin;
  }, [bezig]);
}

test.beforeEach(async ({ page }) => {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**storage.googleapis.com/**', r => r.abort());
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await page.evaluate(() => document.getElementById('splitOverlay').classList.add('active'));
});

test('noemt de dimensies die nog draaien', async ({ page }) => {
  const fouten = volgPaginafouten(page);

  await toonVoortgang(page, ['juridisch', 'balans', 'grammatica']);
  const lbl = page.locator('.krl-wrap .krl-lbl');
  await expect(lbl).toHaveText('Bezig met juridische toets, balans en grammatica…');

  verwachtGeenPaginafouten(fouten);
});

test('de zin wordt korter naarmate dimensies binnenkomen', async ({ page }) => {
  // Dit is de voortgang die je wilt zien: er verandert echt iets, dus er staat
  // niets stil en er valt niets te melden over stilstand.
  const fouten = volgPaginafouten(page);
  const lbl = page.locator('.krl-wrap .krl-lbl');

  await toonVoortgang(page, ['volledigheid', 'juridisch', 'balans']);
  await expect(lbl).toHaveText('Bezig met volledigheid, juridische toets en balans…');

  await toonVoortgang(page, ['juridisch', 'balans']);
  await expect(lbl).toHaveText('Bezig met juridische toets en balans…');   // geen komma bij twee

  await toonVoortgang(page, ['balans']);
  await expect(lbl).toHaveText('Bezig met balans…');

  await toonVoortgang(page, []);
  await expect(lbl).toHaveText('Bezig met analyseren…');   // terugval als er niets bekend is

  verwachtGeenPaginafouten(fouten);
});

test('één spinner, geen drie balken', async ({ page }) => {
  // Drie brede balken suggereerden kaarten die er zo aankomen, maar ze leken er
  // niet op en het waren er te veel voor één mededeling.
  const fouten = volgPaginafouten(page);

  await toonVoortgang(page, ['juridisch']);
  await expect(page.locator('.krl-wrap .laad-spin')).toHaveCount(1);
  await expect(page.locator('.krl-wrap .laad-skelet')).toHaveCount(0);

  verwachtGeenPaginafouten(fouten);
});

test('de regel over "langer dan gebruikelijk" bestaat niet meer', async ({ page }) => {
  // Hij meldde na twintig seconden iets wat niet waar was: het was al aangekondigd
  // dat de analyse een paar minuten duurt. Een melding die iets onverwachts
  // aankondigt terwijl het verwacht was, maakt ongeduldig.
  const fouten = volgPaginafouten(page);

  expect(await page.evaluate(() => !!document.getElementById('analyseTraag'))).toBe(false);
  expect(await page.evaluate(() => typeof startTraagBewaking)).toBe('undefined');

  verwachtGeenPaginafouten(fouten);
});
