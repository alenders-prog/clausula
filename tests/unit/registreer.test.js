/**
 * Unit tests — api/registreer.js
 * Validatie van invoer (kantoorNaam) en rate limiting.
 * Supabase RPC wordt gemockt zodat er geen echte DB-aanroepen plaatsvinden.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Top-level mock — wordt door Vitest gehoist vóór alle imports
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: vi.fn().mockResolvedValue({ data: 'test-org-id', error: null }),
  }),
}));

// Helper: maak een nep-req/res paar
function maakReq(body, methode = 'POST', ip = '1.2.3.4') {
  return {
    method:  methode,
    headers: { 'x-forwarded-for': ip },
    body:    body,
  };
}

function maakRes() {
  const res = {
    _status: 200,
    _body:   null,
    status(code)  { this._status = code; return this; },
    json(body)    { this._body = body; return this; },
  };
  return res;
}

async function laadHandler() {
  // vi.resetModules() wist de module-cache zodat _rateMap opnieuw begint.
  // vi.doMock (niet-gehoist) zet de mock daarna opnieuw op vóór de dynamische import.
  vi.resetModules();
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: () => ({
      rpc: vi.fn().mockResolvedValue({ data: 'test-org-id', error: null }),
    }),
  }));
  const mod = await import('../../api/registreer.js');
  return mod.default;
}

describe('HTTP-methode', () => {
  it('weigert GET met 405', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({}, 'GET'), res);
    expect(res._status).toBe(405);
  });
});

describe('Invoervalidatie kantoorNaam', () => {
  it('weigert lege naam met 400', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({ kantoorNaam: '' }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/naam/i);
  });

  it('weigert naam van 1 teken met 400', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({ kantoorNaam: 'X' }), res);
    expect(res._status).toBe(400);
  });

  it('weigert naam langer dan 100 tekens met 400', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({ kantoorNaam: 'A'.repeat(101) }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/kort/i);
  });

  it('accepteert geldige naam van 2 tekens', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({ kantoorNaam: 'AB' }), res);
    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
  });

  it('accepteert geldige naam van 100 tekens', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({ kantoorNaam: 'A'.repeat(100) }), res);
    expect(res._status).toBe(200);
  });

  it('trimt spaties rondom naam vóór validatie', async () => {
    const handler = await laadHandler();
    const res = maakRes();
    await handler(maakReq({ kantoorNaam: '  X  ' }), res);
    // "X" heeft 1 teken → te kort
    expect(res._status).toBe(400);
  });
});

describe('Rate limiting', () => {
  it('blokkeert een IP na 5 pogingen per uur met 429', async () => {
    const handler = await laadHandler();
    const ip = '9.9.9.9';

    // 5 geldige aanvragen: allemaal 200
    for (let i = 0; i < 5; i++) {
      const res = maakRes();
      await handler(maakReq({ kantoorNaam: `Kantoor ${i}` }, 'POST', ip), res);
      expect(res._status).toBe(200);
    }

    // 6e aanvraag: 429
    const res6 = maakRes();
    await handler(maakReq({ kantoorNaam: 'Zesde' }, 'POST', ip), res6);
    expect(res6._status).toBe(429);
  });

  it('verschillende IPs worden onafhankelijk behandeld', async () => {
    const handler = await laadHandler();

    // IP A: 5 pogingen
    for (let i = 0; i < 5; i++) {
      const res = maakRes();
      await handler(maakReq({ kantoorNaam: `K${i}` }, 'POST', '10.0.0.1'), res);
    }

    // IP B: eerste poging moet slagen
    const resB = maakRes();
    await handler(maakReq({ kantoorNaam: 'KantoorB' }, 'POST', '10.0.0.2'), resB);
    expect(resB._status).toBe(200);
  });
});
