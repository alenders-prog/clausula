/**
 * Unit tests — api/_consistentie.js
 * Samenhang tussen de titel van een issue en zijn eigen bevinding.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bouwConsistentieLijst, pasCorrectiesToe, verwijderDuplicaten, MAX_DUPLICAAT_DEEL,
} from '../../api/_consistentie.js';

// Het echte geval dat aanleiding was voor deze controle.
const zorgkorting = {
  onderwerp:  'Zorgkorting-percentages optellen tot meer dan 100%',
  ernst:      'hoog',
  bevinding:  'De toegepaste zorgkortingen bedragen 30% (vader) + 39% (moeder) = 69% in totaal. '
            + 'Conform de Tremanormen worden de zorgkortingen van beide ouders opgeteld.',
  aanbeveling: 'Herbereken de zorgkortingen conform de Tremanormen 2025.',
};

const correctie = {
  index: 0,
  nieuw_onderwerp: 'Zorgkortingspercentages ongebruikelijk en niet gemotiveerd',
  reden: 'Titel beweert overschrijding van 100%; bevinding berekent 69%.',
  ernst_te_hoog: true,
};

// ── bouwConsistentieLijst ────────────────────────────────────────────────────

describe('bouwConsistentieLijst', () => {
  it('nummert de issues en zet titel en bevinding onder elkaar', () => {
    const lijst = bouwConsistentieLijst([zorgkorting]);
    expect(lijst).toContain('[0] TITEL: Zorgkorting-percentages optellen tot meer dan 100%');
    expect(lijst).toContain('BEVINDING: De toegepaste zorgkortingen');
  });

  it('houdt de rekensom heel — die staat middenin de bevinding', () => {
    const lang = { onderwerp: 'X', bevinding: 'a'.repeat(400) + ' 30% + 39% = 69% ' + 'b'.repeat(400) };
    expect(bouwConsistentieLijst([lang])).toContain('30% + 39% = 69%');
  });
});

// ── pasCorrectiesToe ─────────────────────────────────────────────────────────

describe('pasCorrectiesToe', () => {
  it('herschrijft de titel en verlaagt de ernst één stap', () => {
    const { issues, toegepast } = pasCorrectiesToe([zorgkorting], [correctie]);
    expect(issues[0].onderwerp).toBe('Zorgkortingspercentages ongebruikelijk en niet gemotiveerd');
    expect(issues[0].ernst).toBe('midden');
    expect(toegepast).toHaveLength(1);
    expect(toegepast[0].oud).toBe('Zorgkorting-percentages optellen tot meer dan 100%');
  });

  it('laat de rest van het issue ongemoeid', () => {
    const { issues } = pasCorrectiesToe([zorgkorting], [correctie]);
    expect(issues[0].bevinding).toBe(zorgkorting.bevinding);
    expect(issues[0].aanbeveling).toBe(zorgkorting.aanbeveling);
  });

  it('muteert de oorspronkelijke lijst niet', () => {
    pasCorrectiesToe([zorgkorting], [correctie]);
    expect(zorgkorting.onderwerp).toBe('Zorgkorting-percentages optellen tot meer dan 100%');
    expect(zorgkorting.ernst).toBe('hoog');
  });

  it('laat de ernst staan zonder ernst_te_hoog', () => {
    const { issues } = pasCorrectiesToe([zorgkorting], [{ ...correctie, ernst_te_hoog: undefined }]);
    expect(issues[0].ernst).toBe('hoog');
  });

  it('verhoogt de ernst nooit — de controle beoordeelt samenhang, geen ernst', () => {
    const laag = { ...zorgkorting, ernst: 'laag' };
    const { issues } = pasCorrectiesToe([laag], [correctie]);
    expect(issues[0].ernst).toBe('laag');
  });

  it('negeert een index buiten de lijst', () => {
    const { issues, toegepast } = pasCorrectiesToe([zorgkorting], [{ ...correctie, index: 7 }]);
    expect(issues[0].onderwerp).toBe(zorgkorting.onderwerp);
    expect(toegepast).toHaveLength(0);
  });

  it('negeert een niet-numerieke index', () => {
    const { toegepast } = pasCorrectiesToe([zorgkorting], [{ ...correctie, index: '0' }]);
    expect(toegepast).toHaveLength(0);
  });

  it('negeert een te korte titel — liever de oude kop dan een onleesbare', () => {
    const { issues } = pasCorrectiesToe([zorgkorting], [{ ...correctie, nieuw_onderwerp: 'fout' }]);
    expect(issues[0].onderwerp).toBe(zorgkorting.onderwerp);
  });

  it('geeft de lijst ongewijzigd terug bij geen correcties', () => {
    const invoer = [zorgkorting];
    expect(pasCorrectiesToe(invoer, []).issues).toBe(invoer);
    expect(pasCorrectiesToe(invoer, null).issues).toBe(invoer);
    expect(pasCorrectiesToe(invoer, undefined).issues).toBe(invoer);
  });

  it('overleeft een lege issuelijst', () => {
    expect(pasCorrectiesToe([], [correctie]).issues).toEqual([]);
    expect(pasCorrectiesToe(null, [correctie]).issues).toBe(null);
  });

  it('past meerdere correcties toe op de juiste issues', () => {
    const lijst = [zorgkorting, { onderwerp: 'Tweede issue', ernst: 'midden', bevinding: 'x' }];
    const { issues, toegepast } = pasCorrectiesToe(lijst, [
      correctie,
      { index: 1, nieuw_onderwerp: 'Herschreven tweede issue', reden: 'r' },
    ]);
    expect(issues[0].onderwerp).toContain('ongebruikelijk');
    expect(issues[1].onderwerp).toBe('Herschreven tweede issue');
    expect(issues[1].ernst).toBe('midden');
    expect(toegepast).toHaveLength(2);
  });
});

// ── Herhalingen ────────────────────────────────────────────────────────────
//
// Aanleiding (1 september 2026): in een testrun stond de informatieplicht twee keer in
// het rapport. Het serverlog liet zien dat déze stap de dubbeling wél zag — ze schreef
// het in het redenveld van een titelcorrectie die niets veranderde — maar er geen veld
// voor had om iets mee te doen. Dat veld is er nu, en dit is de bewaking eromheen.
//
// Verwijderen is de enige onomkeerbare handeling in de hele keten. De tests hieronder
// gaan dus vooral over wat er NIET verwijderd mag worden.

describe('verwijderDuplicaten', () => {
  const lijst = (n) => Array.from({ length: n }, (_, i) => ({
    onderwerp: `Issue ${i}`, ernst: 'midden', bevinding: `bevinding ${i}`,
  }));

  it('verwijdert de latere vermelding en houdt de eerdere', () => {
    const invoer = lijst(4);
    const { issues, verwijderd } = verwijderDuplicaten(invoer, [
      { index: 3, van: 1, reden: 'zelfde tekortkoming' },
    ]);
    expect(issues.map(i => i.onderwerp)).toEqual(['Issue 0', 'Issue 1', 'Issue 2']);
    expect(verwijderd).toEqual([
      { index: 3, van: 1, reden: 'zelfde tekortkoming', onderwerp: 'Issue 3' },
    ]);
    expect(invoer).toHaveLength(4);        // de invoer blijft ongemoeid
  });

  it('weigert een verwijzing naar een LATER issue', () => {
    // Zou dit mogen, dan verdwijnt de eerste vermelding en blijft de latere staan —
    // en dan klopt de documentvolgorde niet meer met wat de mediator leest.
    const { issues, verwijderd } = verwijderDuplicaten(lijst(4), [
      { index: 1, van: 3, reden: 'omgekeerd' },
    ]);
    expect(issues).toHaveLength(4);
    expect(verwijderd).toEqual([]);
  });

  it('weigert een issue dat naar zichzelf verwijst', () => {
    expect(verwijderDuplicaten(lijst(3), [{ index: 1, van: 1, reden: 'zichzelf' }]).issues)
      .toHaveLength(3);
  });

  it('houdt bij een keten precies het eerste issue over en logt dát nummer', () => {
    // 2 ← 5 ← 7. Dat er één overblijft volgt al uit regel 1: het laagste gemelde
    // nummer heeft een anker dat nóg lager ligt en dus zelf niet gemeld kan zijn.
    // Wat hier extra wordt vastgelegd is het logboek: [7] moet doorverwijzen naar
    // [2], niet naar [5] — want [5] is er straks niet meer.
    const { issues, verwijderd } = verwijderDuplicaten(lijst(8), [
      { index: 5, van: 2, reden: 'a' },
      { index: 7, van: 5, reden: 'b' },
    ]);
    expect(issues.map(i => i.onderwerp)).toEqual(
      ['Issue 0', 'Issue 1', 'Issue 2', 'Issue 3', 'Issue 4', 'Issue 6']);
    expect(verwijderd.find(d => d.index === 7).van).toBe(2);   // doorverwezen naar het anker
  });

  it('negeert de hele opgave als er te veel wegvalt', () => {
    // Vijf van tien is meer dan MAX_DUPLICAAT_DEEL. Dan is er iets grondig mis en is
    // een lijst mét dubbelingen beter dan een lijst waar de helft uit is: het eerste
    // ziet de mediator, het tweede niet.
    const { issues, verwijderd, genegeerd } = verwijderDuplicaten(lijst(10),
      [5, 6, 7, 8, 9].map(i => ({ index: i, van: 0, reden: 'alles hetzelfde' })));
    expect(issues).toHaveLength(10);
    expect(verwijderd).toEqual([]);
    expect(genegeerd).toMatch(/5 van 10/);
  });

  it('blijft net onder de grens wél verwijderen', () => {
    const { issues, genegeerd } = verwijderDuplicaten(lijst(10),
      [6, 7, 8, 9].map(i => ({ index: i, van: 0, reden: 'x' })));
    expect(issues).toHaveLength(6);
    expect(genegeerd).toBe('');
    expect(MAX_DUPLICAAT_DEEL).toBe(0.4);
  });

  it('negeert onbruikbare of buiten-bereik indices', () => {
    const { issues } = verwijderDuplicaten(lijst(3), [
      { index: 9, van: 0, reden: 'bestaat niet' },
      { index: 2, van: -1, reden: 'negatief' },
      { index: '1', van: 0, reden: 'geen getal' },
      { index: 1.5, van: 0, reden: 'geen geheel getal' },
      null,
    ]);
    expect(issues).toHaveLength(3);
  });

  it('doet niets zonder opgave of zonder issues', () => {
    const invoer = lijst(3);
    expect(verwijderDuplicaten(invoer, []).issues).toBe(invoer);
    expect(verwijderDuplicaten(invoer, null).issues).toBe(invoer);
    expect(verwijderDuplicaten([], [{ index: 1, van: 0, reden: 'x' }]).issues).toEqual([]);
  });
});

describe('een correctie die niets verandert telt niet mee', () => {
  it('slaat een titelcorrectie over die dezelfde titel teruggeeft', () => {
    // Precies wat er in het log stond: de titel bleef gelijk en de enige echte
    // waarneming ("dit is identiek aan issue [2]") zat in het redenveld.
    const lijst = [{ onderwerp: 'Informatieplicht ontbreekt', ernst: 'midden', bevinding: 'x' }];
    const { issues, toegepast } = pasCorrectiesToe(lijst, [{
      index: 0,
      nieuw_onderwerp: 'Informatieplicht ontbreekt',
      reden: 'Dit is identiek aan issue [2].',
      ernst_te_hoog: true,
    }]);
    expect(toegepast).toEqual([]);
    expect(issues[0].ernst).toBe('midden');   // en de ernst gaat dus ook niet omlaag
  });
});

describe('analyseer.js past de herhalingen ook echt toe', () => {
  const bron = readFileSync(new URL('../../api/analyseer.js', import.meta.url), 'utf8');

  it('roept verwijderDuplicaten aan ná de titelcorrecties', () => {
    expect(bron).toMatch(/verwijderDuplicaten\(aangepast, res\?\.duplicaten\)/);
    expect(bron.indexOf('pasCorrectiesToe(issues'))
      .toBeLessThan(bron.indexOf('verwijderDuplicaten(aangepast'));
  });

  it('geeft de ontdubbelde lijst terug, niet de aangepaste', () => {
    // Een aanroep waarvan de uitkomst niet wordt gebruikt is precies het soort fout
    // dat geen enkele test ziet als je alleen de aanroep controleert.
    expect(bron).toMatch(/return ontdubbeld;/);
  });
});

describe('ontdubbelen mag niet verzachten', () => {
  // Het geval uit de eerste evalrun mét deze stap. Terecht als herhaling gemeld, maar
  // de mediator zag het gebrek daarna als 'midden' in plaats van 'hoog'.
  const informatieplicht = [
    { onderwerp: 'Zorgregeling onvolledig', ernst: 'midden', bevinding: 'a' },
    { onderwerp: 'Vakantieregeling ontbreekt', ernst: 'laag', bevinding: 'b' },
    { onderwerp: 'Informatie- en consultatieverplichting ontbreekt', ernst: 'midden', bevinding: 'c' },
    { onderwerp: 'Informatieplicht (art. 1:377b BW) ontbreekt', ernst: 'hoog', bevinding: 'd' },
  ];

  it('tilt de ernst van het blijvende issue op naar de zwaarste van de groep', () => {
    const { issues, verwijderd } = verwijderDuplicaten(informatieplicht, [
      { index: 3, van: 2, reden: 'dezelfde tekortkoming' },
    ]);
    expect(issues).toHaveLength(3);
    expect(issues[2].onderwerp).toBe('Informatie- en consultatieverplichting ontbreekt');
    expect(issues[2].ernst).toBe('hoog');
    expect(verwijderd[0].ernstNaar).toBe('hoog');
    expect(informatieplicht[2].ernst).toBe('midden');   // de invoer blijft ongemoeid
  });

  it('verlaagt de ernst nooit', () => {
    // Andersom: het zwaarste issue blijft staan, het lichtere verdwijnt. De ernst
    // van wat blijft mag daar niet door zakken.
    // Opvulling erbij: met twee issues zou één verwijdering al boven de 40%-grens
    // uitkomen en werd de opgave genegeerd — dan toetst deze test iets anders dan
    // ze belooft. (Gemerkt doordat ze meteen rood ging.)
    const omgekeerd = [
      { onderwerp: 'Informatieplicht ontbreekt', ernst: 'hoog', bevinding: 'a' },
      { onderwerp: 'Informatieafspraken onvolledig', ernst: 'laag', bevinding: 'b' },
      { onderwerp: 'Opvulling een', ernst: 'laag', bevinding: 'c' },
      { onderwerp: 'Opvulling twee', ernst: 'laag', bevinding: 'd' },
    ];
    const { issues, verwijderd } = verwijderDuplicaten(omgekeerd, [
      { index: 1, van: 0, reden: 'zelfde' },
    ]);
    expect(issues[0].ernst).toBe('hoog');
    expect(verwijderd[0].ernstNaar).toBeUndefined();
  });

  it('neemt bij een groep de zwaarste van allemaal', () => {
    const groep = [
      { onderwerp: 'Basis', ernst: 'laag', bevinding: 'a' },
      { onderwerp: 'Herhaling een', ernst: 'midden', bevinding: 'b' },
      { onderwerp: 'Herhaling twee', ernst: 'hoog', bevinding: 'c' },
      { onderwerp: 'Herhaling drie', ernst: 'laag', bevinding: 'd' },
      ...Array.from({ length: 6 }, (_, i) => ({ onderwerp: `Opvulling ${i}`, ernst: 'laag', bevinding: 'x' })),
    ];
    const { issues } = verwijderDuplicaten(groep, [
      { index: 1, van: 0, reden: 'x' },
      { index: 2, van: 0, reden: 'x' },
      { index: 3, van: 0, reden: 'x' },
    ]);
    expect(issues[0]).toEqual({ onderwerp: 'Basis', ernst: 'hoog', bevinding: 'a' });
    expect(issues).toHaveLength(7);
  });

  it('tilt bij een keten op naar het eindpunt', () => {
    // 0 ← 1 ← 2, met de zwaarste helemaal achteraan. Die ernst moet bij [0] landen,
    // niet bij [1] — want [1] verdwijnt ook.
    const keten = [
      { onderwerp: 'Basis', ernst: 'laag', bevinding: 'a' },
      { onderwerp: 'Herhaling', ernst: 'laag', bevinding: 'b' },
      { onderwerp: 'Herhaling van de herhaling', ernst: 'hoog', bevinding: 'c' },
      ...Array.from({ length: 4 }, (_, i) => ({ onderwerp: `Opvulling ${i}`, ernst: 'laag', bevinding: 'x' })),
    ];
    const { issues } = verwijderDuplicaten(keten, [
      { index: 1, van: 0, reden: 'x' },
      { index: 2, van: 1, reden: 'x' },
    ]);
    expect(issues[0]).toEqual({ onderwerp: 'Basis', ernst: 'hoog', bevinding: 'a' });
    expect(issues).toHaveLength(5);
  });
});
