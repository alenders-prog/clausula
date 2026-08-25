/**
 * Smoketest 09 — de regel die verschijnt als de voortgang stilstaat
 *
 * Aanleiding (24 augustus 2026). Tijdens een analyse: "er lijkt nu niets meer te
 * gebeuren." Er draaiden op dat moment gewoon animaties. Wat ontbrak was
 * informatie — de tekst stond al veertig seconden op hetzelfde, en een spinner die
 * blijft draaien zegt niet of hij nog ergens mee bezig is of vastzit.
 *
 * De redenering (wanneer geldt iets als stilstand?) staat in src/ui/traag-melder.js
 * met twaalf unittests. Wat hier wordt vastgelegd is de bedrading: dat de regel
 * daadwerkelijk in beeld komt, buiten het paneel dat bij elk SSE-event opnieuw
 * wordt opgebouwd, en weer verdwijnt zodra er beweging is.
 *
 * De drempel wordt hier op een paar honderd milliseconden gezet; in de app staat
 * hij op twintig seconden.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

async function opRapportscherm(page) {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**storage.googleapis.com/**', r => r.abort());
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await page.evaluate(() => document.getElementById('splitOverlay').classList.add('active'));
}

test('de regel verschijnt zodra de voortgang stilstaat', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await opRapportscherm(page);

  await page.evaluate(() => {
    startTraagBewaking(300);
    meldStatus('Bezig met analyseren…');
  });

  const regel = page.locator('#analyseTraag');
  await expect(regel).toBeHidden();                 // nog niets aan de hand
  await expect(regel).toBeVisible({ timeout: 4_000 });
  await expect(regel).toContainText('Dit duurt langer dan gebruikelijk');
  await expect(regel).toContainText('analyseren');  // noemt waar hij op wacht

  await page.evaluate(() => stopTraagBewaking());
  verwachtGeenPaginafouten(fouten);
});

test('dezelfde melding opnieuw telt niet als voortgang', async ({ page }) => {
  // Dit is de kern. De SSE-lus stuurt bij elk binnenkomend event opnieuw dezelfde
  // zin. Zou dat de klok terugzetten, dan ging de regel nooit af — juist niet in
  // het geval waarvoor hij bestaat.
  const fouten = volgPaginafouten(page);
  await opRapportscherm(page);

  await page.evaluate(async () => {
    startTraagBewaking(600);
    for (let i = 0; i < 6; i++) {
      meldStatus('Bezig met analyseren…');
      await new Promise(r => setTimeout(r, 150));
    }
  });

  await expect(page.locator('#analyseTraag')).toBeVisible({ timeout: 4_000 });

  await page.evaluate(() => stopTraagBewaking());
  verwachtGeenPaginafouten(fouten);
});

test('de regel verdwijnt weer zodra er beweging is', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await opRapportscherm(page);

  await page.evaluate(() => {
    startTraagBewaking(300);
    meldStatus('Bezig met analyseren…');
  });
  await expect(page.locator('#analyseTraag')).toBeVisible({ timeout: 4_000 });

  await page.evaluate(() => meldStatus('Bezig met verwerken…'));
  await expect(page.locator('#analyseTraag')).toBeHidden();

  await page.evaluate(() => stopTraagBewaking());
  verwachtGeenPaginafouten(fouten);
});

test('de regel overleeft een herbouw van het analysepaneel', async ({ page }) => {
  // Waarom hij buiten #analysePanel staat: dat paneel wordt bij elk SSE-event
  // volledig opnieuw opgebouwd. Een regel die erin stond zou telkens opnieuw in
  // beeld schuiven, of verdwijnen op het moment dat je hem net las.
  const fouten = volgPaginafouten(page);
  await opRapportscherm(page);

  await page.evaluate(() => {
    startTraagBewaking(300);
    meldStatus('Bezig met analyseren…');
  });
  await expect(page.locator('#analyseTraag')).toBeVisible({ timeout: 4_000 });

  await page.evaluate(() => {
    document.getElementById('analysePanel').innerHTML = '<p>opnieuw opgebouwd</p>';
  });
  await expect(page.locator('#analyseTraag')).toBeVisible();

  await page.evaluate(() => stopTraagBewaking());
  verwachtGeenPaginafouten(fouten);
});

test('stoppen ruimt de regel en de timer op', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await opRapportscherm(page);

  await page.evaluate(() => {
    startTraagBewaking(300);
    meldStatus('Bezig met analyseren…');
  });
  await expect(page.locator('#analyseTraag')).toBeVisible({ timeout: 4_000 });

  await page.evaluate(() => stopTraagBewaking());
  await expect(page.locator('#analyseTraag')).toBeHidden();

  // En hij komt niet vanzelf terug: zonder opruimen bleef de interval doorlopen.
  await page.waitForTimeout(1_000);
  await expect(page.locator('#analyseTraag')).toBeHidden();

  verwachtGeenPaginafouten(fouten);
});
