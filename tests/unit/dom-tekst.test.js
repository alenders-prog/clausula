/**
 * Unit tests — src/viewer/dom-tekst.js
 *
 * Het geval van 24 augustus 2026: een passage die over twee bullets liep werd niet
 * gevonden, terwijl hij gewoon in het document stond. De viewer plakte alle
 * tekstnodes aaneen zónder scheidingsteken:
 *
 *     document: "…nieuwjaar te wensen.Oud & Nieuw: in de even jaren…"
 *     citaat:   "…nieuwjaar te wensen. Oud & Nieuw: in de even jaren…"
 *
 * Eén ontbrekende spatie, en de passage was onvindbaar — zonder foutmelding.
 *
 * De tegenhanger is even belangrijk: binnen één alinea mág er géén spatie bij,
 * want een woord kan over twee nodes lopen ("vor<strong>dering</strong>").
 */

import { describe, it, expect } from 'vitest';
import { voegTekstDelenSamen, BLOK_TAGS } from '../../src/viewer/dom-tekst.js';

describe('voegTekstDelenSamen', () => {
  it('zet een spatie tussen twee blokken — het geval dat misging', () => {
    const { tekst } = voegTekstDelenSamen([
      { tekst: '…nieuwjaar te wensen.', blok: 'li-1' },
      { tekst: 'Oud & Nieuw: in de even jaren bij vader.', blok: 'li-2' },
    ]);
    expect(tekst).toContain('te wensen. Oud & Nieuw');
    expect(tekst).not.toContain('wensen.Oud');
  });

  it('zet GEEN spatie binnen hetzelfde blok — anders breekt een woord', () => {
    // "vor" + "dering" in één alinea, met <strong> ertussen. Een spatie hier maakt
    // "vordering" onvindbaar, en dat is de fout in de andere richting.
    const { tekst } = voegTekstDelenSamen([
      { tekst: 'De vor',    blok: 'p-1' },
      { tekst: 'dering',    blok: 'p-1' },
      { tekst: ' vervalt.', blok: 'p-1' },
    ]);
    expect(tekst).toBe('De vordering vervalt.');
  });

  it('voegt geen dubbele spatie toe als er al witruimte staat', () => {
    // Anders schuiven de posities op en wijst een gevonden index naar de verkeerde node.
    const { tekst } = voegTekstDelenSamen([
      { tekst: 'Eerste alinea. ', blok: 'p-1' },
      { tekst: 'Tweede alinea.',  blok: 'p-2' },
    ]);
    expect(tekst).toBe('Eerste alinea. Tweede alinea.');
  });

  it('voegt geen spatie toe vóór tekst die al met witruimte begint', () => {
    const { tekst } = voegTekstDelenSamen([
      { tekst: 'Eerste.',  blok: 'p-1' },
      { tekst: ' Tweede.', blok: 'p-2' },
    ]);
    expect(tekst).toBe('Eerste. Tweede.');
  });

  it('geeft posities terug die naar het juiste deel wijzen', () => {
    // Dit is waarvoor starts bestaat: een treffer terugvertalen naar de node waar
    // hij in staat. Klopt de telling niet, dan komt de markering ernaast.
    const delen = [
      { tekst: 'Alfa.',  blok: 'p-1' },
      { tekst: 'Bravo.', blok: 'p-2' },
      { tekst: 'Delta.', blok: 'p-2' },
    ];
    const { tekst, starts } = voegTekstDelenSamen(delen);
    expect(tekst).toBe('Alfa. Bravo.Delta.');
    expect(starts).toEqual([0, 6, 12]);
    for (let i = 0; i < delen.length; i++) {
      expect(tekst.slice(starts[i], starts[i] + delen[i].tekst.length)).toBe(delen[i].tekst);
    }
  });

  it('zet geen spatie vóór het eerste deel', () => {
    const { tekst, starts } = voegTekstDelenSamen([{ tekst: 'Begin', blok: 'p-1' }]);
    expect(tekst).toBe('Begin');
    expect(starts).toEqual([0]);
  });

  it('gaat om met lege delen en lege invoer', () => {
    expect(voegTekstDelenSamen([])).toEqual({ tekst: '', starts: [] });
    expect(voegTekstDelenSamen(null)).toEqual({ tekst: '', starts: [] });
    const r = voegTekstDelenSamen([
      { tekst: '', blok: 'p-1' },
      { tekst: 'Tekst', blok: 'p-2' },
    ]);
    expect(r.tekst).toBe('Tekst');
    expect(r.starts).toEqual([0, 0]);
  });

  it('vergelijkt blokken op identiteit, niet op waarde', () => {
    const blokA = {}, blokB = {};
    expect(voegTekstDelenSamen([
      { tekst: 'een', blok: blokA }, { tekst: 'twee', blok: blokA },
    ]).tekst).toBe('eentwee');
    expect(voegTekstDelenSamen([
      { tekst: 'een', blok: blokA }, { tekst: 'twee', blok: blokB },
    ]).tekst).toBe('een twee');
  });
});

describe('BLOK_TAGS', () => {
  it('bevat de elementen die docx-preview voor alinea\'s en lijsten gebruikt', () => {
    for (const t of ['P', 'LI', 'TD', 'DIV', 'H1']) expect(BLOK_TAGS.has(t)).toBe(true);
  });

  it('bevat geen inline-elementen — die horen door te lopen', () => {
    for (const t of ['SPAN', 'STRONG', 'EM', 'A', 'B', 'I']) expect(BLOK_TAGS.has(t)).toBe(false);
  });
});
