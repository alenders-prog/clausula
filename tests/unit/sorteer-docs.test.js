import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

// ── Bedrading ──────────────────────────────────────────────────────────────
//
// Aanleiding (1 september 2026). In de viewer stond het waardeoverzicht vóór het
// convenant. De console wees het aan:
//
//   [toonRapport] renderDocPanel aanroepen met app.bestanden:
//     (2) ['Waarde_verdeling (13).pdf', 'Concept Convenant (16).pdf']
//
// `sorteerOpType` bestond, was getest, werd naar window geëxporteerd — en werd nul keer
// aangeroepen. In plaats daarvan stond er drie keer een eigen tabel in index.html, elke
// keer `{ ouderschapsplan: 0, convenant: 1 }`. Waardebepaling en zorgverdeling ontbraken
// daarin, kregen allebei rang 9, en hielden dus de volgorde van het uploaden.
//
// Precies dezelfde soort fout als bij de documentvolgorde twee dagen eerder: kloppende
// logica die nergens werd aangeroepen. Vandaar deze controles.

describe('index.html gebruikt deze sortering ook echt', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('roept sorteerOpType aan in plaats van een eigen tabel bij te houden', () => {
    expect((html.match(/window\.sorteerOpType\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('houdt geen losse volgordetabellen meer aan', () => {
    // Een tweede tabel gaat vanzelf uiteenlopen met DOC_VOLGORDE, en het verschil is
    // aan het scherm niet te zien — je ziet alleen een volgorde die "raar" aanvoelt.
    expect(html).not.toMatch(/_HOOFD_VOLGORDE|_PRIM_VOLGORDE/);
    expect(html).not.toMatch(/const _VOLGORDE = \{ ouderschapsplan/);
  });

  it('sorteert ook de terugval van app.bestanden', () => {
    // `app.bestanden = primaireBestanden?.[0] || resolvedFiles`. Bleef resolvedFiles in
    // uploadvolgorde staan, dan gaf de terugval een ándere volgorde dan het gewone pad.
    expect(html).toMatch(/resolvedFiles:\s*window\.sorteerOpType\(resolvedItems\)/);
  });
});
