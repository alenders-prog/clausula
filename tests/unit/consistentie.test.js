/**
 * Unit tests — api/_consistentie.js
 * Samenhang tussen de titel van een issue en zijn eigen bevinding.
 */

import { describe, it, expect } from 'vitest';
import { bouwConsistentieLijst, pasCorrectiesToe } from '../../api/_consistentie.js';

// Het echte geval dat aanleiding was voor deze controle.
const zorgkorting = {
  onderwerp:  'Zorgkorting-percentages optellen tot meer dan 100%',
  ernst:      'hoog',
  bevinding:  'De toegepaste zorgkortingen bedragen 30% (vader) + 39% (moeder) = 69% in totaal. '
            + 'Conform de Tremanormen worden de zorgkortingen van beide ouders opgeteld.',
  aanbeveling: 'Herbereken de zorgkortingen conform de Tremanormen 2025.',
};

const correctie = {
  index: 0,
  nieuw_onderwerp: 'Zorgkortingspercentages ongebruikelijk en niet gemotiveerd',
  reden: 'Titel beweert overschrijding van 100%; bevinding berekent 69%.',
  ernst_te_hoog: true,
};

// ── bouwConsistentieLijst ────────────────────────────────────────────────────

describe('bouwConsistentieLijst', () => {
  it('nummert de issues en zet titel en bevinding onder elkaar', () => {
    const lijst = bouwConsistentieLijst([zorgkorting]);
    expect(lijst).toContain('[0] TITEL: Zorgkorting-percentages optellen tot meer dan 100%');
    expect(lijst).toContain('BEVINDING: De toegepaste zorgkortingen');
  });

  it('houdt de rekensom heel — die staat middenin de bevinding', () => {
    const lang = { onderwerp: 'X', bevinding: 'a'.repeat(400) + ' 30% + 39% = 69% ' + 'b'.repeat(400) };
    expect(bouwConsistentieLijst([lang])).toContain('30% + 39% = 69%');
  });
});

// ── pasCorrectiesToe ─────────────────────────────────────────────────────────

describe('pasCorrectiesToe', () => {
  it('herschrijft de titel en verlaagt de ernst één stap', () => {
    const { issues, toegepast } = pasCorrectiesToe([zorgkorting], [correctie]);
    expect(issues[0].onderwerp).toBe('Zorgkortingspercentages ongebruikelijk en niet gemotiveerd');
    expect(issues[0].ernst).toBe('midden');
    expect(toegepast).toHaveLength(1);
    expect(toegepast[0].oud).toBe('Zorgkorting-percentages optellen tot meer dan 100%');
  });

  it('laat de rest van het issue ongemoeid', () => {
    const { issues } = pasCorrectiesToe([zorgkorting], [correctie]);
    expect(issues[0].bevinding).toBe(zorgkorting.bevinding);
    expect(issues[0].aanbeveling).toBe(zorgkorting.aanbeveling);
  });

  it('muteert de oorspronkelijke lijst niet', () => {
    pasCorrectiesToe([zorgkorting], [correctie]);
    expect(zorgkorting.onderwerp).toBe('Zorgkorting-percentages optellen tot meer dan 100%');
    expect(zorgkorting.ernst).toBe('hoog');
  });

  it('laat de ernst staan zonder ernst_te_hoog', () => {
    const { issues } = pasCorrectiesToe([zorgkorting], [{ ...correctie, ernst_te_hoog: undefined }]);
    expect(issues[0].ernst).toBe('hoog');
  });

  it('verhoogt de ernst nooit — de controle beoordeelt samenhang, geen ernst', () => {
    const laag = { ...zorgkorting, ernst: 'laag' };
    const { issues } = pasCorrectiesToe([laag], [correctie]);
    expect(issues[0].ernst).toBe('laag');
  });

  it('negeert een index buiten de lijst', () => {
    const { issues, toegepast } = pasCorrectiesToe([zorgkorting], [{ ...correctie, index: 7 }]);
    expect(issues[0].onderwerp).toBe(zorgkorting.onderwerp);
    expect(toegepast).toHaveLength(0);
  });

  it('negeert een niet-numerieke index', () => {
    const { toegepast } = pasCorrectiesToe([zorgkorting], [{ ...correctie, index: '0' }]);
    expect(toegepast).toHaveLength(0);
  });

  it('negeert een te korte titel — liever de oude kop dan een onleesbare', () => {
    const { issues } = pasCorrectiesToe([zorgkorting], [{ ...correctie, nieuw_onderwerp: 'fout' }]);
    expect(issues[0].onderwerp).toBe(zorgkorting.onderwerp);
  });

  it('geeft de lijst ongewijzigd terug bij geen correcties', () => {
    const invoer = [zorgkorting];
    expect(pasCorrectiesToe(invoer, []).issues).toBe(invoer);
    expect(pasCorrectiesToe(invoer, null).issues).toBe(invoer);
    expect(pasCorrectiesToe(invoer, undefined).issues).toBe(invoer);
  });

  it('overleeft een lege issuelijst', () => {
    expect(pasCorrectiesToe([], [correctie]).issues).toEqual([]);
    expect(pasCorrectiesToe(null, [correctie]).issues).toBe(null);
  });

  it('past meerdere correcties toe op de juiste issues', () => {
    const lijst = [zorgkorting, { onderwerp: 'Tweede issue', ernst: 'midden', bevinding: 'x' }];
    const { issues, toegepast } = pasCorrectiesToe(lijst, [
      correctie,
      { index: 1, nieuw_onderwerp: 'Herschreven tweede issue', reden: 'r' },
    ]);
    expect(issues[0].onderwerp).toContain('ongebruikelijk');
    expect(issues[1].onderwerp).toBe('Herschreven tweede issue');
    expect(issues[1].ernst).toBe('midden');
    expect(toegepast).toHaveLength(2);
  });
});
