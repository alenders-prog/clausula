import { describe, it, expect } from 'vitest';
import {
  telHml,
  filterActief,
  kopKlasse,
  hmlSegs,
  maakGrad,
} from '../../src/chips/hml-counts.js';

// ─── telHml ───────────────────────────────────────────────────────────────────

describe('telHml', () => {
  it('telt correct over gemengde issues', () => {
    const issues = [
      { ernst: 'hoog' },
      { ernst: 'hoog' },
      { ernst: 'midden' },
      { ernst: 'laag' },
    ];
    expect(telHml(issues)).toEqual({ h: 2, m: 1, l: 1, tot: 4 });
  });

  it('lege array → alles nul', () => {
    expect(telHml([])).toEqual({ h: 0, m: 0, l: 0, tot: 0 });
  });

  it('telt alleen ernst-waarden, negeert andere velden', () => {
    const issues = [{ ernst: 'hoog', afgehandeld: true }, { ernst: 'midden' }];
    // filterActief is een aparte stap; telHml telt blind
    expect(telHml(issues)).toEqual({ h: 1, m: 1, l: 0, tot: 2 });
  });

  it('onbekende ernst wordt niet geteld', () => {
    const issues = [{ ernst: 'info' }, { ernst: 'kritiek' }];
    expect(telHml(issues)).toEqual({ h: 0, m: 0, l: 0, tot: 0 });
  });
});

// ─── filterActief ─────────────────────────────────────────────────────────────

describe('filterActief', () => {
  const issues = [
    { id: 1, ernst: 'hoog',   negeer: false, afgehandeld: false },
    { id: 2, ernst: 'midden', negeer: true,  afgehandeld: false },
    { id: 3, ernst: 'laag',   negeer: false, afgehandeld: true  },
    { id: 4, ernst: 'hoog',   negeer: false, afgehandeld: false },
  ];

  it('verwijdert negeer=true', () => {
    const actief = filterActief(issues);
    expect(actief.some(i => i.id === 2)).toBe(false);
  });

  it('verwijdert afgehandeld=true', () => {
    const actief = filterActief(issues);
    expect(actief.some(i => i.id === 3)).toBe(false);
  });

  it('behoudt issues met negeer=false en afgehandeld=false', () => {
    const actief = filterActief(issues);
    expect(actief.map(i => i.id)).toEqual([1, 4]);
  });

  it('muteert de originele array niet', () => {
    const kopie = [...issues];
    filterActief(issues);
    expect(issues).toHaveLength(kopie.length);
  });
});

// ─── kopKlasse ────────────────────────────────────────────────────────────────

describe('kopKlasse', () => {
  it('kop-hoog als h > 0', () => {
    expect(kopKlasse({ h: 1, m: 0, l: 0 })).toBe('kop-hoog');
  });

  it('kop-hoog heeft prioriteit boven midden', () => {
    expect(kopKlasse({ h: 1, m: 3, l: 0 })).toBe('kop-hoog');
  });

  it('kop-midden als h=0 en m > 0', () => {
    expect(kopKlasse({ h: 0, m: 2, l: 0 })).toBe('kop-midden');
  });

  it('kop-laag als alleen l > 0', () => {
    expect(kopKlasse({ h: 0, m: 0, l: 5 })).toBe('kop-laag');
  });

  it('kop-leeg als alles nul', () => {
    expect(kopKlasse({ h: 0, m: 0, l: 0 })).toBe('kop-leeg');
  });
});

// ─── hmlSegs ──────────────────────────────────────────────────────────────────

describe('hmlSegs', () => {
  it('bouwt drie segmenten in vaste kleurvolgorde', () => {
    const segs = hmlSegs({ h: 2, m: 1, l: 3 });
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ kleur: '#C82020', n: 2 });
    expect(segs[1]).toMatchObject({ kleur: '#E07200', n: 1 });
    expect(segs[2]).toMatchObject({ kleur: '#2A7260', n: 3 });
  });

  it('nul-waarden worden doorgegeven (maakGrad filtert ze)', () => {
    const segs = hmlSegs({ h: 0, m: 0, l: 0 });
    expect(segs.map(s => s.n)).toEqual([0, 0, 0]);
  });
});

// ─── maakGrad ────────────────────────────────────────────────────────────────

describe('maakGrad', () => {
  it('geeft fallback bij som=0', () => {
    expect(maakGrad([{ kleur: '#aaa', n: 0 }])).toBe('var(--status-ok) 0deg 360deg');
  });

  it('geeft fallback bij lege array', () => {
    expect(maakGrad([])).toBe('var(--status-ok) 0deg 360deg');
  });

  it('één segment → één kleur-stop, geen witte gap', () => {
    const grad = maakGrad([{ kleur: '#C82020', n: 5 }]);
    expect(grad).toContain('#C82020');
    expect(grad).not.toContain('white');
  });

  it('twee segmenten → witte gap tussen segmenten', () => {
    const grad = maakGrad([
      { kleur: '#C82020', n: 1 },
      { kleur: '#2A7260', n: 1 },
    ]);
    expect(grad).toContain('white');
    expect(grad).toContain('#C82020');
    expect(grad).toContain('#2A7260');
  });

  it('geeft een string terug die meerdere stops bevat', () => {
    const grad = maakGrad([{ kleur: '#C82020', n: 2 }, { kleur: '#E07200', n: 3 }]);
    // meerdere comma-gescheiden stops
    expect(grad.split(',').length).toBeGreaterThan(1);
  });

  it('nul-segmenten worden overgeslagen', () => {
    const grad = maakGrad([
      { kleur: '#C82020', n: 0 },
      { kleur: '#2A7260', n: 4 },
    ]);
    expect(grad).not.toContain('#C82020');
    expect(grad).toContain('#2A7260');
  });
});
