/**
 * Unit tests — src/rapport/internationaal.js
 *
 * De waarden hieronder zijn schrijfwijzen zoals de classificatie ze oplevert: het
 * schema vraagt om "Nationaliteit van partij A, indien vermeld (bijv. 'Nederlandse',
 * 'Belgische', 'dubbele nationaliteit')", dus komt er vrije tekst terug.
 */

import { describe, it, expect } from 'vitest';
import { heeftInternationaalElement, afgeleideKenmerken } from '../../src/rapport/internationaal.js';

describe('het geval dat aanleiding was', () => {
  it('herkent twee verschillende nationaliteiten', () => {
    // Vijf IPR-chunks stonden ongebruikt in de kennisbank omdat er geen kenmerk was
    // dat ze kon oproepen.
    expect(heeftInternationaalElement('Nederlandse', 'Belgische')).toBe(true);
  });

  it('laat een dossier met twee Nederlandse partijen met rust', () => {
    // Anders gaat het hele IPR-blok bij élke analyse mee: ruis en tokens.
    expect(heeftInternationaalElement('Nederlandse', 'Nederlandse')).toBe(false);
  });
});

describe('heeftInternationaalElement', () => {
  it('is onwaar als er niets is vastgelegd', () => {
    expect(heeftInternationaalElement('', '')).toBe(false);
    expect(heeftInternationaalElement(null, undefined)).toBe(false);
  });

  it('kent de schrijfwijzen van Nederlands', () => {
    for (const v of ['Nederlands', 'Nederlandse', 'nederlandse', 'NL', 'Dutch'])
      expect(heeftInternationaalElement(v, v), v).toBe(false);
  });

  it('is waar bij één buitenlandse partij, ook als de ander leeg is', () => {
    expect(heeftInternationaalElement('Poolse', '')).toBe(true);
    expect(heeftInternationaalElement('', 'Marokkaanse')).toBe(true);
  });

  it('is waar bij een dubbele nationaliteit', () => {
    expect(heeftInternationaalElement('dubbele nationaliteit', 'Nederlandse')).toBe(true);
    expect(heeftInternationaalElement('Nederlandse/Turkse', 'Nederlandse')).toBe(true);
    expect(heeftInternationaalElement('Nederlandse en Duitse', 'Nederlandse')).toBe(true);
  });

  it('laat een toelichting tussen haakjes buiten beschouwing', () => {
    expect(heeftInternationaalElement('Nederlandse (sinds 2010)', 'Nederlandse')).toBe(false);
  });

  it('is onwaar als alleen één partij is vastgelegd en die Nederlands is', () => {
    // Onbekend is niet hetzelfde als buitenlands.
    expect(heeftInternationaalElement('Nederlandse', '')).toBe(false);
  });
});

describe('afgeleideKenmerken', () => {
  it('voegt internationaal toe wanneer dat speelt', () => {
    expect(afgeleideKenmerken({ nationaliteit_a: 'Nederlandse', nationaliteit_b: 'Spaanse' }))
      .toEqual(['internationaal']);
  });

  it('geeft een lege lijst als er niets af te leiden valt', () => {
    expect(afgeleideKenmerken({ nationaliteit_a: 'Nederlandse', nationaliteit_b: 'Nederlandse' }))
      .toEqual([]);
    expect(afgeleideKenmerken({})).toEqual([]);
    expect(afgeleideKenmerken()).toEqual([]);
  });
});
