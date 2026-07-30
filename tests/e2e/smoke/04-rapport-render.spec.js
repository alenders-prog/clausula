/**
 * Smoketest 04 — Rapport rendert correct via geïnjecteerde state
 *
 * Activeert #splitOverlay, injecteert fixture classificatie + rapport direct
 * in de window-globals en roept toonRapport() aan. Verifieert dat de
 * rapport-UI verschijnt zonder crash.
 *
 * Als de test faalt maar eerdere slagen: toonRapport() of één van de
 * render-helpers is kapot, of #splitOverlay wordt niet correct geopend.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLS = JSON.parse(readFileSync(join(__dirname, '../fixtures/classificatie.json'), 'utf8'));
const RPT = JSON.parse(readFileSync(join(__dirname, '../fixtures/rapport.json'), 'utf8'));

test('rapport rendert na state-injectie', async ({ page }) => {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.route('**storage.googleapis.com/**', r => r.abort());
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });

  // Activeer de split-overlay — toonRapport() vereist dat #splitOverlay zichtbaar is
  await page.evaluate(() => {
    document.getElementById('splitOverlay').classList.add('active');
  });

  // Injecteer fixture-state en roep toonRapport() direct aan
  const result = await page.evaluate(async ([cls, rp]) => {
    window.huidigeBestandenLijst = [];
    window.huidigePrimaireBest   = [];
    try {
      await window.toonRapport(cls, rp);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [CLS, RPT]);

  expect(result.ok, `toonRapport() gaf fout: ${result.error}`).toBe(true);

  // Issues-lijst moet gevuld zijn (toonRapport schrijft naar #issuesLijst)
  const issuesEl = page.locator('#issuesLijst');
  await expect(issuesEl).toBeVisible({ timeout: 8_000 });

  // Sticky-chips-balk met filter-chips moet zichtbaar zijn
  const chipsBar = page.locator('.sticky-chips-bar');
  await expect(chipsBar).toBeVisible({ timeout: 5_000 });
});
