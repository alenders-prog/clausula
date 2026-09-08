/**
 * Unit tests — src/opslag/rapport-veld.js
 *
 * Het geval: vier PDF's geüpload om 08:42 en vastgelegd in `rapport._document_bestanden`;
 * om 08:52 schreef een ander codepad het rapport opnieuw weg zonder dat veld. De bestanden
 * stonden daarna verweesd in Storage — met persoonsgegevens erin en niets dat er nog naar
 * verwees om ze op te ruimen.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bouwRapportUpdate, DEELBARE_VELDEN } from '../../src/opslag/rapport-veld.js';

/** Welke sleutels zou deze schrijfactie kwijtraken? Leeg is goed. */
const verlorenSleutels = (oud, nieuw) => {
  const na = new Set(Object.keys(nieuw || {}));
  return Object.keys(oud || {}).filter((k) => !na.has(k));
};

/** Een rapport zoals het in de database staat, met de velden die verdwenen. */
const bewaard = () => ({
  samenvatting: 'tekst',
  issues: [{ onderwerp: 'a' }],
  documenten: [{ doc_type: 'convenant' }],
  _document_bestanden: [{ pad: 'org/1-abc.pdf', naam: 'Convenant.pdf' }],
  _teksten_per_pad: { 'org/1-abc.pdf': 'tekst' },
  _analyse_run_id: 'run-1',
});

describe('bouwRapportUpdate', () => {
  it('vervangt één veld en laat de rest ongemoeid', () => {
    const uit = bouwRapportUpdate(bewaard(), '_concepts', { convenant: { x: 1 } });
    expect(uit._concepts).toEqual({ convenant: { x: 1 } });
    expect(uit.samenvatting).toBe('tekst');
    expect(uit.documenten).toHaveLength(1);
  });

  it('behoudt juist de velden die zoekraakten', () => {
    // Dit is de hele reden dat deze module bestaat.
    const uit = bouwRapportUpdate(bewaard(), 'issues', [{ onderwerp: 'b' }]);
    expect(uit._document_bestanden).toEqual([{ pad: 'org/1-abc.pdf', naam: 'Convenant.pdf' }]);
    expect(uit._teksten_per_pad).toBeDefined();
    expect(uit._analyse_run_id).toBe('run-1');
  });

  it('verliest nooit een sleutel, welk veld je ook bijwerkt', () => {
    for (const veld of DEELBARE_VELDEN) {
      const oud = bewaard();
      expect(verlorenSleutels(oud, bouwRapportUpdate(oud, veld, []))).toEqual([]);
    }
  });
});

describe('wat het weigert, en waarom dat ergere schade voorkomt', () => {
  it('schrijft niets als het bewaarde rapport niet gelezen kon worden', () => {
    // Doorgaan zou `{ veld: waarde }` over een compleet rapport heen schrijven: dan is
    // ÁLLES weg in plaats van één veld. Falen is hier de veilige uitkomst.
    for (const leeg of [null, undefined, 'tekst', 42, []]) {
      expect(() => bouwRapportUpdate(leeg, 'issues', [])).toThrow(/geen bewaard rapport/i);
    }
  });

  it('laat alleen de velden door die op de lijst staan', () => {
    expect(() => bouwRapportUpdate(bewaard(), 'documenten', [])).toThrow(/mag niet via een deelupdate/i);
    expect(() => bouwRapportUpdate(bewaard(), '_document_bestanden', [])).toThrow(/deelupdate/i);
  });

  it('weigert een ongedefinieerde waarde', () => {
    expect(() => bouwRapportUpdate(bewaard(), 'issues', undefined)).toThrow(/geen waarde/i);
    // null mag wél: dat is een bewuste lege waarde.
    expect(() => bouwRapportUpdate(bewaard(), 'issues', null)).not.toThrow();
  });

  it('houdt de lijst kort — dit is geen tweede opslagroute', () => {
    expect(DEELBARE_VELDEN).toEqual(['_concepts', 'issues']);
  });
});

describe('verlorenSleutels', () => {
  it('noemt precies wat er zou verdwijnen', () => {
    expect(verlorenSleutels({ a: 1, _b: 2 }, { a: 9 })).toEqual(['_b']);
    expect(verlorenSleutels({ a: 1 }, { a: 1, b: 2 })).toEqual([]);
    expect(verlorenSleutels(null, null)).toEqual([]);
  });
});

// ── De wachter ──────────────────────────────────────────────────────────────
//
// Dit is het stuk dat had moeten bestaan. Er waren VIJF plekken die naar
// `screeningen.rapport` schreven; één deed het zorgvuldig en vier schreven simpelweg weg
// wat er in het geheugen stond. Dat was aan geen enkele aanroepplek te zien.
describe('elke schrijfactie naar screeningen.rapport gaat door één deur', () => {
  const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  /**
   * De enige waarden die rechtstreeks in de kolom mogen worden geschreven.
   *
   * `_opsl_rapport` is het volledige, gepseudonimiseerde rapport dat opslaan() opbouwt.
   * Alles daarbuiten hoort via bewaarRapportVeld() te gaan, dat begint bij wat er in de
   * database staat. Zet je hier iets bij, dan is dat een besluit dat in de diff staat.
   */
  const TOEGESTAAN = [
    '_opsl_rapport',                                       // opslaan(): update en insert
    '{ ..._opsl_rapport, _document_bestanden: _upBest }',   // opslaan(): paden na de insert
    '_nieuwRapport',                                        // bewaarRapportVeld()
  ];

  it('kent geen andere schrijvers dan de toegestane', () => {
    const schrijvers = [...bron.matchAll(/update\(\{\s*rapport:\s*([^}]*?(?:\{[^}]*\}[^}]*?)?)\s*\}\)/g)]
      .map((m) => m[1].trim());
    expect(schrijvers.length).toBeGreaterThan(0);
    const onbekend = schrijvers.filter((s) => !TOEGESTAAN.includes(s));
    expect(
      onbekend,
      'Schrijft rechtstreeks naar screeningen.rapport. Gebruik bewaarRapportVeld() — '
      + 'die begint bij het bewaarde rapport en kan dus geen velden verliezen. '
      + 'Hoort het hier toch te staan, zet het dan in TOEGESTAAN met een reden.',
    ).toEqual([]);
  });

  it('gebruikt de gedeelde deur op de plekken die één veld bijwerken', () => {
    // Vier plekken: twee in de conceptkeuze, één bij het opslaan van een concept, en de
    // clausule die de assistent als issue toevoegt.
    const aantal = (bron.match(/bewaarRapportVeld\(/g) || []).length;
    expect(aantal).toBeGreaterThanOrEqual(5);   // 1 definitie + 4 aanroepen
  });
});
