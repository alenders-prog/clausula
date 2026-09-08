/**
 * Unit tests — src/conversie/run-opmaak.js
 *
 * Gemeld op 8 september 2026: in het conceptvoorbeeld werd vervangen tekst op sommige
 * plekken kleiner weergegeven. De opmaak werd overgenomen van de eerste run in de alinea,
 * en dat is in Word vaak een superscript of een los cursief woord — niet de lopende tekst.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kiesRunOpmaak } from '../../src/conversie/run-opmaak.js';

describe('kiesRunOpmaak', () => {
  it('kiest de opmaak van de run met de meeste tekst', () => {
    // Het gemelde geval: "2" + superscript "de" + " kerstdag tot en met oud en nieuw…"
    const uit = kiesRunOpmaak([
      { tekstLengte: 1,  rPr: 'klein' },
      { tekstLengte: 2,  rPr: 'superscript' },
      { tekstLengte: 48, rPr: 'lopend' },
    ]);
    expect(uit).toBe('lopend');
  });

  it('neemt bij gelijke lengte de eerste', () => {
    expect(kiesRunOpmaak([{ tekstLengte: 5, rPr: 'a' }, { tekstLengte: 5, rPr: 'b' }])).toBe('a');
  });

  it('geeft null als geen enkele run opmaak heeft', () => {
    // Word valt dan terug op de alineastijl, en dat is precies goed.
    expect(kiesRunOpmaak([{ tekstLengte: 9, rPr: null }])).toBeNull();
    expect(kiesRunOpmaak([])).toBeNull();
    expect(kiesRunOpmaak(null)).toBeNull();
  });

  it('slaat runs zonder tekst niet over als er niets anders is', () => {
    expect(kiesRunOpmaak([{ tekstLengte: 0, rPr: 'enige' }])).toBe('enige');
  });
});

describe('de bedrading', () => {
  const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('beide DOCX-paden kiezen de opmaak niet meer op volgorde', () => {
    // Er stond twee keer `getElementsByTagNameNS(wNs, 'r')[0]` — de eerste run.
    expect(bron).not.toMatch(/const paraRPr\s*=\s*p =>\s*p\.getElementsByTagNameNS\(wNs, 'r'\)\[0\]/);
  });

  it('gebruiken kiesRunOpmaak', () => {
    expect((bron.match(/kiesRunOpmaak\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
