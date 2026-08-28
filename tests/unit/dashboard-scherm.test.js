import { describe, it, expect } from 'vitest';
import {
  kpiStripHtml, categorieHtml, verloopHtml, mfnHtml, topIssuesHtml,
  ringSegmenten, getal, komma, mfnTypen,
} from '../../src/dashboard/scherm.js';
import { bouwStatistieken } from '../../src/dashboard/statistieken.js';

const iss = (onderwerp, ernst = 'midden', dimensies = ['juridisch'], extra = {}) =>
  ({ onderwerp, ernst, dimensies, ...extra });
const scr = (dossier_id, versie_nr, rapport) => ({ dossier_id, versie_nr, rapport });

describe('opmaakhulpjes', () => {
  it('zet duizendtallen op zijn Nederlands', () => {
    expect(getal(1413)).toBe('1.413');
    expect(getal(0)).toBe('0');
  });

  it('gebruikt een komma voor decimalen', () => {
    expect(komma(11.4)).toBe('11,4');
    expect(komma(12)).toBe('12,0');
  });
});

describe('ringSegmenten', () => {
  it('verdeelt de omtrek naar rato en schuift elk segment achter het vorige', () => {
    const s = ringSegmenten([{ waarde: 1 }, { waarde: 1 }, { waarde: 2 }], 54);
    expect(s.map(x => x.pct)).toEqual([25, 25, 50]);
    // Het eerste segment begint bovenaan, de rest schuift op.
    expect(parseFloat(s[0].dashoffset)).toBe(0);
    expect(parseFloat(s[1].dashoffset)).toBeLessThan(0);
    expect(parseFloat(s[2].dashoffset)).toBeLessThan(parseFloat(s[1].dashoffset));
  });

  it('vult samen precies de hele ring', () => {
    // Anders blijft er een spleet of overlapt het laatste segment het eerste.
    const straal = 54, omtrek = 2 * Math.PI * straal;
    const s = ringSegmenten([{ waarde: 106 }, { waarde: 379 }, { waarde: 799 }], straal);
    const som = s.reduce((a, x) => a + parseFloat(x.dasharray.split(' ')[0]), 0);
    expect(som).toBeCloseTo(omtrek, 0);
  });

  it('valt niet om als alles nul is', () => {
    const s = ringSegmenten([{ waarde: 0 }, { waarde: 0 }]);
    expect(s.every(x => x.pct === 0)).toBe(true);
  });
});

describe('kpiStripHtml', () => {
  const stats = bouwStatistieken({
    dossiers: [{ id: 'd1', status: 'actief' }, { id: 'd2', status: 'afgerond' }],
    screeningen: [
      scr('d1', 1, { issues: [iss('a', 'hoog'), iss('b', 'laag', ['juridisch'], { afgehandeld: true })] }),
      scr('d1', 2, { issues: [iss('b', 'laag', ['juridisch'], { afgehandeld: true })] }),
    ],
  });

  it('toont de zes kaarten met de juiste getallen', () => {
    const h = kpiStripHtml(stats);
    expect(h).toMatch(/Actieve dossiers/);
    expect(h).toMatch(/Afgeronde dossiers/);
    expect(h).toMatch(/Analyses uitgevoerd/);
    expect(h).toMatch(/Verbeterpunten gesignaleerd/);
    expect(h).toMatch(/Punten afgevinkt/);
    expect(h).toMatch(/Documentscore/);
    expect((h.match(/db-kpi-lbl/g) || [])).toHaveLength(6);
  });

  it('toont het scoretraject als eerste → laatste', () => {
    const h = kpiStripHtml(stats);
    expect(h).toMatch(/→ \d+%/);
  });

  it('zegt het eerlijk als er nog geen tweede versie is', () => {
    // Een traject zonder tweede meting bestaat niet; "0 → 0%" zou een verbetering van
    // nul suggereren die niet gemeten is.
    const leeg = bouwStatistieken({ dossiers: [], screeningen: [scr('d1', 1, { issues: [] })] });
    expect(kpiStripHtml(leeg)).toMatch(/nog geen tweede versie/);
  });

  it('valt niet om op ontbrekende statistieken', () => {
    expect(() => kpiStripHtml(undefined)).not.toThrow();
    expect(kpiStripHtml({})).toMatch(/db-kpi-rij/);
  });
});

describe('categorieHtml', () => {
  it('toont alleen categorieën met bevindingen', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [iss('a', 'hoog', ['juridisch'])] })] });
    const h = categorieHtml(s);
    expect(h).toMatch(/Juridisch/);
    expect(h).not.toMatch(/Grammatica/);   // nul bevindingen → geen lege rij
  });

  it('meldt netjes dat er niets is in plaats van een lege tabel', () => {
    expect(categorieHtml(bouwStatistieken({}))).toMatch(/Nog geen bevindingen/);
  });

  it('toont hoeveel er van de gevonden punten is beoordeeld', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog'), iss('b', 'hoog', ['juridisch'], { afgehandeld: true }),
    ] })] });
    const h = categorieHtml(s);
    expect(h).toMatch(/1 van 2 beoordeeld/);
    expect(h).toMatch(/\+ 50%/);
  });

  it('toont de losse teller zolang er nog niets beoordeeld is', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog'), iss('b', 'hoog'),
    ] })] });
    expect(categorieHtml(s)).toMatch(/2 hoog open/);
  });
});

describe('verloopHtml', () => {
  const s = bouwStatistieken({ screeningen: [
    scr('d1', 1, { issues: [iss('blijft'), iss('weg'), iss('genegeerd', 'laag', ['juridisch'], { negeer: true })] }),
    scr('d1', 2, { issues: [iss('blijft'), iss('nieuw')] }),
  ] });

  it('toont de vier uitkomsten met hun aantallen', () => {
    const h = verloopHtml(s);
    expect(h).toMatch(/Opgelost · 1/);
    expect(h).toMatch(/Genegeerd · 1/);
    expect(h).toMatch(/Blijft staan · 1/);
    expect(h).toMatch(/Nieuw · 1/);
  });

  it('houdt opgelost en genegeerd gescheiden in de uitleg', () => {
    // Samenvoegen tot "afgehandeld" zou het signaal wissen waarmee je ziet of het
    // document is aangepast of de screening ernaast zat.
    expect(verloopHtml(s)).toMatch(/screening zat ernaast/i);
  });

  it('zegt het als er geen tweede versie is', () => {
    const leeg = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [iss('a')] })] });
    expect(verloopHtml(leeg)).toMatch(/geen dossier met een tweede analyse/i);
  });
});

describe('mfnHtml', () => {
  const mfnDoc = (type, tot, aanw, onvol) => ({ doc_type: type, mfn_score: {
    score_totaal: tot,
    elementen: Array.from({ length: tot }, (_, i) =>
      ({ status: i < aanw ? 'aanwezig' : i < aanw + onvol ? 'onvolledig' : 'ontbreekt' })),
  } });

  const s = bouwStatistieken({ screeningen: [
    scr('d1', 1, { documenten: [mfnDoc('convenant', 15, 12, 2), mfnDoc('ouderschapsplan', 12, 9, 2)] }),
  ] });

  it('telt bij "alle" de noemers op tot 27', () => {
    // 15 uit het convenant plus 12 uit het ouderschapsplan. Een gemiddeld aantal over
    // twee verschillende noemers zou een getal zonder betekenis zijn.
    expect(mfnHtml(s, 'alle')).toMatch(/>27</);
  });

  it('toont bij één documenttype alleen die noemer', () => {
    expect(mfnHtml(s, 'convenant')).toMatch(/>15</);
    expect(mfnHtml(s, 'ouderschapsplan')).toMatch(/>12</);
  });

  it('meldt het als dat type er niet is in deze periode', () => {
    const alleen = bouwStatistieken({ screeningen: [scr('d1', 1, { documenten: [mfnDoc('convenant', 15, 12, 2)] })] });
    expect(mfnHtml(alleen, 'ouderschapsplan')).toMatch(/Geen Ouderschapsplan geanalyseerd/i);
  });

  it('meldt netjes dat er geen MfN-score is', () => {
    expect(mfnHtml(bouwStatistieken({}), 'alle')).toMatch(/Nog geen MfN-score/);
  });

  it('mfnTypen geeft alleen bekende documenttypen terug', () => {
    expect(mfnTypen(s).sort()).toEqual(['convenant', 'ouderschapsplan']);
  });
});

describe('topIssuesHtml', () => {
  it('nummert en toont het aantal dossiers', () => {
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { issues: [iss('Vaak'), iss('Vaak')] }),
      scr('d2', 1, { issues: [iss('Vaak'), iss('Soms')] }),
    ] });
    const h = topIssuesHtml(s);
    expect(h).toMatch(/Vaak/);
    expect(h).toMatch(/2 dossiers/);
    expect(h).toMatch(/db-rang">1</);
  });

  it('ontsnapt HTML in een titel', () => {
    // Titels komen van een taalmodel en belanden ongefilterd in de pagina.
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [iss('<img src=x onerror=alert(1)>')] })] });
    const h = topIssuesHtml(s);
    expect(h).not.toMatch(/<img src=x/);
    expect(h).toMatch(/&lt;img/);
  });

  it('meldt netjes dat er niets is', () => {
    expect(topIssuesHtml(bouwStatistieken({}))).toMatch(/Nog geen terugkerende punten/);
  });
});

describe('categorieHtml — totaalregel en de twee ringen', () => {
  it('sluit de tabel af met een totaalregel', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog', ['juridisch']), iss('b', 'laag', ['grammatica']),
    ] })] });
    const h = categorieHtml(s);
    expect(h).toMatch(/<tfoot>/);
    expect(h).toMatch(/Totaal/);
  });

  it('gebruikt exact de opmaak van de dossierkaart', () => {
    // Dezelfde klassen, dezelfde conic-gradient-ringen, dezelfde voortgangsbalk.
    // Eigen varianten bouwen zou twee dingen opleveren die hetzelfde bedoelen en er
    // net anders uitzien — precies wat er eerst stond.
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog'), iss('b', 'midden', ['juridisch'], { afgehandeld: true }),
      iss('c', 'laag'), iss('d', 'laag'),
    ] })] });
    const h = categorieHtml(s);
    expect(h).toMatch(/v2-cmp-grid/);
    expect(h).toMatch(/v2-ring v2-ring-prev/);
    expect(h).toMatch(/v2-ring v2-ring-curr/);
    expect(h).toMatch(/v2-cmp-arrow/);
    expect(h).toMatch(/v2-prog-fill/);
    expect(h).toMatch(/conic-gradient/);
    expect(h).toMatch(/1 van 4 beoordeeld/);
    expect(h).toMatch(/\+ 25%/);
  });

  it('toont één ring als er nog niets beoordeeld is', () => {
    // Twee identieke ringen met een pijl ertussen suggereren voortgang die er niet is.
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [iss('a', 'hoog')] })] });
    const h = categorieHtml(s);
    expect(h).not.toMatch(/v2-cmp-grid/);
    expect(h).toMatch(/db-enkelring/);
    expect(h).toMatch(/1 hoog open/);
  });

  it('zet een vinkje in de rechterring als alles is afgehandeld', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog', ['juridisch'], { afgehandeld: true }),
    ] })] });
    expect(categorieHtml(s)).toMatch(/>✓</);
  });
});

// Aanleiding: bij Ouderschapsplan was nog niets afgevinkt, dus viel die sectie terug
// op een enkele ring — en die stond nog in een andere opmaak dan de twee ringen bij
// Alle en Convenant. Eén documenttype zag er daardoor anders uit dan de rest.
describe('categorieHtml — één ring en twee ringen zien er hetzelfde uit', () => {
  const zonder = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
    iss('a', 'hoog'), iss('b', 'midden'),
  ] })] });
  const met = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
    iss('a', 'hoog'), iss('b', 'midden', ['juridisch'], { afgehandeld: true }),
  ] })] });

  it('gebruiken allebei de ring van de dossierkaart', () => {
    expect(categorieHtml(zonder)).toMatch(/v2-ring v2-ring-curr/);
    expect(categorieHtml(met)).toMatch(/v2-ring v2-ring-curr/);
  });

  it('gebruiken allebei dezelfde conic-gradient', () => {
    expect(categorieHtml(zonder)).toMatch(/conic-gradient\(from -90deg/);
    expect(categorieHtml(met)).toMatch(/conic-gradient\(from -90deg/);
  });

  it('laten geen van beide de oude legendaregels zien', () => {
    for (const h of [categorieHtml(zonder), categorieHtml(met)]) {
      expect(h).not.toMatch(/db-donutblok/);
      expect(h).not.toMatch(/db-regels/);
    }
  });

  it('tonen bij één ring hoeveel er hoog openstaat', () => {
    expect(categorieHtml(zonder)).toMatch(/1 hoog open/);
  });
});
