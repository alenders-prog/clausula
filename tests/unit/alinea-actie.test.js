/**
 * Unit tests — src/docx/alinea-actie.js
 *
 * Aanleiding (21 augustus 2026): in een gegenereerd Word-document stond de
 * doorgehaalde tekst bovenaan en de vervangende tekst een halve pagina lager.
 * De lege alinea's die Adobe bij een paginaovergang achterlaat werden als
 * "verwijderd" gemarkeerd, waardoor het ankerpunt voor de invoeging meeschoof.
 */

import { describe, it, expect } from 'vitest';
import { volgendeAlineaActie, MAX_LEGE_ALINEAS } from '../../src/docx/alinea-actie.js';

const ORIGINEEL = 'de ouders hebben minderjarige kinderen waarvoor zij nog onderhoudsplichtig '
  + 'zijn en waarover zij een financiële afspraak hebben gemaakt in dit ouderschapsplan';

describe('lege alinea — het geval dat aanleiding was', () => {
  it('slaat een lege alinea over in plaats van hem te verwijderen', () => {
    expect(volgendeAlineaActie({ tekst: '', origineelNorm: ORIGINEEL })).toBe('overslaan');
    expect(volgendeAlineaActie({ tekst: '   ', origineelNorm: ORIGINEEL })).toBe('overslaan');
  });

  it('stopt zodra het er te veel achter elkaar worden', () => {
    // Anders zou de lus doorlopen tot het einde van het document.
    expect(volgendeAlineaActie({
      tekst: '', origineelNorm: ORIGINEEL, legeOpEenRij: MAX_LEGE_ALINEAS,
    })).toBe('stop');
  });

  it('accepteert een paginaovergang van een paar lege alineas', () => {
    for (let n = 0; n < MAX_LEGE_ALINEAS; n++) {
      expect(volgendeAlineaActie({ tekst: '', origineelNorm: ORIGINEEL, legeOpEenRij: n }))
        .toBe('overslaan');
    }
  });
});

describe('doorlopende tekst', () => {
  it('verwijdert een alinea die woorden deelt met de originele tekst', () => {
    expect(volgendeAlineaActie({
      tekst: 'onderhoudsplichtig zijn en waarover zij een financiële afspraak hebben gemaakt',
      origineelNorm: ORIGINEEL,
    })).toBe('verwijderen');
  });

  it('stopt bij een alinea die niets met de originele tekst deelt', () => {
    expect(volgendeAlineaActie({
      tekst: 'Het ouderlijk gezag over de kinderen ligt bij beide ouders volgens afspraak.',
      origineelNorm: 'volstrekt andere zin over pensioenverevening en bankrekeningen',
    })).toBe('stop');
  });

  it('verwijdert korte alineas zonder lange woorden — die zeggen niets', () => {
    // Geen kernwoorden van 8+ letters, dus geen reden om te stoppen.
    expect(volgendeAlineaActie({ tekst: 'ja, dat klopt.', origineelNorm: ORIGINEEL }))
      .toBe('verwijderen');
  });
});

describe('sectiekoppen', () => {
  it('stopt bij een genummerde kop', () => {
    expect(volgendeAlineaActie({ tekst: '1. Ouderlijk gezag', origineelNorm: ORIGINEEL })).toBe('stop');
    expect(volgendeAlineaActie({ tekst: '3.11. Vorderingen', origineelNorm: ORIGINEEL })).toBe('stop');
  });

  it('stopt niet bij een getal middenin een zin', () => {
    expect(volgendeAlineaActie({
      tekst: 'onderhoudsplichtig tot 21 jaar volgens de afspraak',
      origineelNorm: ORIGINEEL,
    })).toBe('verwijderen');
  });
});

describe('robuustheid', () => {
  it('overleeft ontbrekende invoer', () => {
    expect(volgendeAlineaActie({})).toBe('overslaan');
    expect(volgendeAlineaActie({ tekst: null, origineelNorm: null })).toBe('overslaan');
    expect(volgendeAlineaActie({ tekst: 'iets langs met kernwoorden erin', origineelNorm: '' }))
      .toBe('stop');
  });
});
