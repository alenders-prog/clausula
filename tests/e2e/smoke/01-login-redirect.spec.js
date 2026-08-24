/**
 * Smoketest 01 — Redirect naar login.html als er geen sessie is
 *
 * Verifieert dat de startup-IIFE in index.html bij een ontbrekende of verlopen
 * Supabase-sessie doorverwijst naar /login.html.
 * Als deze test faalt terwijl er een geldige sessie is: de auth-check is kapot.
 */

import { test, expect } from '@playwright/test';
import { mockCdnScripts } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

const SUPABASE_HOST = 'zanxprrymagsuwxddiln.supabase.co';

test('redirect naar login.html bij ontbrekende sessie', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  // CDN-scripts lokaal serveren zodat de pagina niet op het netwerk wacht
  await mockCdnScripts(page);

  // Geen localStorage-sessie — mock auth-endpoint met 401
  await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, route => {
    route.fulfill({ status: 401, body: JSON.stringify({ error: 'not authenticated' }) });
  });

  // Andere Supabase-aanroepen ook blokkeren zodat ze niet hangen
  await page.route(`**/${SUPABASE_HOST}/**`, route => {
    route.fulfill({ status: 401, body: '{}' });
  });

  await page.goto('/', { waitUntil: 'commit' });

  // App moet doorverwijzen naar login pagina (serve strip .html → /login)
  await expect(page).toHaveURL(/login/, { timeout: 30_000 });

  verwachtGeenPaginafouten(fouten);
});
