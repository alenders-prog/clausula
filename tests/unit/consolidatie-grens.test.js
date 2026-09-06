/**
 * Unit tests — src/rapport/consolidatie-grens.js
 *
 * Aanleiding, uit de serverlog van een echte analyse op 6 september 2026:
 *
 *     consolidatie: 5 van 19 duplicaat(en) verwijderd
 *       weg: laag   Spaarrekening-sectie bevat taalfout ('beheer wordtgekregen')
 *       weg: laag   Aaneengeschreven woorden "wordtgekregen" in artikel 21
 *
 * Twee kaarten over dezelfde tikfout, allebei weg. Van een groep duplicaten hoort er één
 * te blijven staan.
 */

import { describe, it, expect } from 'vitest';
import { beschermPassagegroepen } from '../../src/rapport/consolidatie-grens.js';

const P = 'Ouders zijn overeengekomen dat beide hierover beheer wordtgekregen.';

describe('het geval uit de log', () => {
  const issues = [
    { onderwerp: "Spaartegoed: taalfout ('beheer wordtgekregen')", ernst: 'laag', passage: P },
    { onderwerp: 'Aaneengeschreven woorden in artikel 21', ernst: 'laag', passage: P },
    { onderwerp: 'Iets anders', ernst: 'midden', passage: 'Een andere zin.' },
  ];

  it('herstelt er één als de hele passagegroep zou verdwijnen', () => {
    const { indices, hersteld } = beschermPassagegroepen(issues, [2]);
    expect(hersteld).toHaveLength(1);
    expect(indices.has(2)).toBe(true);
    // Precies één van de twee, niet allebei — het blijft ontdubbelen.
    expect([...indices].filter((i) => i < 2)).toHaveLength(1);
  });

  it('doet niets als er al één van de groep bewaard blijft', () => {
    const { indices, hersteld } = beschermPassagegroepen(issues, [0, 2]);
    expect(hersteld).toEqual([]);
    expect([...indices].sort()).toEqual([0, 2]);
  });
});

describe('welk exemplaar blijft', () => {
  it('kiest het issue met een wetsverwijzing', () => {
    const issues = [
      { onderwerp: 'Nihilbeding ontbreekt', ernst: 'laag', passage: P, bevinding: 'kort' },
      { onderwerp: 'Nihilbeding (art. 1:158 BW)', ernst: 'laag', passage: P, bevinding: 'kort' },
    ];
    const { indices } = beschermPassagegroepen(issues, []);
    expect(indices.has(1)).toBe(true);
    expect(indices.has(0)).toBe(false);
  });

  it('kiest anders de hoogste ernst', () => {
    const issues = [
      { onderwerp: 'A', ernst: 'laag',   passage: P },
      { onderwerp: 'B', ernst: 'hoog',   passage: P },
      { onderwerp: 'C', ernst: 'midden', passage: P },
    ];
    const { indices } = beschermPassagegroepen(issues, []);
    expect([...indices]).toEqual([1]);
  });

  it('kiest bij gelijke ernst het meest uitgewerkte', () => {
    const issues = [
      { onderwerp: 'A', ernst: 'laag', passage: P, bevinding: 'kort' },
      { onderwerp: 'B', ernst: 'laag', passage: P, bevinding: 'een veel uitgebreidere uitleg van het gebrek' },
    ];
    const { indices } = beschermPassagegroepen(issues, []);
    expect([...indices]).toEqual([1]);
  });
});

describe('ook een issue dat als enige naar zijn zin verwijst', () => {
  it('wordt hersteld — dat is de brede variant, en dat is bewust', () => {
    // Bij het ontwerp is eerst de smalle variant beschreven (alleen groepen van twee of
    // meer). Gemeten en gehouden is de brede: over drie runs gaf dat elf herstellingen,
    // waarvan de meeste terecht. Wie de smalle wil: sla groepen met lengte 1 over.
    const issues = [
      { onderwerp: 'Enige kaart over deze zin', ernst: 'midden', passage: 'Een unieke zin.' },
      { onderwerp: 'Andere', ernst: 'laag', passage: 'Een andere zin.' },
    ];
    const { indices, hersteld } = beschermPassagegroepen(issues, [1]);
    expect(indices.has(0)).toBe(true);
    expect(hersteld.map((h) => h.index)).toEqual([0]);
  });
});

describe('wat het bewust NIET doet', () => {
  it('beschermt issues zonder passage niet', () => {
    // De consolidatieprompt zegt het zelf: een gebrek heeft van nature geen eigen zin,
    // dus daar is de passage geen bruikbaar onderscheid. Die beoordeling blijft bij het
    // model — anders zou deze grens de consolidatie grotendeels uitschakelen.
    const issues = [
      { onderwerp: 'Ingangsdatum ontbreekt', ernst: 'midden', passage: '' },
      { onderwerp: 'Ingangsdatum niet vastgelegd', ernst: 'midden' },
    ];
    const { indices, hersteld } = beschermPassagegroepen(issues, []);
    expect(hersteld).toEqual([]);
    expect(indices.size).toBe(0);
  });

  it('houdt de keuze van de consolidatie verder ongemoeid', () => {
    const issues = [
      { onderwerp: 'A', ernst: 'hoog',   passage: 'zin 1' },
      { onderwerp: 'B', ernst: 'midden', passage: 'zin 2' },
      { onderwerp: 'C', ernst: 'laag',   passage: 'zin 3' },
    ];
    const { indices, hersteld } = beschermPassagegroepen(issues, [0, 1, 2]);
    expect(hersteld).toEqual([]);
    expect([...indices].sort()).toEqual([0, 1, 2]);
  });

  it('negeert verschillen in witruimte en hoofdletters bij het groeperen', () => {
    const issues = [
      { onderwerp: 'A', ernst: 'laag', passage: 'De  woning   wordt verkocht.' },
      { onderwerp: 'B', ernst: 'laag', passage: 'de woning wordt verkocht.' },
    ];
    const { hersteld } = beschermPassagegroepen(issues, []);
    expect(hersteld).toHaveLength(1);   // één groep, dus één hersteld exemplaar
  });
});

describe('randgevallen', () => {
  it('valt niet om op lege invoer', () => {
    expect(beschermPassagegroepen([], []).indices.size).toBe(0);
    expect(beschermPassagegroepen(null, [0]).indices.has(0)).toBe(true);
    expect(beschermPassagegroepen(undefined, undefined).indices.size).toBe(0);
  });

  it('negeert onzinnige indices', () => {
    const issues = [{ onderwerp: 'A', ernst: 'laag', passage: P }];
    const { indices } = beschermPassagegroepen(issues, ['x', null, 0]);
    expect([...indices]).toEqual([0]);
  });
});
