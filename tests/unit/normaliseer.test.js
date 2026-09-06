/**
 * Unit tests — src/tekst/normaliseer.js
 *
 * Aanleiding: op 6 september 2026 bleek een echt convenant 49 Unicode-ligaturen te
 * bevatten (`betreﬀende`, `ﬁscale`, `ﬁnanciële`). Voor een lezer onzichtbaar, maar élke
 * letterlijke tekstvergelijking in de app breekt erop — het terugzoeken van een passage,
 * `zoek_tekst` bij de conceptgeneratie, het bijlagefilter.
 */

import { describe, it, expect } from 'vitest';
import { normaliseerTekst, telAfwijkendeTekens } from '../../src/tekst/normaliseer.js';

describe('de gevallen uit het echte document', () => {
  it('maakt van een ligatuur weer twee letters', () => {
    expect(normaliseerTekst('betreﬀende')).toBe('betreffende');
    expect(normaliseerTekst('ﬁscale')).toBe('fiscale');
    expect(normaliseerTekst('ﬁnanciële')).toBe('financiële');
    expect(normaliseerTekst('speciﬁek')).toBe('specifiek');
    expect(normaliseerTekst('opheﬀen')).toBe('opheffen');
  });

  it('maakt een zoekopdracht met gewone letters weer vindbaar', () => {
    // Dit is de hele reden van dit bestand: het model schrijft "financiële", het document
    // draagt "ﬁnanciële", en zonder normalisatie vindt indexOf niets.
    const doc = 'De ﬁnanciële gevolgen voor de toekomst zijn besproken.';
    expect(doc.includes('financiële')).toBe(false);
    expect(normaliseerTekst(doc).includes('financiële')).toBe(true);
  });

  it('doet hetzelfde met de langere ligaturen', () => {
    expect(normaliseerTekst('oﬃcieel')).toBe('officieel');   // ﬃ → ffi
    expect(normaliseerTekst('waﬄes')).toBe('waffles');       // ﬄ → ffl
  });
});

describe('typografische varianten', () => {
  it('brengt krulaanhalingstekens terug', () => {
    expect(normaliseerTekst('‘zo min mogelijk’')).toBe("'zo min mogelijk'");
    expect(normaliseerTekst('“citaat”')).toBe('"citaat"');
  });

  it('brengt gedachtestreepjes terug', () => {
    expect(normaliseerTekst('€ 1.470,– per maand')).toBe('€ 1.470,- per maand');
    expect(normaliseerTekst('2020—2024')).toBe('2020-2024');
  });

  it('haalt onzichtbare spaties weg die een vergelijking breken', () => {
    expect(normaliseerTekst('€ 1.470')).toBe('€ 1.470');
    expect(normaliseerTekst('woord​deel')).toBe('woorddeel');
  });
});

describe('wat het NIET mag doen', () => {
  it('laat gewone tekst volledig ongemoeid', () => {
    const t = 'Partijen komen overeen dat de woning wordt verkocht.\n\n  Artikel 3.2.1';
    expect(normaliseerTekst(t)).toBe(t);
  });

  it('vouwt geen witruimte samen en trimt niet', () => {
    expect(normaliseerTekst('  twee   spaties  ')).toBe('  twee   spaties  ');
    expect(normaliseerTekst('regel\n\n\nregel')).toBe('regel\n\n\nregel');
  });

  it('corrigeert geen spelfouten', () => {
    // Dit bestand normaliseert schrijfwijzen; het repareert niets.
    expect(normaliseerTekst('wordtgekregen')).toBe('wordtgekregen');
    expect(normaliseerTekst('gezamelijke')).toBe('gezamelijke');
  });

  it('valt niet om op lege of ontbrekende invoer', () => {
    expect(normaliseerTekst('')).toBe('');
    expect(normaliseerTekst(null)).toBe('');
    expect(normaliseerTekst(undefined)).toBe('');
  });
});

describe('telAfwijkendeTekens', () => {
  it('telt hoeveel er te normaliseren valt, zonder de tekst te tonen', () => {
    expect(telAfwijkendeTekens('betreﬀende ﬁscale ﬁnanciële')).toBe(3);
    expect(telAfwijkendeTekens('gewone tekst')).toBe(0);
    expect(telAfwijkendeTekens(null)).toBe(0);
  });
});
