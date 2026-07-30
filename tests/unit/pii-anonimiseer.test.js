/**
 * Unit tests — src/pii-anonimiseer.js
 *
 * Verifieert dat piiAnonimiseer() alle financiële en contactgegevens vervangt
 * vóór verzending naar de Anthropic API via api/ai-assistent.js.
 */

import { describe, it, expect } from 'vitest';
import { piiAnonimiseer } from '../../src/pii-anonimiseer.js';

// ── IBANs ─────────────────────────────────────────────────────────────────────

describe('piiAnonimiseer — IBANs', () => {
  it('vervangt een enkel NL-IBAN', () => {
    const result = piiAnonimiseer('Rekening NL92ABNA0137810490 wordt toebedeeld aan partij A.');
    expect(result).not.toMatch(/NL92ABNA0137810490/);
    expect(result).toMatch(/\[IBAN_0\]/);
  });

  it('vervangt meerdere IBANs met oplopende nummers', () => {
    const result = piiAnonimiseer(
      'NL92ABNA0137810490 en NL32ABNA0121038912 en NL45ABNA0131886479',
    );
    expect(result).toMatch(/\[IBAN_0\]/);
    expect(result).toMatch(/\[IBAN_1\]/);
    expect(result).toMatch(/\[IBAN_2\]/);
    expect(result).not.toMatch(/NL\d{2}[A-Z]{4}\d{10}/);
  });

  it('hetzelfde IBAN krijgt altijd hetzelfde tokennummer', () => {
    const tekst = 'NL92ABNA0137810490 en later nog eens NL92ABNA0137810490.';
    const result = piiAnonimiseer(tekst);
    const matches = result.match(/\[IBAN_\d+\]/g) || [];
    expect(matches).toHaveLength(2);
    expect(matches[0]).toBe(matches[1]); // zelfde token
  });

  it('vervangt ook Belgische en Duitse IBANs', () => {
    const result = piiAnonimiseer('BE68539007547034 en DE89370400440532013000');
    expect(result).toMatch(/\[IBAN_0\]/);
    expect(result).toMatch(/\[IBAN_1\]/);
    expect(result).not.toMatch(/BE68/);
    expect(result).not.toMatch(/DE89/);
  });

  it('matcht niet op bestaande [IBAN_n] tokens (idempotent)', () => {
    const result = piiAnonimiseer('[IBAN_0] is al geanonimiseerd.');
    // [IBAN_0] begint met '[', geen word boundary voor EU-IBAN patroon
    expect(result).toBe('[IBAN_0] is al geanonimiseerd.');
  });

  it('geeft de geanonimiseerde tekst terug uit de screenshot-casus', () => {
    const tekst =
      'Drie rekeningnummers zijn niet ingevuld: NL92ABNA0137810490, ' +
      'NL32ABNA0121038912 en NL45ABNA0131886479.';
    const result = piiAnonimiseer(tekst);
    expect(result).not.toMatch(/NL\d{2}[A-Z]{4}\d{10}/);
    expect(result).toContain('[IBAN_0]');
    expect(result).toContain('[IBAN_1]');
    expect(result).toContain('[IBAN_2]');
  });
});

// ── BSN ───────────────────────────────────────────────────────────────────────

describe('piiAnonimiseer — BSN', () => {
  it('vervangt een BSN-nummer', () => {
    const result = piiAnonimiseer('BSN: 123456789 van partij A.');
    expect(result).not.toMatch(/123456789/);
    expect(result).toContain('[BSN]');
  });

  it('vervangt niet de accountcijfers uit een IBAN (lookbehind)', () => {
    // In een NL-IBAN staan 10 cijfers die op 9 cijfers lijken maar bij IBAN horen
    // na de bankcode. Het IBAN wordt vervangen door [IBAN_0], niet [BSN].
    const result = piiAnonimiseer('NL92ABNA0137810490');
    expect(result).toBe('[IBAN_0]');
    expect(result).not.toContain('[BSN]');
  });

  it('vervangt meerdere BSNs', () => {
    const result = piiAnonimiseer('Partij A (BSN 111111110) en Partij B (BSN 222222221).');
    expect(result).not.toMatch(/\d{9}/);
    // Beide BSN-patronen zijn vervangen
    const bsnMatches = result.match(/\[BSN\]/g) || [];
    expect(bsnMatches.length).toBe(2);
  });
});

// ── Postcodes ─────────────────────────────────────────────────────────────────

describe('piiAnonimiseer — postcodes', () => {
  it('vervangt 4-cijfer + 2-letter postcode aaneengesloten', () => {
    const result = piiAnonimiseer('Woonachtig te 1234AB Amsterdam.');
    expect(result).not.toMatch(/1234AB/);
    expect(result).toContain('[POSTCODE]');
  });

  it('vervangt 4-cijfer + spatie + 2-letter postcode', () => {
    const result = piiAnonimiseer('Adres: 2514 GG Den Haag.');
    expect(result).not.toMatch(/2514 GG/);
    expect(result).toContain('[POSTCODE]');
  });
});

// ── Telefoonnummers ───────────────────────────────────────────────────────────

describe('piiAnonimiseer — telefoonnummers', () => {
  it('vervangt een mobiel nummer', () => {
    const result = piiAnonimiseer('Bereikbaar op 06-12345678.');
    expect(result).not.toMatch(/06-12345678/);
    expect(result).toContain('[TEL]');
  });

  it('vervangt een vast nummer', () => {
    const result = piiAnonimiseer('Tel: 020-1234567');
    expect(result).not.toMatch(/020-1234567/);
    expect(result).toContain('[TEL]');
  });

  it('vervangt een +31 nummer', () => {
    const result = piiAnonimiseer('+31612345678');
    expect(result).not.toMatch(/\+316/);
    expect(result).toContain('[TEL]');
  });
});

// ── E-mailadressen ────────────────────────────────────────────────────────────

describe('piiAnonimiseer — e-mailadressen', () => {
  it('vervangt een e-mailadres', () => {
    const result = piiAnonimiseer('Stuur naar jan.devries@voorbeeld.nl voor bevestiging.');
    expect(result).not.toMatch(/jan\.devries@/);
    expect(result).toContain('[EMAIL]');
  });
});

// ── Gecombineerde casus ───────────────────────────────────────────────────────

describe('piiAnonimiseer — gecombineerde casus', () => {
  it('filtert namen + PII achter elkaar (simulatie dossiercontext)', () => {
    // Namen worden via anonimiseerTekst vervangen vóór piiAnonimiseer.
    // Dit test de situatie na naam-anonimisering.
    const naamenAnon =
      'Partij A (BSN 123456789) heeft rekening NL92ABNA0137810490 (saldo € 181,-). ' +
      'Bereikbaar op 06-12345678 of partij.a@mail.nl. Woonachtig: 1234 AB Utrecht.';

    const result = piiAnonimiseer(naamenAnon);
    expect(result).not.toMatch(/123456789/);
    expect(result).not.toMatch(/NL92ABNA0137810490/);
    expect(result).not.toMatch(/06-12345678/);
    expect(result).not.toMatch(/partij\.a@/);
    expect(result).not.toMatch(/1234 AB/);
    // Partijnaam (al vervangen) staat er nog steeds
    expect(result).toContain('Partij A');
  });

  it('lege en null-input geeft tekst terug ongewijzigd', () => {
    expect(piiAnonimiseer('')).toBe('');
    expect(piiAnonimiseer(null)).toBeNull();
    expect(piiAnonimiseer(undefined)).toBeUndefined();
  });
});
