import { describe, it, expect } from 'vitest';
import {
  naamDelen, alleNaamDelen, naamDelenInTekst,
  toetsDossierSamenhang, samenhangWaarschuwing,
} from '../../src/dossier-samenhang.js';

describe('naamDelen', () => {
  it('laat tussenvoegsels weg', () => {
    expect(naamDelen('Robin van den Bergman')).toEqual(['robin', 'bergman']);
  });

  it('laat delen korter dan drie tekens weg', () => {
    // Initialen dragen geen onderscheid: "J. Bergman" en "J. Doornbos" zouden
    // anders op "j" overlappen en als hetzelfde dossier gelden.
    expect(naamDelen('J. W. Bergman')).toEqual(['bergman']);
  });

  it('houdt samengestelde namen met koppelteken heel', () => {
    expect(naamDelen('Sammy Hartwijk-Doornbos')).toEqual(['sammy', 'hartwijk-doornbos']);
  });

  it('geeft een lege lijst bij lege invoer', () => {
    expect(naamDelen('')).toEqual([]);
    expect(naamDelen(null)).toEqual([]);
  });
});

describe('naamDelenInTekst', () => {
  const delen = alleNaamDelen(['Robin Bergman', 'Sammy Hartwijk']);

  it('vindt een naam op een woordgrens', () => {
    expect([...naamDelenInTekst('Ondergetekende Robin Bergman verklaart', delen)].sort())
      .toEqual(['bergman', 'robin']);
  });

  it('matcht niet binnen een langer woord', () => {
    // Zonder woordgrens zou "Bergmanstraat" als de persoon Bergman tellen —
    // een straatnaam maakt dan twee vreemde dossiers ineens verwant.
    expect(naamDelenInTekst('Wonende aan de Bergmanstraat 12', delen).size).toBe(0);
  });

  it('is hoofdletterongevoelig', () => {
    expect(naamDelenInTekst('HARTWIJK', delen).has('hartwijk')).toBe(true);
  });
});

describe('toetsDossierSamenhang', () => {
  const namen = ['Robin Bergman', 'Sammy Hartwijk', 'Juul Bergman', 'Indy Bergman'];

  it('keurt twee documenten over dezelfde personen goed', () => {
    const r = toetsDossierSamenhang({
      namen,
      documenten: [
        { bestandsnaam: 'convenant.pdf',      tekst: 'Robin Bergman en Sammy Hartwijk, ouders van Juul.' },
        { bestandsnaam: 'ouderschapsplan.pdf', tekst: 'Robin en Sammy spreken af dat Juul en Indy…' },
      ],
    });
    expect(r.oordeel).toBe('ok');
    expect(r.melding).toBe('');
  });

  it('meldt een mismatch als geen enkele naam gedeeld wordt', () => {
    const r = toetsDossierSamenhang({
      namen: [...namen, 'Chris Doornbos', 'Dani Elzinga', 'Novi Doornbos'],
      documenten: [
        { bestandsnaam: 'convenant.pdf',       tekst: 'Robin Bergman en Sammy Hartwijk.' },
        { bestandsnaam: 'ouderschapsplan.pdf', tekst: 'Chris Doornbos en Dani Elzinga, ouders van Novi.' },
      ],
    });
    expect(r.oordeel).toBe('mismatch');
    expect(r.melding).toMatch(/Geen enkele naam komt in beide documenten voor/);
    expect(r.melding).toMatch(/bergman/);
    expect(r.melding).toMatch(/doornbos/);
  });

  it('meldt twijfel bij magere overlap', () => {
    // Alleen het kind komt in beide voor; beide ouders verschillen. Dat kan kloppen
    // (een ouderschapsplan na een nieuwe relatie) maar is het nakijken waard.
    const r = toetsDossierSamenhang({
      namen: [...namen, 'Chris Doornbos', 'Dani Elzinga'],
      documenten: [
        { bestandsnaam: 'a.pdf', tekst: 'Robin Bergman en Sammy Hartwijk, ouder van Juul.' },
        { bestandsnaam: 'b.pdf', tekst: 'Chris Doornbos en Dani Elzinga over Juul.' },
      ],
    });
    expect(r.oordeel).toBe('twijfel');
    expect(r.melding).toMatch(/Gedeeld: juul/);
  });

  it('zwijgt over een document zonder herkenbare naam', () => {
    // Een taxatierapport of jaaropgave noemt vaak geen van de partijen. Dat is geen
    // aanwijzing voor een verkeerd dossier, dus er mag geen melding uit komen.
    const r = toetsDossierSamenhang({
      namen,
      documenten: [
        { bestandsnaam: 'convenant.pdf', tekst: 'Robin Bergman en Sammy Hartwijk.' },
        { bestandsnaam: 'taxatie.pdf',   tekst: 'Marktwaarde van de woning bedraagt EUR 385.000,-.' },
      ],
    });
    expect(r.oordeel).toBe('ok');
  });

  it('gebruikt de bestandsnaam als aanvullend bewijs', () => {
    // De tekst van het tweede document noemt niemand, maar de bestandsnaam wel —
    // en die wijst een andere familie aan.
    const r = toetsDossierSamenhang({
      namen: [...namen, 'Chris Doornbos'],
      documenten: [
        { bestandsnaam: 'convenant Bergman.pdf',       tekst: 'Partijen komen overeen…' },
        { bestandsnaam: 'ouderschapsplan Doornbos.pdf', tekst: 'De ouders spreken af…' },
      ],
    });
    expect(r.oordeel).toBe('mismatch');
  });

  it('geeft ok bij één document — er valt niets te vergelijken', () => {
    expect(toetsDossierSamenhang({
      namen, documenten: [{ bestandsnaam: 'a.pdf', tekst: 'Robin Bergman' }],
    }).oordeel).toBe('ok');
  });

  it('geeft ok als er geen namen bekend zijn', () => {
    expect(toetsDossierSamenhang({
      namen: [],
      documenten: [{ tekst: 'iets' }, { tekst: 'iets anders' }],
    }).oordeel).toBe('ok');
  });

  it('houdt het zwaarste oordeel vast over meerdere paren', () => {
    const r = toetsDossierSamenhang({
      namen: [...namen, 'Chris Doornbos'],
      documenten: [
        { bestandsnaam: 'a.pdf', tekst: 'Robin Bergman en Sammy Hartwijk.' },
        { bestandsnaam: 'b.pdf', tekst: 'Robin Bergman en Sammy Hartwijk, met Juul.' },
        { bestandsnaam: 'c.pdf', tekst: 'Chris Doornbos.' },
      ],
    });
    expect(r.oordeel).toBe('mismatch');
  });

  it('valt niet om op ontbrekende invoer', () => {
    expect(toetsDossierSamenhang().oordeel).toBe('ok');
    expect(toetsDossierSamenhang({ documenten: [{ tekst: null }] }).oordeel).toBe('ok');
  });
});

describe('samenhangWaarschuwing', () => {
  it('geeft niets terug als alles klopt', () => {
    expect(samenhangWaarschuwing({ oordeel: 'ok', melding: '' })).toBe('');
    expect(samenhangWaarschuwing(null)).toBe('');
  });

  it('noemt bij een mismatch het dossier en eindigt met de keuze', () => {
    const t = samenhangWaarschuwing({ oordeel: 'mismatch', melding: 'X noemt a; Y noemt b.' });
    expect(t).toMatch(/niet bij hetzelfde dossier/);
    expect(t).toMatch(/X noemt a; Y noemt b\./);
    expect(t.trim().endsWith('Toch doorgaan met de analyse?')).toBe(true);
  });

  it('gebruikt een mildere kop bij twijfel', () => {
    const t = samenhangWaarschuwing({ oordeel: 'twijfel', melding: 'iets' });
    expect(t).toMatch(/grotendeels verschillende personen/);
    expect(t).not.toMatch(/niet bij hetzelfde dossier/);
  });
});
