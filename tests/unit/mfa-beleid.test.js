import { describe, it, expect } from 'vitest';
import {
  bevestigdeFactoren, bevestigdeTotp, mfaVerplicht, bepaalMfaStap, mfaFoutTekst,
  mfaInschrijfFoutTekst,
} from '../../src/auth/mfa-beleid.js';

const totp   = (status = 'verified') => ({ id: 'f1', factor_type: 'totp', status });
const aal    = (currentLevel, nextLevel = 'aal2') => ({ currentLevel, nextLevel });

describe('bevestigdeFactoren', () => {
  it('telt alleen factoren met status verified', () => {
    // Supabase geeft een factor terug zodra enroll() is aangeroepen, ook als de
    // gebruiker het scherm wegklikte. Zo'n factor kan niets — meetellen zou 2FA
    // geruisloos uitzetten terwijl de app denkt dat hij aanstaat.
    const f = bevestigdeFactoren([totp('unverified'), totp('verified')]);
    expect(f).toHaveLength(1);
    expect(f[0].status).toBe('verified');
  });

  it('valt niet om op ontbrekende of rare invoer', () => {
    expect(bevestigdeFactoren(null)).toEqual([]);
    expect(bevestigdeFactoren(undefined)).toEqual([]);
    expect(bevestigdeFactoren([null, undefined, {}])).toEqual([]);
  });

  it('bevestigdeTotp laat andere factortypen weg', () => {
    const factoren = [totp(), { id: 'f2', factor_type: 'phone', status: 'verified' }];
    expect(bevestigdeFactoren(factoren)).toHaveLength(2);
    expect(bevestigdeTotp(factoren)).toHaveLength(1);
  });
});

describe('mfaVerplicht', () => {
  it('geldt voor beheerders', () => {
    expect(mfaVerplicht('admin')).toBe(true);
    expect(mfaVerplicht('ADMIN')).toBe(true);
  });

  it('geldt niet voor mediators', () => {
    expect(mfaVerplicht('gebruiker')).toBe(false);
    expect(mfaVerplicht('')).toBe(false);
    expect(mfaVerplicht(null)).toBe(false);
  });
});

describe('bepaalMfaStap', () => {
  it('vraagt om een code als er een factor is en de sessie op aal1 staat', () => {
    const r = bepaalMfaStap({ rol: 'gebruiker', factoren: [totp()], aal: aal('aal1') });
    expect(r.stap).toBe('code_invoeren');
    expect(r.blokkeert).toBe(true);
  });

  it('is klaar als de sessie al op aal2 staat', () => {
    const r = bepaalMfaStap({ rol: 'admin', factoren: [totp()], aal: aal('aal2', 'aal2') });
    expect(r.stap).toBe('ok');
    expect(r.blokkeert).toBe(false);
  });

  it('kijkt naar currentLevel, niet naar nextLevel', () => {
    // Lopen die twee uiteen — een net verwijderde factor, een token uit de cache —
    // dan is "sessie staat nog niet op aal2" het veilige oordeel. Op nextLevel
    // afgaan zou hier 'ok' opleveren en de tweede stap overslaan.
    const r = bepaalMfaStap({ rol: 'admin', factoren: [totp()], aal: aal('aal1', 'aal1') });
    expect(r.stap).toBe('code_invoeren');
  });

  it('verplicht een beheerder zonder factor om er een in te stellen', () => {
    const r = bepaalMfaStap({ rol: 'admin', factoren: [], aal: aal('aal1', 'aal1') });
    expect(r.stap).toBe('instellen_verplicht');
    expect(r.blokkeert).toBe(true);
    expect(r.reden).toMatch(/alle dossiers/i);
  });

  it('een onbevestigde factor telt niet als ingesteld', () => {
    const r = bepaalMfaStap({ rol: 'admin', factoren: [totp('unverified')], aal: aal('aal1', 'aal1') });
    expect(r.stap).toBe('instellen_verplicht');
  });

  it('raadt het een mediator aan zonder hem tegen te houden', () => {
    const r = bepaalMfaStap({ rol: 'gebruiker', factoren: [], aal: aal('aal1', 'aal1') });
    expect(r.stap).toBe('instellen_aanbevolen');
    expect(r.blokkeert).toBe(false);
  });

  it('gaat uit van aal1 als het niveau ontbreekt', () => {
    expect(bepaalMfaStap({ rol: 'gebruiker', factoren: [totp()] }).stap).toBe('code_invoeren');
    expect(bepaalMfaStap({}).stap).toBe('instellen_aanbevolen');
  });
});

describe('mfaFoutTekst', () => {
  it('legt bij een afgekeurde code de meest voorkomende oorzaak uit', () => {
    const t = mfaFoutTekst({ message: 'Invalid TOTP code entered' });
    expect(t).toMatch(/dertig seconden/);
  });

  it('herkent een rate limit', () => {
    expect(mfaFoutTekst({ message: 'Request rate limit reached' })).toMatch(/te veel pogingen/i);
  });

  it('herkent een verlopen challenge', () => {
    expect(mfaFoutTekst({ message: 'MFA challenge expired' })).toMatch(/verlopen/i);
  });

  it('geeft een bruikbare tekst bij iets onbekends', () => {
    expect(mfaFoutTekst({ message: 'boom' })).toMatch(/probeer het opnieuw/i);
    expect(mfaFoutTekst(null)).toMatch(/probeer het opnieuw/i);
  });
});

// Aanleiding: het beveiligingstabblad meldde "Verifiëren is niet gelukt" — de
// vangnettekst van mfaFoutTekst, die ik ook op inschrijffouten had losgelaten. De
// werkelijke melding van Supabase werd daarmee weggegooid.
describe('mfaInschrijfFoutTekst', () => {
  it('herkent een blijven staan half afgeronde instelling', () => {
    const t = mfaInschrijfFoutTekst({
      message: 'A factor with the friendly name Clausula for this user already exists',
    });
    expect(t).toMatch(/half afgeronde instelling/i);
    expect(t).toMatch(/nogmaals/i);
  });

  it('wijst naar de projectinstelling als TOTP uitstaat', () => {
    expect(mfaInschrijfFoutTekst({ message: 'MFA is disabled for this project' }))
      .toMatch(/Authentication → Multi-Factor/);
  });

  it('geeft een onbekende melding LETTERLIJK door', () => {
    // Dit is het hele punt: een foutvertaler die de bron verbergt is erger dan geen.
    const t = mfaInschrijfFoutTekst({ message: 'unexpected_failure: database timeout' });
    expect(t).toContain('unexpected_failure: database timeout');
  });

  it('valt niet om op lege invoer', () => {
    expect(mfaInschrijfFoutTekst(null)).toMatch(/niet gelukt/i);
    expect(mfaInschrijfFoutTekst({})).toMatch(/niet gelukt/i);
  });
});
