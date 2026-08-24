/**
 * Smoketest 07 — De analyse-wizard loopt door tot en met zijn derde stap
 *
 * Aanleiding (24 augustus 2026). De wizard eindigde met:
 *
 *     sluitWizard();
 *     document.getElementById('analyseBtn').click();
 *
 * Hij kopieerde zijn documenten naar de oude tray, sloot zichzelf, en drukte op de
 * knop van het uploadscherm. Dat scherm werd daardoor zichtbaar tijdens de analyse —
 * met dezelfde documentenlijst die de mediator net had bevestigd, dezelfde
 * keuzelijsten, een uitgeschakelde knop, en de kop "Opnieuw analyseren" terwijl dit
 * juist een nieuwe analyse was. De stappenbalk beloofde "3 Analyse", maar die stap
 * bestond niet.
 *
 * Deze test loopt de wizard door met een gemockte analyse en controleert dat de
 * wizard open blijft, stap 3 toont, en het uploadscherm niet zichtbaar wordt.
 *
 * Als deze test faalt: wizAnalyseStarten, wizNaarStap3, startAnalyse of sluitWizard.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

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
      { naam: 'Concept Convenant.pdf', type: 'convenant',
        bestand: new File([new Uint8Array([1])], 'Concept Convenant.pdf', { type: 'application/pdf' }) },
      { naam: 'Test OP.docx', type: 'ouderschapsplan',
        bestand: new File([new Uint8Array([1])], 'Test OP.docx',
          { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) },
    ];
    document.getElementById('analyseWizard').classList.add('active');
    document.getElementById('awiz-stap1').style.display = 'none';
    document.getElementById('awiz-stap2').style.display = '';
    document.getElementById('awiz-stap3').style.display = 'none';
    ['wizPartijAInp', 'wizPartijBInp', 'wizRoepAInp', 'wizRoepBInp'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('wizPartijAInp').value = 'Jan Huzen';
    document.getElementById('wizPartijBInp').value = 'Nicky Meijerink';
  });
}

test('wizard blijft open en toont stap 3 tijdens de analyse', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wizardMetDocumenten(page);

  // Stap 3 rechtstreeks tonen. De volledige analyse meelopen zou hier niets extra's
  // bewijzen: die valt op nepbestanden al bij de tekst-extractie om, en wat deze
  // test moet vastleggen is hoe het scherm eruitziet zodra de analyse begint.
  await page.evaluate(() => wizNaarStap3(_wizTray));

  // ── De wizard blijft staan en is op stap 3 ────────────────────────────────
  await expect(page.locator('#analyseWizard')).toHaveClass(/active/);
  await expect(page.locator('#awiz-stap3')).toBeVisible();
  await expect(page.locator('#awiz-stap2')).toBeHidden();
  await expect(page.locator('#wbc3')).toHaveClass(/active/);

  // ── De documenten staan er als samenvatting, niet als bewerkbare lijst ────
  const docs = page.locator('#wizStap3Docs .awiz-stap3-doc');
  await expect(docs).toHaveCount(2);
  await expect(docs.first()).toContainText('Concept Convenant.pdf');
  await expect(docs.first()).toContainText('Convenant');
  // Geen keuzelijsten meer om iets aan te veranderen.
  await expect(page.locator('#awiz-stap3 select')).toHaveCount(0);

  // ── De voortgang is verplaatst naar de wizard ─────────────────────────────
  // Verplaatst, niet nagebouwd: één voortgangsweergave in plaats van twee die uit
  // elkaar kunnen lopen. Of hij zichtbaar is, bepaalt startAnalyse met .active.
  await expect(page.locator('#wizVoortgangSlot #scanning')).toHaveCount(1);
  await expect(page.locator('#wizVoortgangSlot #errorBox')).toHaveCount(1);

  // ── Het uploadscherm eronder is niet zichtbaar ────────────────────────────
  // Dit is de klacht die de aanleiding was: de lijst die je net bevestigd hebt,
  // nog een keer, met een dode knop erbij.
  await expect(page.locator('#trayLijst')).toBeHidden();
  await expect(page.locator('#analyseBtn')).toBeHidden();

  // ── Teruggaan kan niet zolang de analyse loopt ────────────────────────────
  await expect(page.locator('#wizTerugBtn')).toBeHidden();

  verwachtGeenPaginafouten(fouten);
});

test('bij een mislukte analyse blijft de wizard staan met de melding erin', async ({ page }) => {
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
  await wizardMetDocumenten(page);

  await page.evaluate(() => window.wizAnalyseStarten());

  // Wizard blijft staan; de mediator hoeft niet opnieuw te beginnen.
  await expect(page.locator('#analyseWizard')).toHaveClass(/active/);
  await expect(page.locator('#awizPageTitle3')).toHaveText('Analyse mislukt');
  await expect(page.locator('#wizVoortgangSlot #errorBox')).toBeVisible();
  await expect(page.locator('#wizTerugBtn')).toBeVisible();

  // Terug brengt hem naar stap 2, met de voortgangselementen weer op hun eigen plek.
  await page.click('#wizTerugBtn');
  await expect(page.locator('#awiz-stap2')).toBeVisible();
  await expect(page.locator('#awiz-stap3')).toBeHidden();
  await expect(page.locator('#wizVoortgangSlot #scanning')).toHaveCount(0);

  verwachtGeenPaginafouten(fouten);
});

test('ook in de bewerkingsmodus verdwijnt het uploadscherm tijdens de analyse', async ({ page }) => {
  // Dit is het geval dat op 24 augustus 2026 alsnog misging. Wie een bestaand dossier
  // opent om documenten te vervangen, krijgt de wizard in `awiz-bewerk`: die toont
  // stap 1 én stap 2 tegelijk, en forceert dat met `display:block !important`.
  //
  // Een inline `style.display = 'none'` komt daar niet langs. Het resultaat was dat de
  // uploadzone, de documentenlijst én de knop "Analyse starten" naast de voortgang
  // bleven staan — precies het scherm dat stap 3 moest opruimen.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wizardMetDocumenten(page);

  // Bewerkingsmodus aanzetten, zoals openWizardVoorBewerken doet.
  await page.evaluate(() => {
    document.getElementById('analyseWizard').classList.add('awiz-bewerk');
    document.getElementById('awiz-stap1').style.display = '';
  });
  await expect(page.locator('#awiz-stap2')).toBeVisible();   // uitgangspunt klopt

  await page.evaluate(() => wizNaarStap3(_wizTray));

  await expect(page.locator('#awiz-stap3')).toBeVisible();
  await expect(page.locator('#awiz-stap1')).toBeHidden();
  await expect(page.locator('#awiz-stap2')).toBeHidden();
  // Geen tweede "Analyse starten" meer naast de voortgang.
  await expect(page.locator('#wizAnalyseBtn')).toBeHidden();
  await expect(page.locator('#wizDropzone')).toBeHidden();

  // En na sluiten is de bewerkingsmodus weer bruikbaar.
  await page.evaluate(() => sluitWizard());
  expect(await page.evaluate(() =>
    document.getElementById('analyseWizard').classList.contains('awiz-analyse'))).toBe(false);

  verwachtGeenPaginafouten(fouten);
});

test('wizard sluit zodra het rapportskelet opengaat, niet pas als alles klaar is', async ({ page }) => {
  // Dit was de kern van de klacht. Vroeger stond de mediator na ~5 seconden in het
  // rapportscherm en zag hij het zich vullen; met de eerste versie van stap 3 bleef
  // hij twee minuten op "Analyse loopt" staan, want de wizard sloot pas als de hele
  // analyse klaar was. Het skelet gaat open zodra de classificatie rond is.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wizardMetDocumenten(page);

  // De analyse blijft na het skelet doorlopen; zo staat vast dat de wizard níét op
  // het einde wacht.
  await page.evaluate(() => {
    window.analyseDocument = async (tray, onProgress) => {
      onProgress('Stap 1 van 3 — Documenten herkennen…');
      openSplitView();                 // het skelet, zoals na de classificatie
      await new Promise(() => {});     // de rest van de analyse loopt nog
    };
    wizAnalyseStarten();
  });

  // Wizard is dicht en het rapportscherm staat er, terwijl de analyse nog loopt.
  await expect(page.locator('#analyseWizard')).not.toHaveClass(/active/);
  await expect(page.locator('#splitOverlay')).toHaveClass(/active/);

  // En de geleende voortgangselementen staan weer op hun eigen plek.
  await expect(page.locator('#wizVoortgangSlot #scanning')).toHaveCount(0);

  verwachtGeenPaginafouten(fouten);
});
