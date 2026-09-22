/**
 * tests/unit/bekende-fouten.test.js
 *
 * De maat waarop de leveranciersvergelijking rust. Twee dingen worden hier bewaakt: dat
 * een gebrek wordt herkend wanneer het gemeld is, en — belangrijker — dat hij niet
 * aanslaat op een bevinding die er toevallig op lijkt. Een gemiste melding is
 * hinderlijk; een valse treffer maakt een model ten onrechte goed.
 */

import { describe, it, expect } from 'vitest';
import {
  meldtGebrek, isGemeld, aantalRunsGemeld, bevindingTekst, onbruikbareGebreken,
} from '../../src/analyse/bekende-fouten.js';

const issue = (extra = {}) => ({
  onderwerp: 'Peildatum ontbreekt',
  bevinding: 'Het convenant noemt geen peildatum voor de waardering van het vermogen.',
  passage: '',
  aanbeveling: 'Leg een peildatum vast.',
  ernst: 'hoog',
  dimensies: ['volledigheid'],
  ...extra,
});

describe('bevindingTekst', () => {
  it('neemt kop, uitleg, citaat en aanbeveling mee', () => {
    const t = bevindingTekst(issue({ passage: 'artikel 3' }));
    expect(t).toContain('peildatum ontbreekt');
    expect(t).toContain('waardering');
    expect(t).toContain('artikel 3');
    expect(t).toContain('leg een peildatum vast');
  });

  it('overleeft ontbrekende velden', () => {
    expect(bevindingTekst({})).toBe('');
    expect(bevindingTekst(null)).toBe('');
  });
});

describe('zoek — één term volstaat, goed voor taalfouten', () => {
  const fout = { sleutel: 'gezamelijke', zoek: ['gezamelijke'] };

  it('herkent de fout in de tekst van de bevinding', () => {
    expect(meldtGebrek(fout, issue({ bevinding: 'Er staat "gezamelijke" in artikel 2.' }))).toBe(true);
  });

  it('is ongevoelig voor hoofdletters', () => {
    expect(meldtGebrek(fout, issue({ onderwerp: 'Spelfout: Gezamelijke' }))).toBe(true);
  });

  it('slaat niet aan als geen van de termen voorkomt', () => {
    expect(meldtGebrek(fout, issue())).toBe(false);
  });

  it('volstaat met één van meerdere termen', () => {
    const f = { zoek: ['wordtgekregen', 'wordt gekregen'] };
    expect(meldtGebrek(f, issue({ bevinding: 'De zin "wordt gekregen" is fout.' }))).toBe(true);
  });
});

describe('zoek_alle — alle termen, goed voor inhoudelijke gebreken', () => {
  const fout = {
    sleutel: 'peildatum-ontbreekt',
    zoek_alle: ['peildatum', 'ontbreek'],
    dimensie: 'volledigheid',
  };

  it('herkent het gebrek als alle termen voorkomen', () => {
    expect(meldtGebrek(fout, issue())).toBe(true);
  });

  it('slaat NIET aan als er één term mist', () => {
    // "peildatum" alleen komt ook voor in bevindingen die er niets mee te maken hebben.
    // Dit is de reden dat zoek_alle bestaat.
    const anders = issue({
      onderwerp: 'Peildatum onduidelijk geformuleerd',
      bevinding: 'De peildatum staat er wel, maar de formulering is voor twee uitleg vatbaar.',
      aanbeveling: 'Herformuleer.',
    });
    expect(meldtGebrek(fout, anders)).toBe(false);
  });

  it('eist de opgegeven dimensie', () => {
    expect(meldtGebrek(fout, issue({ dimensies: ['grammatica'] }))).toBe(false);
    expect(meldtGebrek(fout, issue({ dimensies: ['volledigheid', 'juridisch'] }))).toBe(true);
    expect(meldtGebrek(fout, issue({ dimensies: [] }))).toBe(false);
  });

  it('laat de dimensie-eis weg als die er niet is', () => {
    const zonderDim = { zoek_alle: ['peildatum', 'ontbreek'] };
    expect(meldtGebrek(zonderDim, issue({ dimensies: ['grammatica'] }))).toBe(true);
  });

  it('kan met zoek gecombineerd worden — alle van de ene, één van de andere', () => {
    const f = { zoek_alle: ['peildatum'], zoek: ['ontbreekt', 'niet vastgelegd'] };
    expect(meldtGebrek(f, issue())).toBe(true);
    expect(meldtGebrek(f, issue({
      onderwerp: 'Peildatum', bevinding: 'De peildatum is onduidelijk.', aanbeveling: 'Verhelder.',
    }))).toBe(false);
  });
});

describe('een gebrek zonder zoektermen matcht nergens op', () => {
  it('geeft false in plaats van stilzwijgend true', () => {
    // Stil true zou élk model perfect laten scoren op dat gebrek.
    expect(meldtGebrek({ sleutel: 'leeg' }, issue())).toBe(false);
    expect(meldtGebrek({ sleutel: 'leeg', zoek: [], zoek_alle: [] }, issue())).toBe(false);
  });

  it('wordt als onbruikbaar gemeld, zodat het niet stil stuk staat', () => {
    expect(onbruikbareGebreken([
      { sleutel: 'goed', zoek: ['x'] },
      { sleutel: 'stuk' },
      { sleutel: 'ook-stuk', zoek: [], zoek_alle: [] },
      { zoek_alle: ['y'] },
    ])).toEqual(['stuk', 'ook-stuk']);
  });

  it('meldt niets bij een gezonde lijst', () => {
    expect(onbruikbareGebreken([{ sleutel: 'a', zoek: ['x'] }])).toEqual([]);
  });
});

describe('isGemeld en aantalRunsGemeld', () => {
  const fout = { zoek: ['gezamelijke'] };

  it('zoekt door de hele lijst bevindingen', () => {
    expect(isGemeld(fout, [issue(), issue({ bevinding: 'gezamelijke staat er' })])).toBe(true);
    expect(isGemeld(fout, [issue(), issue()])).toBe(false);
    expect(isGemeld(fout, [])).toBe(false);
  });

  it('telt in hoeveel runs het gebrek is gemeld', () => {
    const wel = [issue({ bevinding: 'gezamelijke' })];
    const niet = [issue()];
    expect(aantalRunsGemeld(fout, [wel, niet, wel])).toBe(2);
    expect(aantalRunsGemeld(fout, [])).toBe(0);
  });
});

describe('overleeft rommel', () => {
  it('struikelt niet over null', () => {
    expect(meldtGebrek(null, issue())).toBe(false);
    expect(meldtGebrek({ zoek: ['x'] }, null)).toBe(false);
    expect(isGemeld({ zoek: ['x'] }, null)).toBe(false);
    expect(onbruikbareGebreken(null)).toEqual([]);
  });
});
