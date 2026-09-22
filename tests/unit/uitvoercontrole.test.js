/**
 * tests/unit/uitvoercontrole.test.js
 *
 * De mechanische controle op een screeningoutput. Twee dingen worden hier bewaakt: dat
 * elke controle daadwerkelijk afgaat op het geval waarvoor hij bedoeld is, en — net zo
 * belangrijk — dat hij níét afgaat op het geval dat er onschuldig op lijkt. Een
 * meetinstrument dat te vaak aanslaat maakt een model ten onrechte slecht.
 */

import { describe, it, expect } from 'vitest';
import {
  controleerIssue, controleerUitvoer, controleerReeks, tel,
  GELDIGE_DIMENSIES, GELDIGE_ERNST, FOUT, LET_OP,
} from '../../src/analyse/uitvoercontrole.js';
import { VOORRANG_DIMENSIES } from '../../src/analyse/dimensies.js';

/** Een bevinding waar niets mis mee is; per test pas je er één ding aan. */
const goed = (extra = {}) => ({
  onderwerp:   'Hoofdverblijf niet vastgelegd',
  bevinding:   'Het ouderschapsplan noemt geen hoofdverblijfplaats van de kinderen.',
  aanbeveling: 'Leg het hoofdverblijf van beide kinderen expliciet vast.',
  ernst:       'hoog',
  dimensies:   ['volledigheid'],
  passage:     '',
  ...extra,
});

const codes = (bevindingen) => bevindingen.map((b) => b.code);

describe('controleerIssue — een goede bevinding', () => {
  it('levert geen enkele melding op', () => {
    expect(controleerIssue(goed(), 0)).toEqual([]);
  });

  it('accepteert elke geldige ernst en elke geldige dimensie', () => {
    for (const ernst of GELDIGE_ERNST) {
      expect(controleerIssue(goed({ ernst }), 0)).toEqual([]);
    }
    for (const dim of GELDIGE_DIMENSIES) {
      expect(controleerIssue(goed({ dimensies: [dim] }), 0)).toEqual([]);
    }
  });

  it('staat een lege passage toe — niet elke bevinding wijst naar één plek', () => {
    expect(controleerIssue(goed({ passage: '' }), 0)).toEqual([]);
  });
});

describe('controleerIssue — velden en waarden', () => {
  it('meldt een ontbrekend of leeg verplicht veld als fout', () => {
    for (const veld of ['onderwerp', 'bevinding', 'aanbeveling']) {
      const uit = controleerIssue(goed({ [veld]: '' }), 0);
      expect(codes(uit)).toContain('veld-leeg');
      expect(uit[0].niveau).toBe(FOUT);
      expect(uit[0].uitleg).toContain(veld);
    }
    expect(codes(controleerIssue(goed({ onderwerp: undefined }), 0))).toContain('veld-leeg');
    // Alleen spaties telt ook als leeg.
    expect(codes(controleerIssue(goed({ bevinding: '   ' }), 0))).toContain('veld-leeg');
  });

  it('meldt een ernst die niet bestaat', () => {
    const uit = controleerIssue(goed({ ernst: 'kritiek' }), 0);
    expect(codes(uit)).toContain('ernst-onbekend');
    expect(uit[0].uitleg).toContain('kritiek');
  });

  it('meldt een lege of ontbrekende dimensielijst', () => {
    expect(codes(controleerIssue(goed({ dimensies: [] }), 0))).toContain('dimensies-leeg');
    expect(codes(controleerIssue(goed({ dimensies: undefined }), 0))).toContain('dimensies-leeg');
  });

  it('meldt een dimensie die niet bestaat', () => {
    const uit = controleerIssue(goed({ dimensies: ['tijdlijn'] }), 0);
    expect(codes(uit)).toContain('dimensie-onbekend');
    expect(uit[0].uitleg).toContain('tijdlijn');
  });

  it('accepteert cross_doc als dimensie van een bevinding', () => {
    // Begripsmatig is cross_doc een knop in de weergave. In de uitvoer staat hij wél in
    // `dimensies`: crossDocTool zet geen enum op dat veld en `zwaarsteDimensie` heeft er
    // een eigen tak voor. Deze controle sloeg er in zijn eerste versie op aan, op twee
    // van de vijf bewaarde runs. Zie de kop van uitvoercontrole.js.
    expect(controleerIssue(goed({ dimensies: ['cross_doc'] }), 0)).toEqual([]);
    expect(controleerIssue(goed({ dimensies: ['juridisch', 'cross_doc'] }), 0)).toEqual([]);
  });

  it('meldt een passage die geen string is', () => {
    expect(codes(controleerIssue(goed({ passage: 42 }), 0))).toContain('passage-geen-string');
  });

  it('overleeft een bevinding die geen object is', () => {
    expect(codes(controleerIssue(null, 0))).toEqual(['geen-object']);
    expect(codes(controleerIssue('kapot', 0))).toEqual(['geen-object']);
  });

  it('noemt de plaats in de lijst, zodat de melding terug te vinden is', () => {
    expect(controleerIssue(goed({ ernst: 'x' }), 7)[0].waar).toBe('issues[7]');
  });
});

describe('controleerIssue — het citaat moet in het document staan', () => {
  const DOC = 'Partijen zijn geboren te Deventer op 06-11-1986 en wonen samen in Holten.';

  it('slaat niet aan op een citaat dat er letterlijk staat', () => {
    const uit = controleerIssue(goed({ passage: 'geboren te Deventer op 06-11-1986' }), 0,
      { documentTekst: DOC });
    expect(uit).toEqual([]);
  });

  it('slaat niet aan op verschil in hoofdletters, leestekens of spaties', () => {
    for (const passage of [
      'Geboren te Deventer op 06-11-1986',
      'geboren te Deventer, op 06 11 1986',
      'geboren  te   Deventer op 06-11-1986',
    ]) {
      expect(controleerIssue(goed({ passage }), 0, { documentTekst: DOC })).toEqual([]);
    }
  });

  it('meldt een parafrase — het geval waarvoor deze controle bestaat', () => {
    // Het model schreef "in 1986" waar "op 06-11-1986" staat, en stelde vervolgens op
    // zijn eigen parafrase een gebrek vast.
    const uit = controleerIssue(goed({ passage: 'geboren te Deventer in 1986' }), 0,
      { documentTekst: DOC });
    expect(codes(uit)).toEqual(['citaat-niet-gevonden']);
    expect(uit[0].niveau).toBe(LET_OP);
  });

  it('doet niets zonder documenttekst', () => {
    expect(controleerIssue(goed({ passage: 'staat hier niet' }), 0)).toEqual([]);
  });

  it('doet niets bij een lege passage', () => {
    expect(controleerIssue(goed({ passage: '' }), 0, { documentTekst: DOC })).toEqual([]);
  });
});

describe('controleerIssue — een bevestiging is geen bevinding', () => {
  it('meldt een aanbeveling die zegt dat er niets hoeft', () => {
    const uit = controleerIssue(goed({
      onderwerp:   'Behoefte partneralimentatie: berekening is rekenkundig correct',
      aanbeveling: 'Geen aanpassing vereist; de berekening is correct.',
    }), 0);
    expect(codes(uit)).toEqual(['bevestiging']);
    expect(uit[0].niveau).toBe(LET_OP);
  });

  it('laat een echte bevinding staan die het woord "correct" gebruikt', () => {
    expect(controleerIssue(goed({
      bevinding:   'Het bedrag is correct maar de ingangsdatum ontbreekt.',
      aanbeveling: 'Neem de ingangsdatum van de alimentatie op.',
    }), 0)).toEqual([]);
  });
});

describe('controleerReeks — dubbele onderwerpen', () => {
  it('meldt het tweede voorkomen, niet het eerste', () => {
    const uit = controleerReeks([
      goed({ onderwerp: 'Hoofdverblijf ontbreekt' }),
      goed({ onderwerp: 'Alimentatie ontbreekt' }),
      goed({ onderwerp: 'Hoofdverblijf ontbreekt' }),
    ]);
    expect(uit).toHaveLength(1);
    expect(uit[0].waar).toBe('issues[2]');
    expect(uit[0].uitleg).toContain('issues[0]');
  });

  it('ziet door hoofdletters en leestekens heen', () => {
    const uit = controleerReeks([
      goed({ onderwerp: 'Hoofdverblijf ontbreekt' }),
      goed({ onderwerp: 'hoofdverblijf, ontbreekt!' }),
    ]);
    expect(codes(uit)).toEqual(['dubbel-onderwerp']);
  });

  it('meldt niets bij verschillende onderwerpen', () => {
    expect(controleerReeks([goed({ onderwerp: 'A' }), goed({ onderwerp: 'B' })])).toEqual([]);
  });

  it('slaat lege onderwerpen over — die zijn al als veld-leeg gemeld', () => {
    expect(controleerReeks([goed({ onderwerp: '' }), goed({ onderwerp: '' })])).toEqual([]);
  });
});

describe('controleerUitvoer', () => {
  it('meldt een ontbrekende issues-array', () => {
    expect(codes(controleerUitvoer({}).bevindingen)).toContain('issues-ontbreekt');
    expect(codes(controleerUitvoer(null).bevindingen)).toContain('issues-ontbreekt');
  });

  it('is stil over een lege maar aanwezige issues-array', () => {
    const { bevindingen, aantalIssues } = controleerUitvoer({ issues: [] });
    expect(bevindingen).toEqual([]);
    expect(aantalIssues).toBe(0);
  });

  it('telt per code en per niveau', () => {
    // Elk issue een eigen onderwerp, anders telt `dubbel-onderwerp` mee en meet deze
    // test iets anders dan hij beweert.
    const { telling, aantalIssues } = controleerUitvoer({
      issues: [
        goed({ onderwerp: 'Hoofdverblijf ontbreekt' }),
        goed({ onderwerp: 'Alimentatie ontbreekt', ernst: 'kritiek' }),
        goed({ onderwerp: 'Pensioen ontbreekt', dimensies: ['tijdlijn'] }),
        goed({ onderwerp: 'Woning niet verdeeld', aanbeveling: 'Geen actie nodig.' }),
      ],
    });
    expect(aantalIssues).toBe(4);
    expect(telling.fout).toBe(2);           // ernst-onbekend + dimensie-onbekend
    expect(telling.letOp).toBe(1);          // bevestiging
    expect(telling.totaal).toBe(3);
    expect(telling.perCode).toEqual({
      'ernst-onbekend': 1, 'dimensie-onbekend': 1, bevestiging: 1,
    });
  });

  it('geeft de documenttekst door aan de citaatcontrole', () => {
    const { telling } = controleerUitvoer(
      { issues: [goed({ passage: 'staat er niet' })] },
      { documentTekst: 'Een heel ander document.' },
    );
    expect(telling.perCode['citaat-niet-gevonden']).toBe(1);
  });
});

describe('tel', () => {
  it('geeft nullen terug op een lege lijst', () => {
    expect(tel([])).toEqual({ totaal: 0, fout: 0, letOp: 0, perCode: {} });
  });
});

describe('bronwachter', () => {
  it('leest de vijf dimensies uit dimensies.js in plaats van een eigen lijst te houden', () => {
    // Op 22 september 2026 had tests/golden/schema.test.js zijn eigen kopie van deze
    // lijst, naast de zes die op 8 september al waren samengevoegd. Komt er ooit een
    // zesde dimensie bij, dan moet dat bestand meebewegen zonder dat iemand eraan denkt.
    //
    // De toets staat op "bevat elk van de vijf, in dezelfde volgorde" en niet op
    // gelijkheid, omdat cross_doc er bewust bij komt — dat is de enige toegestane
    // afwijking, en die staat hieronder apart.
    expect(GELDIGE_DIMENSIES.slice(0, VOORRANG_DIMENSIES.length)).toEqual([...VOORRANG_DIMENSIES]);
  });

  it('voegt niets toe aan de vijf behalve cross_doc', () => {
    const extra = GELDIGE_DIMENSIES.filter((d) => !VOORRANG_DIMENSIES.includes(d));
    expect(extra).toEqual(['cross_doc']);
  });
});
