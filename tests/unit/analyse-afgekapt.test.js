import { describe, it, expect } from 'vitest';
import {
  ontbrekendeDelen, beoordeelAfloop, afkappingMelding,
} from '../../src/analyse/afgekapt.js';

const compleet = () => ({ structuur: { issues: [] }, juridisch: { issues: [] }, balans: { issues: [] } });

describe('ontbrekendeDelen', () => {
  it('zwijgt als alles binnen is', () => {
    expect(ontbrekendeDelen({ 'a.pdf': compleet() }, ['a.pdf'])).toEqual([]);
  });

  it('een leeg resultaat is een geldige uitkomst, geen ontbrekend deel', () => {
    // Een document zónder juridische bevindingen bestaat. Dat als "ontbrekend"
    // melden zou elke schone analyse een waarschuwing geven, en dan leest niemand
    // hem nog.
    expect(ontbrekendeDelen({ 'a.pdf': { structuur: { issues: [] }, juridisch: { issues: [] }, balans: { issues: [] } } }, ['a.pdf']))
      .toEqual([]);
  });

  it('noemt precies wat er mist, per document', () => {
    // Precies de storing van 31-08-2026: het tweede document kreeg zijn
    // bevindingen-aanroep niet af.
    const acc = {
      'convenant.pdf': compleet(),
      'op.pdf':        { structuur: { issues: [] } },
    };
    expect(ontbrekendeDelen(acc, ['convenant.pdf', 'op.pdf'])).toEqual([
      { bestandsnaam: 'op.pdf', ontbreekt: ['juridische toets', 'balans'] },
    ]);
  });

  it('telt null als nog-niet-binnen', () => {
    const acc = { 'a.pdf': { structuur: null, juridisch: { issues: [] }, balans: { issues: [] } } };
    expect(ontbrekendeDelen(acc, ['a.pdf'])[0].ontbreekt).toEqual(['volledigheid']);
  });

  it('een document dat helemaal ontbreekt mist alles', () => {
    expect(ontbrekendeDelen({}, ['a.pdf'])[0].ontbreekt)
      .toEqual(['volledigheid', 'juridische toets', 'balans']);
  });

  it('valt niet om op lege invoer', () => {
    expect(ontbrekendeDelen()).toEqual([]);
    expect(ontbrekendeDelen(null, null)).toEqual([]);
  });
});

describe('beoordeelAfloop', () => {
  it('volledig als klaar binnenkwam en er niets ontbreekt', () => {
    const r = beoordeelAfloop({ klaarOntvangen: true, acc: { 'a.pdf': compleet() }, bestanden: ['a.pdf'] });
    expect(r).toMatchObject({ volledig: true, melding: '' });
  });

  it('een afgebroken stroom telt, ook als er toevallig niets ontbreekt', () => {
    // Zonder dit zou een stroom die precies na het laatste deel wegvalt als
    // "volledig" gelden, terwijl de consolidatie dan nog moest komen.
    const r = beoordeelAfloop({ klaarOntvangen: false, acc: { 'a.pdf': compleet() }, bestanden: ['a.pdf'] });
    expect(r.volledig).toBe(false);
    expect(r.melding).toMatch(/niet volledig afgerond/i);
  });

  it('ontbrekende delen tellen, ook als klaar wél binnenkwam', () => {
    const r = beoordeelAfloop({
      klaarOntvangen: true,
      acc: { 'a.pdf': { structuur: { issues: [] } } }, bestanden: ['a.pdf'],
    });
    expect(r.volledig).toBe(false);
    expect(r.melding).toMatch(/juridische toets/);
  });

  it('valt niet om op lege invoer', () => {
    expect(beoordeelAfloop().volledig).toBe(false);
  });
});

describe('afkappingMelding', () => {
  it('noemt document én onderdeel, en zegt wat de gebruiker eraan heeft', () => {
    const t = afkappingMelding([{ bestandsnaam: 'op.pdf', ontbreekt: ['juridische toets', 'balans'] }]);
    expect(t).toContain('op.pdf');
    expect(t).toContain('juridische toets, balans');
    // Niet alleen dát het misging: wat er wél staat klopt, en wat je nu moet doen.
    expect(t).toMatch(/onvolledig/i);
    expect(t).toMatch(/opnieuw/i);
  });

  it('heeft een bruikbare tekst als er niets specifieks te noemen valt', () => {
    expect(afkappingMelding([])).toMatch(/opnieuw/i);
  });
});
