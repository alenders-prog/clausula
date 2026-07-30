/**
 * Smoketest 03 — Analyseknop activeert zodra een bestand in de tray staat
 *
 * Stelt een dossier-context in via zetDossierContext(), laadt een minimaal
 * PDF-bestand in de tray en verifieert dat #analyseBtn enabled wordt.
 * Als deze test faalt: trayVoegToe(), trayRender() of de enable-logica is kapot.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';

test('analyseknop enabled na bestand in tray', async ({ page }) => {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });

  // Stel een dossier-context in zodat #analyseBtn actief kan worden
  // (zetDossierContext is een globale function-declaratie, toegankelijk via window)
  await page.evaluate(() => {
    window.zetDossierContext('00000000-0000-0000-0000-000000000010', 'Test Dossier');
  });

  // Minimaal PDF-bestand aanmaken als buffer (leeg maar geldig genoeg voor tray)
  const minimalPdf = Buffer.from(
    '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj ' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
    '0000000058 00000 n\n0000000115 00000 n\n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF',
    'utf-8'
  );

  // Zet het bestand op de verborgen file input — triggert trayVoegToe()
  const fileInput = page.locator('#fileInput');
  await fileInput.setInputFiles({
    name: 'test-convenant.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf,
  });

  // Analyseknop moet enabled worden (disabled=false zodra dossier + bestand aanwezig)
  const analyseBtn = page.locator('#analyseBtn');
  await expect(analyseBtn).toBeEnabled({ timeout: 8_000 });
});
