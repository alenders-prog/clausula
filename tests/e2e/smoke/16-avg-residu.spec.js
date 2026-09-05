/**
 * Smoketest 16 — de residu-controle gaat écht af in de browser
 *
 * Aanleiding (4 september 2026). De app beloofde de mediator dat documenten "volledig
 * geanonimiseerd" het kantoor verlaten. Nagespeeld op een gewone convenantalinea bleef er
 * van alles staan; het laatste dat overbleef nadat `src/avg/persoonsdetails.js` erbij kwam,
 * was de voornaam van een kind dat de classificatie niet had opgehaald:
 *
 *     Uit het huwelijk is geboren: Jochem ter Bergman.
 *                                  ^^^^^^
 *
 * De unittests dekken dat af (`tests/unit/residu.test.js`). Wat ze níét kunnen dekken is de
 * bedrading: dat `zoekResidu` via de ESM-brug op `window` staat, dat de aanroep op de plek
 * staat waar de tekst het kantoor verlaat, en dat de balk verschijnt. Dat is precies de
 * klasse fouten waarvoor deze map bestaat — `bouwVerificatieContext is not defined` en
 * `STREAM_ONDERDELEN is not defined` haalden er twee productie.
 *
 * Twee beweringen, want een melder die nooit afgaat en een melder die altijd afgaat zijn
 * allebei waardeloos en zien er van buiten hetzelfde uit:
 *
 *   1. een kindnaam die niet in de namenkaart staat → de balk verschijnt en noemt hem;
 *   2. een document waarin iedereen bekend is       → geen balk.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

/** Het kind heet Jochem; of de classificatie hem kent verschilt per test. */
const CONVENANT_TEKST = [
  'CONVENANT / VASTSTELLINGSOVEREENKOMST',
  'Willem ter Kulve, geboren te Enschede op 12-12-1996, wonende aan Markendoel 16,',
  'werkzaam bij Pensioenfonds Zorg en Welzijn, hierna: de man;',
  'Rozemarijn Haverkate, hierna: de vrouw.',
  'Partijen zijn op 26-08-2022 te Renkum gehuwd in beperkte gemeenschap van goederen.',
  'Uit het huwelijk is geboren: Jochem ter Kulve, geboren 03-04-2011 te Deventer.',
  '2.10 Eigendom echtelijke woning. De woning wordt toebedeeld aan de man.',
  '15. Deze overeenkomst is opgemaakt en ondertekend op ......... te .........',
].join('\n');

function sseStroom(bestandsnaam) {
  const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
  const leeg = { issues: [] };
  return [
    ev({ type: 'structuur', bestandsnaam,
         result: { issues: [], samenvatting: 'Testsamenvatting.', mfn_score: { behaald: 9, totaal: 15 } } }),
    ev({ type: 'juridisch',    bestandsnaam, result: leeg }),
    ev({ type: 'balans',       bestandsnaam, result: leeg }),
    ev({ type: 'consolidatie', bestandsnaam, result: leeg }),
    ev({ type: 'klaar' }),
  ].join('');
}

function antropischeStroom(invoer) {
  const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
  return [
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use' } }),
    ev({ type: 'content_block_delta', index: 0,
         delta: { type: 'input_json_delta', partial_json: JSON.stringify(invoer) } }),
    ev({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
  ].join('');
}

/**
 * @param {object} classificatie  wat de classificatiestap "ophaalt" — het verschil tussen
 *                                de twee tests zit hier, en nergens anders.
 */
async function bereidVoor(page, classificatie) {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.route('**/rest/v1/screeningen**', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '11111111-2222-3333-4444-555555555555' }) }));
  await page.route('**/api/analyseer', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'text/event-stream' },
    body: sseStroom('convenant.pdf') }));
  await page.route('**/api/claude-edge', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'text/event-stream' },
    body: antropischeStroom({
      doc_type: 'convenant', situatie_kenmerken: [],
      documenten: [{ bestandsnaam: 'convenant.pdf', doc_type: 'convenant' }],
      ...classificatie,
    }) }));
  await page.route('**/api/naam-encrypt', route => route.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namen_map: 'proef' }) }));
  await page.route('**storage.googleapis.com/**', r => r.abort());
  await page.route('**/storage/v1/object/**', r => r.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Id: 'proef', Key: 'documenten/proef.pdf' }) }));
  await page.route('**/storage/v1/**', r => r.fulfill({
    status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page, ['zoekResidu']);
}

/** Draait de analyse en geeft terug wat de residu-controle opleverde. */
async function draaiAnalyse(page) {
  return page.evaluate(async () => {
    app.dossierId   = '9725a3c8-0000-0000-0000-000000000000';
    app.screeningId = null;
    app.tray = [{
      id: 1, type: 'convenant', bestandsnaam: 'convenant.pdf',
      tekst: window.__CONVENANT,
      bestand: new File(['x'], 'convenant.pdf', { type: 'application/pdf' }),
    }];
    let fout = '';
    try { await analyseDocument(app.tray, () => {}); }
    catch (err) { fout = `${err.name}: ${err.message}`; }
    return {
      fout,
      residu:  (app.anonResidu ?? []).map(r => r.waarde),
      balkTxt: document.getElementById('residuBalk')?.textContent ?? null,
    };
  });
}

test('een kindnaam buiten de namenkaart levert een balk op die hem noemt', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  // Jochem ontbreekt bewust in kinderen_namen: dát is het gebrek dat gemeld moet worden.
  await bereidVoor(page, {
    partij_a_naam: 'Willem ter Kulve',
    partij_b_naam: 'Rozemarijn Haverkate',
  });
  await page.evaluate((t) => { window.__CONVENANT = t; }, CONVENANT_TEKST);

  const uit = await draaiAnalyse(page);

  expect(uit.fout, 'analyseDocument struikelde').toBe('');
  // 1. De meting zelf — bewijst dat zoekResidu via de brug bereikbaar was en is aangeroepen.
  expect(uit.residu.join(' ')).toContain('Jochem');
  // 2. De balk — bewijst dat de mediator het ook te zien krijgt. Zonder deze regel kan de
  //    controle prima draaien en toch onzichtbaar zijn, wat het gebrek onveranderd laat.
  expect(uit.balkTxt, 'de residu-balk staat er niet').toContain('Jochem');
  expect(uit.balkTxt).toContain('convenant.pdf');

  verwachtGeenPaginafouten(fouten);
});

test('bij een volledige namenkaart blijft het stil', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await bereidVoor(page, {
    partij_a_naam: 'Willem ter Kulve',
    partij_b_naam: 'Rozemarijn Haverkate',
    kinderen_namen: ['Jochem ter Kulve'],
  });
  await page.evaluate((t) => { window.__CONVENANT = t; }, CONVENANT_TEKST);

  const uit = await draaiAnalyse(page);

  expect(uit.fout).toBe('');
  expect(uit.residu, `onverwacht residu: ${uit.residu.join(', ')}`).toEqual([]);
  expect(uit.balkTxt, 'er staat een balk terwijl er niets te melden is').toBeNull();

  verwachtGeenPaginafouten(fouten);
});
