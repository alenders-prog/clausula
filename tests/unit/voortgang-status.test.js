import { describe, it, expect } from 'vitest';
import {
  lopendeDimensies, voortgangZin, voortgangStatus,
  AFRONDING_MS, AFRONDING_TEKST,
} from '../../src/analyse/voortgang-status.js';

const LABELS = {
  volledigheid: 'Volledigheid', juridisch: 'Juridische toets', balans: 'Balans',
  grammatica: 'Grammatica', conflicten: 'Conflicten', cross_doc: 'Cross-document',
};

describe('lopendeDimensies', () => {
  it('geeft de lopende dimensies in kleine letters, in vaste volgorde', () => {
    // De sleutelvolgorde van dimLoadt verschilt van de leesvolgorde; zonder een vaste
    // volgorde zou de zin tussen twee tekenbeurten kunnen wisselen zonder dat er iets
    // veranderd is, en dat leest als onrust.
    const d = lopendeDimensies(
      { grammatica: true, juridisch: true, balans: true }, LABELS);
    expect(d).toEqual(['juridische toets', 'balans', 'grammatica']);
  });

  it('telt alleen true — een ontbrekende sleutel is niet hetzelfde als bezig', () => {
    // cross_doc ontbreekt bij één document. Dat is "niet aan de orde", niet "wacht nog".
    expect(lopendeDimensies({ juridisch: true, cross_doc: false }, LABELS))
      .toEqual(['juridische toets']);
    expect(lopendeDimensies({ juridisch: true }, LABELS)).toEqual(['juridische toets']);
  });

  it('negeert waarden die alleen op waar lijken', () => {
    expect(lopendeDimensies({ juridisch: 1, balans: 'ja', grammatica: true }, LABELS))
      .toEqual(['grammatica']);
  });

  it('valt terug op de sleutel als er geen label is', () => {
    expect(lopendeDimensies({ balans: true }, {})).toEqual(['balans']);
  });

  it('valt niet om op lege invoer', () => {
    expect(lopendeDimensies()).toEqual([]);
    expect(lopendeDimensies(null, null)).toEqual([]);
  });
});

describe('voortgangZin', () => {
  it('maakt een leesbare opsomming', () => {
    expect(voortgangZin(['juridische toets', 'balans', 'grammatica']))
      .toBe('Bezig met juridische toets, balans en grammatica…');
  });

  it('krimpt netjes naar één dimensie', () => {
    expect(voortgangZin(['grammatica'])).toBe('Bezig met grammatica…');
  });

  it('heeft een zinnige tekst als er niets bekend is', () => {
    expect(voortgangZin([])).toBe('Bezig met analyseren…');
    expect(voortgangZin()).toBe('Bezig met analyseren…');
  });
});

// Dit is de kern. De oude code koos tussen "de zin" en "de kaarten" op de vraag of er
// al resultaten waren — waardoor de zin verdween zodra het eerste verbeterpunt
// binnenkwam, terwijl er nog volop gewerkt werd. Die twee vragen worden hier gescheiden.
describe('voortgangStatus', () => {
  const bezig = { juridisch: true, balans: true };

  it('bezig zonder resultaten → de grote versie', () => {
    const s = voortgangStatus({ nogBezig: true, aantalIssues: 0, dimLoadt: bezig, labels: LABELS });
    expect(s.modus).toBe('groot');
    expect(s.zin).toBe('Bezig met juridische toets en balans…');
  });

  it('bezig MET resultaten → de compacte versie, niet weg', () => {
    // Precies het geval dat misging: zes verbeterpunten in beeld, balans en grammatica
    // nog onderweg, en het scherm zei niets meer.
    const s = voortgangStatus({ nogBezig: true, aantalIssues: 6, dimLoadt: bezig, labels: LABELS });
    expect(s.modus).toBe('compact');
    expect(s.zin).toBe('Bezig met juridische toets en balans…');
  });

  it('klaar → kort een afronding, want anders is het einde onzichtbaar', () => {
    const s = voortgangStatus({ nogBezig: false, aantalIssues: 6, afgerondOp: 1000, nu: 3000 });
    expect(s.modus).toBe('afronding');
    expect(s.zin).toBe(AFRONDING_TEKST);
  });

  it('de afronding verdwijnt weer', () => {
    const s = voortgangStatus({ nogBezig: false, afgerondOp: 1000, nu: 1000 + AFRONDING_MS });
    expect(s.modus).toBe('geen');
    expect(s.zin).toBe('');
  });

  it('een opgeslagen rapport toont geen afronding', () => {
    // Zonder afgerondOp is er niets afgerond in deze sessie — dan mag er bij het openen
    // van een oud rapport geen "Analyse compleet" opduiken.
    expect(voortgangStatus({ nogBezig: false, aantalIssues: 12 }).modus).toBe('geen');
  });

  it('bezig wint van een net afgeronde vorige ronde', () => {
    // Bij een heranalyse staat afgerondOp nog van de vorige keer. Wat nu draait telt.
    const s = voortgangStatus({
      nogBezig: true, aantalIssues: 3, dimLoadt: bezig, labels: LABELS,
      afgerondOp: 1000, nu: 1500,
    });
    expect(s.modus).toBe('compact');
  });

  it('valt niet om op lege invoer', () => {
    expect(voortgangStatus().modus).toBe('geen');
    expect(() => voortgangStatus(null ?? undefined)).not.toThrow();
  });
});
