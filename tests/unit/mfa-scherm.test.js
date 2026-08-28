import { describe, it, expect } from 'vitest';
import { mfaStatusHtml, mfaInschrijfHtml, leesbaarSecret } from '../../src/auth/mfa-scherm.js';
import { bepaalMfaStap } from '../../src/auth/mfa-beleid.js';

const totp = (status = 'verified') => ({ id: 'f1', factor_type: 'totp', status });

describe('leesbaarSecret', () => {
  it('zet het secret in blokjes van vier', () => {
    expect(leesbaarSecret('ABCDEFGHIJKL')).toBe('ABCD EFGH IJKL');
  });

  it('haalt bestaande spaties eruit voordat hij hergroepeert', () => {
    expect(leesbaarSecret('AB CD EF GH')).toBe('ABCD EFGH');
  });

  it('valt niet om op leeg', () => {
    expect(leesbaarSecret('')).toBe('');
    expect(leesbaarSecret(null)).toBe('');
  });
});

describe('mfaStatusHtml', () => {
  it('toont bij een actieve factor de verwijderknop en niet de instelknop', () => {
    const h = mfaStatusHtml(bepaalMfaStap({ rol: 'admin', factoren: [totp()], aal: { currentLevel: 'aal2' } }));
    expect(h).toMatch(/mfaUitBtn/);
    expect(h).not.toMatch(/mfaAanBtn/);
    expect(h).toMatch(/staat aan/i);
  });

  it('behandelt een openstaande codestap als "staat aan"', () => {
    // Wie in de app zit met een sessie op aal1 heeft wel degelijk 2FA ingesteld.
    // Dat scherm mag niet aanbieden om het nogmaals in te stellen.
    const h = mfaStatusHtml(bepaalMfaStap({ rol: 'admin', factoren: [totp()], aal: { currentLevel: 'aal1' } }));
    expect(h).toMatch(/staat aan/i);
    expect(h).not.toMatch(/mfaAanBtn/);
  });

  it('markeert het als verplicht voor een beheerder zonder factor', () => {
    const h = mfaStatusHtml(bepaalMfaStap({ rol: 'admin', factoren: [], aal: { currentLevel: 'aal1' } }));
    expect(h).toMatch(/mfa-verplicht/);
    expect(h).toMatch(/Verplicht voor uw rol/i);
    expect(h).toMatch(/mfaAanBtn/);
  });

  it('is voor een mediator een aanbeveling, niet een eis', () => {
    const h = mfaStatusHtml(bepaalMfaStap({ rol: 'gebruiker', factoren: [], aal: { currentLevel: 'aal1' } }));
    expect(h).toMatch(/mfa-uit/);
    expect(h).not.toMatch(/mfa-verplicht/);
    expect(h).toMatch(/mfaAanBtn/);
  });

  it('valt niet om op ontbrekend beleid', () => {
    expect(() => mfaStatusHtml(undefined)).not.toThrow();
    expect(() => mfaStatusHtml({})).not.toThrow();
  });
});

describe('mfaInschrijfHtml', () => {
  it('toont de QR, het secret en het codeveld', () => {
    const h = mfaInschrijfHtml({ qr: 'data:image/svg+xml;base64,AAAA', secret: 'ABCDEFGHIJKL' });
    expect(h).toMatch(/<img src="data:image\/svg\+xml;base64,AAAA"/);
    expect(h).toMatch(/ABCD EFGH IJKL/);
    expect(h).toMatch(/mfaCode/);
    expect(h).toMatch(/mfaBevestigBtn/);
  });

  it('waarschuwt dat het secret de enige herstelweg is', () => {
    // Supabase kent geen herstelcodes voor TOTP. Zonder deze waarschuwing sluit een
    // beheerder die zijn telefoon verliest zichzelf buiten het hele kantoor.
    const h = mfaInschrijfHtml({ qr: 'x', secret: 'ABCD' });
    expect(h).toMatch(/wachtwoordmanager/i);
    expect(h).toMatch(/herstelcodes/i);
  });

  it('blijft bruikbaar als de QR ontbreekt', () => {
    const h = mfaInschrijfHtml({ secret: 'ABCDEFGH' });
    expect(h).not.toMatch(/<img/);
    expect(h).toMatch(/handmatig/i);
    expect(h).toMatch(/ABCD EFGH/);
  });

  it('ontsnapt aanhalingstekens in de QR-bron', () => {
    // De bron komt van de server, maar hij belandt in een attribuut; een niet-ontsnapte
    // quote breekt daar uit.
    const h = mfaInschrijfHtml({ qr: 'x" onerror="alert(1)', secret: 'A' });
    expect(h).not.toMatch(/onerror="alert/);
    expect(h).toMatch(/&quot;/);
  });
});
