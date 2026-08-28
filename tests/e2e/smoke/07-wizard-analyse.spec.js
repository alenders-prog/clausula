/**
 * Smoketest 07 — De analyse-wizard toont de looptoestand in stap 2 zelf
 *
 * Geschiedenis, in drie stappen op één dag (24 augustus 2026):
 *
 *  1. De wizard eindigde met `sluitWizard(); analyseBtn.click();` — hij kopieerde
 *     zijn documenten naar de oude tray, sloot zichzelf, en drukte op de knop van
 *     het uploadscherm. Dat scherm werd zichtbaar tijdens de analyse, met dezelfde
 *     documentenlijst die net was bevestigd en de kop "Opnieuw analyseren".
 *
 *  2. Daarop kwam er een stap 3: een eigen paneel dat #scanning en #errorBox uit
 *     het uploadscherm LEENDE en naderhand terugzette. Dat brak twee keer — een
 *     anker dat meeverhuisde, en een !important-gevecht om zichtbaarheid — en het
 *     beloofde "ongeveer twee minuten" terwijl het na ongeveer vijf seconden
 *     verdween: de wizard sluit zodra het rapportskelet opengaat.
 *
 *  3. Nu verandert stap 2 van toestand. Geen tweede paneel, geen geleende
 *     elementen, en de voortgang staat in de documentregels — want in die vijf
 *     seconden gebeurt het werk per document.
 *
 * Faalt deze test: wizAnalyseStarten, wizAnalyseLoopt, wizAnalyseGestopt of
 * sluitWizard.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

/** Zet de wizard rechtstreeks op stap 2 met twee herkende documenten. */
async function wizardMetDocumenten(page) {
  await page.evaluate(() => {
    // Let op: dit zijn `let`-bindingen op het hoogste niveau van een klassiek
    // script. Die staan niet op `window` — `window._wizTray = …` zou een ander,
    // ongebruikt globaal maken. Een kale toewijzing raakt wél de juiste binding,
    // omdat page.evaluate in datzelfde globale bereik draait.
    _wizDossierId  = '00000000-0000-0000-0000-000000000010';
    _wizDossierNaam = 'Huzen - Meijerink';
    _wizTray = [
      { id: 'w1', naam: 'Concept Convenant.pdf', type: 'convenant', herkend: true,
        bestand: new File([new Uint8Array([1])], 'Concept Convenant.pdf', { type: 'application/pdf' }) },
      { id: 'w2', naam: 'Test OP.docx', type: 'ouderschapsplan', herkend: true,
        bestand: new File([new Uint8Array([1])], 'Test OP.docx',
          { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) },
    ];
    document.getElementById('analyseWizard').classList.add('active');
    document.getElementById('awiz-stap1').style.display = 'none';
    document.getElementById('awiz-stap2').style.display = '';
    ['wizPartijAInp', 'wizPartijBInp', 'wizRoepAInp', 'wizRoepBInp'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('wizPartijAInp').value = 'Jan Huzen';
    document.getElementById('wizPartijBInp').value = 'Nicky Meijerink';
    wizRenderDocs();
  });
}

test('stap 2 gaat in de looptoestand zonder een nieuw scherm te openen', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);
  await wizardMetDocumenten(page);

  // Uitgangspunt: knop bruikbaar, tijdblok zichtbaar, geen status.
  await expect(page.locator('#wizTijdBlok')).toBeVisible();
  await expect(page.locator('#wizStatus')).toBeHidden();

  await page.evaluate(() => wizAnalyseLoopt());

  // ── Stap 2 blijft staan; er komt geen tweede paneel ───────────────────────
  await expect(page.locator('#analyseWizard')).toHaveClass(/active/);
  await expect(page.locator('#awiz-stap2')).toBeVisible();
  await expect(page.locator('#awiz-stap3')).toHaveCount(0);   // bestaat niet meer

  // ── De knop meldt het gevolg van de klik, op zijn eigen plek ──────────────
  await expect(page.locator('#wizAnalyseBtn')).toBeDisabled();
  await expect(page.locator('#wizAnalyseBtn')).toContainText('Analyse gestart');
  await expect(page.locator('#wizAnalyseBtn .laad-spin')).toHaveCount(1);

  // ── De statusregel neemt de plek van het tijdblok over ────────────────────
  await expect(page.locator('#wizTijdBlok')).toBeHidden();
  await expect(page.locator('#wizStatus')).toBeVisible();

  // ── Niets meer te wijzigen zolang het loopt ───────────────────────────────
  await expect(page.locator('#wizTerugBtn')).toBeDisabled();
  const selects = page.locator('#awiz-stap2 .awiz-doc-sel');
  for (let i = 0; i < await selects.count(); i++) await expect(selects.nth(i)).toBeDisabled();

  // ── Het uploadscherm eronder blijft weg — de oorspronkelijke klacht ───────
  await expect(page.locator('#trayLijst')).toBeHidden();
  await expect(page.locator('#analyseBtn')).toBeHidden();

  verwachtGeenPaginafouten(fouten);
});

test('de voortgang staat in de documentregels, op naam en niet op volgorde', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);
  await wizardMetDocumenten(page);
  await page.evaluate(() => wizAnalyseLoopt());

  // Bewust het TWEEDE document als eerste melden: het vinkje hoort bij de naam,
  // niet bij de positie. Op volgorde matchen zou hier het verkeerde document
  // afvinken, en dat is precies het soort fout dat niemand opmerkt.
  await page.evaluate(() => meldDocStatus('Test OP.docx', 'bezig'));
  const rijOP = page.locator('.awiz-doc-row[data-naam="Test OP.docx"] .awiz-doc-stand');
  const rijCon = page.locator('.awiz-doc-row[data-naam="Concept Convenant.pdf"] .awiz-doc-stand');
  await expect(rijOP.locator('.laad-spin')).toHaveCount(1);
  await expect(rijCon).toBeEmpty();

  await page.evaluate(() => meldDocStatus('Test OP.docx', 'klaar'));
  await expect(rijOP).toHaveClass(/klaar/);
  await expect(rijOP.locator('svg')).toHaveCount(1);
  await expect(rijCon).toBeEmpty();   // het andere document is nog niet aan de beurt

  // De statusregel volgt de algemene voortgang.
  await page.evaluate(() => meldStatus('Bezig met documenten herkennen…'));
  await expect(page.locator('#wizStatus')).toHaveText('Bezig met documenten herkennen…');

  verwachtGeenPaginafouten(fouten);
});

test('na een mislukte analyse is stap 2 meteen weer bruikbaar', async ({ page }) => {
  // Dit is het pad dat er bij de vorige opzet twee keer naast zat. Het moet niet
  // alleen de melding tonen, maar de mediator ook laten dóórwerken zonder zijn
  // documenten opnieuw te kiezen.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.route('**/api/analyseer', route => route.fulfill({
    status: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Analyse mislukt in de test' }),
  }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);
  await wizardMetDocumenten(page);

  await page.evaluate(() => window.wizAnalyseStarten());

  // Wizard blijft staan op stap 2, met de melding in de statusregel.
  await expect(page.locator('#analyseWizard')).toHaveClass(/active/);
  await expect(page.locator('#awiz-stap2')).toBeVisible();
  await expect(page.locator('#wizStatus')).toBeVisible();
  await expect(page.locator('#wizStatus')).toHaveClass(/fout/);

  // En alles is weer bedienbaar — dit is wat een melding waardeloos maakt als het
  // ontbreekt: je ziet wat er mis is maar kunt niets.
  await expect(page.locator('#wizAnalyseBtn')).toBeEnabled();
  await expect(page.locator('#wizAnalyseBtn')).toContainText('Analyse starten');
  await expect(page.locator('#wizTerugBtn')).toBeEnabled();
  const selects = page.locator('#awiz-stap2 .awiz-doc-sel');
  for (let i = 0; i < await selects.count(); i++) await expect(selects.nth(i)).toBeEnabled();

  // De standvakjes zijn leeg — geen halve spinners van een mislukte poging.
  const standen = page.locator('#awiz-stap2 .awiz-doc-stand');
  for (let i = 0; i < await standen.count(); i++) await expect(standen.nth(i)).toBeEmpty();

  verwachtGeenPaginafouten(fouten);
});

test('ook in de bewerkingsmodus blijft de knop de enige plek waar iets verandert', async ({ page }) => {
  // In `awiz-bewerk` staan stap 1 én stap 2 tegelijk, geforceerd met
  // `display:block !important`. De vorige opzet moest daar met een extra klasse
  // tegenin om stap 2 te verbergen; dat gevecht is weg, want stap 2 mág blijven.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);
  await wizardMetDocumenten(page);

  await page.evaluate(() => {
    document.getElementById('analyseWizard').classList.add('awiz-bewerk');
    document.getElementById('awiz-stap1').style.display = '';
  });
  await expect(page.locator('#awiz-stap2')).toBeVisible();

  await page.evaluate(() => wizAnalyseLoopt());

  await expect(page.locator('#awiz-stap2')).toBeVisible();
  await expect(page.locator('#wizAnalyseBtn')).toBeDisabled();
  await expect(page.locator('#wizStatus')).toBeVisible();

  // Na sluiten is de wizard weer in de uitgangsstand — niet half in de looptoestand.
  await page.evaluate(() => sluitWizard());
  await expect(page.locator('#wizAnalyseBtn')).toContainText('Analyse starten');
  expect(await page.evaluate(() =>
    document.getElementById('wizAnalyseBtn').disabled)).toBe(false);

  verwachtGeenPaginafouten(fouten);
});

test('wizard sluit zodra het rapportskelet opengaat, niet pas als alles klaar is', async ({ page }) => {
  // Dit was de kern van de klacht. Het skelet gaat open zodra de classificatie rond
  // is — ongeveer vijf seconden — en vult zich daarna vanzelf. Daar hoort de
  // mediator te zijn, niet achter een wizardscherm dat stilstaat.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);
  await wizardMetDocumenten(page);

  // De analyse blijft na het skelet doorlopen; zo staat vast dat de wizard níét op
  // het einde wacht.
  await page.evaluate(() => {
    window.analyseDocument = async (tray, onProgress) => {
      onProgress('Bezig met documenten herkennen…');
      openSplitView();                 // het skelet, zoals na de classificatie
      await new Promise(() => {});     // de rest van de analyse loopt nog
    };
    wizAnalyseStarten();
  });

  await expect(page.locator('#analyseWizard')).not.toHaveClass(/active/);
  await expect(page.locator('#splitOverlay')).toHaveClass(/active/);

  // En de looptoestand is netjes afgezet, zodat een volgende analyse schoon begint.
  await expect(page.locator('#wizAnalyseBtn')).toContainText('Analyse starten');

  verwachtGeenPaginafouten(fouten);
});
