/**
 * Unit tests — api/_crypto.js
 * AES-256-GCM encrypt/decrypt voor namen_map opslag.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Testvaste 32-byte sleutel (64 hex-tekens)
const TEST_KEY = 'a'.repeat(64);

let versleutelNamen;
let ontsleutelNamen;

beforeEach(async () => {
  process.env.NAAM_ENCRYPTION_KEY = TEST_KEY;
  // Dynamische import zodat de env var al gezet is als het module laadt
  ({ versleutelNamen, ontsleutelNamen } = await import('../../api/_crypto.js'));
});

afterEach(() => {
  delete process.env.NAAM_ENCRYPTION_KEY;
});

describe('versleutelNamen', () => {
  it('retourneert een non-lege base64 string', async () => {
    const blob = await versleutelNamen([['P1', 'Alice Bakker']]);
    expect(typeof blob).toBe('string');
    expect(blob.length).toBeGreaterThan(0);
  });

  it('produceert elke keer een andere ciphertext (random IV)', async () => {
    const entries = [['P1', 'Alice']];
    const blob1 = await versleutelNamen(entries);
    const blob2 = await versleutelNamen(entries);
    expect(blob1).not.toBe(blob2);
  });

  it('werkt met meerdere naam-entries', async () => {
    const entries = [['P1', 'Alice Bakker'], ['P2', 'Bob de Vries'], ['K1', 'Kind Een']];
    const blob = await versleutelNamen(entries);
    expect(blob.length).toBeGreaterThan(20);
  });

  it('werkt met lege array (geeft geldige blob terug)', async () => {
    const blob = await versleutelNamen([]);
    expect(typeof blob).toBe('string');
  });

  it('faalt als NAAM_ENCRYPTION_KEY ontbreekt', async () => {
    delete process.env.NAAM_ENCRYPTION_KEY;
    await expect(versleutelNamen([['P1', 'Test']])).rejects.toThrow('NAAM_ENCRYPTION_KEY');
  });

  it('faalt als NAAM_ENCRYPTION_KEY verkeerde lengte heeft', async () => {
    process.env.NAAM_ENCRYPTION_KEY = 'te-kort';
    await expect(versleutelNamen([['P1', 'Test']])).rejects.toThrow('NAAM_ENCRYPTION_KEY');
  });
});

describe('ontsleutelNamen', () => {
  it('round-trip: encrypt → decrypt geeft originele entries terug', async () => {
    const origineel = [['P1', 'Alice Bakker'], ['P2', 'Bob de Vries']];
    const blob = await versleutelNamen(origineel);
    const result = await ontsleutelNamen(blob);
    expect(result).toEqual(origineel);
  });

  it('round-trip werkt met speciale tekens in namen', async () => {
    const origineel = [['P1', "Jan-Pieter d'Haan"], ['P2', 'Müller & Söhne']];
    const blob = await versleutelNamen(origineel);
    const result = await ontsleutelNamen(blob);
    expect(result).toEqual(origineel);
  });

  it('gooit fout bij gemanipuleerde blob (integriteit mislukt)', async () => {
    const blob = await versleutelNamen([['P1', 'Alice']]);
    // Eerste tekens vervangen om IV of ciphertext te corrumperen
    const kapot = 'ZZZZ' + blob.slice(4);
    await expect(ontsleutelNamen(kapot)).rejects.toThrow();
  });

  it('faalt als NAAM_ENCRYPTION_KEY ontbreekt bij decrypt', async () => {
    const blob = await versleutelNamen([['P1', 'Test']]);
    delete process.env.NAAM_ENCRYPTION_KEY;
    await expect(ontsleutelNamen(blob)).rejects.toThrow('NAAM_ENCRYPTION_KEY');
  });
});
