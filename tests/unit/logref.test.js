/**
 * Unit tests — src/avg/logref.js
 *
 * Aanleiding: B5 uit de architectuurbeoordeling. Zes logregels in `api/analyseer.js` zetten
 * `doc.bestandsnaam` in de Vercel-log, en een bestandsnaam is hier "Convenant
 * Jansen-de Vries.pdf". Twee regels in `api/_iban.js` konden een volledig rekeningnummer
 * loggen wanneer de pseudonimisering het niet had gehaald.
 */

import { describe, it, expect } from 'vitest';
import { kortRef, docRef, ibanRef } from '../../src/avg/logref.js';

describe('de gevallen die aanleiding waren', () => {
  it('houdt de cliëntnaam uit een bestandsnaam', () => {
    const ref = docRef('Convenant Jansen-de Vries.pdf');
    expect(ref).not.toMatch(/Jansen/i);
    expect(ref).not.toMatch(/Vries/i);
    expect(ref).toMatch(/^doc#[0-9a-f]{8}\.pdf$/);
  });

  it('houdt een echt rekeningnummer uit de log', () => {
    const ref = ibanRef('NL28 RABO 0328582298');
    expect(ref).not.toMatch(/0328582298/);
    expect(ref).not.toMatch(/RABO/);
    expect(ref).toMatch(/^iban#[0-9a-f]{8}$/);
  });
});

describe('dezelfde invoer geeft dezelfde verwijzing', () => {
  it('knoopt logregels over hetzelfde document aan elkaar', () => {
    expect(docRef('Ouderschapsplan De Boer.docx')).toBe(docRef('Ouderschapsplan De Boer.docx'));
  });

  it('negeert het pad ervoor', () => {
    expect(docRef('uploads/2026/Convenant.pdf')).toBe(docRef('Convenant.pdf'));
    expect(docRef('C:\\dossiers\\Convenant.pdf')).toBe(docRef('Convenant.pdf'));
  });

  it('geeft dezelfde verwijzing voor elke schrijfwijze van hetzelfde IBAN', () => {
    const vormen = ['NL28 RABO 0328582298', 'NL28RABO0328582298', 'nl28 rabo 0328582298'];
    expect(new Set(vormen.map(ibanRef)).size).toBe(1);
  });

  it('onderscheidt twee verschillende documenten', () => {
    expect(docRef('Convenant A.pdf')).not.toBe(docRef('Convenant B.pdf'));
  });
});

describe('de extensie blijft leesbaar', () => {
  it('houdt hem aan de verwijzing, in kleine letters', () => {
    expect(docRef('Convenant.PDF')).toMatch(/\.pdf$/);
    expect(docRef('Plan.docx')).toMatch(/\.docx$/);
  });

  it('laat hem weg als er geen is', () => {
    expect(docRef('Convenant')).toMatch(/^doc#[0-9a-f]{8}$/);
  });

  it('ziet een naam die met een punt begint niet als extensie', () => {
    expect(docRef('.env')).toMatch(/^doc#[0-9a-f]{8}$/);
  });
});

describe('placeholders blijven staan', () => {
  it('laat een gepseudonimiseerd IBAN ongemoeid — die nummering maakt de log bruikbaar', () => {
    expect(ibanRef('[IBAN_0]')).toBe('[IBAN_0]');
    expect(ibanRef('[IBAN-1]')).toBe('[IBAN-1]');
  });

  it('vervangt wat er alleen maar op lijkt wél', () => {
    expect(ibanRef('[IBAN]')).toMatch(/^iban#[0-9a-f]{8}$/);
    expect(ibanRef('IBAN_0')).toMatch(/^iban#[0-9a-f]{8}$/);
  });
});

describe('lege invoer', () => {
  it('toont nooit "undefined" in een logregel', () => {
    expect(docRef(undefined)).toBe('doc#leeg');
    expect(docRef(null)).toBe('doc#leeg');
    expect(docRef('')).toBe('doc#leeg');
    expect(docRef('   ')).toBe('doc#leeg');
    expect(ibanRef(undefined)).toBe('iban#leeg');
    expect(kortRef(42)).toBe('ref#leeg');
  });

  it('houdt "leeg" te onderscheiden van een echte waarde', () => {
    expect(docRef('leeg.pdf')).not.toBe('doc#leeg');
  });
});

describe('kortRef', () => {
  it('gebruikt het meegegeven voorvoegsel', () => {
    expect(kortRef('iets', 'dossier')).toMatch(/^dossier#[0-9a-f]{8}$/);
  });

  it('werkt op tekens buiten ASCII', () => {
    expect(kortRef('Convenant Müller-Ünlü')).toMatch(/^ref#[0-9a-f]{8}$/);
    expect(kortRef('Convenant Müller')).not.toBe(kortRef('Convenant Muller'));
  });
});
