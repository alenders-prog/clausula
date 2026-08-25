/**
 * Unit tests — src/ui/lijst-zin.js
 *
 * Gebruikt om te tonen welke dimensies nog draaien tijdens een analyse:
 * "Bezig met juridische toets, balans en grammatica…". Met een kale join zou daar
 * "juridische toets, balans, grammatica" staan, wat leest als een opsomming die
 * halverwege is afgekapt.
 */

import { describe, it, expect } from 'vitest';
import { lijstZin } from '../../src/ui/lijst-zin.js';

describe('lijstZin', () => {
  it('geeft één item ongewijzigd terug', () => {
    expect(lijstZin(['balans'])).toBe('balans');
  });

  it('verbindt er twee met "en", zonder komma', () => {
    expect(lijstZin(['balans', 'grammatica'])).toBe('balans en grammatica');
  });

  it('zet komma\'s tussen de eerste en "en" voor de laatste', () => {
    expect(lijstZin(['juridische toets', 'balans', 'grammatica']))
      .toBe('juridische toets, balans en grammatica');
  });

  it('geeft een lege string bij een lege lijst', () => {
    expect(lijstZin([])).toBe('');
    expect(lijstZin()).toBe('');
    expect(lijstZin(null)).toBe('');
  });

  it('negeert lege en witruimte-items', () => {
    expect(lijstZin(['balans', '', '   ', 'grammatica'])).toBe('balans en grammatica');
    expect(lijstZin(['', null, undefined])).toBe('');
  });

  it('kan een ander voegwoord gebruiken', () => {
    expect(lijstZin(['nu', 'later'], 'of')).toBe('nu of later');
  });

  it('trimt witruimte rond de items', () => {
    expect(lijstZin(['  balans  ', ' grammatica '])).toBe('balans en grammatica');
  });
});
