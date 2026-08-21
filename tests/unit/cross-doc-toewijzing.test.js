/**
 * Unit tests — api/_cross-doc-toewijzing.js
 *
 * Aanleiding (21 augustus 2026): het issue "Zorgkortingspercentages in
 * ouderschapsplan wijken af van de Tremanormen" stond onder *Convenant* en sprong
 * bij aanklikken naar het ouderschapsplan.
 */

import { describe, it, expect } from 'vitest';
import { doelDocument, hoortBijDocument } from '../../api/_cross-doc-toewijzing.js';

const ZORGKORTING = {
  onderwerp: 'Zorgkortingspercentages in ouderschapsplan wijken af van de Tremanormen',
  passage_document: 'ouderschapsplan',
  betreft_documenten: ['ouderschapsplan', 'convenant'],
};

describe('het geval dat aanleiding was', () => {
  it('plaatst het issue op het tabblad van de passage', () => {
    expect(hoortBijDocument(ZORGKORTING, 'ouderschapsplan')).toBe(true);
  });

  it('zet het niet meer op het andere tabblad', () => {
    // Daar was niets om naartoe te springen, dus wisselde de viewer van document.
    expect(hoortBijDocument(ZORGKORTING, 'convenant')).toBe(false);
  });
});

describe('doelDocument', () => {
  it('geeft voorrang aan passage_document', () => {
    expect(doelDocument({ passage_document: 'convenant', betreft_documenten: ['ouderschapsplan'] }))
      .toBe('convenant');
  });

  it('valt terug op het eerste betreft_documenten', () => {
    expect(doelDocument({ betreft_documenten: ['ouderschapsplan', 'convenant'] }))
      .toBe('ouderschapsplan');
  });

  it('geeft null zonder bruikbare aanwijzing', () => {
    expect(doelDocument({})).toBe(null);
    expect(doelDocument({ betreft_documenten: [] })).toBe(null);
    expect(doelDocument({ passage_document: '   ' })).toBe(null);
    expect(doelDocument(null)).toBe(null);
  });

  it('negeert waarden van het verkeerde type', () => {
    expect(doelDocument({ passage_document: 42, betreft_documenten: ['convenant'] })).toBe('convenant');
    expect(doelDocument({ betreft_documenten: 'convenant' })).toBe(null);
  });
});

describe('zonder aanwijzing naar alle documenten', () => {
  it('toont het issue overal — liever een kaart te veel dan een onzichtbare bevinding', () => {
    const zonder = { onderwerp: 'Iets zonder velden' };
    expect(hoortBijDocument(zonder, 'convenant')).toBe(true);
    expect(hoortBijDocument(zonder, 'ouderschapsplan')).toBe(true);
  });
});

describe('gewone issues met één document', () => {
  it('blijven op hun eigen tabblad', () => {
    const alleenOp = { passage_document: 'ouderschapsplan', betreft_documenten: ['ouderschapsplan'] };
    expect(hoortBijDocument(alleenOp, 'ouderschapsplan')).toBe(true);
    expect(hoortBijDocument(alleenOp, 'convenant')).toBe(false);
  });
});
