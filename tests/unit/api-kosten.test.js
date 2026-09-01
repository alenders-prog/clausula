import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  kostenVanUsage, normaliseerModel, bouwVerbruikRegel, veiligeFase, veiligeUuid, foutsoortVan,
  PRIJZEN, CACHE_LEES_FACTOR, CACHE_SCHRIJF_FACTOR,
} from '../../src/api/kosten.js';

const usage = (over = {}) => ({
  input_tokens: 0, output_tokens: 0,
  cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...over,
});

describe('kostenVanUsage — de gewone tarieven', () => {
  it('rekent invoer en uitvoer tegen de prijs van het model', () => {
    // Sonnet: $3 invoer, $15 uitvoer per miljoen.
    const r = kostenVanUsage(usage({ input_tokens: 1e6, output_tokens: 1e6 }), 'claude-sonnet-4-6');
    expect(r.usd).toBeCloseTo(18, 6);
  });

  it('rekent Opus duurder dan Sonnet', () => {
    const s = kostenVanUsage(usage({ output_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    const o = kostenVanUsage(usage({ output_tokens: 1e6 }), 'claude-opus-5').usd;
    expect(o).toBeGreaterThan(s);
  });

  it('geeft nul bij een lege aanroep', () => {
    expect(kostenVanUsage(usage(), 'claude-sonnet-4-6').usd).toBe(0);
    expect(kostenVanUsage(null, 'claude-sonnet-4-6').usd).toBe(0);
  });
});

// Dit is de plek waar het stil misgaat. Cache LEZEN kost een tiende, cache SCHRIJVEN
// een kwart méér. Wie die verwisselt rekent zichzelf twaalfeneenhalf keer rijk of arm,
// en aan het bedrag is niet te zien dat er iets niet klopt.
describe('kostenVanUsage — de cachefactoren', () => {
  it('rekent cache lezen tegen een tiende van de invoerprijs', () => {
    const gewoon = kostenVanUsage(usage({ input_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    const gelezen = kostenVanUsage(usage({ cache_read_input_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    expect(gelezen).toBeCloseTo(gewoon * CACHE_LEES_FACTOR, 6);
    expect(gelezen).toBeCloseTo(0.30, 6);
  });

  it('rekent cache aanleggen een kwart duurder dan gewone invoer', () => {
    const gewoon = kostenVanUsage(usage({ input_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    const geschreven = kostenVanUsage(usage({ cache_creation_input_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    expect(geschreven).toBeCloseTo(gewoon * CACHE_SCHRIJF_FACTOR, 6);
    expect(geschreven).toBeCloseTo(3.75, 6);
  });

  it('lezen is twaalfeneenhalf keer goedkoper dan aanleggen', () => {
    // De verhouding die het hele nut van caching bepaalt. Klopt die niet, dan is het
    // antwoord op "werkt de cache?" onbetrouwbaar.
    const lees = kostenVanUsage(usage({ cache_read_input_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    const schrijf = kostenVanUsage(usage({ cache_creation_input_tokens: 1e6 }), 'claude-sonnet-4-6').usd;
    expect(schrijf / lees).toBeCloseTo(12.5, 3);
  });

  it('telt de vier soorten bij elkaar op', () => {
    const r = kostenVanUsage(usage({
      input_tokens: 1000, output_tokens: 2000,
      cache_read_input_tokens: 3000, cache_creation_input_tokens: 4000,
    }), 'claude-sonnet-4-6');
    const verwacht = (1000 * 3 + 2000 * 15 + 3000 * 0.3 + 4000 * 3.75) / 1e6;
    expect(r.usd).toBeCloseTo(verwacht, 6);
  });

  it('houdt zes decimalen aan', () => {
    // Een zoekronde kost ordegrootte $0,001; op twee decimalen zou dat nul worden.
    const r = kostenVanUsage(usage({ output_tokens: 200 }), 'claude-sonnet-4-6');
    expect(r.usd).toBe(0.003);
    expect(r.usd).toBeGreaterThan(0);
  });
});

describe('normaliseerModel', () => {
  it('haalt een datumachtervoegsel weg', () => {
    expect(normaliseerModel('claude-sonnet-4-6-20260101')).toBe('claude-sonnet-4-6');
  });

  it('laat een bekende naam met rust', () => {
    expect(normaliseerModel('claude-opus-5')).toBe('claude-opus-5');
  });

  it('geeft een onbekende naam ongewijzigd terug', () => {
    expect(normaliseerModel('iets-nieuws')).toBe('iets-nieuws');
  });
});

describe('onbekend model', () => {
  it('rekent door met het standaardtarief en meldt dat', () => {
    // Stilzwijgend nul teruggeven zou een nieuw model gratis laten lijken, en dat is
    // precies wanneer je het wilt weten.
    const r = kostenVanUsage(usage({ output_tokens: 1e6 }), 'claude-toekomst-9');
    expect(r.onbekendModel).toBe(true);
    expect(r.usd).toBeGreaterThan(0);
  });

  it('meldt niets bij een bekend model', () => {
    expect(kostenVanUsage(usage(), 'claude-sonnet-4-6').onbekendModel).toBe(false);
    expect(Object.keys(PRIJZEN).length).toBeGreaterThan(3);
  });
});

// screening_id komt uit de browser: de analyse begint vóórdat de screening bestaat,
// dus de sleutel wordt daar vooraf gemaakt en meegestuurd. De kolom is een uuid — iets
// anders laat het wegschrijven mislukken, en dan is de héle regel weg (kosten, duur,
// tokens) en niet alleen het label.
describe('veiligeUuid', () => {
  it('laat een echte uuid door', () => {
    const u = '11111111-1111-4111-8111-111111111111';
    expect(veiligeUuid(u)).toBe(u);
    expect(veiligeUuid(u.toUpperCase())).toBe(u.toUpperCase());
  });

  it('weigert alles wat geen uuid is', () => {
    expect(veiligeUuid('s1')).toBeNull();
    expect(veiligeUuid('11111111-1111-4111-8111')).toBeNull();
    expect(veiligeUuid('kerstavond')).toBeNull();
    expect(veiligeUuid(null)).toBeNull();
    expect(veiligeUuid(undefined)).toBeNull();
    expect(veiligeUuid(12345)).toBeNull();
  });

  it('de regel houdt zijn cijfers, ook zonder bruikbare sleutel', () => {
    // De meting mag niet sneuvelen op een onbruikbaar label.
    const r = bouwVerbruikRegel({
      endpoint: 'analyseer', fase: 'structuur', model: 'claude-sonnet-4-6',
      screeningId: 'onzin', usage: { input_tokens: 100, output_tokens: 10 },
    });
    expect(r.screening_id).toBeNull();
    expect(r.input_tokens).toBe(100);
    expect(r.kosten_usd).toBeGreaterThan(0);
  });
});

describe('veiligeFase', () => {
  it('laat een bekende fase door', () => {
    expect(veiligeFase('cross_doc')).toBe('cross_doc');
    expect(veiligeFase('zoekronde')).toBe('zoekronde');
  });

  it('vervangt alles wat niet op de lijst staat', () => {
    // Vrije tekst zou hier een zoekterm kunnen worden, en die komt van de gebruiker
    // en kan een cliëntnaam bevatten.
    expect(veiligeFase('alimentatie Bergman')).toBe('onbekend');
    expect(veiligeFase(null)).toBe('onbekend');
    expect(veiligeFase('')).toBe('onbekend');
  });
});

describe('bouwVerbruikRegel', () => {
  const basis = {
    endpoint: 'ai-assistent', fase: 'clausule', model: 'claude-sonnet-4-6',
    usage: usage({ input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 3500 }),
    duurMs: 52340.7, eersteTokenMs: 4120.2,
    organisatieId: 'o1', gebruikerId: 'g1', screeningId: '11111111-1111-4111-8111-111111111111',
  };

  it('zet de tellingen en de kosten in de regel', () => {
    const r = bouwVerbruikRegel(basis);
    expect(r).toMatchObject({
      endpoint: 'ai-assistent', fase: 'clausule', model: 'claude-sonnet-4-6',
      input_tokens: 1000, output_tokens: 2000, cache_lees_tokens: 3500,
      organisatie_id: 'o1', gebruiker_id: 'g1', screening_id: '11111111-1111-4111-8111-111111111111', geslaagd: true,
    });
    expect(r.kosten_usd).toBeGreaterThan(0);
  });

  it('rondt de tijden af op hele milliseconden', () => {
    const r = bouwVerbruikRegel(basis);
    expect(r.duur_ms).toBe(52341);
    expect(r.eerste_token_ms).toBe(4120);
  });

  it('laat een ontbrekende tijd leeg in plaats van nul', () => {
    // Nul zou als "razendsnel" in de percentielen belanden.
    const r = bouwVerbruikRegel({ ...basis, duurMs: undefined, eersteTokenMs: null });
    expect(r.duur_ms).toBeNull();
    expect(r.eerste_token_ms).toBeNull();
  });

  it('bewaart de foutsoort alleen bij een mislukte aanroep', () => {
    expect(bouwVerbruikRegel({ ...basis, geslaagd: false, foutsoort: 'timeout' }).foutsoort).toBe('timeout');
    expect(bouwVerbruikRegel({ ...basis, geslaagd: false }).foutsoort).toBe('onbekend');
    expect(bouwVerbruikRegel(basis).foutsoort).toBeNull();
  });

  it('zet een onbekende fase om', () => {
    expect(bouwVerbruikRegel({ ...basis, fase: 'iets met een naam erin' }).fase).toBe('onbekend');
  });

  it('valt niet om op lege invoer', () => {
    const r = bouwVerbruikRegel();
    expect(r.endpoint).toBe('onbekend');
    expect(r.kosten_usd).toBe(0);
    expect(r.input_tokens).toBe(0);
  });
});

describe('foutsoortVan', () => {
  it('herkent een timeout', () => {
    expect(foutsoortVan(new Error('Tijdslimiet bereikt vóór het antwoord van Claude'))).toBe('timeout');
    expect(foutsoortVan(new Error('Claude antwoordde niet binnen de beschikbare tijd'))).toBe('timeout');
    expect(foutsoortVan({ name: 'TimeoutError', message: 'TimeoutError' })).toBe('timeout');
  });

  it('herkent een afgebroken stroom', () => {
    expect(foutsoortVan(new Error('De verbinding met de assistent viel weg voordat het antwoord af was.')))
      .toBe('afgebroken');
  });

  it('herkent een HTTP-fout', () => {
    expect(foutsoortVan(new Error('Claude 529: overloaded'))).toBe('http');
  });

  it('geeft onbekend bij iets anders', () => {
    expect(foutsoortVan(new Error('boem'))).toBe('onbekend');
    expect(foutsoortVan(null)).toBe('onbekend');
  });
});

// Aanleiding (31 augustus 2026): de consistentiecheck draaide twee keer per analyse en
// stond in api_verbruik als fase 'onbekend' — zijn toolnaam ontbrak in FASE_PER_TOOL.
// Klein bedrag, maar een kolom waarin 'onbekend' zich ophoopt is op termijn onleesbaar:
// dan valt niet meer na te gaan wát daar in zat.
//
// Deze test kijkt in de bron in plaats van naar een tweede lijst die kan verlopen.
describe('elke fase die de endpoints kunnen versturen staat op de woordenlijst', () => {
  const bron = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const faseBlok = () => {
    const m = bron('../../api/analyseer.js').match(/const FASE_PER_TOOL = \{([\s\S]*?)\n\};/);
    expect(m, 'FASE_PER_TOOL niet gevonden — is hij hernoemd?').not.toBeNull();
    return m[1];
  };

  // Dít is de richting waarin het vandaag misging: de tool bestond, de toewijzing niet.
  it('elke tool in het analysepad heeft een fase', () => {
    const namen = new Set();
    for (const p of ['../../api/analyseer.js', '../../api/_consistentie.js']) {
      for (const m of bron(p).matchAll(/^\s*name: '([a-z_]+)',/gm)) namen.add(m[1]);
    }
    expect(namen.size, 'geen toolnamen gevonden — is de vorm veranderd?').toBeGreaterThan(3);

    const blok = faseBlok();
    for (const naam of namen) {
      expect(blok, `tool '${naam}' heeft geen fase in FASE_PER_TOOL en belandt als 'onbekend' in api_verbruik`)
        .toContain(`${naam}:`);
    }
  });

  it('de fasen uit analyseer.js zijn allemaal bekend', () => {
    const fasen = [...faseBlok().matchAll(/:\s*'([a-z_]+)'/g)].map(m => m[1]);
    expect(fasen.length).toBeGreaterThan(3);
    for (const f of fasen) {
      expect(veiligeFase(f), `fase '${f}' staat niet in FASEN`).toBe(f);
    }
  });

  it('de fasen uit ai-assistent.js zijn allemaal bekend', () => {
    // `_meetFase = '…'` is op 1 september 2026 `_zetFase('…')` geworden: de fase zit nu
    // in de AsyncLocalStorage van het verzoek in plaats van in een modulevariabele, zodat
    // twee gelijktijdige vragen elkaars label niet meer overschrijven.
    const fasen = [...bron('../../api/ai-assistent.js')
      .matchAll(/_zetFase\('([a-z_]+)'\)/g)].map(m => m[1]);
    expect(fasen.length).toBeGreaterThan(2);
    for (const f of fasen) {
      expect(veiligeFase(f), `fase '${f}' staat niet in FASEN`).toBe(f);
    }
  });
});
