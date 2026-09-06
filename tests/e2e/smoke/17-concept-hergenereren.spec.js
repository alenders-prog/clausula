/**
 * Smoketest 17 — de knop "Opnieuw genereren" is werkelijk aanklikbaar
 *
 * Aanleiding (6 september 2026). De ↺-knop naast "Bekijk concept" deed niets. Geen
 * foutmelding, geen spoor in de console — er gebeurde simpelweg niks.
 *
 * De oorzaak zat in `updateConceptKnop()`. Die heeft drie takken:
 *
 *   isBezig      → genBtn.disabled = true
 *   heeftConcept → genBtn verbergen, ↺ tonen        ← disabled werd hier NIET gewist
 *   anders       → genBtn.disabled = n === 0
 *
 * En de ↺-knop doet `document.getElementById('genereerConceptBtn').click()`. Een
 * `.click()` op een DISABLED knop doet niets. Dus precies in de enige situatie waarin ↺
 * zichtbaar is — er is een concept, dus de generatie is net klaar en `disabled` staat nog
 * op `true` uit de bezig-fase — was hij dood.
 *
 * Deze test toetst de toestand ná `updateConceptKnop()`, niet de generatie zelf. Dat is
 * bewust: de fout zat in de knopstatus, en die is met een unittest niet te zien omdat de
 * functie op de DOM werkt.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

/** Zet een minimale rapport-state neer en roep de knoplogica aan. */
async function zetToestand(page, { metConcept }) {
  return page.evaluate(([heeftConcept]) => {
    window.app = window.app || {};
    app.classificatie = { doc_type: 'convenant' };
    app.documenten    = [{ doc_type: 'convenant' }];
    app.docIdx        = 0;
    app.rapport = {
      doc_type: 'convenant',
      issues: [{ onderwerp: 'Iets', ernst: 'laag', afgehandeld: true }],
      ...(heeftConcept ? { _concepts: { convenant: { tekst: 'concept' } } } : {}),
    };
    document.getElementById('splitOverlay')?.classList.add('active');

    // De toestand die de bezig-fase achterlaat. Zónder deze regel toetst de test niets:
    // de knop staat van zichzelf op enabled, dus dan slaagt hij ook met de bug erin.
    // Dat is precies wat er bij het schrijven gebeurde — de eerste versie bleef groen
    // nadat de reparatie tijdelijk was weggehaald.
    document.getElementById('genereerConceptBtn').disabled = true;

    updateConceptKnop();
    const gen    = document.getElementById('genereerConceptBtn');
    const hergen = document.getElementById('hergenConceptBtn');
    return {
      genDisabled:    gen.disabled,
      hergenZichtbaar: hergen.style.display !== 'none',
    };
  }, [metConcept]);
}

test('met een concept is de ↺-knop zichtbaar én is de doelknop aanklikbaar', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**/storage/v1/**', (r) => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);

  const uit = await zetToestand(page, { metConcept: true });

  expect(uit.hergenZichtbaar).toBe(true);
  // Dit is de hele bug: hij was `true`, en dan doet `.click()` niets.
  expect(uit.genDisabled).toBe(false);

  verwachtGeenPaginafouten(fouten);
});

test('de ↺-klik bereikt de knop erachter', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**/storage/v1/**', (r) => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);

  await zetToestand(page, { metConcept: true });

  // Niet de echte generatie starten — alleen vaststellen dát de klik aankomt.
  const bereikt = await page.evaluate(() => new Promise((klaar) => {
    const gen = document.getElementById('genereerConceptBtn');
    gen.addEventListener('click', () => klaar(true), { once: true });
    setTimeout(() => klaar(false), 1000);
    document.getElementById('hergenConceptBtn').click();
  }));

  expect(bereikt).toBe(true);
  verwachtGeenPaginafouten(fouten);
});

test('zonder concept blijft ↺ verborgen', async ({ page }) => {
  const fouten = volgPaginafouten(page);
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);
  await page.route('**/storage/v1/**', (r) => r.fulfill({ status: 404 }));

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await wachtOpBrug(page);

  const uit = await zetToestand(page, { metConcept: false });
  expect(uit.hergenZichtbaar).toBe(false);

  verwachtGeenPaginafouten(fouten);
});
