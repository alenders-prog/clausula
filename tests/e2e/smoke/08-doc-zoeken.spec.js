/**
 * Smoketest 08 — de zoekteller in het documentpaneel telt elke treffer één keer
 *
 * Op 24 augustus 2026 meldde de zoekbalk "9 / 21" op een document met tien
 * treffers. Twee oorzaken, allebei onzichtbaar bij het lezen van één functie:
 *
 *  1. `highlightInPdf` vulde `_zoekAnkers` zélf al — één anker per treffer — en
 *     de aanroeper haalde daarna nóg eens alle `.textLayer span.hl-match` op.
 *  2. `highlightInDocx` maakt één `<mark>` per tekstnode; een treffer die over
 *     twee nodes loopt (vet woord, afbreking) leverde er dus twee.
 *
 * Geen van beide is te zien in de code die de teller rendert, en geen unittest
 * kan erbij: het gaat om DOM die pas bij het zoeken ontstaat. Vandaar hier.
 *
 * Faalt deze test, dan verzamelt iemand de ankers weer buiten de highlighters om,
 * of markeert een highlighter meer elementen dan er treffers zijn.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';

/** Zet een documentpaneel klaar met DOCX-weergave en geeft het aantal treffers terug. */
async function zoek(page, html, term) {
  return page.evaluate(([h, t]) => {
    document.getElementById('splitOverlay').classList.add('active');
    const panel = document.getElementById('documentPanel');
    panel.classList.remove('tekst-modus');
    panel.innerHTML = `<div class="docx-inhoud">${h}</div>`;
    const inp = document.getElementById('docZoekInput');
    if (inp) inp.value = t;
    zoekInDocument(t);
    return {
      ankers:  _zoekAnkers.length,
      marks:   panel.querySelectorAll('mark.hl-match').length,
      label:   document.getElementById('docZoekInfo')?.textContent?.trim() || '',
    };
  }, [html, term]);
}

test.describe('zoeken in het documentpaneel', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page);
    await mockSupabaseRest(page);
    await page.route('**storage.googleapis.com/**', r => r.abort());
    await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  });

  test('telt elke treffer één keer', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    const r = await zoek(
      page,
      '<p>De vordering vervalt.</p><p>Een tweede vordering blijft staan.</p><p>Geen derde.</p>',
      'vorderin',
    );
    expect(r.ankers).toBe(2);
    expect(r.marks).toBe(2);
    expect(r.label).toBe('1 / 2');
    verwachtGeenPaginafouten(fouten);
  });

  test('een treffer die over twee tekstnodes loopt telt als één', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    // "vordering" staat hier verdeeld over een gewone tekstnode en een <strong> —
    // precies wat docx-preview doet bij een woord dat halverwege vet wordt.
    const r = await zoek(page, '<p>De vor<strong>dering</strong> vervalt.</p>', 'vorderin');
    expect(r.marks).toBe(2);   // twee <mark>-elementen…
    expect(r.ankers).toBe(1);  // …maar één zoekresultaat
    expect(r.label).toBe('1 / 1');
    verwachtGeenPaginafouten(fouten);
  });

  test('zonder treffers blijft de teller leeg', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    const r = await zoek(page, '<p>Niets van dien aard.</p>', 'vorderin');
    expect(r.ankers).toBe(0);
    expect(r.marks).toBe(0);
    verwachtGeenPaginafouten(fouten);
  });

  test('opnieuw zoeken stapelt de ankers niet op', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    const html = '<p>De vordering vervalt.</p><p>Een tweede vordering blijft staan.</p>';
    await zoek(page, html, 'vorderin');
    const r = await page.evaluate(() => {
      zoekInDocument('vorderin');
      return { ankers: _zoekAnkers.length, label: document.getElementById('docZoekInfo')?.textContent?.trim() || '' };
    });
    expect(r.ankers).toBe(2);
    expect(r.label).toBe('1 / 2');
    verwachtGeenPaginafouten(fouten);
  });
});
