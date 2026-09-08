/**
 * Unit tests — src/opslag/technische-velden.js
 *
 * Het gemelde geval: een opgeslagen Storage-pad luidde
 * `1788864773258-cz8[WERKGEVER_0]159gjr.pdf` terwijl het bestand
 * `1788864773258-cz8bv159gjr.pdf` heette. De pseudonimisering had `bv` middenin een
 * willekeurige bestandsnaam herkend en vervangen; het rapport wees daarna naar een pad dat
 * niet bestaat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { herstelTechnischeVelden } from '../../src/opslag/technische-velden.js';

const origineel = () => ({
  samenvatting: 'Jan Jansen woont in Almelo',
  _document_bestanden: [
    { pad: 'org/1788864773258-cz8bv159gjr.pdf', naam: 'Convenant fam. Jansen.pdf', type: 'convenant' },
    { pad: 'org/1788864772215-5o56l8pbazg.pdf', naam: 'Zorgverdeling.pdf', type: 'bijlage' },
  ],
});

/** Zoals anonimiseerObj het zou achterlaten: overal vervangen, ook in het pad. */
const gepseudonimiseerd = () => ({
  samenvatting: 'Thomas Bergman woont in [WOONPLAATS_0]',
  _document_bestanden: [
    { pad: 'org/1788864773258-cz8[WERKGEVER_0]159gjr.pdf', naam: 'Convenant fam. Bergman.pdf', type: 'convenant' },
    { pad: 'org/1788864772215-5o56l8pbazg.pdf', naam: 'Zorgverdeling.pdf', type: 'bijlage' },
  ],
});

describe('herstelTechnischeVelden', () => {
  it('zet een verminkt pad terug', () => {
    const uit = herstelTechnischeVelden(origineel(), gepseudonimiseerd());
    expect(uit._document_bestanden[0].pad).toBe('org/1788864773258-cz8bv159gjr.pdf');
  });

  it('laat de bestandsnaam gepseudonimiseerd', () => {
    // `naam` is de naam die de mediator aanleverde en draagt cliëntnamen — die hoort juist
    // wél vervangen te blijven. Alleen de sleutel gaat terug.
    const uit = herstelTechnischeVelden(origineel(), gepseudonimiseerd());
    expect(uit._document_bestanden[0].naam).toBe('Convenant fam. Bergman.pdf');
  });

  it('laat de rest van het rapport ongemoeid', () => {
    const uit = herstelTechnischeVelden(origineel(), gepseudonimiseerd());
    expect(uit.samenvatting).toBe('Thomas Bergman woont in [WOONPLAATS_0]');
  });

  it('raakt een pad dat toch al goed was niet aan', () => {
    const uit = herstelTechnischeVelden(origineel(), gepseudonimiseerd());
    expect(uit._document_bestanden[1].pad).toBe('org/1788864772215-5o56l8pbazg.pdf');
  });

  it('valt niet om als er geen bestanden zijn', () => {
    expect(herstelTechnischeVelden({}, { a: 1 })).toEqual({ a: 1 });
    expect(herstelTechnischeVelden(null, null)).toBeNull();
    expect(herstelTechnischeVelden({ _document_bestanden: [] }, { _document_bestanden: [] }))
      .toEqual({ _document_bestanden: [] });
  });
});

describe('de bedrading', () => {
  it('opslaan() herstelt de paden na het pseudonimiseren', () => {
    // Zonder deze aanroep verwijst elk opgeslagen rapport waarvan een willekeurige
    // bestandsnaam toevallig iets naamachtigs bevat naar een pad dat niet bestaat.
    const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const idx = bron.indexOf('anonimiseerObj(rapportZonderBulk');
    expect(idx).toBeGreaterThan(-1);
    expect(bron.slice(Math.max(0, idx - 500), idx + 200)).toMatch(/herstelTechnischeVelden\(/);
  });
});
