/**
 * Smoketest 13 — het klassieke script wacht op de ESM-brug
 *
 * Op 29 augustus 2026 meldde de app bij het openen: "Kon dossiers niet laden:
 * maakGrad is not defined". Geen foutmelding in de console, geen 404, niets — alleen
 * die ene regel op een verder leeg scherm. Bij verversen was het soms weg.
 *
 * De oorzaak: `laadDossiers()` staat aan het eind van de opstart-IIFE in het KLASSIEKE
 * script, dat meteen draait. Het moduleblok onderaan index.html is *deferred* en draait
 * pas ná het parsen. Alles wat via `window.*` uit src/ komt, bestaat op dat moment nog
 * niet.
 *
 * Die race zat er altijd al in en werd altijd gewonnen, omdat de modulegraaf klein
 * genoeg was. Toen die van ongeveer twintig naar dertig bestanden groeide, werd hij
 * verloren. Dezelfde fout brak drie dagen eerder zes browsertests; toen is hij in de
 * tests opgelost en niet in de app.
 *
 * Deze test bewaakt de reparatie: het klassieke script wacht via `brugGereed` tot het
 * moduleblok `_brugGereedMelden()` heeft aangeroepen.
 *
 * Faalt hij, kijk dan of die aanroep nog de laatste regel van het moduleblok is.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

test.describe('ESM-brug', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page);
    await mockSupabaseRest(page);
    await page.route('**storage.googleapis.com/**', r => r.abort());
    await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
  });

  test('de dossierlijst laadt zonder "is not defined"', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    const meldingen = [];
    page.on('console', m => { if (m.type() === 'error') meldingen.push(m.text()); });

    // Twee dingen zijn nodig om deze fout te kunnen zien, en beide zijn nagegaan
    // door de reparatie weg te halen en te kijken of de test dan rood wordt.
    //
    // 1. Een dossier MÉT analyse. De gedeelde fixture heeft er geen, en dan tekent
    //    laadDossiers "Nog geen analyse" — waarbij maakGrad nooit wordt aangeroepen
    //    en er dus ook niets kan struikelen.
    await page.route('**/rest/v1/dossiers**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        id: '00000000-0000-0000-0000-000000000010',
        naam: 'Race Dossier', partij_a: 'Jan', partij_b: 'Maria',
        status: 'actief', updated_at: '2026-08-29T10:00:00Z',
        screeningen: [{
          id: '00000000-0000-0000-0000-0000000000a1',
          bestandsnaam: 'convenant.pdf', versie_nr: 1,
          created_at: '2026-08-29T10:00:00Z',
          classificatie: { doc_type: 'convenant' },
          rapport: { documenten: [{ doc_type: 'convenant', issues: [
            { onderwerp: 'Pensioen', ernst: 'hoog',   dimensies: ['juridisch'] },
            { onderwerp: 'Tikfout',  ernst: 'laag',   dimensies: ['grammatica'] },
          ] }] },
        }],
      }]),
    }));

    // 2. De race AFDWINGEN. Zonder vertraging wint het moduleblok in de
    //    testomgeving gewoon. Een halve seconde per modulebestand bootst na wat er in
    //    productie gebeurde toen de graaf van ~20 naar ~30 bestanden groeide: het
    //    klassieke script is dan als eerste klaar en begint te tekenen.
    await page.route('**/src/**/*.js', async route => {
      await new Promise(r => setTimeout(r, 400));
      await route.continue();
    });

    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
    await page.waitForFunction(() => typeof window.maakGrad === 'function', null, { timeout: 20_000 });

    // De foutmelding die de gebruiker zag, mag nergens in beeld staan.
    const tekst = await page.locator('#dossierLijst').textContent();
    expect(tekst || '').not.toMatch(/is not defined/);
    expect(meldingen.join(' ')).not.toMatch(/maakGrad is not defined/);

    verwachtGeenPaginafouten(fouten);
  });

  test('brugGereed lost pas op als de brug er werkelijk is', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('#dossierLijst', { timeout: 45_000 });

    const uit = await page.evaluate(async () => {
      // Wachten op de belofte en dan kijken of de brug er is. Lost hij te vroeg op,
      // dan is minstens één van deze nog undefined — precies de situatie waarin
      // laadDossiers over maakGrad struikelde.
      await brugGereed;
      return {
        maakGrad: typeof window.maakGrad,
        score:    typeof window.berekenGemiddeldeScore,
        kpi:      typeof window.kpiStripHtml,
      };
    });

    expect(uit).toEqual({ maakGrad: 'function', score: 'function', kpi: 'function' });
  });

  test('de melder staat als laatste in het moduleblok', async ({ page }) => {
    // Zonder deze aanroep blijft de app acht seconden staan en gaat daarna door met
    // een fout. Dat is een vangnet, geen werkende toestand — dus bewaken we dat de
    // aanroep er staat, en dat er niets ná komt dat nog op window schrijft.
    const html = await (await page.request.get('/index.html')).text();
    const eind = html.lastIndexOf('</script>');
    const staart = html.slice(eind - 400, eind);
    expect(staart).toContain('_brugGereedMelden');
    const naMelder = staart.slice(staart.indexOf('_brugGereedMelden?.()'));
    expect(naMelder).not.toMatch(/window\.\w+\s*=/);
  });
});
