/**
 * Smoketest 06 — De assistent beantwoordt een vraag, streamend
 *
 * Dit is het pad dat op 23 augustus 2026 twee keer productie haalde met een fout die
 * geen enkele bestaande controle zag:
 *
 *     bouwVerificatieContext is not defined      (ESM-import niet aan window gehangen)
 *     STREAM_ONDERDELEN is not defined           (declaratie bij een refactor meegeknipt)
 *
 * Beide laadden zonder syntaxfout en braken pas bij de eerste klik. De unittests
 * dekken de losse modules, maar niemand liep de flow ooit dóór.
 *
 * De test mockt `/api/ai-assistent` met een vast SSE-stroompje in precies het formaat
 * dat de server stuurt, en controleert drie dingen:
 *   1. de tekst groeit terwijl hij binnenkomt (er staat iets vóór het eind)
 *   2. de secties die onderweg meekomen worden gerenderd (bronnen, signalen)
 *   3. er ontstaat geen enkele runtime-fout
 *
 * Als deze test faalt: _assistVerstuur, _assistMaakStreamBericht,
 * _assistVoegAssistBerichtToe of de ESM-brug onderaan index.html is kapot.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten, verwachtGeenFoutbericht } from '../helpers/paginafouten.js';

const ANTWOORD = '**Zeggenschap over de woning**\n\nDe vertrekkende partij behoudt '
  + 'zeggenschap zolang de woning gezamenlijk eigendom is.';

const EIND = {
  intent:   'casus',
  antwoord: ANTWOORD,
  bronnen:  [{ type: 'wet', citation: 'art. 3:170 BW' }, { type: 'wet', citation: 'art. 1:88 BW' }],
  aannames: ['Uitgaande van gezamenlijk eigendom'],
  signalen: [{ perspectief: 'juridisch', ernst: 'hoog', tekst: 'Geen boetebeding opgenomen' }],
  onbekenden: [],
  verduidelijkingsvraag: null,
  vervolgacties: ['clausule_opstellen'],
  opties: [],
  vragen: [],
  clausuleRelevant: 'convenant',
};

/** Precies het formaat dat api/ai-assistent.js stuurt. */
function bouwStroom() {
  const bericht = obj => `data: ${JSON.stringify(obj)}\n\n`;
  const helft = Math.floor(ANTWOORD.length / 2);
  return [
    bericht({ type: 'fase',   tekst: 'Kennisbank raadplegen…' }),
    bericht({ type: 'fase',   tekst: 'Zoekt: zeggenschap gezamenlijke woning' }),
    bericht({ type: 'delta',  tekst: ANTWOORD.slice(0, helft) }),
    bericht({ type: 'delta',  tekst: ANTWOORD.slice(helft) }),
    bericht({ type: 'sectie', veld: 'bronnen',       waarde: EIND.bronnen }),
    bericht({ type: 'sectie', veld: 'aannames',      waarde: EIND.aannames }),
    bericht({ type: 'sectie', veld: 'signalen',      waarde: EIND.signalen }),
    bericht({ type: 'sectie', veld: 'vervolgacties', waarde: EIND.vervolgacties }),
    bericht({ type: 'klaar',  data: EIND }),
  ].join('');
}

test('assistent beantwoordt een vraag streamend, zonder runtime-fouten', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  // De assistent-endpoint mocken. Het `stream: true` in de body wordt gecontroleerd:
  // zonder dat verzoek zou de client op het JSON-pad blijven en test deze spec niets.
  let vroegOmStroom = null;
  await page.route('**/api/ai-assistent', async (route) => {
    vroegOmStroom = JSON.parse(route.request().postData() || '{}').stream === true;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: bouwStroom(),
    });
  });

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });

  // Panel openen en de koppel-dialoog afhandelen als algemene vraag.
  await page.evaluate(() => {
    window.toggleAssistPanel();
    if (typeof window._assistLinkNee === 'function') window._assistLinkNee();
  });
  await expect(page.locator('#assistPanel')).toHaveClass(/open/);

  await page.fill('#assistInput', 'Heeft de vertrekkende partij nog zeggenschap over de woning?');
  await page.click('#assistSend');

  // Eerst kort kijken of er iets brak. Het antwoord komt uit een gemockte stroom en
  // is dus binnen milliseconden binnen; blijft het uit door een ReferenceError, dan
  // zou de tekstassertie hieronder twintig seconden wachten en falen met "tekst niet
  // gevonden" — terwijl de échte melding hier al klaarstaat.
  await page.waitForTimeout(1500);
  verwachtGeenPaginafouten(fouten);

  // ── 1. Het antwoord verschijnt ──────────────────────────────────────────────
  const bericht = page.locator('#assistMsgs .assist-msg-assist').last();
  await verwachtGeenFoutbericht(bericht);
  await expect(bericht).toContainText('gezamenlijk eigendom');
  expect(vroegOmStroom, 'client vroeg niet om een stroom').toBe(true);

  // ── 2. De secties zijn gerenderd ────────────────────────────────────────────
  // Bronnen komen als chips terug, signalen als inklapbaar blok.
  await expect(bericht.locator('.assist-bron')).toHaveCount(2);
  await expect(bericht).toContainText('Signalen');
  await expect(bericht).toContainText('Aannames');

  // ── 3. De voortgangsregel is weg zodra het antwoord af is ───────────────────
  // Blijft die staan, dan is het definitieve bericht niet gerenderd en kijk je nog
  // naar de voorvertoning.
  await expect(bericht.locator('.assist-stream-rest')).toHaveCount(0);

  verwachtGeenPaginafouten(fouten);
});

test('assistent toont een leesbare melding bij een platte foutpagina', async ({ page }) => {
  // Het geval dat de mediator "Unexpected token 'A'" opleverde: Vercel kapt de functie
  // af en stuurt geen JSON maar een tekstpagina. leesAntwoord() hoort daar een zin van
  // te maken, niet de binnenkant van de parser.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.route('**/api/ai-assistent', route => route.fulfill({
    status: 504,
    headers: { 'Content-Type': 'text/plain' },
    body: 'An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n\nfra1::abc',
  }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await page.evaluate(() => {
    window.toggleAssistPanel();
    if (typeof window._assistLinkNee === 'function') window._assistLinkNee();
  });

  await page.fill('#assistInput', 'Een vraag die in een time-out loopt.');
  await page.click('#assistSend');

  const bericht = page.locator('#assistMsgs .assist-msg-assist').last();
  await expect(bericht).toContainText('te lang over');
  await expect(bericht).not.toContainText('JSON');
  await expect(bericht).not.toContainText('token');

  verwachtGeenPaginafouten(fouten);
});

test('clausulekop blijft niet achter als het genereren mislukt', async ({ page }) => {
  // De kop wordt vóór de stroom opgehangen zodat hij niet halverwege bijschuift.
  // Gaat het antwoord daarna mis, dan ruimt de stroom zijn eigen voorvertoning op
  // maar is de kop een apart element — en bleef die staan. Bij elke nieuwe poging
  // kwam er zo een lege "Voorgestelde clausule" boven de volgende foutmelding.
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  await page.route('**/api/ai-assistent', route => route.fulfill({
    status: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Claude 529: overloaded' }),
  }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await page.evaluate(() => {
    window.toggleAssistPanel();
    if (typeof window._assistLinkNee === 'function') window._assistLinkNee();
  });

  // Twee keer proberen: één achtergebleven kop valt nog weg tussen de meldingen,
  // maar bij herhaling stapelen ze op — en dát is wat de mediator zou zien.
  for (let poging = 0; poging < 2; poging++) {
    await page.evaluate(() => window._assistVerstuur(
      'Stel een clausule op over de verkoop van de woning.', 'Clausule…', true, true));
    await expect(page.locator('#assistMsgs')).toContainText('fout', { ignoreCase: true });
  }

  const koppen = await page.locator('#assistMsgs [id^="clausule-hdr-"]').count();
  expect(koppen, `${koppen} achtergebleven clausulekop(pen) na twee mislukte pogingen`).toBe(0);

  verwachtGeenPaginafouten(fouten);
});
