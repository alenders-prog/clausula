/**
 * Smoketest 11 — het beveiligingstabblad laadt en toont de juiste toestand
 *
 * Beleid en weergave hebben 28 unittests. Die zeggen niets over de brug: vijf nieuwe
 * `window.*`-toewijzingen onderaan index.html, en het tabblad roept ze aan vanuit het
 * klassieke script. Gaat daar iets mis, dan laadt de pagina zonder klacht en breekt
 * het pas bij de eerste klik op "Beveiliging" — met `mfaStatusHtml is not defined`.
 *
 * Diezelfde klasse fout haalde op 23 augustus 2026 twee keer productie. Een tabblad in
 * een instellingenscherm is bovendien een plek waar niemand dagelijks komt, dus een
 * stille breuk kan er lang blijven zitten.
 *
 * Faalt deze test, kijk dan eerst naar de ESM-brug onderaan index.html.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

test.describe('beveiligingstabblad', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page);
    await mockSupabaseRest(page);
    await page.route('**storage.googleapis.com/**', r => r.abort());
    await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
    // Wachten op de brug zelf, niet op een element dat er toevallig omheen staat.
    await page.waitForFunction(
      () => typeof window.mfaStatusHtml === 'function'
         && typeof window.bepaalMfaStap === 'function',
      null, { timeout: 20_000 },
    );
  });

  test('een beheerder zonder factor krijgt een verplichting te zien', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const html = await page.evaluate(() => mfaStatusHtml(bepaalMfaStap({
      rol: 'admin', factoren: [], aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
    })));

    expect(html).toContain('mfa-verplicht');
    expect(html).toContain('mfaAanBtn');
    verwachtGeenPaginafouten(fouten);
  });

  test('een actieve factor levert de verwijderknop op, niet de instelknop', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const html = await page.evaluate(() => mfaStatusHtml(bepaalMfaStap({
      rol: 'gebruiker',
      factoren: [{ id: 'f1', factor_type: 'totp', status: 'verified' }],
      aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
    })));

    expect(html).toContain('mfaUitBtn');
    expect(html).not.toContain('mfaAanBtn');
    verwachtGeenPaginafouten(fouten);
  });

  test('het tabblad Beveiliging rendert zonder fout in de pagina', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    // Niet via een klik: het instellingenscherm hangt aan een sessie die de mock niet
    // volledig nabouwt. Wel het echte inzetpunt — de functie die het tabblad vult —
    // met de echte DOM eromheen, want dáár breekt een ontbrekende brug.
    const uit = await page.evaluate(() => {
      const el = document.getElementById('instBeveiligingBody');
      if (!el) return { fout: 'instBeveiligingBody ontbreekt' };
      el.innerHTML = mfaStatusHtml(bepaalMfaStap({
        rol: 'gebruiker', factoren: [], aal: { currentLevel: 'aal1' },
      }));
      return { knop: !!el.querySelector('#mfaAanBtn'), tekst: el.textContent.trim().slice(0, 40) };
    });

    expect(uit.fout).toBeUndefined();
    expect(uit.knop).toBe(true);
    expect(uit.tekst.length).toBeGreaterThan(0);
    verwachtGeenPaginafouten(fouten);
  });
});
