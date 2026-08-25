/**
 * Unit tests — tests/helpers/test-token.mjs
 *
 * De eval hing af van een met de hand geplakte Supabase-token, en die verloopt
 * binnen een uur. Op 24 augustus 2026 bleek hij al sinds de 19e dood: elke fixture
 * faalde met "verwachte issues gevonden" terwijl er in werkelijkheid een 401 terugkwam
 * en er niets was geanalyseerd. Deze helper haalt nu zelf een verse token op.
 *
 * Wat hier getoetst wordt is de keuze- en beoordelingslogica — niet de echte
 * inlogaanroep. Die krijgt een neptransport mee.
 */

import { describe, it, expect } from 'vitest';
import { beoordeelToken, mintToken, haalToken } from '../helpers/test-token.mjs';

/** Bouwt een JWT-vormige string met de gegeven claims. Niet ondertekend — dat hoeft niet. */
function maakJwt(claims) {
  const deel = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${deel({ alg: 'HS256', typ: 'JWT' })}.${deel(claims)}.handtekening`;
}

const NU = Date.parse('2026-08-24T12:00:00Z');
const VERS     = maakJwt({ role: 'authenticated', exp: Math.floor(NU / 1000) + 3600 });
const VERLOPEN = maakJwt({ role: 'authenticated', exp: Math.floor(NU / 1000) - 60 });

describe('beoordeelToken', () => {
  it('keurt een geldige token goed en zegt hoelang hij nog meegaat', () => {
    const r = beoordeelToken(VERS, NU);
    expect(r.geldig).toBe(true);
    expect(r.verlooptOver).toBe(3600);
  });

  it('herkent een verlopen token en noemt de datum', () => {
    const r = beoordeelToken(VERLOPEN, NU);
    expect(r.geldig).toBe(false);
    expect(r.reden).toMatch(/verlopen op 2026-08-24/);
  });

  it('herkent een ontbrekende token', () => {
    expect(beoordeelToken('', NU)).toEqual({ geldig: false, reden: 'ontbreekt' });
    expect(beoordeelToken(undefined, NU).geldig).toBe(false);
  });

  it('herkent aanhalingstekens uit .env — die maken de token stilletjes ongeldig', () => {
    const r = beoordeelToken(`"${VERS}"`, NU);
    expect(r.geldig).toBe(false);
    expect(r.reden).toMatch(/aanhalingstekens/);
  });

  it('herkent iets dat geen JWT is', () => {
    expect(beoordeelToken('zomaar-wat', NU).reden).toBe('heeft geen JWT-vorm');
    expect(beoordeelToken('een.twee.drie', NU).reden).toBe('is niet te lezen als JWT');
  });

  it('laat een token zonder exp-claim door — daar oordeelt de server over', () => {
    expect(beoordeelToken(maakJwt({ role: 'authenticated' }), NU).geldig).toBe(true);
  });

  it('negeert witruimte rondom', () => {
    expect(beoordeelToken(`  ${VERS}\n`, NU).geldig).toBe(true);
  });
});

describe('mintToken', () => {
  const basis = { url: 'https://x.supabase.co', anonKey: 'anon', email: 'a@b.nl', wachtwoord: 'geheim' };

  it('stuurt e-mail en wachtwoord naar het token-endpoint', async () => {
    let gezien = null;
    const doeFetch = async (url, opties) => {
      gezien = { url, opties };
      return { ok: true, text: async () => JSON.stringify({ access_token: VERS }) };
    };
    const t = await mintToken({ ...basis, doeFetch });
    expect(t).toBe(VERS);
    expect(gezien.url).toBe('https://x.supabase.co/auth/v1/token?grant_type=password');
    expect(gezien.opties.headers.apikey).toBe('anon');
    expect(JSON.parse(gezien.opties.body)).toEqual({ email: 'a@b.nl', password: 'geheim' });
  });

  it('geeft de foutmelding van Supabase door', async () => {
    const doeFetch = async () => ({
      ok: false, status: 400,
      text: async () => JSON.stringify({ error_description: 'Invalid login credentials' }),
    });
    await expect(mintToken({ ...basis, doeFetch })).rejects.toThrow(/400.*Invalid login credentials/);
  });

  it('klaagt als er geen access_token in het antwoord zit', async () => {
    const doeFetch = async () => ({ ok: true, text: async () => JSON.stringify({ user: {} }) });
    await expect(mintToken({ ...basis, doeFetch })).rejects.toThrow(/geen access_token/);
  });
});

describe('haalToken — welke weg wordt gekozen', () => {
  // haalToken kijkt naar de échte klok (hij krijgt geen `nu` mee), dus deze tokens
  // moeten relatief aan nu staan — niet aan het vaste tijdstip hierboven.
  const nu = Date.now();
  const VERS_NU     = maakJwt({ role: 'authenticated', exp: Math.floor(nu / 1000) + 3600 });
  const VERLOPEN_NU = maakJwt({ role: 'authenticated', exp: Math.floor(nu / 1000) - 60 });

  const ENV_INLOG = {
    TEST_EMAIL: 'eval@clausula.nl', TEST_PASSWORD: 'geheim',
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
    TEST_JWT_TOKEN: VERLOPEN_NU,   // bewust verlopen: inloggen hoort voor te gaan
  };

  it('logt in wanneer e-mail en wachtwoord er zijn — ook als er een token staat', async () => {
    let ingelogd = false;
    const doeFetch = async () => {
      ingelogd = true;
      return { ok: true, text: async () => JSON.stringify({ access_token: VERS }) };
    };
    expect(await haalToken(ENV_INLOG, doeFetch)).toBe(VERS);
    expect(ingelogd).toBe(true);
  });

  it('valt terug op een geldige TEST_JWT_TOKEN als er geen inloggegevens zijn', async () => {
    const doeFetch = async () => { throw new Error('had niet aangeroepen mogen worden'); };
    expect(await haalToken({ TEST_JWT_TOKEN: VERS_NU }, doeFetch)).toBe(VERS_NU);
  });

  it('legt uit wat er moet gebeuren als beide wegen dicht zijn', async () => {
    await expect(haalToken({ TEST_JWT_TOKEN: VERLOPEN_NU }, async () => {}))
      .rejects.toThrow(/verlopen[\s\S]*TEST_EMAIL=/);
  });

  it('meldt het als de inloggegevens er zijn maar de Supabase-sleutels niet', async () => {
    await expect(haalToken({ TEST_EMAIL: 'a@b.nl', TEST_PASSWORD: 'x' }, async () => {}))
      .rejects.toThrow(/SUPABASE_URL of SUPABASE_ANON_KEY ontbreekt/);
  });

  it('behandelt lege inloggegevens als afwezig', async () => {
    // TEST_EMAIL= zonder waarde in .env mag niet tot een inlogpoging leiden.
    const doeFetch = async () => { throw new Error('had niet aangeroepen mogen worden'); };
    expect(await haalToken({ TEST_EMAIL: '', TEST_PASSWORD: '  ', TEST_JWT_TOKEN: VERS_NU }, doeFetch)).toBe(VERS_NU);
  });
});
