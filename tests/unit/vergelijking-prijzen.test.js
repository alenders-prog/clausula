/**
 * tests/unit/vergelijking-prijzen.test.js
 *
 * De prijstabel van de vergelijking, en de bronwachter die hem tegen `src/api/kosten.js`
 * aan houdt. Twee prijstabellen die uit elkaar lopen zijn erger dan één foute: aan geen
 * van beide is dan te zien welke de juiste is.
 */

import { describe, it, expect } from 'vitest';
import { PRIJZEN, kosten, verdeling, prijsBekend, normaliseerModel } from '../../src/vergelijking/prijzen.js';
import {
  PRIJZEN as PROD_PRIJZEN,
  CACHE_LEES_FACTOR, CACHE_SCHRIJF_FACTOR,
} from '../../src/api/kosten.js';

describe('normaliseerModel', () => {
  it('laat een naam die in de tabel staat met rust', () => {
    expect(normaliseerModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(normaliseerModel('gpt-5.6-luna')).toBe('gpt-5.6-luna');
  });

  it('kapt beide datumvormen af — de leveranciers schrijven ze verschillend', () => {
    expect(normaliseerModel('claude-sonnet-4-6-20260101')).toBe('claude-sonnet-4-6');
    expect(normaliseerModel('gpt-5.5-2026-04-23')).toBe('gpt-5.5');
  });

  it('laat een onbekend model onaangeroerd, zodat het als onbekend opvalt', () => {
    expect(normaliseerModel('gpt-9-onbekend')).toBe('gpt-9-onbekend');
    expect(prijsBekend('gpt-9-onbekend')).toBe(false);
  });
});

describe('kosten', () => {
  const verbruik = { vers: 1e6, cacheSchrijf: 0, cacheLees: 0, uit: 0 };

  it('rekent een miljoen verse invoertokens af tegen het invoertarief', () => {
    expect(kosten('claude-sonnet-4-6', verbruik)).toBeCloseTo(3, 10);
    expect(kosten('gpt-5.6-luna', verbruik)).toBeCloseTo(0.20, 10);
  });

  it('telt de vier stromen bij elkaar op', () => {
    // 1M vers + 1M schrijven + 1M lezen + 1M uit op sonnet-4-6: 3 + 3,75 + 0,30 + 15.
    const alles = { vers: 1e6, cacheSchrijf: 1e6, cacheLees: 1e6, uit: 1e6 };
    expect(kosten('claude-sonnet-4-6', alles)).toBeCloseTo(22.05, 10);
  });

  it('geeft null bij een onbekend model — geen bedrag is beter dan een verzonnen bedrag', () => {
    expect(kosten('gpt-9-onbekend', verbruik)).toBeNull();
    expect(kosten('claude-sonnet-4-6', null)).toBeNull();
  });

  it('behandelt ontbrekende stromen als nul', () => {
    expect(kosten('claude-sonnet-4-6', { uit: 1e6 })).toBeCloseTo(15, 10);
  });
});

describe('verdeling', () => {
  it('splitst de rekening, want de verhouding invoer/uitvoer is de uitkomst', () => {
    const d = verdeling('claude-sonnet-4-6', { vers: 1e6, cacheSchrijf: 0, cacheLees: 0, uit: 1e6 });
    expect(d.vers).toBeCloseTo(3, 10);
    expect(d.uit).toBeCloseTo(15, 10);
  });

  it('geeft null bij een onbekend model', () => {
    expect(verdeling('gpt-9-onbekend', { vers: 1 })).toBeNull();
  });
});

describe('OpenAI — cache-schrijven verschilt per generatie', () => {
  it('rekent 1,25x voor de gpt-5.6-familie', () => {
    for (const m of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
      expect(PRIJZEN[m].cacheSchrijf).toBeCloseTo(PRIJZEN[m].vers * 1.25, 10);
    }
  });

  it('rekent niets extra voor de oudere reeks — schrijven is daar gelijk aan vers', () => {
    // De aanname "OpenAI schrijft gratis naar de cache" geldt hier nog wél, en voor de
    // 5.6-familie niet meer. Eén factor over beide heen zou voor de helft fout zijn.
    for (const m of ['gpt-5.5', 'gpt-5.4', 'gpt-5.2']) {
      expect(PRIJZEN[m].cacheSchrijf).toBe(PRIJZEN[m].vers);
    }
  });

  it('rekent overal een tiende voor cache-lezen', () => {
    for (const m of Object.keys(PRIJZEN)) {
      expect(PRIJZEN[m].cacheLees).toBeCloseTo(PRIJZEN[m].vers * 0.10, 10);
    }
  });
});

describe('bronwachter — deze tabel en src/api/kosten.js zeggen hetzelfde', () => {
  const anthropicRijen = Object.keys(PRIJZEN).filter((m) => m.startsWith('claude-'));

  it('dekt elk Claude-model dat in de productietabel staat', () => {
    // Andersom hoeft niet: de vergelijking mag modellen kennen die productie niet draait.
    for (const m of anthropicRijen) {
      expect(PROD_PRIJZEN[m], `${m} ontbreekt in src/api/kosten.js`).toBeDefined();
    }
  });

  it('noemt voor elk Claude-model dezelfde invoer- en uitvoerprijs', () => {
    for (const m of anthropicRijen) {
      expect(PRIJZEN[m].vers, `${m} invoer`).toBeCloseTo(PROD_PRIJZEN[m].invoer, 10);
      expect(PRIJZEN[m].uit,  `${m} uitvoer`).toBeCloseTo(PROD_PRIJZEN[m].uitvoer, 10);
    }
  });

  it('leidt dezelfde cachetarieven af als de factoren in productie', () => {
    for (const m of anthropicRijen) {
      expect(PRIJZEN[m].cacheLees, `${m} cache lezen`)
        .toBeCloseTo(PROD_PRIJZEN[m].invoer * CACHE_LEES_FACTOR, 10);
      expect(PRIJZEN[m].cacheSchrijf, `${m} cache schrijven`)
        .toBeCloseTo(PROD_PRIJZEN[m].invoer * CACHE_SCHRIJF_FACTOR, 10);
    }
  });
});
