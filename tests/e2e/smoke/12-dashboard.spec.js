/**
 * Smoketest 12 — het dashboard rendert in de pagina
 *
 * Aggregatie (26 tests) en weergave (23 tests) staan in src/dashboard/. Wat die niet
 * dekken is de bedrading: elf nieuwe `window.*`-toewijzingen, en `tekenDashboard()`
 * dat ze aanroept vanuit het klassieke script. Breekt daar iets, dan laadt de pagina
 * zonder klacht en blijft de kaartenrij simpelweg leeg — geen foutmelding, geen
 * kapotte pagina, alleen niets. Dat is het soort stilte waar niemand op klikt.
 *
 * De test voedt de renderfuncties met een klein maar volledig statistiekobject en
 * kijkt of er ook werkelijk zes kaarten en vier secties uit komen.
 */

import { test, expect } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
import { volgPaginafouten, verwachtGeenPaginafouten } from '../helpers/paginafouten.js';
import { wachtOpBrug } from '../helpers/brug.js';

const DOSSIERS = [
  { id: 'd1', status: 'actief' }, { id: 'd2', status: 'actief' }, { id: 'd3', status: 'afgerond' },
];

const SCREENINGEN = [
  { dossier_id: 'd1', versie_nr: 1, rapport: { documenten: [{
      doc_type: 'convenant',
      issues: [
        { onderwerp: 'Pensioen niet geregeld', ernst: 'hoog',   dimensies: ['juridisch'] },
        { onderwerp: 'Tikfout in artikel 3',   ernst: 'laag',   dimensies: ['grammatica'], afgehandeld: true },
        { onderwerp: 'Klopt niet',             ernst: 'midden', dimensies: ['balans'], negeer: true },
      ],
      mfn_score: { score_totaal: 15, elementen: [{ status: 'aanwezig' }, { status: 'ontbreekt' }] },
    }] } },
  { dossier_id: 'd1', versie_nr: 2, rapport: { documenten: [{
      doc_type: 'convenant',
      issues: [
        { onderwerp: 'Pensioen niet geregeld', ernst: 'hoog',   dimensies: ['juridisch'] },
        { onderwerp: 'Nieuw bij herschrijven', ernst: 'midden', dimensies: ['conflicten'] },
      ],
      mfn_score: { score_totaal: 15, elementen: [{ status: 'aanwezig' }, { status: 'aanwezig' }] },
    }] } },
];

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseSession(page);
    await mockSupabaseRest(page);
    await page.route('**storage.googleapis.com/**', r => r.abort());
    await page.route('**/storage/v1/**', r => r.fulfill({ status: 404 }));
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
    await wachtOpBrug(page, ['bouwStatistieken', 'kpiStripHtml']);
  });

  test('de kerncijferbalk toont vijf cijfers uit echte gegevens', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const uit = await page.evaluate(([dossiers, screeningen]) => {
      const stats = bouwStatistieken({ dossiers, screeningen });
      const el = document.getElementById('dbKpi');
      el.innerHTML = kpiStripHtml(stats);
      return {
        cellen:  el.querySelectorAll('.db-cel').length,
        pijl:    !!el.querySelector('#dbStatBtn'),
        tekst:   el.textContent.replace(/\s+/g, ' '),
        stats:   { actief: stats.kpi.actief, afgerond: stats.kpi.afgerond,
                   gesignaleerd: stats.kpi.gesignaleerd, afgevinkt: stats.kpi.afgevinkt },
      };
    }, [DOSSIERS, SCREENINGEN]);

    expect(uit.cellen).toBe(5);
    expect(uit.pijl).toBe(true);
    expect(uit.stats).toEqual({ actief: 2, afgerond: 1, gesignaleerd: 5, afgevinkt: 1 });
    expect(uit.tekst).toContain('Actieve dossiers');
    // De documentscore stond permanent op "— nog geen tweede versie" en is 07-09-2026 weg.
    expect(uit.tekst).not.toContain('Documentscore');
    verwachtGeenPaginafouten(fouten);
  });

  test('de drie secties vullen zich zonder fout', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const uit = await page.evaluate(([dossiers, screeningen]) => {
      const stats = bouwStatistieken({ dossiers, screeningen });
      const vul = (id, html) => { const el = document.getElementById(id); el.innerHTML = html; return el; };
      const cat = vul('dbCategorie', categorieHtml(stats));
      const mfn = vul('dbMfn',       mfnHtml(stats, 'alle'));
      const top = vul('dbTop',       topIssuesHtml(stats));
      return {
        kaartOpmaak: !!cat.querySelector('.v2-cmp-grid'),
        pijl:        !!cat.querySelector('.v2-cmp-arrow'),
        balk:        !!cat.querySelector('.v2-prog-fill'),
        mfnRingen:   mfn.querySelectorAll('.db-donut').length,
        totaalRegel: !!cat.querySelector('tfoot'),
        catRijen: cat.querySelectorAll('.db-tabel tbody tr').length,
        mfnTekst: mfn.textContent.replace(/\s+/g, ' '),
        topRijen: top.querySelectorAll('.db-toprij').length,
      };
    }, [DOSSIERS, SCREENINGEN]);

    // Twee ringen voor de ernst — gevonden tegenover nog open, met een pijl ertussen,
    // precies zoals de dossierkaart dat doet (16 → 13, "3 van 16 beoordeeld").
    expect(uit.kaartOpmaak).toBe(true);
    expect(uit.pijl).toBe(true);
    expect(uit.balk).toBe(true);
    expect(uit.mfnRingen).toBe(1);
    expect(uit.totaalRegel).toBe(true);
    expect(uit.catRijen).toBeGreaterThan(0);
    expect(uit.mfnTekst).toContain('Aanwezig');
    expect(uit.topRijen).toBeGreaterThan(0);
    verwachtGeenPaginafouten(fouten);
  });

  test('de pijl in de kerncijferbalk klapt het paneel open en dicht', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    // De pijl zit sinds 07-09-2026 ín de balk, en die wordt bij elke verversing opnieuw
    // opgebouwd. Juist daarom loopt deze test twee klikken: een luisteraar rechtstreeks
    // op de knop zou na de eerste hertekening dood zijn, en dat is van buiten niet te zien.
    const knop   = page.locator('#dbStatBtn');
    const paneel = page.locator('#dbPaneel');

    await expect(knop).toBeVisible();
    await expect(paneel).toBeHidden();

    // Het paneel schuift uit met grid-template-rows 0fr → 1fr. Zonder deze controle kan
    // die overgang er bij een opruimronde stil uit vallen: het paneel werkt dan nog
    // steeds, het klapt alleen weer open zonder dat je ziet dát er iets gebeurt.
    const overgang = await paneel.evaluate(el => getComputedStyle(el).transitionProperty);
    expect(overgang).toContain('grid-template-rows');

    await knop.click();
    await expect(paneel).toBeVisible();
    await expect(knop).toHaveAttribute('aria-expanded', 'true');
    // Tweede klik, ná een hertekening — hier zou een dode luisteraar zichtbaar worden.
    await knop.click();
    await expect(paneel).toBeHidden();
    await expect(knop).toHaveAttribute('aria-expanded', 'false');

    verwachtGeenPaginafouten(fouten);
  });
});
