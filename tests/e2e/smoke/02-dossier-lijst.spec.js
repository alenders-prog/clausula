/**
 * Smoketest 02 — Dossier-overzicht laadt na inloggen
 *
 * Verifieert de volledige startup-flow: sessie-check → gebruikersprofiel laden →
 * dossiers ophalen → dossier-kaarten renderen.
 * Als deze test faalt: de initialisatie-keten of dossier-rendering is kapot.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

test('dossier-lijst toont kaarten na inlog', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });

  // Dossier-lijst moet zichtbaar zijn
  const lijst = page.locator('#dossierLijst');
  await expect(lijst).toBeVisible({ timeout: 45_000 });

  // Minimaal één dossier-kaart aanwezig (uit fixture dossiers.json)
  const kaart = lijst.locator('.dos-kaart').first();
  await expect(kaart).toBeVisible({ timeout: 20_000 });

  // Topbar toont de praktijknaam (bewijst dat gebruikersprofiel geladen is)
  const firm = page.locator('#topbarFirm');
  await expect(firm).not.toBeEmpty({ timeout: 20_000 });

  verwachtGeenPaginafouten(fouten);
});
