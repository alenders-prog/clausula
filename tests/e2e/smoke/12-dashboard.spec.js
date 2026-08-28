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

  test('de kaartenrij toont zes cijfers uit echte gegevens', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const uit = await page.evaluate(([dossiers, screeningen]) => {
      const stats = bouwStatistieken({ dossiers, screeningen });
      const el = document.getElementById('dbKpi');
      el.innerHTML = kpiStripHtml(stats);
      return {
        kaarten: el.querySelectorAll('.db-kpi').length,
        tekst:   el.textContent.replace(/\s+/g, ' '),
        stats:   { actief: stats.kpi.actief, afgerond: stats.kpi.afgerond,
                   gesignaleerd: stats.kpi.gesignaleerd, afgevinkt: stats.kpi.afgevinkt },
      };
    }, [DOSSIERS, SCREENINGEN]);

    expect(uit.kaarten).toBe(6);
    expect(uit.stats).toEqual({ actief: 2, afgerond: 1, gesignaleerd: 5, afgevinkt: 1 });
    expect(uit.tekst).toContain('Actieve dossiers');
    expect(uit.tekst).toContain('Documentscore');
    verwachtGeenPaginafouten(fouten);
  });

  test('de vier secties vullen zich zonder fout', async ({ page }) => {
    const fouten = volgPaginafouten(page);

    const uit = await page.evaluate(([dossiers, screeningen]) => {
      const stats = bouwStatistieken({ dossiers, screeningen });
      const vul = (id, html) => { const el = document.getElementById(id); el.innerHTML = html; return el; };
      const cat = vul('dbCategorie', categorieHtml(stats));
      const ver = vul('dbVerloop',   verloopHtml(stats));
      const mfn = vul('dbMfn',       mfnHtml(stats, 'alle'));
      const top = vul('dbTop',       topIssuesHtml(stats));
      return {
        kaartOpmaak: !!cat.querySelector('.v2-cmp-grid'),
        pijl:        !!cat.querySelector('.v2-cmp-arrow'),
        balk:        !!cat.querySelector('.v2-prog-fill'),
        mfnRingen:   mfn.querySelectorAll('.db-donut').length,
        totaalRegel: !!cat.querySelector('tfoot'),
        catRijen: cat.querySelectorAll('.db-tabel tbody tr').length,
        verBalken: ver.querySelectorAll('.db-vbalk').length,
        verTekst: ver.textContent.replace(/\s+/g, ' '),
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
    expect(uit.verBalken).toBe(2);         // versie 1 en de laatste versie
    // Het punt van het verloop: er is er één bijgekomen bij het herschrijven.
    expect(uit.verTekst).toContain('Nieuw · 1');
    expect(uit.verTekst).toContain('Genegeerd · 1');
    expect(uit.mfnTekst).toContain('Aanwezig');
    expect(uit.topRijen).toBeGreaterThan(0);
    verwachtGeenPaginafouten(fouten);
  });

  test('de knop Statistieken klapt het paneel open en dicht', async ({ page }) => {
    const fouten = volgPaginafouten(page);
    const knop   = page.locator('#dbStatBtn');
    const paneel = page.locator('#dbPaneel');

    await expect(paneel).toBeHidden();
    await knop.click();
    await expect(paneel).toBeVisible();
    await expect(knop).toHaveAttribute('aria-expanded', 'true');
    await knop.click();
    await expect(paneel).toBeHidden();

    verwachtGeenPaginafouten(fouten);
  });
});
