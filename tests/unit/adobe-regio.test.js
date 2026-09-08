/**
 * Unit tests — src/conversie/adobe-regio.js
 *
 * De PDF→DOCX-conversie stuurt het originele bestand naar Adobe, met cliëntnamen erin.
 * Waar dat landt is daarmee een AVG-vraag en geen configuratiedetail; deze tests staan
 * er vooral voor de terugvalregel, want die kant is stil.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { adobeHost, buitenEu, HOST_EU, HOST_VS } from '../../src/conversie/adobe-regio.js';

describe('adobeHost', () => {
  it('kiest Europa als er niets is ingesteld', () => {
    expect(adobeHost()).toBe(HOST_EU);
    expect(adobeHost(undefined)).toBe(HOST_EU);
    expect(adobeHost('')).toBe(HOST_EU);
  });

  it('kiest de Verenigde Staten alleen als daar uitdrukkelijk om wordt gevraagd', () => {
    for (const v of ['us', 'US', ' us ', 'ue1', 'vs']) expect(adobeHost(v)).toBe(HOST_VS);
  });

  it('valt bij een onbekende waarde naar Europa en niet naar de VS', () => {
    // Dit is de regel die ertoe doet. Een typefout in een omgevingsvariabele hoort geen
    // doorgifte naar de Verenigde Staten op te leveren die niemand opmerkt.
    for (const v of ['eu-west-1', 'europa', 'usa', 'U.S.', 'ew1', 'onzin']) {
      expect(adobeHost(v)).toBe(HOST_EU);
    }
  });

  it('geeft de Europese hostnaam volgens Adobe’s patroon', () => {
    expect(HOST_EU).toBe('https://pdf-services-ew1.adobe.io');
  });

  it('geeft als terugval exact de hostnaam die er vóór 08-09-2026 stond', () => {
    // Anders is "terugvallen" niet hetzelfde als terug.
    expect(HOST_VS).toBe('https://pdf-services.adobe.io');
  });

  it('meldt via buitenEu wanneer de verwerking de EU verlaat', () => {
    expect(buitenEu()).toBe(false);
    expect(buitenEu('us')).toBe(true);
  });
});

describe('de bedrading — geen vaste Adobe-hostnamen meer in de endpoints', () => {
  // Zonder deze wachter blijft één vergeten `https://pdf-services.adobe.io/…` staan en
  // gaat dat ene verzoek stilletjes naar de Verenigde Staten terwijl de rest EU is.
  for (const bestand of ['api/adobe-start.js', 'api/adobe-result.js']) {
    it(`${bestand} bouwt zijn URL's met adobeHost()`, () => {
      const bron = readFileSync(new URL(`../../${bestand}`, import.meta.url), 'utf8');
      expect(bron).toMatch(/adobeHost\(/);
      expect(bron).not.toMatch(/['"`]https:\/\/pdf-services[^'"`]*\.adobe\.io/);
    });
  }
});
