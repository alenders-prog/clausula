/**
 * Unit tests — src/tekst/placeholder-kern.js
 *
 * Gemeld op 8 september 2026: een kaart heette "Dubbele zin bij toedeling bankrekeningen
 * IBAN_0 en IBAN_1". Wij versturen `[IBAN_0]` mét haken; het model schreef hem zonder over,
 * en dan herstelt niets hem meer.
 */

import { describe, it, expect } from 'vitest';
import { isTechnischeKern } from '../../src/tekst/placeholder-kern.js';

describe('wat zonder haken hersteld mag worden', () => {
  it('de plaatshouders die dit project gebruikt', () => {
    for (const k of ['IBAN_0', 'TEL_1', 'BSN_0', 'REKENING_12', 'WOONPLAATS_0', 'WERKGEVER_0'])
      expect(isTechnischeKern(k)).toBe(true);
  });
});

describe('wat níét, en dat is de hele reden voor deze toets', () => {
  it('gewone woorden', () => {
    // Zonder deze grens zou "de vrouw" of "Rekening" in de lopende tekst geraakt worden.
    for (const k of ['IBAN', 'WOONPLAATS', 'Rekening', 'vrouw', 'PERSOON_A', 'KIND_EEN'])
      expect(isTechnischeKern(k)).toBe(false);
  });

  it('lege en rare invoer', () => {
    for (const k of ['', '  ', null, undefined, '_0', '0', 'iban_0'])
      expect(isTechnischeKern(k)).toBe(false);
  });
});
