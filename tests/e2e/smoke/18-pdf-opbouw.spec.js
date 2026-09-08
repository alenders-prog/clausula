/**
 * Smoketest 18 — de PDF-opbouw loopt door
 *
 * `buildPdfDef` is ruim driehonderd regels en werd door geen enkele test aangeraakt.
 * Smoketest 05 controleert alleen dát de knop er staat, niet wat er gebeurt als je hem
 * indrukt — en juist daar zit de klasse fout waarvoor deze map bestaat: code die zonder
 * syntaxfout laadt en pas bij de eerste klik breekt.
 *
 * Aanleiding (8 september 2026): het categorieënraster in de PDF haalt zijn volgorde
 * sinds het samentrekken van de dimensielijsten uit `VOORRANG_DIMENSIES`, en dat komt via
 * de ESM-brug binnen. Was die brug er nog niet, dan stond hier `undefined.map` — precies
 * de fout die op 23 augustus 2026 twee keer productie haalde.
 *
 * Deze test roept de opbouw echt aan. Hij tekent geen PDF: pdfmake maakt daar een
 * blob van, en dat voegt niets toe aan wat we willen weten.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLS = JSON.parse(readFileSync(join(__dirname, '../fixtures/classificatie.json'), 'utf8'));
const RPT = JSON.parse(readFileSync(join(__dirname, '../fixtures/rapport.json'), 'utf8'));

test('buildPdfDef bouwt een documentdefinitie zonder te breken', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);

  const uit = await page.evaluate(([cls, rp]) => {
    try {
      const def = window.buildPdfDef(
        'convenant.pdf', cls, rp, 2, 'na correcties', 'M. Mediator', 'Kantoor', 'Dossier',
      );
      return {
        ok: true,
        heeftInhoud: Array.isArray(def?.content) && def.content.length > 0,
        // Het raster noemt de dimensies bij naam; die tekst hoort erin te staan.
        tekst: JSON.stringify(def).slice(0, 200000),
      };
    } catch (e) {
      return { ok: false, fout: e.message };
    }
  }, [CLS, RPT]);

  expect(uit.ok, `buildPdfDef gaf fout: ${uit.fout}`).toBe(true);
  expect(uit.heeftInhoud, 'de documentdefinitie heeft geen content').toBe(true);

  // Het categorieënraster loopt VOORRANG_DIMENSIES af. Staat die lijst er niet, dan
  // ontbreken deze koppen — dat is stiller dan een fout en dus het echte risico.
  const posities = ['JURIDISCH', 'CONFLICTEN', 'VOLLEDIGHEID', 'BALANS', 'GRAMMATICA']
    .map((dim) => {
      const i = uit.tekst.indexOf(`"text":"${dim}"`);
      expect(i, `de PDF noemt de categorie ${dim} niet`).toBeGreaterThan(-1);
      return i;
    });

  // En in de voorrangsvolgorde, niet de weergavevolgorde. Dat verschil zit hem precies
  // in conflicten: die staat hier op twee en in de filterknoppen op vier. Zou iemand
  // WEERGAVE_DIMENSIES invullen, dan valt dat nergens anders op.
  expect(posities, 'het raster staat niet in de voorrangsvolgorde')
    .toEqual([...posities].sort((a, b) => a - b));

  verwachtGeenPaginafouten(fouten);
});

test('de dimensielijsten komen door de ESM-brug heen', async ({ page }) => {
  // Vier plekken in index.html lezen deze lijsten. Twee ervan draaien pas tijdens een
  // echte analyse of een export, en die zijn hier niet na te spelen. Wat ze delen is
  // de brug — dus dat is wat hier wordt getoetst, in plaats van vier keer half.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);

  const lijsten = await page.evaluate(() => ({
    voorrang: window.VOORRANG_DIMENSIES,
    weergave: window.WEERGAVE_DIMENSIES,
    zonder:   window.WEERGAVE_ZONDER_CROSSDOC,
  }));

  expect(lijsten.voorrang, 'VOORRANG_DIMENSIES kwam niet door de brug').toEqual(
    ['juridisch', 'conflicten', 'volledigheid', 'balans', 'grammatica']);
  expect(lijsten.weergave).toContain('cross_doc');
  expect(lijsten.zonder).not.toContain('cross_doc');
  expect(lijsten.zonder).toHaveLength(5);

  verwachtGeenPaginafouten(fouten);
});
