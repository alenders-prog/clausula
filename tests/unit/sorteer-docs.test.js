import { describe, it, expect } from 'vitest';
import { DOC_VOLGORDE, sorteerOpDocType, sorteerOpType } from '../../src/rapport/sorteer-docs.js';

describe('DOC_VOLGORDE', () => {
  // Moet gelijk blijven aan de inline volgorde in index.html (toonRapport-tabs
  // en laadScreening/_TAB_VOLGORDE): OP → Zorgverdeling → Convenant → Waarde → rest.
  it('rangen komen overeen met de canonieke tabvolgorde', () => {
    expect(DOC_VOLGORDE.ouderschapsplan).toBe(0);
    expect(DOC_VOLGORDE.zorgverdeling).toBe(1);
    expect(DOC_VOLGORDE.convenant).toBe(10);
    expect(DOC_VOLGORDE.waarde_verdeling).toBe(11);
  });
});

describe('sorteerOpDocType', () => {
  it('OP altijd vóór convenant', () => {
    const input = [
      { doc_type: 'convenant',       naam: 'C' },
      { doc_type: 'ouderschapsplan', naam: 'OP' },
    ];
    const result = sorteerOpDocType(input);
    expect(result[0].doc_type).toBe('ouderschapsplan');
    expect(result[1].doc_type).toBe('convenant');
  });

  it('muteert de originele array niet', () => {
    const input = [
      { doc_type: 'convenant' },
      { doc_type: 'ouderschapsplan' },
    ];
    sorteerOpDocType(input);
    expect(input[0].doc_type).toBe('convenant');
  });

  it('onbekend doc_type komt achteraan', () => {
    const input = [
      { doc_type: 'onbekend' },
      { doc_type: 'convenant' },
      { doc_type: 'ouderschapsplan' },
    ];
    const result = sorteerOpDocType(input);
    expect(result[0].doc_type).toBe('ouderschapsplan');
    expect(result[1].doc_type).toBe('convenant');
    expect(result[2].doc_type).toBe('onbekend');
  });

  it('onbekend doc_type komt ook achter waarde_verdeling', () => {
    const input = [
      { doc_type: 'waarde_verdeling' },
      { doc_type: 'onbekend' },
      { doc_type: 'convenant' },
      { doc_type: 'zorgverdeling' },
      { doc_type: 'ouderschapsplan' },
    ];
    expect(sorteerOpDocType(input).map(i => i.doc_type)).toEqual([
      'ouderschapsplan', 'zorgverdeling', 'convenant', 'waarde_verdeling', 'onbekend',
    ]);
  });

  it('lege array geeft lege array', () => {
    expect(sorteerOpDocType([])).toEqual([]);
  });

  it('sortering is deterministisch bij al-correct-gesorteerde input', () => {
    const input = [
      { doc_type: 'ouderschapsplan' },
      { doc_type: 'convenant' },
    ];
    expect(sorteerOpDocType(input).map(i => i.doc_type))
      .toEqual(['ouderschapsplan', 'convenant']);
  });
});

describe('sorteerOpType', () => {
  it('sorteert op .type-veld (tray-items)', () => {
    const input = [
      { type: 'convenant',       bestand: 'c.pdf' },
      { type: 'ouderschapsplan', bestand: 'op.pdf' },
    ];
    const result = sorteerOpType(input);
    expect(result[0].type).toBe('ouderschapsplan');
    expect(result[1].type).toBe('convenant');
  });

  it('muteert de originele array niet', () => {
    const input = [{ type: 'convenant' }, { type: 'ouderschapsplan' }];
    sorteerOpType(input);
    expect(input[0].type).toBe('convenant');
  });
});
