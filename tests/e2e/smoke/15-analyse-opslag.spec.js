/**
 * Smoketest 15 — een geslaagde analyse loopt dóór tot en met het opslaan
 *
 * Aanleiding (1 september 2026). Elf dagen lang werd er geen enkele analyse bewaard, en
 * niemand kon het zien. De oorzaak was één regel:
 *
 *     ReferenceError: _klaar is not defined      (in analyseDocument)
 *
 * `_klaar` stond met `let` binnen een try-blok en werd erbuiten gelezen. Correcte
 * JavaScript, geen syntaxfout, alle unittests groen — precies de klasse waarvoor deze map
 * bestaat. En tóch glipte het erdoor, want geen enkele smoketest liep een analyse van
 * begin tot eind. De wizardtest (07) speelt juist een MISLUKKING na en eindigt vóór het
 * punt waar dit brak.
 *
 * Dit is de gelukkige afloop. Wat hij vastlegt:
 *
 *   1. analyseDocument komt zonder fout tot het eind van de stroom;
 *   2. het rapport draagt _document_tekst — zonder dat weigert de conceptgeneratie;
 *   3. het hoofddocument staat vooraan in de viewer, niet de bijlage;
 *   4. startAnalyse schrijft de screening écht naar de database.
 *
 * ── WAAROM `tekst` OP HET TRAY-ITEM ──────────────────────────────────────────
 *
 * De eerste opzet gaf echte PDF-bestanden mee. Dat strandde: een zelfgemaakte PDF krijgt
 * pdf.js niet open (nul pagina's), waarna de analyse afbreekt op "Kon weinig tot geen
 * tekst uit de documenten halen" — ruim vóór de regel die deze test wil toetsen. Een
 * fixture-PDF bijbouwen zou de test laten slagen om een reden die niets met de bewering
 * te maken heeft.
 *
 * `item.tekst` is de bestaande ingang van de heranalyse-modus: is die gevuld, dan slaat
 * de extractie over. Daarmee begint de test precies waar hij over gaat.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

const CONVENANT_TEKST = [
  'CONVENANT / VASTSTELLINGSOVEREENKOMST',
  'Partijen zijn op 26-08-2022 te Renkum gehuwd in beperkte gemeenschap van goederen.',
  'Uit het huwelijk zijn geen kinderen geboren.',
  '2.10 Eigendom echtelijke woning. De woning wordt toebedeeld aan de man.',
  '3. Partneralimentatie wordt op nihil gesteld gelet op vergelijkbare inkomens.',
  '15. Deze overeenkomst is opgemaakt en ondertekend op ......... te .........',
].join('\n');

const BIJLAGE_TEKST = [
  'VERDELINGSOVERZICHT (bijlage bij het convenant)',
  'Bankrekening bij de bank, toedeling aan de vrouw, saldo per peildatum.',
  'De waarde van de woning is vastgesteld op vierhonderdvijftigduizend euro.',
].join('\n');

/** Een complete SSE-stroom voor één convenant, in de vorm die analyseDocument leest. */
function sseStroom(bestandsnaam) {
  const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
  const leeg = { issues: [] };
  return [
    ev({ type: 'structuur', bestandsnaam,
         result: { issues: [], samenvatting: 'Testsamenvatting van de analyse.',
                   mfn_score: { behaald: 9, totaal: 15 } } }),
    ev({ type: 'juridisch',    bestandsnaam, result: leeg }),
    ev({ type: 'balans',       bestandsnaam, result: leeg }),
    ev({ type: 'consolidatie', bestandsnaam, result: leeg }),
    ev({ type: 'klaar' }),
  ].join('');
}

/**
 * Een Anthropic-stroom met één tool-aanroep, in de vorm die de client leest:
 * content_block_start → input_json_delta's → message_delta met stop_reason.
 */
function antropischeStroom(invoer) {
  const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
  return [
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use' } }),
    ev({ type: 'content_block_delta', index: 0,
         delta: { type: 'input_json_delta', partial_json: JSON.stringify(invoer) } }),
    ev({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
  ].join('');
}

/** Zet de mocks klaar; geeft de lijst terug die volloopt met schrijfacties. */
async function bereidVoor(page) {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);   // eerst de algemene; de route hieronder wint als laatste

  const geschreven = [];
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
  // De classificatie draait vóór de analyse via claude-edge. Zonder deze mock struikelt
  // de test op een 404 van de dev-server, wat niets zegt over de bewering.
  await page.route('**/api/claude-edge', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'text/event-stream' },
    body: antropischeStroom({
      doc_type: 'convenant', situatie_kenmerken: [],
      partij_a: 'Partij A', partij_b: 'Partij B',
      documenten: [
        { bestandsnaam: 'convenant.pdf', doc_type: 'convenant' },
        { bestandsnaam: 'waarde.pdf',    doc_type: 'waarde_verdeling' },
      ],
    }),
  }));
  await page.route('**/api/naam-encrypt', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namen_map: 'proef' }) }));
  await page.route('**storage.googleapis.com/**', r => r.abort());
  // De vorm die supabase-js van een geslaagde upload verwacht. Met een kaal `{}` ziet de
  // client een fout, gooit opslaan() vóór de insert, en schrijft de test een nul die
  // eruitziet als het gebrek dat hij moet betrappen.
  await page.route('**/storage/v1/object/**', r => r.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Id: 'proef', Key: 'documenten/proef.pdf' }) }));
  await page.route('**/storage/v1/**', r => r.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page, ['sorteerOpType']);
  return geschreven;
}

/**
 * De tray zoals een mediator hem samenstelt: de bijlage als eerste geüpload, het
 * convenant erna. Dat is de volgorde waarin de viewer met het waardeoverzicht begon.
 */
function zetTray(conv, bij) {
  return (page) => page.evaluate(({ conv, bij }) => {
    app.dossierId   = '9725a3c8-0000-0000-0000-000000000000';
    app.screeningId = null;
    app.tray = [
      { id: 1, type: 'waarde_verdeling', bestandsnaam: 'waarde.pdf', tekst: bij,
        bestand: new File(['x'], 'waarde.pdf', { type: 'application/pdf' }) },
      { id: 2, type: 'convenant', bestandsnaam: 'convenant.pdf', tekst: conv,
        bestand: new File(['x'], 'convenant.pdf', { type: 'application/pdf' }) },
    ];
  }, { conv, bij });
}

test('analyseDocument komt zonder fout tot het eind en zet het hoofddocument vooraan', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await bereidVoor(page);
  await zetTray(CONVENANT_TEKST, BIJLAGE_TEKST)(page);

  const uit = await page.evaluate(async () => {
    try {
      const r = await analyseDocument(app.tray, () => {});
      return {
        fout: '',
        eerste:     r.primaireBestanden?.[0]?.[0]?.name ?? null,
        terugval:   r.resolvedFiles?.[0]?.name ?? null,
        heeftTekst: !!r.rapport?._document_tekst,
      };
    } catch (err) {
      return { fout: `${err.name}: ${err.message}` };
    }
  });

  // 1. Dít is de bewering. `_klaar` binnen de try en erbuiten gelezen komt hier terug
  //    als een ReferenceError — en deze test was er niet toen dat gebeurde.
  expect(uit.fout, 'analyseDocument struikelde').toBe('');

  // 2. Zonder _document_tekst weigert de conceptgeneratie ("Geen documenttekst
  //    beschikbaar"). Dat was precies wat er overbleef toen de analyse halverwege
  //    afbrak en het halve rapport tóch werd opgeslagen.
  expect(uit.heeftTekst, '_document_tekst ontbreekt in het rapport').toBe(true);

  // 3. Het convenant vooraan — óók in de terugval die app.bestanden gebruikt als
  //    primaireBestanden leeg is. Die stond in uploadvolgorde.
  expect(uit.eerste).toBe('convenant.pdf');
  expect(uit.terugval).toBe('convenant.pdf');

  verwachtGeenPaginafouten(fouten);
});

// Bewust opslaan() zélf en niet startAnalyse(): die tekent daarna het rapport, en de
// PDF-viewer blijft in de testomgeving hangen op een verzonnen bestand. Wat déze test
// moet bewijzen ligt vóór dat punt — dat er werkelijk iets naar de tabel gaat. De
// koppeling tussen een geslaagde analyse en opslaan() staat vast in de broncontroles
// onderaan tests/unit/opslag-waarschuwing.test.js.
test('opslaan() schrijft de screening werkelijk naar de database', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  const geschreven = await bereidVoor(page);

  await page.evaluate(() => {
    app.dossierId    = '9725a3c8-0000-0000-0000-000000000000';
    app.screeningId  = null;
    app.tray         = [];
    app.bestanden    = [];
    app.classificatie = { doc_type: 'convenant', situatie_kenmerken: [] };
    app.rapport = {
      issues: [], samenvatting: 'Testsamenvatting.',
      _document_tekst: 'CONVENANT. Partijen zijn gehuwd in gemeenschap van goederen.',
      _document_bestanden: [],
    };
    window.__opslagKlaar = false;
    opslaan().then(() => { window.__opslagKlaar = 'af'; },
                   e => { window.__opslagKlaar = 'fout: ' + e.message; });
  });

  await expect.poll(() => page.evaluate(() => window.__opslagKlaar),
    { timeout: 15_000, message: 'opslaan() kwam niet terug' }).toBe('af');

  // Strandt het opslaan, dan staat de reden in de foutbalk. Die meelezen scheelt een
  // ronde raden: "nul schrijfacties" zegt niet waaróm.
  //
  // Bewust via evaluate en niet via locator().textContent(): die wacht tot het element
  // verschijnt, en dat gebeurt hier terecht nooit. Precies dáárop liep deze test twee
  // minuten vast — de regel die de fout moest verklaren was zelf de fout.
  const balk = await page.evaluate(() =>
    document.getElementById('opslagFoutBalk')?.textContent ?? null);
  expect(balk, `opslaan() meldde een fout: ${balk}`).toBeNull();

  // De bewering die elf dagen niet gold: er gaat werkelijk iets naar de tabel.
  expect(geschreven.length, 'er is niets naar screeningen geschreven').toBeGreaterThan(0);
  expect(['POST', 'PATCH']).toContain(geschreven[0].methode);
  expect(geschreven[0].body?.rapport, 'de schrijfactie draagt geen rapport').toBeTruthy();

  verwachtGeenPaginafouten(fouten);
});
