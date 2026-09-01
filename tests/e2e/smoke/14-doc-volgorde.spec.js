/**
 * Smoketest 14 — sorteren op documentvolgorde zet de kaarten op de juiste plek
 *
 * Aanleiding (31 augustus 2026). Bij "Sorteren op Documentvolgorde" stond een
 * verbeterpunt over de kerstverdeling bovenaan, terwijl de passage in §11 Feestdagen
 * staat — driekwart door het ouderschapsplan. Er was geen enkele controle op de
 * uitkomst, en van buiten was niet te zien of een kaart op een echte treffer stond of
 * op de terugval.
 *
 * De unittests dekken het zoeken zelf (tests/unit/doc-volgorde.test.js). Wat híer
 * wordt vastgelegd is de bedrading: dat vindDocVolgorde in de app de module gebruikt,
 * met de tekst van het actieve tabblad, en dat de controle een melding geeft als een
 * groot deel niet is teruggevonden. Dat laatste was op 29-08 precies het gat —
 * kloppende logica die nergens werd aangeroepen.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

// Let op de volgorde binnen deze tekst: het getal 11 staat er VÓÓR de zin over het
// hoofdverblijf. Anders kan de artikeltest niet omvallen — een vroege treffer die
// tóch achteraan uitkomt bewijst niets. (Eerst fout gebouwd, gemerkt door de
// reparatie weg te halen en te zien dat de test groen bleef.)
const OP_TEKST = `=== OUDERSCHAPSPLAN: op.pdf ===
1. Kinderalimentatie. De kinderalimentatie bedraagt 11 euro per dag, jaarlijks
geindexeerd. Ouders oefenen het gezag gezamenlijk uit.
2. Hoofdverblijf. De kinderen hebben hun hoofdverblijf bij de moeder.
3. Zorgverdeling. De kinderen verblijven om en om een week bij ieder van de ouders.
11. Feestdagen. De feestdagen worden op de volgende wijze verdeeld:
Kerstavond tot en met 2 de kerstdag; de wissel zal op 2 de kerstdag voor het
ontbijt zijn. Oud en nieuw: even jaren bij vader, oneven jaren bij moeder.`;

test.beforeEach(async ({ page }) => {
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**storage.googleapis.com/**', r => r.abort());
  await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page, ['bepaalVolgorde', 'beoordeelVolgorde']);
});

/** Zet de app-toestand die vindDocVolgorde leest, en roept hem aan. */
async function sorteer(page, issues) {
  return page.evaluate(([tekst, iss]) => {
    app.rapport      = { _document_tekst: tekst };
    app.documenten   = [{ doc_type: 'ouderschapsplan' }];
    app.docIdx       = 0;
    app.classificatie = { doc_type: 'ouderschapsplan' };
    return vindDocVolgorde(iss);
  }, [OP_TEKST, issues]);
}

test('de kerstpassage komt op zijn eigen plek, niet vooraan en niet achteraan', async ({ page }) => {
  const fouten = volgPaginafouten(page);

  // Drie kaarten, niet twee. Met twee bewijst deze test niets: een kaart die
  // hélemaal niet wordt teruggevonden belandt óók achteraan, dus [1,0] zou ook
  // groen zijn met de kapotte woordtrap. De derde kaart staat ná de kerstpassage,
  // zodat de kerstkaart er middenin moet landen.
  const volgorde = await sorteer(page, [
    { onderwerp: 'Kerstverdeling', _origPos: 0,
      passage: 'Kerstavond tot en met 2de kerstdag; de wissel zal op 2de kerstdag voor het ontbijt zijn.' },
    { onderwerp: 'Hoofdverblijf', _origPos: 1,
      passage: 'De kinderen hebben hun hoofdverblijf bij de moeder.' },
    { onderwerp: 'Oud en nieuw', _origPos: 2,
      passage: 'Oud en nieuw: even jaren bij vader, oneven jaren bij moeder.' },
  ]);

  expect(volgorde).toEqual([1, 0, 2]);

  verwachtGeenPaginafouten(fouten);
});

test('een kaal artikelnummer trekt een kaart niet naar voren', async ({ page }) => {
  const fouten = volgPaginafouten(page);

  // Zonder de reparatie zou artikel "11" de eerste "11" in de tekst raken — die van
  // de kinderalimentatie, in paragraaf 1 — en deze kaart bovenaan zetten.
  const volgorde = await sorteer(page, [
    { onderwerp: 'Iets uit paragraaf 11', artikel: '11', _origPos: 0,
      passage: 'Een passage die in het document niet voorkomt.' },
    { onderwerp: 'Hoofdverblijf', _origPos: 1,
      passage: 'De kinderen hebben hun hoofdverblijf bij de moeder.' },
  ]);

  expect(volgorde).toEqual([1, 0]);

  verwachtGeenPaginafouten(fouten);
});

test('de controle meldt het als de helft niet is teruggevonden', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  const meldingen = [];
  page.on('console', m => { if (m.type() === 'warning') meldingen.push(m.text()); });

  await sorteer(page, [
    { passage: 'De kinderen hebben hun hoofdverblijf bij de moeder.', _origPos: 0 },
    { passage: 'Volstrekt afwezige zin een.',   _origPos: 1 },
    { passage: 'Volstrekt afwezige zin twee.',  _origPos: 2 },
    { passage: 'Volstrekt afwezige zin drie.',  _origPos: 3 },
  ]);

  expect(meldingen.join(' ')).toMatch(/docvolgorde/);
  expect(meldingen.join(' ')).toMatch(/3 van 4/);

  verwachtGeenPaginafouten(fouten);
});

test('bij een goede uitkomst blijft het stil', async ({ page }) => {
  const meldingen = [];
  page.on('console', m => { if (m.type() === 'warning') meldingen.push(m.text()); });

  await sorteer(page, [
    { passage: 'De kinderen hebben hun hoofdverblijf bij de moeder.', _origPos: 0 },
    { passage: 'De feestdagen worden op de volgende wijze verdeeld:', _origPos: 1 },
  ]);

  expect(meldingen.join(' ')).not.toMatch(/docvolgorde/);
});

// Dit is niet in de browser te toetsen: in een test bestaat er geen naamkoppeling, dus
// de ruwe en de gepseudonimiseerde schrijfwijze zijn daar identiek en elke variant
// slaagt. In productie niet — op 1 september 2026 werden tien van de veertien
// bevindingen niet teruggevonden (nul exact) doordat alléén de gepseudonimiseerde
// variant werd aangeboden tegen een documenttekst die tijdens een verse analyse nog ruw
// is. Na opslaan en opnieuw openen klopte diezelfde lijst wél.
test('de passage gaat in beide schrijfwijzen naar de volgordebepaling', async ({ page }) => {
  const html = await (await page.request.get('/index.html')).text();

  expect(html, 'de ruwe schrijfwijze ontbreekt')
    .toMatch(/passages:[\s\S]{0,240}normPassage\(issue\.passage\)/);
  expect(html, 'de gepseudonimiseerde schrijfwijze ontbreekt')
    .toMatch(/normPassage\(anonimiseerTekst\(issue\.passage/);
});
