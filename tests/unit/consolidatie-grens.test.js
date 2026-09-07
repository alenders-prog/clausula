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

describe('balans verliest nooit van een buurman op dezelfde passage', () => {
  // Het gemeten geval, twee runs achter elkaar identiek: de consolidatie bewaarde de
  // volledigheidskaart en gooide de balanskaart over exact dezelfde zorgkortingszin weg.
  const Z = 'Vader (rekening gehouden met een zorgkorting van 30%): € 441,-';
  const issues = [
    { onderwerp: 'Zorgkorting 30%/39% wijkt af van Tremanormen en is niet gemotiveerd',
      ernst: 'midden', dimensies: ['juridisch', 'balans'], passage: Z },
    { onderwerp: 'Zorgkorting vader (30%) en moeder (39%) niet gemotiveerd',
      ernst: 'midden', dimensies: ['volledigheid'], passage: Z },
  ];

  it('herstelt de balanskaart als alleen de buurman blijft staan', () => {
    const { indices, hersteld } = beschermPassagegroepen(issues, [1]);
    expect(indices.has(0)).toBe(true);
    expect(indices.has(1)).toBe(true);   // de buurman blijft óók staan
    expect(hersteld).toEqual([{ index: 0, reden: 'balans', onderwerp: issues[0].onderwerp }]);
  });

  it('doet niets als de balanskaart zelf al bewaard is', () => {
    const { hersteld } = beschermPassagegroepen(issues, [0]);
    expect(hersteld).toEqual([]);
  });

  it('herstelt er één, niet allemaal, als er twee balanskaarten zijn', () => {
    const twee = [...issues,
      { onderwerp: 'Zorgkorting eenzijdig', ernst: 'laag', dimensies: ['balans'], passage: Z }];
    const { indices, hersteld } = beschermPassagegroepen(twee, [1]);
    expect(hersteld).toHaveLength(1);
    expect(indices.has(0)).toBe(true);   // midden wint van laag
    expect(indices.has(2)).toBe(false);
  });

  it('laat balans op een ANDERE passage met rust', () => {
    const anders = [
      { onderwerp: 'Balanskwestie elders', ernst: 'midden', dimensies: ['balans'], passage: 'Een andere zin.' },
      { onderwerp: 'Buurman', ernst: 'midden', dimensies: ['volledigheid'], passage: Z },
      { onderwerp: 'Nog een', ernst: 'laag', dimensies: ['grammatica'], passage: Z },
    ];
    // Index 0 is als enige van zijn passage weggegooid → regel 1 pakt hem, niet regel 2.
    const { hersteld } = beschermPassagegroepen(anders, [1]);
    expect(hersteld).toEqual([{ index: 0, reden: 'passage', onderwerp: 'Balanskwestie elders' }]);
  });

  it('beschermt géén andere dimensie — grammatica naast volledigheid blijft ontdubbeld', () => {
    // De algemene variant zou hier de grammaticakaart terughalen. Dat is bewust niet zo:
    // twee kaarten over dezelfde zin zijn daar meestal wél een dubbeling.
    const gram = [
      { onderwerp: 'Tikfout in de zin', ernst: 'laag', dimensies: ['grammatica'], passage: Z },
      { onderwerp: 'Zin onvolledig', ernst: 'midden', dimensies: ['volledigheid'], passage: Z },
    ];
    const { indices, hersteld } = beschermPassagegroepen(gram, [1]);
    expect(hersteld).toEqual([]);
    expect(indices.has(0)).toBe(false);
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
