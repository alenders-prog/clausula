/**
 * Unit tests — api/_iban.js
 * IBAN-validatie: verwijder hallucinated IBANs en los tegenstrijdige conclusies op.
 */

import { describe, it, expect } from 'vitest';
import { ibanSet, ibanUitIssue, filterIssuesOpIban } from '../../api/_iban.js';

// ── ibanSet ───────────────────────────────────────────────────────────────────

describe('ibanSet', () => {
  it('extraheert echte NL-IBANs uit tekst', () => {
    const s = ibanSet('Rekening NL36RABO1011417243 met saldo € 96.700,-');
    expect(s).toEqual(new Set(['NL36RABO1011417243']));
  });

  it('extraheert pseudoniem-placeholders [IBAN_n]', () => {
    const s = ibanSet('Rekening [IBAN_0] en [IBAN_1] zijn toegewezen aan de man.');
    expect(s).toEqual(new Set(['[IBAN_0]', '[IBAN_1]']));
  });

  it('extraheert meerdere unieke IBANs', () => {
    const s = ibanSet('NL36RABO1011417243 en NL32RABO0139671137 en NL36RABO1011417243 nogmaals');
    expect(s.size).toBe(2);
    expect(s.has('NL36RABO1011417243')).toBe(true);
    expect(s.has('NL32RABO0139671137')).toBe(true);
  });

  it('geeft lege set bij tekst zonder IBANs', () => {
    expect(ibanSet('Geen rekeningnummers in deze tekst.').size).toBe(0);
  });

  it('matcht niet op incomplete of invalide IBANs', () => {
    expect(ibanSet('NL36RABO101 of NL36RABO10114172430000').size).toBe(0);
  });
});

// ── ibanUitIssue ──────────────────────────────────────────────────────────────

describe('ibanUitIssue', () => {
  it('haalt IBAN op uit passage-veld', () => {
    const iss = { passage: 'NL36RABO1011417243 op naam van Jaap.', bevinding: '', onderwerp: '', aanbeveling: '' };
    expect(ibanUitIssue(iss)).toEqual(['NL36RABO1011417243']);
  });

  it('haalt IBANs op uit alle velden gecombineerd', () => {
    const iss = {
      passage:     'Rekening [IBAN_0]',
      bevinding:   'Rekening [IBAN_1] ontbreekt in bijlage.',
      onderwerp:   'Ontbrekende rekening',
      aanbeveling: 'Voeg [IBAN_0] toe.',
    };
    const ibans = ibanUitIssue(iss);
    expect(ibans).toContain('[IBAN_0]');
    expect(ibans).toContain('[IBAN_1]');
  });

  it('geeft lege array bij issue zonder IBANs', () => {
    const iss = { passage: 'Geen rekeningnummer.', bevinding: 'Fout.', onderwerp: 'X', aanbeveling: 'Y' };
    expect(ibanUitIssue(iss)).toEqual([]);
  });
});

// ── filterIssuesOpIban ────────────────────────────────────────────────────────

function maakIssue(overrides) {
  return {
    onderwerp:    'Test issue',
    ernst:        'midden',
    passage:      '',
    bevinding:    '',
    aanbeveling:  '',
    ...overrides,
  };
}

const DOC_TEKST = `
  Rekening [IBAN_0] op naam van partij A, saldo € 9,-.
  Rekening [IBAN_1] op naam van partij A, saldo € 96.700,-, uitsluitingsclausule.
  Rekening [IBAN_2] op naam van beide partijen, saldo € 2.275,-.
`;

describe('filterIssuesOpIban — stap 1: onbekend IBAN', () => {
  it('behoudt issues zonder IBAN', () => {
    const iss = maakIssue({ bevinding: 'Geen rekeningnummer hier.' });
    expect(filterIssuesOpIban([iss], DOC_TEKST)).toEqual([iss]);
  });

  it('behoudt issues met een bestaand IBAN', () => {
    const iss = maakIssue({ bevinding: '[IBAN_0] is correct opgenomen.' });
    expect(filterIssuesOpIban([iss], DOC_TEKST)).toEqual([iss]);
  });

  it('verwijdert issue met IBAN dat niet in document staat', () => {
    const iss = maakIssue({ bevinding: '[IBAN_99] ontbreekt in bijlage 1.' });
    expect(filterIssuesOpIban([iss], DOC_TEKST)).toEqual([]);
  });

  it('verwijdert issue als één van meerdere IBANs onbekend is', () => {
    const iss = maakIssue({ bevinding: '[IBAN_0] en [IBAN_99] zijn relevant.' });
    expect(filterIssuesOpIban([iss], DOC_TEKST)).toEqual([]);
  });

  it('retourneert alle issues ongewijzigd als doc geen IBANs bevat', () => {
    const issues = [
      maakIssue({ bevinding: '[IBAN_0] ontbreekt.' }),
      maakIssue({ bevinding: 'Geen IBAN hier.' }),
    ];
    expect(filterIssuesOpIban(issues, 'Geen rekeningnummers.')).toEqual(issues);
  });
});

describe('filterIssuesOpIban — stap 2: tegenstrijdige conclusies', () => {
  it('verwijdert het minder ernstige bij tegenstrijdig paar (ontbreekt vs. aanwezig)', () => {
    const hoog = maakIssue({
      ernst:     'hoog',
      bevinding: '[IBAN_1] ontbreekt in het verdelingsoverzicht.',
      onderwerp: 'Rekening ontbreekt',
    });
    const laag = maakIssue({
      ernst:     'laag',
      bevinding: '[IBAN_1] is opgenomen in bijlage 1.',
      onderwerp: 'Rekening aanwezig',
    });
    const result = filterIssuesOpIban([hoog, laag], DOC_TEKST);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(hoog);
  });

  it('behoudt beide issues als ze NIET tegenstrijdig zijn', () => {
    const a = maakIssue({ ernst: 'midden', bevinding: '[IBAN_0] heeft een onjuiste tenaamstelling.', onderwerp: 'Naam fout' });
    const b = maakIssue({ ernst: 'laag',   bevinding: '[IBAN_0] peildatum ontbreekt.', onderwerp: 'Peildatum mist' });
    expect(filterIssuesOpIban([a, b], DOC_TEKST)).toHaveLength(2);
  });

  it('bij gelijkwaardige ernst: behoudt het eerste issue (laagste rang)', () => {
    const a = maakIssue({ ernst: 'midden', bevinding: '[IBAN_2] ontbreekt in bijlage.', onderwerp: 'A' });
    const b = maakIssue({ ernst: 'midden', bevinding: '[IBAN_2] is aanwezig in bijlage.', onderwerp: 'B' });
    const result = filterIssuesOpIban([a, b], DOC_TEKST);
    expect(result).toHaveLength(1);
  });

  it('verwijdert geen issues als doc geen IBANs bevat (vroege return)', () => {
    const a = maakIssue({ bevinding: 'X ontbreekt.' });
    const b = maakIssue({ bevinding: 'X is aanwezig.' });
    expect(filterIssuesOpIban([a, b], 'Geen rekeningen.')).toHaveLength(2);
  });
});

describe('filterIssuesOpIban — gecombineerd scenario (de originele bug)', () => {
  it('verwijdert verwisseld IBAN ([IBAN_99] ≠ [IBAN_0]) én lost tegenstrijdigheid op', () => {
    const doc = 'Rekening [IBAN_0] saldo € 9,-. Rekening [IBAN_1] schenking € 96.700,-.';

    const verwisseld = maakIssue({
      ernst:     'midden',
      onderwerp: 'Schenking ontbreekt in bijlage',
      bevinding: '[IBAN_99] ontbreekt in het verdelingsoverzicht.',  // bestaat niet
    });
    const tegenstrijdig1 = maakIssue({
      ernst:     'midden',
      onderwerp: 'Schenking buiten verdeling',
      bevinding: '[IBAN_1] is opgenomen in bijlage 1.',
    });
    const tegenstrijdig2 = maakIssue({
      ernst:     'hoog',
      onderwerp: 'Schenking intern conflict',
      bevinding: '[IBAN_1] ontbreekt in het verdelingsoverzicht.',
    });
    const geldig = maakIssue({
      ernst:     'laag',
      bevinding: '[IBAN_0] heeft geen peildatum.',
    });

    const result = filterIssuesOpIban([verwisseld, tegenstrijdig1, tegenstrijdig2, geldig], doc);

    expect(result).not.toContain(verwisseld);      // IBAN_99 bestaat niet
    expect(result).not.toContain(tegenstrijdig1);  // laagste ernst van het tegenstrijdige paar
    expect(result).toContain(tegenstrijdig2);      // hoogste ernst — bewaren
    expect(result).toContain(geldig);              // geen conflict
    expect(result).toHaveLength(2);
  });
});
