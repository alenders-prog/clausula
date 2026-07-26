/**
 * Integratietests — api/naam-encrypt.js + api/naam-decrypt.js (Edge Runtime handlers)
 *
 * De Supabase auth-check (fetch naar /auth/v1/user) wordt gemockt.
 * Echte AES-GCM encryptie loopt wel door — dat is het kerngedrag.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TEST_KEY = 'b'.repeat(64);
const FAKE_TOKEN = 'geldig-jwt-token';

// Mock fetch: supabase auth geeft 200 terug op token, 401 op alles anders
vi.stubGlobal('fetch', async (url, opts) => {
  if (url.includes('/auth/v1/user')) {
    const auth = opts?.headers?.['Authorization'] || '';
    if (auth === `Bearer ${FAKE_TOKEN}`) {
      return { ok: true };
    }
    return { ok: false, status: 401 };
  }
  return { ok: false, status: 500 };
});

beforeEach(() => {
  process.env.NAAM_ENCRYPTION_KEY = TEST_KEY;
  process.env.SUPABASE_URL        = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY   = 'anon-key';
});

afterEach(() => {
  delete process.env.NAAM_ENCRYPTION_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  vi.resetModules();
});

function maakRequest(body, token = FAKE_TOKEN, methode = 'POST') {
  const heeftBody = methode !== 'GET' && methode !== 'HEAD';
  return new Request('http://localhost/api/naam-encrypt', {
    method:  methode,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
    ...(heeftBody ? { body: JSON.stringify(body) } : {}),
  });
}

async function laadEncrypt() {
  const mod = await import('../../api/naam-encrypt.js');
  return mod.default;
}

async function laadDecrypt() {
  const mod = await import('../../api/naam-decrypt.js');
  return mod.default;
}

// ── naam-encrypt ──────────────────────────────────────────────────────────────

describe('naam-encrypt', () => {
  it('401 zonder Authorization-header', async () => {
    const handler = await laadEncrypt();
    const res = await handler(maakRequest({ entries: [['P1', 'Alice']] }, ''));
    expect(res.status).toBe(401);
  });

  it('401 bij ongeldig token', async () => {
    const handler = await laadEncrypt();
    const res = await handler(maakRequest({ entries: [['P1', 'Alice']] }, 'ongeldig-token'));
    expect(res.status).toBe(401);
  });

  it('405 bij GET', async () => {
    const handler = await laadEncrypt();
    const res = await handler(maakRequest({}, FAKE_TOKEN, 'GET'));
    expect(res.status).toBe(405);
  });

  it('200 met blob bij geldige entries', async () => {
    const handler = await laadEncrypt();
    const res  = await handler(maakRequest({ entries: [['P1', 'Alice Bakker']] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.blob).toBe('string');
    expect(body.blob.length).toBeGreaterThan(10);
  });

  it('200 met blob: null bij lege entries-array', async () => {
    const handler = await laadEncrypt();
    const res  = await handler(maakRequest({ entries: [] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.blob).toBeNull();
  });
});

// ── naam-decrypt ──────────────────────────────────────────────────────────────

describe('naam-decrypt', () => {
  it('401 zonder token', async () => {
    const handler = await laadDecrypt();
    const res = await handler(maakRequest({ blob: 'test' }, ''));
    expect(res.status).toBe(401);
  });

  it('200 met lege entries bij lege blob', async () => {
    const handler = await laadDecrypt();
    const res  = await handler(maakRequest({ blob: null }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.entries).toEqual([]);
  });

  it('round-trip via aparte handlers: encrypt → decrypt', async () => {
    const { default: encHandler } = await import('../../api/naam-encrypt.js');
    vi.resetModules();
    const { default: decHandler } = await import('../../api/naam-decrypt.js');

    const origineel = [['P1', 'Alice Bakker'], ['P2', 'Bob de Vries']];

    const encRes  = await encHandler(maakRequest({ entries: origineel }));
    const { blob } = await encRes.json();

    const decRes  = await decHandler(maakRequest({ blob }));
    const { entries } = await decRes.json();

    expect(entries).toEqual(origineel);
  });

  it('500 bij gemanipuleerde blob', async () => {
    const { default: encHandler } = await import('../../api/naam-encrypt.js');
    vi.resetModules();
    const { default: decHandler } = await import('../../api/naam-decrypt.js');

    const encRes  = await encHandler(maakRequest({ entries: [['P1', 'Test']] }));
    const { blob } = await encRes.json();

    const kapot = 'ZZZZ' + blob.slice(4);
    const decRes = await decHandler(maakRequest({ blob: kapot }));
    expect(decRes.status).toBe(500);
  });
});
