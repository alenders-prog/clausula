import { describe, it, expect } from 'vitest';
import {
  woorden, bouwSkelet, zoekInSkelet, artikelZoekterm, vindPositie,
  bepaalVolgorde, beoordeelVolgorde, GEEN_TREFFER_BASIS, MELD_TEKENS,
} from '../../src/rapport/doc-volgorde.js';

/** Zoals de aanroeper aanlevert: kleine letters, witruimte ingeklapt. */
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Een ouderschapsplan in het klein: een vroege paragraaf met het getal 11 erin, en
// pas driekwart verderop §11 Feestdagen met de kerstregeling.
const OP = norm(`
  1. Ouderlijk gezag. Ouders oefenen het gezag gezamenlijk uit. De kinderen hebben
  hun hoofdverblijf bij de moeder. Het kinderalimentatiebedrag bedraagt 11 euro per
  dag, jaarlijks geindexeerd volgens de wettelijke indexering van artikel 1:402a BW.
  2. Zorgverdeling. De kinderen verblijven om en om een week bij ieder van de ouders.
  10. Vakanties. De vakanties worden bij helfte verdeeld, waarbij de zomervakantie
  in onderling overleg wordt ingedeeld en gelet is op de mogelijke feestdagen.
  11. Feestdagen. De feestdagen worden op de volgende wijze verdeeld:
  Kerstavond tot en met 2 de kerstdag; de wissel zal op 2 de kerstdag voor het
  ontbijt zijn. Oud en nieuw: even jaren bij vader, oneven jaren bij moeder.
`);

describe('woorden', () => {
  it('haalt woorden los van leestekens, met hun positie', () => {
    const w = woorden('kerstdag; de wissel');
    expect(w.map(x => x.woord)).toEqual(['kerstdag', 'de', 'wissel']);
    expect(w[0].pos).toBe(0);
    expect(w[2].pos).toBe(13);
  });

  it('valt niet om op lege invoer', () => {
    expect(woorden()).toEqual([]);
    expect(woorden('')).toEqual([]);
  });
});

describe('bouwSkelet en zoekInSkelet', () => {
  it('vindt een rij inhoudswoorden terug op de echte tekenpositie', () => {
    const tekst = 'de wissel zal op de tweede kerstdag voor het ontbijt zijn';
    const sk = bouwSkelet(tekst, true);
    const pos = zoekInSkelet(sk, ['wissel', 'tweede', 'kerstdag']);
    expect(pos).toBe(tekst.indexOf('wissel'));
  });

  it('zoekt op hele woorden — "erf" valt niet in "erfenis"', () => {
    const sk = bouwSkelet('vader erfenis moeder woning', true);
    expect(zoekInSkelet(sk, ['erf'])).toBe(-1);
    expect(zoekInSkelet(sk, ['erfenis'])).toBeGreaterThan(-1);
  });

  it('het volledige skelet houdt korte woorden en getallen wél', () => {
    const vol = bouwSkelet('artikel 11 feestdagen', false);
    expect(zoekInSkelet(vol, ['11', 'feestdagen'])).toBeGreaterThan(-1);
    // en het inhoudsskelet niet: 11 is te kort
    expect(zoekInSkelet(bouwSkelet('artikel 11 feestdagen', true), ['11', 'feestdagen'])).toBe(-1);
  });

  it('valt niet om op lege invoer', () => {
    expect(zoekInSkelet(bouwSkelet(''), ['x'])).toBe(-1);
    expect(zoekInSkelet(null, ['x'])).toBe(-1);
    expect(zoekInSkelet(bouwSkelet('abc'), [])).toBe(-1);
  });
});

describe('artikelZoekterm', () => {
  it('weigert een kaal nummer van één of twee cijfers', () => {
    // Dit is de tweede fout: indexOf('11') raakt het eerste bedrag of jaartal in het
    // document en zet een issue uit §11 daarmee bovenaan.
    expect(artikelZoekterm('11')).toBeNull();
    expect(artikelZoekterm('artikel 3')).toBeNull();
    expect(artikelZoekterm('art. 11')).toBeNull();
  });

  it('accepteert een genummerd artikel met meer houvast', () => {
    expect(artikelZoekterm('3.2.1')).toEqual(['3', '2', '1']);
    expect(artikelZoekterm('11 Feestdagen')).toEqual(['11', 'feestdagen']);
  });

  it('strippt het voorvoegsel', () => {
    expect(artikelZoekterm('artikel bankrekeningen')).toEqual(['bankrekeningen']);
  });

  it('valt niet om op lege invoer', () => {
    expect(artikelZoekterm(null)).toBeNull();
    expect(artikelZoekterm('   ')).toBeNull();
    expect(artikelZoekterm('artikel')).toBeNull();
  });
});

describe('vindPositie — de trappen', () => {
  const ctx = {
    docNorm: OP,
    inhoudSkelet: bouwSkelet(OP, true),
    volSkelet:    bouwSkelet(OP, false),
  };

  it('trap 1: een letterlijke passage', () => {
    const r = vindPositie(ctx, { passageNorm: 'de kinderen hebben hun hoofdverblijf bij de moeder' });
    expect(r.trap).toBe('exact');
    expect(r.pos).toBe(OP.indexOf('de kinderen hebben'));
  });

  // Dit is de melding van 31 augustus 2026. De passage staat driekwart door het
  // document, maar wijkt op één plek af (superscript "2ᵈᵉ" werd "2de"), dus de
  // letterlijke trappen missen hem. Vroeger viel hij dan door naar de woordtrappen,
  // en die konden principieel niets vinden — inhoudswoorden aaneengeplakt gezocht in
  // tekst mét stopwoorden.
  it('trap 3: vindt de kerstpassage terug ondanks een afwijking', () => {
    const passage = norm('Kerstavond tot en met 2de kerstdag; de wissel zal op 2de kerstdag voor het ontbijt zijn.');
    const r = vindPositie(ctx, { passageNorm: passage, origPos: 0 });

    expect(r.trap).toBe('woorden4');
    expect(r.pos).toBe(OP.indexOf('kerstavond'));
    // En dat is écht laat in het document, niet vooraan.
    expect(r.pos / OP.length).toBeGreaterThan(0.7);
  });

  it('trap 5: een artikel met houvast mag, ondanks de punt erachter', () => {
    const r = vindPositie(ctx, { passageNorm: 'staat hier niet in', artikel: '11 feestdagen' });
    expect(r.trap).toBe('artikel');
    // In de tekst staat "11. Feestdagen" mét punt; het skelet stapt daaroverheen.
    expect(r.pos).toBe(OP.indexOf('11. feestdagen'));
  });

  it('een kaal artikelnummer springt NIET naar het eerste getal in de tekst', () => {
    const r = vindPositie(ctx, { passageNorm: 'staat hier niet in', artikel: '11', origPos: 2 });
    expect(r.trap).toBe('geen');
    // De vroege "11 euro" mag hem niet naar voren trekken.
    expect(r.pos).toBe(GEEN_TREFFER_BASIS + 2);
  });

  it('niets gevonden → achteraan, in modelvolgorde', () => {
    const a = vindPositie(ctx, { passageNorm: 'volstrekt afwezige zin', origPos: 1 });
    const b = vindPositie(ctx, { passageNorm: 'nog een afwezige zin', origPos: 4 });
    expect(a.trap).toBe('geen');
    expect(a.pos).toBeLessThan(b.pos);
  });

  it('valt niet om op een issue zonder passage of artikel', () => {
    expect(vindPositie(ctx, {}).trap).toBe('geen');
    expect(vindPositie(ctx).trap).toBe('geen');
  });
});

describe('bepaalVolgorde', () => {
  it('zet de kerstkaart achter een kaart uit paragraaf 1', () => {
    // De klacht in het klein: kaart 0 hoort ná kaart 1 te staan.
    const items = [
      { passageNorm: norm('Kerstavond tot en met 2de kerstdag; de wissel zal op 2de kerstdag voor het ontbijt zijn.'), origPos: 0 },
      { passageNorm: 'de kinderen hebben hun hoofdverblijf bij de moeder', origPos: 1 },
    ];
    const { volgorde, diagnose } = bepaalVolgorde({ docNorm: OP, items });

    expect(volgorde).toEqual([1, 0]);
    expect(diagnose.zonderTreffer).toBe(0);
    expect(diagnose.perTrap).toEqual({ exact: 1, woorden4: 1 });
  });

  it('zonder documenttekst blijft de volgorde ongemoeid', () => {
    // Beter de modelvolgorde tonen dan hem op een gok door elkaar gooien.
    const items = [{ passageNorm: 'a' }, { passageNorm: 'b' }];
    const r = bepaalVolgorde({ docNorm: '', items });
    expect(r.volgorde).toEqual([0, 1]);
    expect(r.diagnose.zonderTreffer).toBe(2);
  });

  it('valt niet om op lege invoer', () => {
    expect(bepaalVolgorde().volgorde).toEqual([]);
    expect(bepaalVolgorde({ docNorm: OP, items: null }).volgorde).toEqual([]);
  });
});

// De controle die er niet was. Zonder dit is een lijst die grotendeels op de terugval
// staat niet te onderscheiden van een lijst die echt op documentvolgorde staat.
describe('beoordeelVolgorde', () => {
  it('zwijgt als vrijwel alles is teruggevonden', () => {
    expect(beoordeelVolgorde({ totaal: 10, zonderTreffer: 1 }).ok).toBe(true);
  });

  it('slaat alarm als een derde niet gevonden is', () => {
    const r = beoordeelVolgorde({ totaal: 9, zonderTreffer: 3 });
    expect(r.ok).toBe(false);
    expect(r.melding).toMatch(/3 van 9/);
    expect(r.melding).toMatch(/achteraan/);
  });

  it('zwijgt bij een lege lijst', () => {
    expect(beoordeelVolgorde({ totaal: 0, zonderTreffer: 0 }).ok).toBe(true);
    expect(beoordeelVolgorde().ok).toBe(true);
  });
});

// Aanleiding (1 september 2026), uit een echte analyse: van veertien bevindingen werden
// er tien niet teruggevonden en NUL exact. De lijst stond daardoor grotendeels in
// modelvolgorde. Na opslaan en opnieuw openen klopte diezelfde lijst wél — en dat was het
// bewijs: de passage werd altijd gepseudonimiseerd, maar `_document_tekst` is dat tijdens
// een verse analyse nog niet. Er werd dus in twee alfabetten tegelijk gezocht.
describe('passage en documenttekst staan niet altijd in hetzelfde alfabet', () => {
  const RUW    = norm('De rekening op naam van Erwin Huzen wordt toebedeeld aan de man.');
  const PSEUDO = norm('De rekening op naam van Robin Doorneveld wordt toebedeeld aan de man.');
  const ctxVan = (doc) => ({ docNorm: doc, inhoudSkelet: bouwSkelet(doc, true), volSkelet: bouwSkelet(doc, false) });

  it('vindt de passage in een RUWE documenttekst (verse analyse)', () => {
    const r = vindPositie(ctxVan(RUW), { passages: [RUW, PSEUDO] });
    expect(r.trap).toBe('exact');
  });

  it('vindt hem ook in een GEPSEUDONIMISEERDE tekst (opgeslagen rapport)', () => {
    const r = vindPositie(ctxVan(PSEUDO), { passages: [RUW, PSEUDO] });
    expect(r.trap).toBe('exact');
  });

  it('met maar één variant mist hij de helft van de gevallen', () => {
    // Dit is precies wat er misging: alléén de gepseudonimiseerde variant aanbieden,
    // terwijl het document ruw is.
    expect(vindPositie(ctxVan(RUW), { passages: [PSEUDO] }).trap).toBe('geen');
  });

  it('negeert lege en dubbele varianten', () => {
    const r = vindPositie(ctxVan(RUW), { passages: [null, '', RUW, RUW] });
    expect(r.trap).toBe('exact');
  });

  it('blijft werken met het oude enkelvoudige veld', () => {
    expect(vindPositie(ctxVan(RUW), { passageNorm: RUW }).trap).toBe('exact');
  });

  it('bepaalVolgorde geeft beide varianten door', () => {
    const doc = norm(`Vooraan staat iets anders. ${RUW} En daarna nog een slotzin.`);
    const { volgorde, diagnose } = bepaalVolgorde({ docNorm: doc, items: [
      { passages: [PSEUDO, RUW], origPos: 0 },
      { passages: ['vooraan staat iets anders'], origPos: 1 },
    ] });
    expect(diagnose.zonderTreffer).toBe(0);
    expect(volgorde).toEqual([1, 0]);
  });
});

// ── Wélke passages niet zijn teruggevonden ─────────────────────────────────
//
// Aanleiding (1 september 2026). De melding zei hoevéél: "10 van 14, nul exact". Dat was
// genoeg om de alfabet-asymmetrie aan te wijzen — zo'n verhouding is een patroon.
//
// Voor het geval dat daarna overbleef — één passage die er wél staat en toch niet matcht —
// zegt een getal niets. Ik heb er die dag twee oorzaken voor voorgesteld (een teruggezette
// roepnaam, en een verdwenen tussenvoegsel) en bij naspelen bleken ze allebei onjuist,
// juist omdat ik het geval zelf niet had. Vandaar de tekst erbij.

describe('diagnose.nietGevonden', () => {
  it('noemt welke passages niet zijn teruggevonden, met hun oorspronkelijke plek', () => {
    const { diagnose } = bepaalVolgorde({
      docNorm: 'de kinderen hebben hun hoofdverblijf bij de moeder.',
      items: [
        { passages: ['de kinderen hebben hun hoofdverblijf bij de moeder.'], origPos: 0 },
        { passages: ['een zin die er beslist niet in staat'], origPos: 1 },
      ],
    });
    expect(diagnose.nietGevonden).toEqual([
      { origPos: 1, passage: 'een zin die er beslist niet in staat' },
    ]);
  });

  it('kapt een lange passage af — een schermafdruk moet leesbaar blijven', () => {
    const lang = 'x'.repeat(200);
    const { diagnose } = bepaalVolgorde({ docNorm: 'iets heel anders', items: [{ passages: [lang] }] });
    expect(diagnose.nietGevonden[0].passage).toHaveLength(MELD_TEKENS);
  });

  it('leest ook de oude enkelvoudige schrijfwijze', () => {
    const { diagnose } = bepaalVolgorde({
      docNorm: 'iets heel anders', items: [{ passageNorm: 'afwezige zin', origPos: 3 }],
    });
    expect(diagnose.nietGevonden).toEqual([{ origPos: 3, passage: 'afwezige zin' }]);
  });

  it('blijft leeg als alles is teruggevonden', () => {
    const { diagnose } = bepaalVolgorde({
      docNorm: 'de kinderen hebben hun hoofdverblijf bij de moeder.',
      items: [{ passages: ['de kinderen hebben hun hoofdverblijf bij de moeder.'] }],
    });
    expect(diagnose.nietGevonden).toEqual([]);
  });

  it('heeft dezelfde vorm als er geen documenttekst is', () => {
    // Zonder dit zou `diagnose.nietGevonden.length` omvallen op precies het geval waarin
    // er niets te doorzoeken viel.
    const { diagnose } = bepaalVolgorde({ docNorm: '', items: [{ passages: ['x'] }] });
    expect(diagnose.nietGevonden).toEqual([]);
  });
});
