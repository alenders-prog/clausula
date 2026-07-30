/**
 * Smoketest 05 — PDF-rapport knop zichtbaar na laden rapport
 *
 * Verifieert dat de rapport-toolbar (#downloadPdfBtn) zichtbaar is nadat
 * toonRapport() is aangeroepen. RTF-export bestaat niet meer — dit is de
 * vervangende smoketest voor de export-laag.
 *
 * Als deze test faalt maar eerdere slagen: #downloadPdfBtn ontbreekt of
 * de split-overlay rendert de docbar niet.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLS = JSON.parse(readFileSync(join(__dirname, '../fixtures/classificatie.json'), 'utf8'));
const RPT = JSON.parse(readFileSync(join(__dirname, '../fixtures/rapport.json'), 'utf8'));

test('PDF-rapport knop zichtbaar na laden rapport', async ({ page }) => {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });

  // Activeer de split-overlay (normaal gebeurt dit via openSplitView())
  await page.evaluate(() => {
    document.getElementById('splitOverlay').classList.add('active');
  });

  // Laad rapport-fixture
  await page.evaluate(async ([cls, rp]) => {
    window.huidigeBestandenLijst = [];
    window.huidigePrimaireBest   = [];
    await window.toonRapport(cls, rp);
  }, [CLS, RPT]);

  // Issues-lijst moet gevuld zijn
  await page.waitForSelector('#issuesLijst', { timeout: 8_000 });

  // PDF-rapport knop moet zichtbaar zijn in de docbar
  const pdfBtn = page.locator('#downloadPdfBtn');
  await expect(pdfBtn).toBeVisible({ timeout: 5_000 });
  await expect(pdfBtn).toBeEnabled();
});
