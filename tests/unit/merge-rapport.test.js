import { describe, it, expect } from 'vitest';
import { bouwSubRapport } from '../../src/rapport/merge-rapport.js';

const BASIS_RP = {
  samenvatting: 'Samenvatting van het OP',
  mfn_score:    { totaal: 8 },
  _concepts:    { ouderschapsplan: 'concept-op-tekst' },
  issues:       [{ onderwerp: 'Issue A' }],
};

describe('bouwSubRapport — samenvatting', () => {
  it('gebruikt samenvatting van subRap als die aanwezig is', () => {
    const subRap = { samenvatting: 'Samenvatting Convenant', doc_type: 'convenant' };
    const result = bouwSubRapport(BASIS_RP, subRap);
    expect(result.samenvatting).toBe('Samenvatting Convenant');
  });

  it('geeft lege string als subRap geen samenvatting heeft (NIET de basis-samenvatting)', () => {
    const subRap = { doc_type: 'convenant' };
    const result = bouwSubRapport(BASIS_RP, subRap);
    // Dit is de kritieke regressietest: OP-samenvatting mag NIET doorsijpelen naar Convenant-tab
    expect(result.samenvatting).toBe('');
  });

  it('geeft lege string bij lege subRap ({})', () => {
    const result = bouwSubRapport(BASIS_RP, {});
    expect(result.samenvatting).toBe('');
  });

  it('geeft lege string als samenvatting expliciet undefined is', () => {
    const result = bouwSubRapport(BASIS_RP, { samenvatting: undefined });
    expect(result.samenvatting).toBe('');
  });
});

describe('bouwSubRapport — velden uit rp en subRap', () => {
  it('subRap-velden overschrijven rp-velden', () => {
    const subRap = { mfn_score: { totaal: 5 }, doc_type: 'convenant' };
    const result = bouwSubRapport(BASIS_RP, subRap);
    expect(result.mfn_score.totaal).toBe(5);
  });

  it('rp-velden blijven bewaard als subRap ze niet overschrijft', () => {
    const subRap = { doc_type: 'convenant' };
    const result = bouwSubRapport(BASIS_RP, subRap);
    expect(result.issues).toEqual(BASIS_RP.issues);
  });

  it('muteert rp niet', () => {
    const rpKopie = { ...BASIS_RP };
    bouwSubRapport(BASIS_RP, { samenvatting: 'Nieuw' });
    expect(BASIS_RP.samenvatting).toBe(rpKopie.samenvatting);
  });
});

describe('bouwSubRapport — _concepts behoud', () => {
  it('voorgaandConcepten worden samengevoegd met merged._concepts', () => {
    const subRap = { _concepts: { convenant: 'concept-conv-tekst' } };
    const voorgaand = { ouderschapsplan: 'bewaard-op-concept' };
    const result = bouwSubRapport(BASIS_RP, subRap, voorgaand);
    expect(result._concepts.convenant).toBe('concept-conv-tekst');
    expect(result._concepts.ouderschapsplan).toBe('bewaard-op-concept');
  });

  it('zonder voorgaandConcepten blijft _concepts ongewijzigd', () => {
    const subRap = { _concepts: { convenant: 'nieuw' } };
    const result = bouwSubRapport(BASIS_RP, subRap, null);
    expect(result._concepts).toEqual({ convenant: 'nieuw' });
  });

  it('voorgaandConcepten overschrijven niet als merged ze al heeft', () => {
    const subRap   = { _concepts: { convenant: 'vers-concept' } };
    const voorgaand = { convenant: 'oud-concept' };
    const result = bouwSubRapport(BASIS_RP, subRap, voorgaand);
    // voorgaand komt ná merged in spread → overschrijft
    expect(result._concepts.convenant).toBe('oud-concept');
  });
});
