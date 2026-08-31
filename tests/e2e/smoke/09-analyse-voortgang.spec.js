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
import { wachtOpBrug } from '../helpers/brug.js';

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
  await wachtOpBrug(page);
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

/**
 * Bouwt de kopregel zoals beide renderpaden hem opleveren, zodat
 * tekenVoortgangStatus een echte plek heeft om in te schrijven.
 */
async function toonKopregel(page) {
  await page.evaluate(() => {
    document.getElementById('analysePanel').innerHTML =
      `<div class="sticky-chips-bar"><div class="issue-filter-bar"><div class="issues-hdr">`
      + `<span class="issues-hdr-title" id="stickySectieTitel">Convenant — Verbeterpunten</span>`
      + `<span class="hdr-status" id="voortgangStatus" aria-live="polite"></span>`
      + `</div></div></div>`;
  });
}

// Dit is de reparatie van 31 augustus 2026. De zin hing aan "er is nog niets" in
// plaats van aan "er wordt nog gewerkt", en verdween dus zodra het eerste
// verbeterpunt binnenkwam — precies wanneer je hem nodig hebt.
test.describe('de status blijft staan als er al resultaten zijn', () => {
  test('bezig mét resultaten levert de compacte regel in de kopbalk', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    await toonKopregel(page);

    const modus = await page.evaluate(() => {
      const s = voortgangStatus({
        nogBezig: true, aantalIssues: 6,
        dimLoadt: { balans: true, grammatica: true },
        labels: { balans: 'Balans', grammatica: 'Grammatica' },
      });
      tekenVoortgangStatus(s);
      return s.modus;
    });

    expect(modus).toBe('compact');
    await expect(page.locator('#voortgangStatus')).toHaveText('Bezig met balans en grammatica…');
    await expect(page.locator('#voortgangStatus .laad-spin')).toHaveCount(1);

    verwachtGeenPaginafouten(fouten);
  });

  test('de regel krimpt mee en verdwijnt als het klaar is', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    await toonKopregel(page);
    const status = page.locator('#voortgangStatus');

    await page.evaluate(() => tekenVoortgangStatus(voortgangStatus({
      nogBezig: true, aantalIssues: 6,
      dimLoadt: { grammatica: true }, labels: { grammatica: 'Grammatica' },
    })));
    await expect(status).toHaveText('Bezig met grammatica…');

    // Klaar, en zojuist afgerond: kort een bevestiging, want anders is het einde van
    // de analyse even onzichtbaar als het verloop was.
    await page.evaluate(() => tekenVoortgangStatus(voortgangStatus({
      nogBezig: false, afgerondOp: Date.now(),
    })));
    await expect(status).toHaveText('✓ Analyse compleet');

    // En een rapport zonder afronding in deze sessie zegt niets.
    await page.evaluate(() => tekenVoortgangStatus(voortgangStatus({ nogBezig: false })));
    await expect(status).toHaveText('');

    verwachtGeenPaginafouten(fouten);
  });

  test('beide renderpaden hebben de plek voor de status', async ({ page }) => {
    // Zonder dit element schrijft tekenVoortgangStatus stilletjes nergens heen —
    // geen fout, geen melding, alleen weer een leeg scherm.
    const html = await (await page.request.get('/index.html')).text();
    const treffers = html.match(/id="voortgangStatus"/g) || [];
    expect(treffers).toHaveLength(2);

    // En dat de renderpaden hem ook áánroepen. De module en het tekenen zijn los
    // getoetst; wat daartussen zit is bedrading, en juist dáár ging het eerder mis:
    // kloppende logica die nergens werd gebruikt (de brug-race, 29-08-2026).
    expect(html).toMatch(/_voortgang\s*=\s*voortgangStatus\(/);
    expect(html.match(/tekenVoortgangStatus\(/g) || []).not.toHaveLength(0);
    expect(html).toMatch(/tekenVoortgangStatus\(_voortgang\)/);
  });
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
