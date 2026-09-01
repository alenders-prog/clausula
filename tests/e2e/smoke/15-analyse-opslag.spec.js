/**
 * Smoketest 15 — een geslaagde analyse loopt dóór tot en met het opslaan
 *
 * Aanleiding (1 september 2026). Elf dagen lang werd er geen enkele analyse bewaard, en
 * niemand kon het zien. De oorzaak was één regel:
 *
 *     ReferenceError: _klaar is not defined     (index.html, in analyseDocument)
 *
 * `_klaar` stond met `let` binnen een try-blok en werd erbuiten gelezen. Toegevoegd op
 * 31 augustus om 19:29; de laatste geslaagde opslag was om 19:03.
 *
 * Correcte JavaScript, geen syntaxfout, alle unittests groen. Precies de klasse waarvoor
 * deze map bestaat — en tóch glipte het erdoor, omdat geen enkele smoketest een analyse
 * van begin tot eind liep. De bestaande wizardtest speelt juist een MISLUKKING na (500
 * van de server), en die eindigt vóór het punt waar dit brak.
 *
 * Vandaar deze: de gelukkige afloop, met een gemockte analyseer-stroom, tot en met de
 * insert in Supabase. Wat hij vastlegt:
 *
 *   1. analyseDocument komt zonder fout tot het eind;
 *   2. opslaan() wordt aangeroepen en schrijft écht een screening weg;
 *   3. het hoofddocument staat vooraan in de viewer, niet de bijlage.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';
import { maakPdf, CONVENANT_REGELS, BIJLAGE_REGELS } from '../helpers/pdf.js';

// Ruim boven de ondergrens van 200 tekens die analyseDocument hanteert.
const LANGE_TEKST = 'Partijen zijn op 26-08-2022 gehuwd in beperkte gemeenschap van goederen. '
  + 'De echtelijke woning wordt toebedeeld aan de man; de hypotheek wordt overgenomen. '
  + 'Partneralimentatie wordt op nihil gesteld. Uit het huwelijk zijn geen kinderen geboren. '
  + 'Beide partijen hebben pensioen opgebouwd; verevening is wederzijds uitgesloten.';

/** Een complete SSE-stroom voor één convenant, in de vorm die analyseDocument leest. */
function sseStroom(bestandsnaam) {
  const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
  const leeg = { issues: [] };
  return [
    ev({ type: 'structuur', bestandsnaam,
         result: { issues: [], samenvatting: 'Testsamenvatting.', mfn_score: { behaald: 9, totaal: 15 } } }),
    ev({ type: 'juridisch',  bestandsnaam, result: leeg }),
    ev({ type: 'balans',     bestandsnaam, result: leeg }),
    ev({ type: 'consolidatie', bestandsnaam, result: leeg }),
    ev({ type: 'klaar' }),
  ].join('');
}

// NOG NIET GROEN — bewust zichtbaar gelaten in plaats van weggehaald.
// Blokkade: analyseDocument haalt uit de fixture-PDF geen 200 tekens en breekt af op de
// tekstcontrole, ruim vóór de regel die deze test wil toetsen. De PDF is geldig (zie
// helpers/pdf.js) maar pdf.js levert er in deze opstelling geen tekstlaag uit. Volgende
// stap: uitzoeken of pdfjsLib in de testcontext wel geladen is, of de teksthaler zelf
// stubben.
test.fixme('een geslaagde analyse wordt daadwerkelijk opgeslagen', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);

  // Onderschep wat er naar de screeningen-tabel gaat. Dát is de bewering: niet dat er
  // een rapport op het scherm staat, maar dat het de database haalt.
  const geschreven = [];
  await mockSupabaseRest(page);   // eerst de algemene, dan de onze — de laatste wint
  await page.route('**/rest/v1/screeningen**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      geschreven.push({ methode: req.method(), body: req.postDataJSON?.() ?? null });
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' }) });
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' });
  });

  await page.route('**/api/analyseer', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'text/event-stream' },
    body: sseStroom('convenant.pdf'),
  }));
  await page.route('**storage.googleapis.com/**', r => r.abort());
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 200, body: '{}' }));

  // pdf.js haalt uit een verzonnen PDF geen tekst, waarna de app op OCR terugvalt en
  // Tesseract in de headless browser niet bestaat. Dat is testomgeving, geen app-fout:
  // een lege teksthaler zou het echte pad (de SSE-stroom) nooit bereiken.
  await page.addInitScript(() => {
    window.Tesseract = {
      createWorker: async () => ({
        recognize: async () => ({ data: { text: LANGE_TEKST } }),
        terminate: async () => {},
        setParameters: async () => {}, reinitialize: async () => {},
      }),
    };
  });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page, ['sorteerOpType']);

  // De analyse rechtstreeks aanroepen met een tray van twee documenten: een bijlage die
  // als eerste is geüpload en het convenant erna. Dat is de volgorde waarin de viewer
  // op 1 september met het waardeoverzicht begon.
  const pdfs = {
    waarde:    [...maakPdf(BIJLAGE_REGELS)],
    convenant: [...maakPdf(CONVENANT_REGELS)],
  };

  const uitkomst = await page.evaluate(async ({ pdfs }) => {
    const mkBestand = (naam, bytes) =>
      new File([new Uint8Array(bytes)], naam, { type: 'application/pdf' });
    app.dossierId = '9725a3c8-0000-0000-0000-000000000000';
    app.tray = [
      { id: 1, bestand: mkBestand('waarde.pdf', pdfs.waarde),       type: 'waarde_verdeling', bestandsnaam: 'waarde.pdf' },
      { id: 2, bestand: mkBestand('convenant.pdf', pdfs.convenant), type: 'convenant',        bestandsnaam: 'convenant.pdf' },
    ];
    try {
      const r = await analyseDocument(app.tray, () => {});
      return { ok: true, eerste: r.primaireBestanden?.[0]?.[0]?.name ?? null,
               terugval: r.resolvedFiles?.[0]?.name ?? null };
    } catch (err) {
      return { ok: false, fout: `${err.name}: ${err.message}` };
    }
  }, { pdfs });

  // 1. Geen ReferenceError meer aan het eind van de stroom.
  expect(uitkomst.fout ?? '', 'analyseDocument struikelde').toBe('');
  expect(uitkomst.ok).toBe(true);

  // 3. Het convenant staat vooraan — óók in de terugval die app.bestanden gebruikt als
  //    primaireBestanden leeg is. Die terugval stond in uploadvolgorde.
  expect(uitkomst.eerste).toBe('convenant.pdf');
  expect(uitkomst.terugval).toBe('convenant.pdf');

  verwachtGeenPaginafouten(fouten);
});

// NOG NIET GROEN — zie hierboven.
// Blokkade: er gaat niets naar de tabel, en de melding verdwijnt in de nieuwe foutbalk.
// Vermoedelijk struikelt opslaan() al vóór de insert op iets uit de testomgeving (_orgId
// en _userId blijven null bij een gemockte sessie). Uit te zoeken door de balktekst in de
// test te lezen in plaats van alleen het aantal schrijfacties.
test.fixme('opslaan() schrijft de screening ook echt weg', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);

  const geschreven = [];
  await mockSupabaseRest(page);   // eerst de algemene, dan de onze — de laatste wint
  await page.route('**/rest/v1/screeningen**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      geschreven.push({ methode: req.method(), body: req.postDataJSON?.() ?? null });
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' }) });
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' });
  });
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 200, body: '{}' }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);

  await page.evaluate(async () => {
    app.dossierId = '9725a3c8-0000-0000-0000-000000000000';
    app.screeningId = null;
    app.tray = [];
    app.rapport = { issues: [], samenvatting: 'Test', _document_bestanden: [] };
    app.classificatie = { doc_type: 'convenant' };
    await opslaan();
  });

  // Dít is de bewering die elf dagen niet gold: er gaat werkelijk iets naar de tabel.
  expect(geschreven.length, 'er is niets naar screeningen geschreven').toBeGreaterThan(0);
  expect(['POST', 'PATCH']).toContain(geschreven[0].methode);

  verwachtGeenPaginafouten(fouten);
});
