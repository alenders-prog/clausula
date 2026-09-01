import { describe, it, expect } from 'vitest';
import {
  bouwStatistieken, documentenVan, hoofdCategorie,
  isAfgevinkt, isGenegeerd, bouwVerloop, scoreTraject, MFN_TOTAAL,
} from '../../src/dashboard/statistieken.js';

const iss = (onderwerp, ernst = 'midden', dimensies = ['juridisch'], extra = {}) =>
  ({ onderwerp, ernst, dimensies, ...extra });

const scr = (dossier_id, versie_nr, rapport) => ({ dossier_id, versie_nr, rapport });

// `issuesVan` is op 1 september 2026 weggehaald: geëxporteerd, getest, en door de app
// nooit aangeroepen. Een groene test onder code die niemand draait geeft dekking die er
// niet is — precies de valse zekerheid waardoor `sorteerOpType` maanden onopgemerkt bleef.
// Wat de app wél gebruikt is `documentenVan`, en dat blijft hieronder staan.
describe('documentenVan', () => {
  it('leest een rapport met één document', () => {
    expect(documentenVan({ issues: [iss('a')] })).toHaveLength(1);
  });

  it('leest een rapport met meerdere documenten', () => {
    const r = { documenten: [{ issues: [iss('a')] }, { issues: [iss('b'), iss('c')] }] };
    expect(documentenVan(r)).toHaveLength(2);
  });

  it('een lege documenten-array levert geen documenten op', () => {
    // Niet terugvallen op het rapport zelf: dat gaf eerder bij score.js een rapport
    // zonder documenten een perfecte score.
    expect(documentenVan({ documenten: [] })).toEqual([]);
  });

  it('valt niet om op ontbrekende of rare invoer', () => {
    expect(documentenVan(null)).toEqual([]);
    // Een rapport zonder `documenten` is de enkeldocument-vorm en telt als één
    // document — dat is de tweevorm waar deze functie voor bestaat, geen randgeval.
    expect(documentenVan({})).toEqual([{}]);
  });
});

describe('hoofdCategorie', () => {
  it('kiest de eerste bekende categorie in vaste volgorde', () => {
    expect(hoofdCategorie(iss('a', 'hoog', ['grammatica', 'juridisch']))).toBe('juridisch');
  });

  it('rekent cross_doc onder juridisch', () => {
    // cross_doc is geen eigen rij in de tabel — het is een juridische bevinding die
    // pas tussen twee documenten zichtbaar werd.
    expect(hoofdCategorie(iss('a', 'hoog', ['cross_doc']))).toBe('juridisch');
  });

  it('valt terug op volledigheid', () => {
    expect(hoofdCategorie(iss('a', 'hoog', []))).toBe('volledigheid');
    expect(hoofdCategorie({})).toBe('volledigheid');
  });
});

describe('afgevinkt tegenover genegeerd', () => {
  it('houdt ze strikt uit elkaar', () => {
    expect(isAfgevinkt({ afgehandeld: true })).toBe(true);
    expect(isGenegeerd({ afgehandeld: true })).toBe(false);
    expect(isGenegeerd({ negeer: true })).toBe(true);
  });

  it('een genegeerd punt telt nooit als afgevinkt, ook niet met beide vlaggen', () => {
    // Afgevinkt zegt "verwerkt", genegeerd zegt "dit klopte niet". Optellen wist het
    // signaal waarmee je de kwaliteit van de screening zelf volgt.
    expect(isAfgevinkt({ afgehandeld: true, negeer: true })).toBe(false);
    expect(isGenegeerd({ afgehandeld: true, negeer: true })).toBe(true);
  });
});

describe('bouwStatistieken — kerncijfers', () => {
  const dossiers = [
    { id: 'd1', status: 'actief' }, { id: 'd2', status: 'actief' },
    { id: 'd3', status: 'afgerond' }, { id: 'd4', status: 'gearchiveerd' },
  ];

  it('telt dossiers per status en negeert gearchiveerd', () => {
    const s = bouwStatistieken({ dossiers, screeningen: [] });
    expect(s.kpi.actief).toBe(2);
    expect(s.kpi.afgerond).toBe(1);
  });

  it('telt bevindingen per categorie en ernst', () => {
    const s = bouwStatistieken({ dossiers, screeningen: [
      scr('d1', 1, { issues: [
        iss('a', 'hoog', ['juridisch']),
        iss('b', 'laag', ['grammatica']),
        iss('c', 'midden', ['balans']),
      ] }),
    ] });
    expect(s.kpi.gesignaleerd).toBe(3);
    expect(s.ernst).toMatchObject({ hoog: 1, midden: 1, laag: 1, totaal: 3 });
    const jur = s.perCategorie.find(c => c.naam === 'juridisch');
    expect(jur).toMatchObject({ hoog: 1, totaal: 1 });
  });

  it('telt afgevinkt en genegeerd apart', () => {
    const s = bouwStatistieken({ dossiers, screeningen: [
      scr('d1', 1, { issues: [
        iss('a', 'hoog', ['juridisch'], { afgehandeld: true }),
        iss('b', 'hoog', ['juridisch'], { negeer: true }),
        iss('c', 'hoog', ['juridisch']),
      ] }),
    ] });
    expect(s.kpi.afgevinkt).toBe(1);
    expect(s.kpi.genegeerd).toBe(1);
    // Alleen de derde staat écht nog open.
    expect(s.ernst.openHoog).toBe(1);
  });

  it('valt niet om op een lege invoer', () => {
    const s = bouwStatistieken();
    expect(s.kpi.gesignaleerd).toBe(0);
    expect(s.perCategorie).toHaveLength(5);
    expect(s.topIssues).toEqual([]);
  });
});

describe('bouwStatistieken — MfN', () => {
  it('gebruikt de vaste noemer per documenttype, niet de lengte van de lijst', () => {
    // Een afgekapte elementenlijst zou de noemer stilletjes verkleinen en het
    // percentage aanwezig opblazen.
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { documenten: [{
        doc_type: 'convenant',
        mfn_score: { score_totaal: 15, elementen: [{ status: 'aanwezig' }, { status: 'ontbreekt' }] },
      }] }),
    ] });
    const c = s.mfn.find(m => m.doc_type === 'convenant');
    expect(c.totaal).toBe(15);
    expect(c.pctAanwezig).toBe(7);   // 1 van 15, niet 1 van 2
  });

  it('valt terug op de vaste waarde als score_totaal ontbreekt', () => {
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { documenten: [{ doc_type: 'ouderschapsplan',
        mfn_score: { elementen: [{ status: 'aanwezig' }] } }] }),
    ] });
    expect(s.mfn[0].totaal).toBe(MFN_TOTAAL.ouderschapsplan);
  });

  it('middelt over de documenten van dat type', () => {
    const doc = (aanw) => ({ doc_type: 'convenant', mfn_score: { score_totaal: 15,
      elementen: Array.from({ length: 15 }, (_, i) => ({ status: i < aanw ? 'aanwezig' : 'ontbreekt' })) } });
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { documenten: [doc(12)] }),
      scr('d2', 1, { documenten: [doc(10)] }),
    ] });
    expect(s.mfn[0].documenten).toBe(2);
    expect(s.mfn[0].gemAanwezig).toBe(11);
  });

  it('telt extra_elementen mee', () => {
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { documenten: [{ doc_type: 'convenant', mfn_score: {
        score_totaal: 15, elementen: [{ status: 'aanwezig' }],
        extra_elementen: ['Huisdieren', 'Digitale nalatenschap'] } }] }),
    ] });
    expect(s.mfn[0].extra).toBe(2);
  });
});

describe('scoreTraject', () => {
  it('vergelijkt de eerste met de laatste versie', () => {
    const perDossier = new Map([['d1', [
      scr('d1', 1, { issues: [iss('a', 'hoog', ['juridisch'])] }),   // 0
      scr('d1', 2, { issues: [iss('b', 'laag', ['juridisch'])] }),   // 100
    ]]]);
    expect(scoreTraject(perDossier)).toMatchObject({ scoreEerste: 0, scoreLaatste: 100, scoreDossiers: 1 });
  });

  it('slaat dossiers met één versie over', () => {
    // Bij één versie is er geen "daarna". Meetellen zou een verbetering van nul
    // suggereren die er niet is, en juist die dossiers verwateren het cijfer.
    const perDossier = new Map([['d1', [scr('d1', 1, { issues: [] })]]]);
    expect(scoreTraject(perDossier)).toMatchObject({ scoreEerste: null, scoreDossiers: 0 });
  });

  it('sorteert op versienummer, niet op volgorde in de lijst', () => {
    const perDossier = new Map([['d1', [
      scr('d1', 2, { issues: [iss('b', 'laag', ['juridisch'])] }),
      scr('d1', 1, { issues: [iss('a', 'hoog', ['juridisch'])] }),
    ]]]);
    expect(scoreTraject(perDossier)).toMatchObject({ scoreEerste: 0, scoreLaatste: 100 });
  });
});

describe('bouwVerloop', () => {
  const perDossier = new Map([['d1', [
    scr('d1', 1, { issues: [
      iss('Blijft staan', 'hoog'),
      iss('Wordt opgelost', 'hoog'),
      iss('Wordt genegeerd', 'laag', ['juridisch'], { negeer: true }),
    ] }),
    scr('d1', 2, { issues: [
      iss('Blijft staan', 'hoog'),
      iss('Nieuw ontstaan', 'midden'),
    ] }),
  ]]]);

  it('deelt de bevindingen op in blijft, opgelost, genegeerd en nieuw', () => {
    const v = bouwVerloop(perDossier);
    expect(v).toMatchObject({ blijft: 1, opgelost: 1, genegeerd: 1, nieuw: 1, v1: 3, v2: 2, dossiers: 1 });
  });

  it('telt een bevinding die alleen in de laatste versie staat als nieuw', () => {
    // Dit is het getal dat een vergelijking van twee aantallen (3 → 2) verbergt: er
    // is er één bijgekomen bij het herschrijven.
    expect(bouwVerloop(perDossier).nieuw).toBe(1);
  });

  it('vergelijkt hoofdletterongevoelig op titel', () => {
    const m = new Map([['d1', [
      scr('d1', 1, { issues: [iss('Indexering ontbreekt')] }),
      scr('d1', 2, { issues: [iss('indexering ontbreekt')] }),
    ]]]);
    expect(bouwVerloop(m)).toMatchObject({ blijft: 1, opgelost: 0, nieuw: 0 });
  });

  it('slaat dossiers met één versie over', () => {
    const m = new Map([['d1', [scr('d1', 1, { issues: [iss('a')] })]]]);
    expect(bouwVerloop(m).dossiers).toBe(0);
  });
});

describe('bouwStatistieken — top terugkerende punten', () => {
  it('sorteert op aantal en telt de dossiers waarin ze voorkomen', () => {
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { issues: [iss('Vaak'), iss('Vaak'), iss('Zelden')] }),
      scr('d2', 1, { issues: [iss('Vaak', 'hoog', ['juridisch'], { afgehandeld: true })] }),
    ] });
    expect(s.topIssues[0]).toMatchObject({ onderwerp: 'Vaak', aantal: 3, dossiers: 2 });
    expect(s.topIssues[0].afgevinktPct).toBe(33);
    expect(s.topIssues[1].onderwerp).toBe('Zelden');
  });

  it('slaat bevindingen zonder titel over', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [iss(''), iss('  ')] })] });
    expect(s.topIssues).toEqual([]);
    expect(s.kpi.gesignaleerd).toBe(2);   // ze tellen wél mee in het totaal
  });
});

// Aanleiding: de documenttypekeuze werkte alleen op het MfN-blok. De categorietabel,
// het verloop en de top-lijst bleven staan — een knop die zichtbaar niets doet.
describe('bouwStatistieken — filteren op documenttype', () => {
  const doc = (type, titels) => ({ doc_type: type, issues: titels.map(t => iss(t)) });
  const rijen = [scr('d1', 1, { documenten: [
    doc('convenant', ['Pensioen', 'Woning']),
    doc('ouderschapsplan', ['Zorgregeling']),
  ] })];

  it('telt bij "alle" beide stukken', () => {
    expect(bouwStatistieken({ screeningen: rijen }).kpi.gesignaleerd).toBe(3);
  });

  it('beperkt zich tot het gekozen type', () => {
    expect(bouwStatistieken({ screeningen: rijen, docType: 'convenant' }).kpi.gesignaleerd).toBe(2);
    expect(bouwStatistieken({ screeningen: rijen, docType: 'ouderschapsplan' }).kpi.gesignaleerd).toBe(1);
  });

  it('werkt door in de top-lijst', () => {
    const t = bouwStatistieken({ screeningen: rijen, docType: 'ouderschapsplan' }).topIssues;
    expect(t.map(x => x.onderwerp)).toEqual(['Zorgregeling']);
  });

  it('valt terug op de classificatie van de screening', () => {
    // Een rapport met één document draagt zelf geen doc_type; dat staat dan in de
    // classificatie van de screening.
    const s = { dossier_id: 'd1', versie_nr: 1, classificatie: { doc_type: 'convenant' },
                rapport: { issues: [iss('Pensioen')] } };
    expect(bouwStatistieken({ screeningen: [s], docType: 'convenant' }).kpi.gesignaleerd).toBe(1);
    expect(bouwStatistieken({ screeningen: [s], docType: 'ouderschapsplan' }).kpi.gesignaleerd).toBe(0);
  });

  it('telt een document zonder herkenbaar type alleen onder "alle"', () => {
    const s = scr('d1', 1, { issues: [iss('Naamloos')] });
    expect(bouwStatistieken({ screeningen: [s] }).kpi.gesignaleerd).toBe(1);
    expect(bouwStatistieken({ screeningen: [s], docType: 'convenant' }).kpi.gesignaleerd).toBe(0);
  });
});

// De dossierkaart zet twee ringen naast elkaar: links alles wat de screening vond,
// rechts wat daarvan nog openstaat. Dat is een ZELFVERGELIJKING binnen één analyse.
// Ik had eerst versies vergeleken, en dat bleef bij dit kantoor altijd leeg — de
// meeste dossiers hebben één analyse, terwijl er wel degelijk voortgang is.
describe('bouwVoorNa — gevonden tegenover nog open', () => {
  it('rekent afgevinkte punten weg uit de rechterring', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog'), iss('b', 'midden', ['juridisch'], { afgehandeld: true }), iss('c', 'laag'),
    ] })] });
    expect(s.ernstVoorNa.voor).toMatchObject({ hoog: 1, midden: 1, laag: 1, totaal: 3 });
    expect(s.ernstVoorNa.na).toMatchObject({ hoog: 1, midden: 0, laag: 1, totaal: 2 });
    expect(s.ernstVoorNa.beoordeeld).toBe(1);
  });

  it('telt genegeerde punten links MEE en rechts niet', () => {
    // Zoals op de kaart: het "voor"-totaal hoort te kloppen met wat de mediator bij de
    // analyse zag, ook als hij een punt daarna heeft weggeklikt.
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [
      iss('a', 'hoog'), iss('b', 'hoog', ['juridisch'], { negeer: true }),
    ] })] });
    expect(s.ernstVoorNa.voor.totaal).toBe(2);
    expect(s.ernstVoorNa.na.totaal).toBe(1);
    expect(s.ernstVoorNa.beoordeeld).toBe(1);
  });

  it('is nul beoordeeld als er niets is aangeraakt', () => {
    const s = bouwStatistieken({ screeningen: [scr('d1', 1, { issues: [iss('a'), iss('b')] })] });
    expect(s.ernstVoorNa.beoordeeld).toBe(0);
    expect(s.ernstVoorNa.voor.totaal).toBe(s.ernstVoorNa.na.totaal);
  });

  it('werkt over meerdere analyses heen', () => {
    const s = bouwStatistieken({ screeningen: [
      scr('d1', 1, { issues: [iss('a', 'hoog', ['juridisch'], { afgehandeld: true })] }),
      scr('d2', 1, { issues: [iss('b', 'laag')] }),
    ] });
    expect(s.ernstVoorNa.voor.totaal).toBe(2);
    expect(s.ernstVoorNa.na.totaal).toBe(1);
  });
});
