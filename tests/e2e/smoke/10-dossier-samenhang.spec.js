/**
 * Smoketest 10 — de dossier-samenhangtoets is in de pagina bereikbaar en werkt
 *
 * De toets zelf heeft negentien unittests in tests/unit/dossier-samenhang.test.js.
 * Die zeggen alleen niets over de brug: `toetsDossierSamenhang` wordt in het klassieke
 * script van index.html aangeroepen, maar geïmporteerd in het module-script onderaan.
 * Loopt daar iets mis — een vergeten `window.`-toewijzing, een verkeerd pad — dan laadt
 * de pagina zonder klacht en breekt de analyse pas bij de eerste keer starten, met
 * `toetsDossierSamenhang is not defined`.
 *
 * Precies die klasse fout haalde op 23 augustus 2026 twee keer productie
 * (`bouwVerificatieContext is not defined`, `STREAM_ONDERDELEN is not defined`).
 * Beide waren geldige JavaScript en beide werden door geen enkele unittest gezien.
 *
 * Faalt deze test, kijk dan eerst naar de ESM-brug onderaan index.html.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

test.describe('dossier-samenhang', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page);
    await mockSupabaseRest(page);
    await page.route('**storage.googleapis.com/**', r => r.abort());
    await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
    // Wachten op de brug zélf, niet op een element dat er toevallig omheen staat.
    // Het module-script laadt asynchroon; bij de eerste poging was `#dossierLijst`
    // er al en de toewijzing nog niet, wat een test opleverde die de ene keer
    // slaagde en de andere keer niet.
    await page.waitForFunction(
      () => typeof window.toetsDossierSamenhang === 'function'
         && typeof window.samenhangWaarschuwing === 'function',
      null, { timeout: 20_000 },
    );
  });

  test('herkent twee documenten uit verschillende dossiers', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const r = await page.evaluate(() => {
      const uitkomst = toetsDossierSamenhang({
        namen: ['Robin Bergman', 'Sammy Hartwijk', 'Chris Doornbos', 'Dani Elzinga'],
        documenten: [
          { bestandsnaam: 'convenant.pdf',       tekst: 'Robin Bergman en Sammy Hartwijk komen overeen…' },
          { bestandsnaam: 'ouderschapsplan.pdf', tekst: 'Chris Doornbos en Dani Elzinga spreken af…' },
        ],
      });
      return { oordeel: uitkomst.oordeel, vraag: samenhangWaarschuwing(uitkomst) };
    });

    expect(r.oordeel).toBe('mismatch');
    // De vraag moet eindigen met een keuze — anders staat er een mededeling waar een
    // doorgaan-of-afbreken hoort.
    expect(r.vraag).toContain('niet bij hetzelfde dossier');
    expect(r.vraag.trim().endsWith('Toch doorgaan met de analyse?')).toBe(true);

    verwachtGeenPaginafouten(fouten);
  });

  test('zwijgt bij documenten uit hetzelfde dossier', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const r = await page.evaluate(() => toetsDossierSamenhang({
      namen: ['Robin Bergman', 'Sammy Hartwijk'],
      documenten: [
        { bestandsnaam: 'convenant.pdf',       tekst: 'Robin Bergman en Sammy Hartwijk komen overeen…' },
        { bestandsnaam: 'ouderschapsplan.pdf', tekst: 'Robin en Sammy spreken af dat…' },
      ],
    }).oordeel);

    expect(r).toBe('ok');
    verwachtGeenPaginafouten(fouten);
  });
});
