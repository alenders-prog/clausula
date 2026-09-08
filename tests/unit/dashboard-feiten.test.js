import { describe, it, expect } from 'vitest';
import { bouwFeitRegels, keurFeitRegel } from '../../src/dashboard/feiten.js';

// Veruit de meeste tests hieronder gaan over één document. bouwFeitRegels levert sinds
// 08-09-2026 een lijst met één regel per documenttype; deze helper pakt de enige.
const bouwFeitRegel = (...a) => bouwFeitRegels(...a)[0] ?? null;

const iss = (onderwerp, ernst = 'midden', dimensies = ['juridisch'], extra = {}) =>
  ({ onderwerp, ernst, dimensies, ...extra });

const screening = (over = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  dossier_id: '22222222-2222-2222-2222-222222222222',
  gebruiker_id: '33333333-3333-3333-3333-333333333333',
  versie_nr: 1,
  created_at: '2026-08-01T10:00:00.000Z',
  rapport: { issues: [] },
  ...over,
});

describe('bouwFeitRegel — tellingen', () => {
  it('telt bevindingen per ernst en per categorie', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [
      iss('a', 'hoog', ['juridisch']),
      iss('b', 'midden', ['juridisch']),
      iss('c', 'laag', ['grammatica']),
    ] } }), { organisatie_id: '44444444-4444-4444-4444-444444444444' });

    expect(r.issues_totaal).toBe(3);
    expect(r).toMatchObject({ hoog: 1, midden: 1, laag: 1 });
    expect(r.per_categorie.juridisch).toEqual({ h: 1, m: 1, l: 0 });
    expect(r.per_categorie.grammatica).toEqual({ h: 0, m: 0, l: 1 });
    expect(r.per_categorie.balans).toEqual({ h: 0, m: 0, l: 0 });
  });

  it('houdt afgevinkt en genegeerd uit elkaar', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [
      iss('a', 'hoog', ['juridisch'], { afgehandeld: true }),
      iss('b', 'hoog', ['juridisch'], { negeer: true }),
      iss('c', 'hoog'),
    ] } }));
    expect(r.afgevinkt).toBe(1);
    expect(r.genegeerd).toBe(1);
    expect(r.issues_totaal).toBe(3);
  });

  it('rekent cross_doc onder juridisch', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a', 'hoog', ['cross_doc'])] } }));
    expect(r.per_categorie.juridisch.h).toBe(1);
  });

  it('splitst een analyse met twee documenttypen in twee regels', () => {
    // Dit was één regel met doc_type 'convenant+ouderschapsplan' en de tellingen
    // opgeteld. Daardoor deed de keuze Convenant/Ouderschapsplan in het dashboard
    // zichtbaar niets: het filter hield de hele regel, inclusief het andere stuk.
    const rs = bouwFeitRegels(screening({ rapport: { documenten: [
      { doc_type: 'ouderschapsplan', issues: [iss('b', 'laag')] },
      { doc_type: 'convenant',       issues: [iss('a', 'hoog')] },
    ] } }));
    expect(rs).toHaveLength(2);
    // Gesorteerd op type, zodat de uitvoer niet van de documentvolgorde afhangt.
    expect(rs.map(r => r.doc_type)).toEqual(['convenant', 'ouderschapsplan']);
    expect(rs[0]).toMatchObject({ issues_totaal: 1, hoog: 1, laag: 0 });
    expect(rs[1]).toMatchObject({ issues_totaal: 1, hoog: 0, laag: 1 });
    // Beide regels wijzen naar dezelfde analyse; samen vormen ze de sleutel.
    expect(new Set(rs.map(r => r.screening_id)).size).toBe(1);
  });

  it('voegt documenten van hetzelfde type samen tot één regel', () => {
    const rs = bouwFeitRegels(screening({ rapport: { documenten: [
      { doc_type: 'convenant', issues: [iss('a', 'hoog')] },
      { doc_type: 'convenant', issues: [iss('b', 'laag')] },
    ] } }));
    expect(rs).toHaveLength(1);
    expect(rs[0].issues_totaal).toBe(2);
  });

  it('geeft een lege lijst als er niets te tellen valt', () => {
    expect(bouwFeitRegels(null)).toEqual([]);
    expect(bouwFeitRegels(screening({ rapport: null }))).toEqual([]);
    expect(bouwFeitRegels(screening({ rapport: { documenten: [] } }))).toEqual([]);
    expect(bouwFeitRegels({ rapport: { issues: [] } })).toEqual([]);   // geen id
  });
});

describe('bouwFeitRegel — MfN', () => {
  const mfnDoc = (type, tot, aanw, onvol, extra = []) => ({
    doc_type: type,
    mfn_score: {
      score_totaal: tot,
      elementen: Array.from({ length: tot }, (_, i) =>
        ({ status: i < aanw ? 'aanwezig' : i < aanw + onvol ? 'onvolledig' : 'ontbreekt' })),
      extra_elementen: extra,
    },
    issues: [],
  });

  it('geeft elk documenttype zijn eigen noemer', () => {
    // Dit telde de noemers op tot 27 (15 + 12), waarna niet meer uiteen te halen was
    // wat van welk stuk kwam — en het MfN-filter, dat exact vergelijkt, liet de ring
    // bij een typekeuze helemaal verdwijnen.
    const rs = bouwFeitRegels(screening({ rapport: { documenten: [
      mfnDoc('convenant', 15, 12, 2), mfnDoc('ouderschapsplan', 12, 9, 2),
    ] } }));
    expect(rs.map(r => [r.doc_type, r.mfn_totaal, r.mfn_aanwezig])).toEqual([
      ['convenant', 15, 12],
      ['ouderschapsplan', 12, 9],
    ]);
  });

  it('gebruikt de vaste noemer als score_totaal ontbreekt', () => {
    // Een afgekapte elementenlijst zou de noemer stilletjes verkleinen en de score
    // opblazen.
    const r = bouwFeitRegel(screening({ rapport: { documenten: [{
      doc_type: 'convenant', issues: [],
      mfn_score: { elementen: [{ status: 'aanwezig' }] },
    }] } }));
    expect(r.mfn_totaal).toBe(15);
  });

  it('telt extra_elementen mee', () => {
    const r = bouwFeitRegel(screening({ rapport: { documenten: [
      mfnDoc('convenant', 15, 12, 2, ['Huisdieren', 'Digitale nalatenschap']),
    ] } }));
    expect(r.mfn_extra).toBe(2);
  });

  it('laat de MfN-velden leeg als er geen MfN-score is', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a')] } }));
    expect(r.mfn_totaal).toBeNull();
    expect(r.mfn_aanwezig).toBeNull();
  });
});

describe('bouwFeitRegel — sleutels en score', () => {
  it('neemt de sleutels over als losse waarden', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a')] } }),
      { organisatie_id: '44444444-4444-4444-4444-444444444444' });
    expect(r.screening_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(r.dossier_sleutel).toBe('22222222-2222-2222-2222-222222222222');
    expect(r.organisatie_id).toBe('44444444-4444-4444-4444-444444444444');
    expect(r.versie_nr).toBe(1);
    expect(r.geanalyseerd_op).toBe('2026-08-01T10:00:00.000Z');
  });

  it('valt voor gebruiker_id terug op die van de screening', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a')] } }));
    expect(r.gebruiker_id).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('geeft elk documenttype zijn eigen score in plaats van één gemiddelde', () => {
    const rs = bouwFeitRegels(screening({ rapport: { documenten: [
      { doc_type: 'convenant',       issues: [iss('a', 'laag', ['juridisch'])] },  // 100
      { doc_type: 'ouderschapsplan', issues: [iss('b', 'hoog', ['juridisch'])] },  // 0
    ] } }));
    expect(rs.map(r => [r.doc_type, r.score])).toEqual([
      ['convenant', 100], ['ouderschapsplan', 0],
    ]);
  });

  it('zet doc_type op "onbekend" als het type niet te bepalen is', () => {
    // Nooit null: in Postgres zijn twee NULL's in een unique index van elkaar
    // verschillend, dus met NULL erin zou opnieuw opslaan rijen bíjschrijven in
    // plaats van bijwerken.
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a')] } }));
    expect(r.doc_type).toBe('onbekend');
  });
});

// Dit is het vangnet dat ertoe doet. Voegt iemand later een veld toe waar tekst in kan
// zitten — een titel "voor de leesbaarheid", een bestandsnaam "handig bij debuggen" —
// dan gaat de tabel persoonsgegevens bevatten en kloppen de bewaarregels niet meer.
// Zie docs/avg-verwerkersovereenkomst.md.
describe('keurFeitRegel — geen inhoud in de feitentabel', () => {
  it('keurt een normale regel goed', () => {
    const r = bouwFeitRegel(screening({ rapport: { documenten: [
      { doc_type: 'convenant', issues: [iss('Pensioen niet geregeld', 'hoog')] },
    ] } }), { organisatie_id: '44444444-4444-4444-4444-444444444444' });
    expect(keurFeitRegel(r)).toEqual([]);
  });

  it('slaat alarm bij een issue-titel', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a')] } }));
    r.onderwerp = 'Beleggingssaldo Peaks NL046344501 mist een komma';
    const bezwaren = keurFeitRegel(r);
    expect(bezwaren).toHaveLength(1);
    expect(bezwaren[0]).toMatch(/onderwerp/);
  });

  it('slaat alarm bij een bestandsnaam', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a')] } }));
    r.bestandsnaam = 'Convenant fam. Schreven-van Zand def2.pdf';
    expect(keurFeitRegel(r)).toHaveLength(1);
  });

  it('laat uuid-velden en het documenttype met rust', () => {
    const r = bouwFeitRegel(screening({ rapport: { documenten: [
      { doc_type: 'ouderschapsplan', issues: [] },
    ] } }), { organisatie_id: '44444444-4444-4444-4444-444444444444' });
    expect(r.doc_type).toBe('ouderschapsplan');
    expect(keurFeitRegel(r)).toEqual([]);
  });

  it('valt niet om op lege invoer', () => {
    expect(keurFeitRegel(null)).toEqual([]);
    expect(keurFeitRegel({})).toEqual([]);
  });
});

// Uit "gevonden min afgevinkt" is niet af te leiden wat er per ernst nog openstaat:
// drie afgevinkte punten kunnen drie lage zijn of drie hoge. Het dashboard heeft dat
// wel nodig voor de ringen "gevonden → nog open" en de regel "nog open, ernst hoog".
describe('bouwFeitRegel — wat er per ernst nog openstaat', () => {
  it('trekt afgevinkte en genegeerde punten van de juiste ernst af', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [
      iss('a', 'hoog'),
      iss('b', 'hoog',   ['juridisch'], { afgehandeld: true }),
      iss('c', 'midden', ['juridisch'], { negeer: true }),
      iss('d', 'laag'),
      iss('e', 'laag'),
    ] } }));
    expect(r).toMatchObject({ hoog: 2, midden: 1, laag: 2 });
    expect(r).toMatchObject({ open_hoog: 1, open_midden: 0, open_laag: 2 });
  });

  it('telt alles als open zolang er niets is aangeraakt', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [iss('a', 'hoog'), iss('b', 'laag')] } }));
    expect(r.open_hoog).toBe(1);
    expect(r.open_laag).toBe(1);
  });

  it('zet het openstaande aantal op nul als alles is afgehandeld', () => {
    const r = bouwFeitRegel(screening({ rapport: { issues: [
      iss('a', 'hoog', ['juridisch'], { afgehandeld: true }),
    ] } }));
    expect(r.hoog).toBe(1);
    expect(r.open_hoog).toBe(0);
  });
});
