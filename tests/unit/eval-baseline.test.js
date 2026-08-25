/**
 * Unit tests — tests/helpers/eval-baseline.mjs
 *
 * De vergelijking moet twee dingen tegelijk kunnen: een echte verandering melden,
 * én zwijgen over de woordkeuze van het model. Lukt dat tweede niet, dan meldt hij
 * bij élke run verschillen — en een signaal dat altijd afgaat leert je het negeren.
 */

import { describe, it, expect } from 'vitest';
import { vingerafdruk, gelijkenis, maakBaseline, vergelijk, verslag } from '../helpers/eval-baseline.mjs';

const issue = (onderwerp, ernst = 'midden') => ({ onderwerp, ernst });

describe('vingerafdruk', () => {
  it('laat leestekens en hoofdletters buiten beschouwing', () => {
    expect([...vingerafdruk('Geschillenregeling / mediationclausule ontbreekt')])
      .toEqual([...vingerafdruk('geschillenregeling of mediationclausule, ONTBREEKT')]);
  });

  it('laat stopwoorden en korte woorden weg', () => {
    expect([...vingerafdruk('De verdeling van het huis is niet geregeld')])
      .toEqual(['verdeling', 'huis', 'geregeld']);
  });

  it('gaat om met een lege titel', () => {
    expect(vingerafdruk('').size).toBe(0);
    expect(vingerafdruk(undefined).size).toBe(0);
  });
});

describe('gelijkenis', () => {
  it('is 1 voor identieke titels', () => {
    expect(gelijkenis(vingerafdruk('Pensioen ontbreekt'), vingerafdruk('Pensioen ontbreekt'))).toBe(1);
  });

  it('is 0 als er niets gedeeld wordt', () => {
    expect(gelijkenis(vingerafdruk('Pensioen ontbreekt'), vingerafdruk('Woning verdeeld'))).toBe(0);
  });

  it('ziet twee schrijfwijzen van hetzelfde gebrek als gelijk', () => {
    const a = vingerafdruk('Geschillenregeling of mediationclausule ontbreekt');
    const b = vingerafdruk('Geschillenregeling / mediationclausule ontbreekt');
    expect(gelijkenis(a, b)).toBe(1);
  });
});

describe('maakBaseline', () => {
  it('telt per ernst', () => {
    const b = maakBaseline([issue('a', 'hoog'), issue('b'), issue('c')]);
    expect(b.aantal).toBe(3);
    expect(b.perErnst).toEqual({ hoog: 1, midden: 2 });
  });

  it('gaat om met een ontbrekende ernst', () => {
    expect(maakBaseline([{ onderwerp: 'x' }]).perErnst).toEqual({ onbekend: 1 });
  });
});

describe('vergelijk', () => {
  const basis = maakBaseline([
    issue('Kinderalimentatie ontbreekt volledig', 'hoog'),
    issue('Geschillenregeling of mediationclausule ontbreekt'),
    issue('Pensioenverevening niet conform WVPS'),
  ]);

  it('meldt geen verschil bij dezelfde bevindingen', () => {
    const r = vergelijk(basis, [
      issue('Kinderalimentatie ontbreekt volledig', 'hoog'),
      issue('Geschillenregeling of mediationclausule ontbreekt'),
      issue('Pensioenverevening niet conform WVPS'),
    ]);
    expect(r.nieuw).toEqual([]);
    expect(r.verdwenen).toEqual([]);
    expect(r.gebleven).toBe(3);
    expect(r.aantalDelta).toBe(0);
  });

  it('zwijgt over een andere formulering van hetzelfde gebrek', () => {
    const r = vergelijk(basis, [
      issue('Kinderalimentatie ontbreekt volledig', 'hoog'),
      issue('Geschillenregeling / mediationclausule ontbreekt'),   // ander leesteken
      issue('Pensioenverevening niet conform WVPS'),
    ]);
    expect(r.nieuw).toEqual([]);
    expect(r.verdwenen).toEqual([]);
  });

  it('meldt een bevinding die erbij komt', () => {
    const r = vergelijk(basis, [
      ...basis.onderwerpen,
      issue('Ondertekeningsblok ontbreekt', 'laag'),
    ]);
    expect(r.nieuw.map(n => n.onderwerp)).toEqual(['Ondertekeningsblok ontbreekt']);
    expect(r.aantalDelta).toBe(1);
    expect(r.ernstDelta).toEqual({ laag: 1 });
  });

  it('meldt een bevinding die verdwijnt — dat is het signaal dat er iets stuk is', () => {
    const r = vergelijk(basis, [
      issue('Geschillenregeling of mediationclausule ontbreekt'),
      issue('Pensioenverevening niet conform WVPS'),
    ]);
    expect(r.verdwenen.map(v => v.onderwerp)).toEqual(['Kinderalimentatie ontbreekt volledig']);
    expect(r.aantalDelta).toBe(-1);
  });

  it('koppelt elke oude bevinding hoogstens één keer', () => {
    // Twee bijna-gelijke titels in de nieuwe run mogen niet allebei op dezelfde
    // oude bevinding matchen — dan zou een echte dubbeling onzichtbaar blijven.
    const r = vergelijk(basis, [
      issue('Kinderalimentatie ontbreekt volledig', 'hoog'),
      issue('Kinderalimentatie ontbreekt volledig', 'hoog'),
      issue('Geschillenregeling of mediationclausule ontbreekt'),
      issue('Pensioenverevening niet conform WVPS'),
    ]);
    expect(r.nieuw).toHaveLength(1);
    expect(r.gebleven).toBe(3);
  });

  it('zegt het als er nog geen baseline is', () => {
    const r = vergelijk(null, [issue('x')]);
    expect(r.heeftBaseline).toBe(false);
    expect(verslag('fixture', r)).toMatch(/geen baseline/);
  });
});

describe('verslag', () => {
  it('vat een schone vergelijking samen', () => {
    const b = maakBaseline([issue('Pensioen ontbreekt')]);
    const t = verslag('convenant', vergelijk(b, [issue('Pensioen ontbreekt')]));
    expect(t).toMatch(/1 gelijk/);
    expect(t).toMatch(/geen bevinding erbij of eraf/);
  });

  it('toont wat erbij kwam en wat eraf ging, met teken', () => {
    const b = maakBaseline([issue('Pensioen ontbreekt')]);
    const t = verslag('convenant', vergelijk(b, [issue('Woning niet verdeeld', 'hoog')]));
    expect(t).toMatch(/\+ hoog\s+Woning niet verdeeld/);
    expect(t).toMatch(/- midden\s+Pensioen ontbreekt/);
  });
});
