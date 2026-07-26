import { describe, it, expect } from 'vitest';
import {
  CONTEXT_HOOFD_MAP,
  raadDocType,
  contextVoorHoofd,
  vindEigenBestanden,
  bouwPrimaireBest,
} from '../../src/viewer/primaire-best.js';

// ─── raadDocType ──────────────────────────────────────────────────────────────

describe('raadDocType', () => {
  it.each([
    ['Convenant def.pdf',            'convenant'],
    ['Ouderschapsplan definitief.pdf','ouderschapsplan'],
    ['Zorgverdeling kind.pdf',        'zorgverdeling'],
    ['Zorgregeling.pdf',              'zorgverdeling'],
    ['Huwelijkse voorwaarden.pdf',    'huwelijkse_voorwaarden'],
    ['Waardebepaling woning.pdf',     'waarde_verdeling'],
    ['Pensioenopgave 2023.pdf',       'pensioenopgave'],
    ['Paspoort man.pdf',              'id_bewijs'],
    ['Rijbewijs vrouw.pdf',           'id_bewijs'],
    ['Briefje.pdf',                   'overig'],
  ])('"%s" → "%s"', (naam, verwacht) => {
    expect(raadDocType(naam)).toBe(verwacht);
  });
});

// ─── contextVoorHoofd ─────────────────────────────────────────────────────────

describe('contextVoorHoofd', () => {
  it('zorgverdeling hoort bij ouderschapsplan', () => {
    expect(contextVoorHoofd('zorgverdeling', 'ouderschapsplan')).toBe(true);
  });

  it('zorgverdeling hoort NIET bij convenant', () => {
    expect(contextVoorHoofd('zorgverdeling', 'convenant')).toBe(false);
  });

  it('waarde_verdeling hoort bij convenant', () => {
    expect(contextVoorHoofd('waarde_verdeling', 'convenant')).toBe(true);
  });

  it('waarde_verdeling hoort NIET bij ouderschapsplan', () => {
    expect(contextVoorHoofd('waarde_verdeling', 'ouderschapsplan')).toBe(false);
  });

  it('onbekend contexttype (geen eigenaar) hoort bij elk hoofdtype', () => {
    expect(contextVoorHoofd('overig', 'ouderschapsplan')).toBe(true);
    expect(contextVoorHoofd('overig', 'convenant')).toBe(true);
  });

  it('id_bewijs (geen eigenaar in MAP) hoort bij elk hoofdtype', () => {
    expect(contextVoorHoofd('id_bewijs', 'ouderschapsplan')).toBe(true);
    expect(contextVoorHoofd('id_bewijs', 'convenant')).toBe(true);
  });
});

// ─── vindEigenBestanden ───────────────────────────────────────────────────────

describe('vindEigenBestanden', () => {
  const bestanden = [
    { name: 'Ouderschapsplan.pdf' },
    { name: 'Convenant.pdf' },
    { name: 'Pensioenopgave.pdf' },
  ];

  it('exacte naamMatch → gevondenVia naam', () => {
    const doc = { bestandsnaam: 'Convenant.pdf', doc_type: 'convenant' };
    const { eigen, gevondenVia } = vindEigenBestanden(doc, bestanden);
    expect(gevondenVia).toBe('naam');
    expect(eigen).toHaveLength(1);
    expect(eigen[0].name).toBe('Convenant.pdf');
  });

  it('geen exacte match maar raadDocType treft → gevondenVia heuristiek', () => {
    const doc = { bestandsnaam: 'Convenant (oud).pdf', doc_type: 'convenant' };
    const { eigen, gevondenVia } = vindEigenBestanden(doc, bestanden);
    expect(gevondenVia).toBe('heuristiek');
    expect(eigen[0].name).toBe('Convenant.pdf');
  });

  it('geen match op naam of type → gevondenVia geen, lege array', () => {
    const doc = { bestandsnaam: 'Onbekend.pdf', doc_type: 'onbekend_type' };
    const { eigen, gevondenVia } = vindEigenBestanden(doc, bestanden);
    expect(gevondenVia).toBe('geen');
    expect(eigen).toHaveLength(0);
  });
});

// ─── bouwPrimaireBest ─────────────────────────────────────────────────────────

// Hulpfunctie voor leesbare fixtures
const f = naam => ({ name: naam });

describe('bouwPrimaireBest — basisvolgorde', () => {
  it('[0] is altijd OP, ook als Convenant eerst in bestandenLijst staat', () => {
    const rDocs = [
      { bestandsnaam: 'Ouderschapsplan.pdf', doc_type: 'ouderschapsplan' },
      { bestandsnaam: 'Convenant.pdf',       doc_type: 'convenant' },
    ];
    const bestanden = [f('Convenant.pdf'), f('Ouderschapsplan.pdf')];
    const result = bouwPrimaireBest(rDocs, bestanden, null);

    expect(result[0][0].name).toBe('Ouderschapsplan.pdf');
    expect(result[1][0].name).toBe('Convenant.pdf');
  });

  it('lege bestandenLijst → alle tabs zijn lege arrays', () => {
    const rDocs = [
      { bestandsnaam: 'Ouderschapsplan.pdf', doc_type: 'ouderschapsplan' },
      { bestandsnaam: 'Convenant.pdf',       doc_type: 'convenant' },
    ];
    const result = bouwPrimaireBest(rDocs, [], null);
    expect(result[0]).toEqual([]);
    expect(result[1]).toEqual([]);
  });
});

describe('bouwPrimaireBest — context zonder contextMap (fallback heuristiek)', () => {
  it('zorgverdelingsbestand gaat naar OP-tab, niet naar Convenant-tab', () => {
    const rDocs = [
      { bestandsnaam: 'Ouderschapsplan.pdf', doc_type: 'ouderschapsplan' },
      { bestandsnaam: 'Convenant.pdf',       doc_type: 'convenant' },
    ];
    const bestanden = [
      f('Ouderschapsplan.pdf'),
      f('Convenant.pdf'),
      f('Zorgverdeling.pdf'),  // contexttype: zorgverdeling → eigenaar: ouderschapsplan
    ];
    const result = bouwPrimaireBest(rDocs, bestanden, null);

    const opTab  = result[0].map(f => f.name);
    const conTab = result[1].map(f => f.name);

    expect(opTab).toContain('Zorgverdeling.pdf');
    expect(conTab).not.toContain('Zorgverdeling.pdf');
  });

  it('pensioenbestand gaat naar Convenant-tab, niet naar OP-tab', () => {
    const rDocs = [
      { bestandsnaam: 'Ouderschapsplan.pdf', doc_type: 'ouderschapsplan' },
      { bestandsnaam: 'Convenant.pdf',       doc_type: 'convenant' },
    ];
    const bestanden = [
      f('Ouderschapsplan.pdf'),
      f('Convenant.pdf'),
      f('Pensioenopgave.pdf'),  // contexttype: pensioenopgave → eigenaar: convenant
    ];
    const result = bouwPrimaireBest(rDocs, bestanden, null);

    const opTab  = result[0].map(f => f.name);
    const conTab = result[1].map(f => f.name);

    expect(conTab).toContain('Pensioenopgave.pdf');
    expect(opTab).not.toContain('Pensioenopgave.pdf');
  });
});

describe('bouwPrimaireBest — expliciete contextMap', () => {
  it('contextMap bepaalt exact welke bestanden bij welke tab horen', () => {
    const rDocs = [
      { bestandsnaam: 'Ouderschapsplan.pdf', doc_type: 'ouderschapsplan' },
      { bestandsnaam: 'Convenant.pdf',       doc_type: 'convenant' },
    ];
    const bestanden = [
      f('Ouderschapsplan.pdf'),
      f('Convenant.pdf'),
      f('Pensioenopgave.pdf'),
      f('Zorgverdeling.pdf'),
    ];
    // contextMap wijst pensioen aan OP toe (niet-standaard, maar de opgeslagen data is leidend)
    const contextMap = [
      { bestandsnaam: 'Ouderschapsplan.pdf', context: ['Pensioenopgave.pdf'] },
      { bestandsnaam: 'Convenant.pdf',       context: ['Zorgverdeling.pdf'] },
    ];
    const result = bouwPrimaireBest(rDocs, bestanden, contextMap);

    const opTab  = result[0].map(f => f.name);
    const conTab = result[1].map(f => f.name);

    expect(opTab).toContain('Pensioenopgave.pdf');
    expect(opTab).not.toContain('Zorgverdeling.pdf');
    expect(conTab).toContain('Zorgverdeling.pdf');
    expect(conTab).not.toContain('Pensioenopgave.pdf');
  });

  it('bestandsnaam niet in contextMap → lege context-array (alleen hoofd)', () => {
    const rDocs = [
      { bestandsnaam: 'Ouderschapsplan.pdf', doc_type: 'ouderschapsplan' },
    ];
    const bestanden = [f('Ouderschapsplan.pdf'), f('Bijlage.pdf')];
    const contextMap = [
      // Geen entry voor Ouderschapsplan.pdf
    ];
    const result = bouwPrimaireBest(rDocs, bestanden, contextMap);

    // Alleen het hoofd-document, geen context
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].name).toBe('Ouderschapsplan.pdf');
  });
});
