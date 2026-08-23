/**
 * Unit tests — src/api-antwoord.js
 *
 * De bodies hieronder zijn wat Vercel daadwerkelijk terugstuurt als een serverless
 * functie zijn tijdslimiet overschrijdt of crasht. Precies die tekst kwam op
 * 23 augustus 2026 als "Unexpected token 'A'" bij de gebruiker op het scherm.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { duidFout, platformCode, leesAntwoord } from '../../src/api-antwoord.js';

const TIMEOUT_BODY = 'An error occurred with your deployment\n\n'
  + 'FUNCTION_INVOCATION_TIMEOUT\n\nfra1::x7k2m-1755950000000-abc123def456';
const CRASH_BODY = 'An error occurred with your deployment\n\n'
  + 'FUNCTION_INVOCATION_FAILED\n\nfra1::q9p4n-1755950000000-987654321abc';

/** Een minimaal Response-achtig object; alleen wat leesAntwoord gebruikt. */
const antwoord = (status, body) => ({
  status,
  ok:   status >= 200 && status < 300,
  text: async () => body,
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('het geval dat aanleiding was', () => {
  it('geeft geen parser-melding maar de reden', async () => {
    await expect(leesAntwoord(antwoord(504, TIMEOUT_BODY)))
      .rejects.toThrow(/te lang over/);
  });

  it('noemt de parser nergens meer', async () => {
    await expect(leesAntwoord(antwoord(504, TIMEOUT_BODY)))
      .rejects.not.toThrow(/JSON|token/i);
  });

  it('logt de technische code wel, voor de console', async () => {
    await leesAntwoord(antwoord(504, TIMEOUT_BODY)).catch(() => {});
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('geen JSON'),
      expect.objectContaining({ status: 504, code: 'FUNCTION_INVOCATION_TIMEOUT' }),
    );
  });
});

describe('platformCode', () => {
  it('vist de Vercel-code uit de foutpagina', () => {
    expect(platformCode(TIMEOUT_BODY)).toBe('FUNCTION_INVOCATION_TIMEOUT');
    expect(platformCode(CRASH_BODY)).toBe('FUNCTION_INVOCATION_FAILED');
  });

  it('geeft leeg als er geen code in staat', () => {
    expect(platformCode('Bad Gateway')).toBe('');
    expect(platformCode('')).toBe('');
    expect(platformCode(null)).toBe('');
  });
});

describe('duidFout', () => {
  it('herkent de time-out aan de code, ook zonder status 504', () => {
    expect(duidFout(500, TIMEOUT_BODY)).toMatch(/te lang over/);
  });

  it('onderscheidt een crash van een time-out', () => {
    expect(duidFout(500, CRASH_BODY)).toMatch(/liep vast/);
  });

  it('stuurt bij een verlopen sessie naar opnieuw inloggen', () => {
    expect(duidFout(401, '')).toMatch(/opnieuw in/);
    expect(duidFout(403, '')).toMatch(/opnieuw in/);
  });

  it('vraagt bij 429 om even te wachten', () => {
    expect(duidFout(429, '')).toMatch(/Wacht even/);
  });

  it('noemt een te grote vraag bij zijn naam', () => {
    expect(duidFout(413, '')).toMatch(/te groot/);
  });

  it('valt terug op de status als er niets bekend is', () => {
    expect(duidFout(418, 'Ik ben een theepot')).toMatch(/HTTP 418/);
  });

  it('duidt een leesbaar 200-antwoord dat geen JSON is als afgekapt', () => {
    expect(duidFout(200, '{"antwoord":"half')).toMatch(/onvolledig/);
  });
});

describe('leesAntwoord', () => {
  it('geeft het object terug bij een geldig antwoord', async () => {
    const data = await leesAntwoord(antwoord(200, '{"intent":"kennisvraag","antwoord":"ja"}'));
    expect(data).toEqual({ intent: 'kennisvraag', antwoord: 'ja' });
  });

  it('geeft de foutmelding van de applicatie voorrang boven de eigen duiding', async () => {
    await expect(leesAntwoord(antwoord(500, '{"error":"ANTHROPIC_API_KEY ontbreekt"}')))
      .rejects.toThrow('ANTHROPIC_API_KEY ontbreekt');
  });

  it('duidt zelf als de JSON-fout leeg is', async () => {
    await expect(leesAntwoord(antwoord(500, '{"error":""}')))
      .rejects.toThrow(/liep vast/);
  });

  it('overleeft een lege body', async () => {
    await expect(leesAntwoord(antwoord(502, ''))).rejects.toThrow(/niet bereikbaar/);
  });
});
