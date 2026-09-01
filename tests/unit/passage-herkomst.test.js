/**
 * tests/unit/passage-herkomst.test.js
 *
 * De vraag die dit beantwoordt: staat dit citaat in het document dat we analyseren, of
 * komt het uit een bijlage die alleen ter context meeging?
 *
 * De scherpe rand zit niet in "vindt hij het" maar in "wanneer durft hij iets weg te
 * gooien". Die kant is met opzet strenger; het merendeel van de tests hieronder gaat
 * daarover.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HOOFD, BIJLAGE, ONBEKEND, HARDE_TRAPPEN,
  maakHerkomstToets, scheidBijlageIssues,
} from '../../src/rapport/passage-herkomst.js';

// Het echte geval van 1 september 2026, ingekort. De bevinding ging over de schrijfwijze
// "Peaks - Beleggings-app" in het verdelingsoverzicht — een bijlage bij het convenant —
// en stond onder het tabblad Ouderschapsplan.
const OP = `=== OUDERSCHAPSPLAN: op.pdf ===
1. Gezag. Ouders oefenen het gezag gezamenlijk uit.
2. Hoofdverblijf. De kinderen hebben hun hoofdverblijf bij de moeder.
3. Zorgverdeling. De kinderen verblijven om en om een week bij ieder van de ouders.
4. Kosten. De ouders dragen samen de kosten van de kinderen.`;

const BIJLAGE_TEKST = `=== VERDELINGSOVERZICHT: verdeling.pdf ===
Bankrekening Rabobank NL00RABO0123456789 — toedeling aan de vrouw.
Peaks - Beleggings-app, saldo per peildatum, toedeling aan de man.
Peaks beleggingsapp wordt afgekocht tegen de waarde per peildatum.`;

describe('maakHerkomstToets', () => {
  const toets = maakHerkomstToets({ hoofdTekst: OP, contextTekst: BIJLAGE_TEKST });

  it('herkent een citaat uit het hoofddocument', () => {
    expect(toets('De kinderen hebben hun hoofdverblijf bij de moeder.')).toBe(HOOFD);
  });

  it('herkent het citaat dat de aanleiding was als uit de bijlage', () => {
    expect(toets('Peaks - Beleggings-app, saldo per peildatum, toedeling aan de man.'))
      .toBe(BIJLAGE);
  });

  it('laat een citaat dat nergens hard te vinden is met rust', () => {
    expect(toets('Partijen hebben zich laten voorlichten over de fiscale gevolgen.'))
      .toBe(ONBEKEND);
  });

  it('kiest het hoofddocument als het citaat in allebei staat', () => {
    // "kosten van de kinderen" staat in het OP; zet dezelfde zin ook in de bijlage.
    const beide = maakHerkomstToets({
      hoofdTekst: OP,
      contextTekst: BIJLAGE_TEKST + '\nDe ouders dragen samen de kosten van de kinderen.',
    });
    expect(beide('De ouders dragen samen de kosten van de kinderen.')).toBe(HOOFD);
  });

  it('geeft onbekend zonder passage of zonder hoofdtekst', () => {
    expect(toets('')).toBe(ONBEKEND);
    expect(toets(null)).toBe(ONBEKEND);
    expect(maakHerkomstToets({ contextTekst: BIJLAGE_TEKST })('wat dan ook')).toBe(ONBEKEND);
  });

  it('trekt zich niets aan van witruimte en hoofdletters', () => {
    expect(toets('  DE KINDEREN   hebben hun\nhoofdverblijf bij de MOEDER.  ')).toBe(HOOFD);
  });
});

describe('de lat om iets te verwijderen ligt hoger dan om te blijven', () => {
  // Dit is de kern van het ontwerp. Zonder deze twee tests zou iemand de toets
  // symmetrisch kunnen maken zonder dat er iets rood wordt.

  it('drie gedeelde inhoudswoorden zijn niet genoeg om te verwijderen', () => {
    const toets = maakHerkomstToets({ hoofdTekst: OP, contextTekst: BIJLAGE_TEKST });
    // Deze zin staat niet in het OP. In de bijlage haalt hij precies drie
    // inhoudswoorden op een rij — "bankrekening rabobank" plus "toedeling" — en dat
    // is nu juist de soort toevallige overlap die een convenant met zijn eigen
    // verdelingsoverzicht altijd heeft.
    expect(toets('De bankrekening bij Rabobank blijft na toedeling ongewijzigd doorlopen.'))
      .toBe(ONBEKEND);
  });

  it('vier gedeelde inhoudswoorden zijn dat wel', () => {
    const toets = maakHerkomstToets({ hoofdTekst: OP, contextTekst: BIJLAGE_TEKST });
    expect(toets('De Peaks beleggingsapp wordt afgekocht tegen de waarde per peildatum, aldus partijen.'))
      .toBe(BIJLAGE);
  });

  it('een zwakke treffer in het hoofddocument is wél genoeg om te blijven', () => {
    // Geparafraseerd, dus geen letterlijke treffer; in het OP haalt hij alleen de
    // woorden3-trap ("kinderen hebben hoofdverblijf"). Dat is genoeg om te blijven —
    // precies andersom dan de bijlagekant, waar drie woorden niets bewijzen.
    const toets = maakHerkomstToets({ hoofdTekst: OP, contextTekst: BIJLAGE_TEKST });
    expect(toets('De kinderen hebben hoofdverblijf elders.')).toBe(HOOFD);
  });

  it('de artikeltrap telt niet mee — die zegt niets over herkomst', () => {
    // "3" komt in beide stukken voor als paragraafnummer. Zou de artikeltrap
    // meedoen, dan werd elk citaat ergens "gevonden" en was de toets waardeloos.
    const toets = maakHerkomstToets({ hoofdTekst: OP, contextTekst: BIJLAGE_TEKST });
    expect(toets('Een zin die in geen van beide stukken voorkomt.')).toBe(ONBEKEND);
  });

  it('HARDE_TRAPPEN bevat geen woorden3', () => {
    expect([...HARDE_TRAPPEN].sort()).toEqual(['begin', 'exact', 'woorden4']);
  });
});

describe('scheidBijlageIssues', () => {
  const issues = [
    { onderwerp: 'Hoofdverblijf', passage: 'De kinderen hebben hun hoofdverblijf bij de moeder.' },
    { onderwerp: 'Schrijfwijze Peaks', passage: 'Peaks - Beleggings-app, saldo per peildatum, toedeling aan de man.' },
    { onderwerp: 'Zorgverdeling', passage: 'De kinderen verblijven om en om een week bij ieder van de ouders.' },
  ];

  it('haalt alleen de bijlage-bevinding eruit en houdt de volgorde aan', () => {
    const { blijft, uitBijlage } = scheidBijlageIssues(issues, {
      hoofdTekst: OP, contextTekst: BIJLAGE_TEKST,
    });
    expect(blijft.map(i => i.onderwerp)).toEqual(['Hoofdverblijf', 'Zorgverdeling']);
    expect(uitBijlage.map(i => i.onderwerp)).toEqual(['Schrijfwijze Peaks']);
  });

  it('doet niets als er geen bijlagen zijn', () => {
    // Zonder context is er geen tweede document om iets aan toe te schrijven; dan is
    // wegfilteren altijd een gok. Dit is de veelvoorkomende situatie: één document.
    const { blijft, uitBijlage } = scheidBijlageIssues(issues, { hoofdTekst: OP });
    expect(blijft).toHaveLength(3);
    expect(uitBijlage).toHaveLength(0);
  });

  it('gaat om met een lege of ontbrekende lijst', () => {
    expect(scheidBijlageIssues(null, { hoofdTekst: OP, contextTekst: BIJLAGE_TEKST }))
      .toEqual({ blijft: [], uitBijlage: [] });
    expect(scheidBijlageIssues([{ onderwerp: 'zonder passage' }], {
      hoofdTekst: OP, contextTekst: BIJLAGE_TEKST,
    }).blijft).toHaveLength(1);
  });
});

// ── Bedrading ──────────────────────────────────────────────────────────────
//
// De module hierboven kan tot in de puntjes kloppen en toch niets doen. Dat is precies
// wat er op 29 augustus 2026 gebeurde met de volgordecontrole: kloppende logica die
// nergens werd aangeroepen. Deze twee controles zijn er tegen dat scenario.

describe('analyseer.js gebruikt deze module ook echt', () => {
  const bron = readFileSync(new URL('../../api/analyseer.js', import.meta.url), 'utf8');

  it('roept de toets aan op de per-document bevindingen', () => {
    expect(bron).toMatch(/import \{[^}]*maakHerkomstToets[^}]*\} from '\.\.\/src\/rapport\/passage-herkomst\.js'/);
    expect(bron).toMatch(/filterBijlageIssues\(filterGenderIssues\(result\)/);
  });

  it('vergelijkt met de tekst zoals het model die kreeg, niet de ruwe', () => {
    // De passages komen terug in gepseudonimiseerde vorm, want dát is wat er verstuurd
    // is. Toetsen tegen doc.tekst zou dezelfde alfabet-asymmetrie opleveren die de
    // volgordebepaling op 1 september 2026 om zeep hielp — daar dan zonder melding.
    expect(bron).toMatch(/maakHerkomstToets\(\{\s*hoofdTekst:\s*vervangPii\(doc\.tekst\),\s*contextTekst\s*\}\)/);
  });

  it('laat cross-doc met rust — die kijkt juist over de documentgrens heen', () => {
    // Cross-doc loopt buiten callMetSse om (staat zo in de code) en hoort dat te
    // blijven doen: een bevinding die twee stukken tegen elkaar houdt, staat per
    // definitie niet volledig in één ervan.
    const crossBlok = bron.slice(bron.indexOf('let crossDocPromise'));
    expect(crossBlok).toMatch(/crossDocTool/);          // we kijken naar het juiste stuk
    expect(crossBlok).not.toMatch(/filterBijlageIssues/);
  });
});
