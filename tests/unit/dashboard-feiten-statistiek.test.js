import { describe, it, expect } from 'vitest';
import {
  statistiekenUitFeiten, scoreTrajectUitFeiten, mfnUitFeiten, uitVerwijderdeDossiers,
} from '../../src/dashboard/feiten-statistiek.js';
import { bouwFeitRegel } from '../../src/dashboard/feiten.js';
import { bouwStatistieken } from '../../src/dashboard/statistieken.js';

/** Een feitregel zoals hij uit de database komt. */
const feit = (over = {}) => ({
  screening_id: 's1', dossier_sleutel: 'd1', versie_nr: 1, doc_type: 'convenant',
  geanalyseerd_op: '2026-08-01T10:00:00.000Z',
  issues_totaal: 0, hoog: 0, midden: 0, laag: 0, afgevinkt: 0, genegeerd: 0,
  open_hoog: 0, open_midden: 0, open_laag: 0,
  per_categorie: {}, score: null,
  mfn_totaal: null, mfn_aanwezig: null, mfn_onvolledig: null, mfn_ontbreekt: null, mfn_extra: null,
  ...over,
});

describe('statistiekenUitFeiten — kerncijfers', () => {
  const rijen = [
    feit({ screening_id: 's1', issues_totaal: 3, hoog: 1, midden: 1, laag: 1,
           afgevinkt: 1, open_hoog: 1, open_midden: 0, open_laag: 1,
           per_categorie: { juridisch: { h: 1, m: 1, l: 0 }, grammatica: { h: 0, m: 0, l: 1 } } }),
    feit({ screening_id: 's2', dossier_sleutel: 'd2', issues_totaal: 2, hoog: 0, midden: 2, laag: 0,
           genegeerd: 1, open_midden: 1,
           per_categorie: { balans: { h: 0, m: 2, l: 0 } } }),
  ];

  it('telt op over de regels', () => {
    const s = statistiekenUitFeiten({ feiten: rijen });
    expect(s.kpi.analyses).toBe(2);
    expect(s.kpi.gesignaleerd).toBe(5);
    expect(s.kpi.afgevinkt).toBe(1);
    expect(s.kpi.genegeerd).toBe(1);
    expect(s.ernst).toMatchObject({ hoog: 1, midden: 3, laag: 1, totaal: 5, openHoog: 1 });
  });

  it('telt de categorieën op uit de jsonb', () => {
    const s = statistiekenUitFeiten({ feiten: rijen });
    const jur = s.perCategorie.find(c => c.naam === 'juridisch');
    const bal = s.perCategorie.find(c => c.naam === 'balans');
    expect(jur).toMatchObject({ hoog: 1, midden: 1, laag: 0, totaal: 2 });
    expect(bal).toMatchObject({ midden: 2, totaal: 2 });
  });

  it('negeert een onbekende categorie in de jsonb', () => {
    // Komt er ooit een dimensie bij, dan mag een oude feitregel het scherm niet slopen.
    const s = statistiekenUitFeiten({ feiten: [feit({ per_categorie: { verzonnen: { h: 9 } } })] });
    expect(s.perCategorie.every(c => c.totaal === 0)).toBe(true);
  });

  it('haalt actief en afgerond uit de dossiers, niet uit de feiten', () => {
    // Dat is per definitie de huidige stand; een verwijderd dossier hoort daar niet
    // meer bij te tellen.
    const s = statistiekenUitFeiten({
      dossiers: [{ status: 'actief' }, { status: 'afgerond' }, { status: 'gearchiveerd' }],
      feiten: rijen,
    });
    expect(s.kpi.actief).toBe(1);
    expect(s.kpi.afgerond).toBe(1);
  });

  it('bouwt de voor/na-ringen uit gevonden en openstaand', () => {
    const s = statistiekenUitFeiten({ feiten: rijen });
    expect(s.ernstVoorNa.voor).toMatchObject({ hoog: 1, midden: 3, laag: 1, totaal: 5 });
    expect(s.ernstVoorNa.na).toMatchObject({ hoog: 1, midden: 1, laag: 1, totaal: 3 });
    expect(s.ernstVoorNa.beoordeeld).toBe(2);
  });

  it('laat verloop en topIssues leeg — die hebben titels nodig', () => {
    // Titels staan bewust niet in de feitentabel. Het scherm vult ze aan uit de
    // live-berekening; blijft dat uit, dan meldt het netjes dat er niets is.
    const s = statistiekenUitFeiten({ feiten: rijen });
    expect(s.verloop).toBeNull();
    expect(s.topIssues).toEqual([]);
  });

  it('valt niet om op lege invoer', () => {
    const s = statistiekenUitFeiten();
    expect(s.kpi.gesignaleerd).toBe(0);
    expect(s.perCategorie).toHaveLength(5);
  });
});

describe('statistiekenUitFeiten — documenttype', () => {
  const rijen = [
    feit({ screening_id: 's1', doc_type: 'convenant', issues_totaal: 2, hoog: 2 }),
    feit({ screening_id: 's2', doc_type: 'ouderschapsplan', issues_totaal: 3, laag: 3 }),
    feit({ screening_id: 's3', doc_type: 'convenant+ouderschapsplan', issues_totaal: 5, midden: 5 }),
  ];

  it('telt bij "alle" alles mee', () => {
    expect(statistiekenUitFeiten({ feiten: rijen }).kpi.gesignaleerd).toBe(10);
  });

  it('neemt een gecombineerde analyse mee bij beide typen', () => {
    // Bij een analyse van beide stukken is niet te zeggen welke bevinding bij welk
    // stuk hoorde — de feitregel telt ze samen. Grover dan de live-berekening; dat
    // staat in de uitleg bij de module.
    expect(statistiekenUitFeiten({ feiten: rijen, docType: 'convenant' }).kpi.gesignaleerd).toBe(7);
    expect(statistiekenUitFeiten({ feiten: rijen, docType: 'ouderschapsplan' }).kpi.gesignaleerd).toBe(8);
  });
});

describe('scoreTrajectUitFeiten', () => {
  it('vergelijkt de eerste met de laatste versie per dossier', () => {
    const r = scoreTrajectUitFeiten([
      feit({ screening_id: 's1', dossier_sleutel: 'd1', versie_nr: 1, score: 40 }),
      feit({ screening_id: 's2', dossier_sleutel: 'd1', versie_nr: 2, score: 90 }),
    ]);
    expect(r).toMatchObject({ scoreEerste: 40, scoreLaatste: 90, scoreDossiers: 1 });
  });

  it('slaat dossiers met één versie over', () => {
    const r = scoreTrajectUitFeiten([feit({ score: 40 })]);
    expect(r).toMatchObject({ scoreEerste: null, scoreDossiers: 0 });
  });

  it('sorteert op versienummer, niet op volgorde in de lijst', () => {
    const r = scoreTrajectUitFeiten([
      feit({ screening_id: 's2', versie_nr: 2, score: 90 }),
      feit({ screening_id: 's1', versie_nr: 1, score: 40 }),
    ]);
    expect(r).toMatchObject({ scoreEerste: 40, scoreLaatste: 90 });
  });

  it('werkt ook als het dossier zelf verwijderd is', () => {
    // dossier_sleutel blijft staan als losse uuid — dat is het punt van de tabel.
    const r = scoreTrajectUitFeiten([
      feit({ screening_id: 's1', dossier_sleutel: 'weg', versie_nr: 1, score: 20 }),
      feit({ screening_id: 's2', dossier_sleutel: 'weg', versie_nr: 2, score: 80 }),
    ]);
    expect(r.scoreDossiers).toBe(1);
  });

  it('slaat regels zonder score over', () => {
    const r = scoreTrajectUitFeiten([feit({ versie_nr: 1 }), feit({ screening_id: 's2', versie_nr: 2 })]);
    expect(r.scoreDossiers).toBe(0);
  });
});

describe('mfnUitFeiten', () => {
  const rijen = [
    feit({ screening_id: 's1', doc_type: 'convenant', mfn_totaal: 15, mfn_aanwezig: 12,
           mfn_onvolledig: 2, mfn_ontbreekt: 1, mfn_extra: 3 }),
    feit({ screening_id: 's2', doc_type: 'convenant', mfn_totaal: 15, mfn_aanwezig: 10,
           mfn_onvolledig: 3, mfn_ontbreekt: 2, mfn_extra: 1 }),
  ];

  it('middelt over de analyses', () => {
    const m = mfnUitFeiten(rijen, 'convenant')[0];
    expect(m.documenten).toBe(2);
    expect(m.totaal).toBe(15);
    expect(m.gemAanwezig).toBe(11);
    expect(m.extra).toBe(4);
  });

  it('slaat regels zonder MfN-score over', () => {
    expect(mfnUitFeiten([feit()], 'alle')).toEqual([]);
  });

  it('neemt bij één documenttype alleen de analyses van uitsluitend dat type', () => {
    // Bij een gecombineerde analyse staat er 27 in mfn_totaal en is niet uiteen te
    // halen wat van welk stuk kwam. Meenemen zou een noemer opleveren die niet klopt
    // met het label.
    const gemengd = [...rijen, feit({ screening_id: 's3', doc_type: 'convenant+ouderschapsplan',
      mfn_totaal: 27, mfn_aanwezig: 20, mfn_onvolledig: 4, mfn_ontbreekt: 3, mfn_extra: 0 })];
    expect(mfnUitFeiten(gemengd, 'convenant')[0].documenten).toBe(2);
    expect(mfnUitFeiten(gemengd, 'alle')[0].documenten).toBe(3);
  });
});

describe('uitVerwijderdeDossiers', () => {
  it('telt de regels waarvan de screening niet meer bestaat', () => {
    const rijen = [
      feit({ screening_id: 's1', dossier_sleutel: 'd1', issues_totaal: 4 }),
      feit({ screening_id: 'weg1', dossier_sleutel: 'oud', issues_totaal: 7 }),
      feit({ screening_id: 'weg2', dossier_sleutel: 'oud', issues_totaal: 3 }),
    ];
    const r = uitVerwijderdeDossiers(rijen, new Set(['s1']));
    expect(r).toEqual({ analyses: 2, bevindingen: 10, dossiers: 1 });
  });

  it('geeft nul terug als alles er nog is', () => {
    expect(uitVerwijderdeDossiers([feit()], ['s1']))
      .toEqual({ analyses: 0, bevindingen: 0, dossiers: 0 });
  });

  it('valt niet om op lege invoer', () => {
    expect(uitVerwijderdeDossiers(null, null).analyses).toBe(0);
  });
});

// De twee bronnen moeten hetzelfde antwoord geven zolang er niets is verwijderd.
// Lopen ze uiteen, dan telt het dashboard iets anders dan de dossierlijst en is aan
// niets te zien welke van de twee klopt.
describe('feiten en screeningen geven dezelfde cijfers', () => {
  const iss = (onderwerp, ernst, dimensies = ['juridisch'], extra = {}) =>
    ({ onderwerp, ernst, dimensies, ...extra });

  const screeningen = [
    { id: 's1', dossier_id: 'd1', versie_nr: 1, created_at: '2026-08-01T10:00:00Z',
      rapport: { documenten: [{ doc_type: 'convenant', issues: [
        iss('a', 'hoog'), iss('b', 'midden', ['balans'], { afgehandeld: true }),
        iss('c', 'laag', ['grammatica']), iss('d', 'hoog', ['juridisch'], { negeer: true }),
      ] }] } },
    { id: 's2', dossier_id: 'd1', versie_nr: 2, created_at: '2026-08-05T10:00:00Z',
      rapport: { documenten: [{ doc_type: 'convenant', issues: [iss('a', 'hoog')] }] } },
  ];
  const feiten = screeningen.map(s => bouwFeitRegel(s, { organisatie_id: 'o1' }));

  const uitScreeningen = bouwStatistieken({ screeningen });
  const uitFeiten = statistiekenUitFeiten({ feiten });

  it('geven hetzelfde totaal, afgevinkt en genegeerd', () => {
    expect(uitFeiten.kpi.gesignaleerd).toBe(uitScreeningen.kpi.gesignaleerd);
    expect(uitFeiten.kpi.afgevinkt).toBe(uitScreeningen.kpi.afgevinkt);
    expect(uitFeiten.kpi.genegeerd).toBe(uitScreeningen.kpi.genegeerd);
  });

  it('geven dezelfde ernstverdeling en hetzelfde openstaande aantal', () => {
    expect(uitFeiten.ernst.hoog).toBe(uitScreeningen.ernst.hoog);
    expect(uitFeiten.ernst.midden).toBe(uitScreeningen.ernst.midden);
    expect(uitFeiten.ernst.laag).toBe(uitScreeningen.ernst.laag);
    expect(uitFeiten.ernst.openHoog).toBe(uitScreeningen.ernst.openHoog);
  });

  it('geven dezelfde categorietotalen', () => {
    for (const cat of uitScreeningen.perCategorie) {
      const uit = uitFeiten.perCategorie.find(c => c.naam === cat.naam);
      expect(`${cat.naam}=${uit.totaal}`).toBe(`${cat.naam}=${cat.totaal}`);
    }
  });

  it('geven hetzelfde beoordeeld-aantal voor de twee ringen', () => {
    expect(uitFeiten.ernstVoorNa.beoordeeld).toBe(uitScreeningen.ernstVoorNa.beoordeeld);
    expect(uitFeiten.ernstVoorNa.na.totaal).toBe(uitScreeningen.ernstVoorNa.na.totaal);
  });
});
