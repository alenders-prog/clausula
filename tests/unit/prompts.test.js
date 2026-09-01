/**
 * Unit tests — api/_prompts/
 *
 * De prompts zijn op 20 augustus 2026 uit api/analyseer.js gehaald (84% van dat
 * bestand was prompttekst). Doel: een promptwijziging is nu zichtbaar in een diff
 * op een eigen pad, zodat er een controle aan gekoppeld kan worden.
 *
 * Deze tests bewaken twee dingen die stil kunnen breken:
 *   1. De blokken zijn niet leeg of half afgekapt bij het verplaatsen.
 *   2. De samenstelling van het gedeelde blok blijft in de juiste volgorde —
 *      die volgorde bepaalt de cache-sleutel bij Anthropic.
 */

import { describe, it, expect } from 'vitest';
import {
  ERNST_CRITERIA, VERIFICATIEPLICHT, bouwPseudonimiseringNota, bouwStabielGedeeld,
} from '../../api/_prompts/gedeeld.js';
import { bouwSysStructuur }   from '../../api/_prompts/structuur.js';
import { bouwSysBevindingen } from '../../api/_prompts/bevindingen.js';
import { bouwSysCrossDoc }    from '../../api/_prompts/cross-doc.js';
import { SYS_CONSOLIDATIE }   from '../../api/_prompts/consolidatie.js';
import {
  bouwAnderDocsNota, bouwRoepnamenNota, bouwJuridischeChecks,
  bouwHvChecks, bouwIprChecks, bouwMfnInstructie,
} from '../../api/_prompts/fragmenten.js';

const LEEG = { docTypLabel: '', anderDocsNota: '', roepnamenNota: '', mfnInstructie: '',
               heeftMfn: false, mfnElemList: [], juridischeChecks: '', hvChecks: '',
               iprChecks: '', docTypenLabel: '', wetTekst: '' };

describe('gedeelde promptblokken', () => {
  it('zijn niet leeg en niet afgekapt', () => {
    expect(ERNST_CRITERIA.length).toBeGreaterThan(500);
    expect(VERIFICATIEPLICHT.length).toBeGreaterThan(3000);
    expect(SYS_CONSOLIDATIE.length).toBeGreaterThan(500);
  });

  it('bevatten de regels die vandaag zijn toegevoegd', () => {
    // De verificatieplicht dekt sinds 19-08-2026 ook berekende en normatieve claims.
    expect(VERIFICATIEPLICHT).toContain('VERIFICATIEPLICHT BIJ BEREKENDE EN NORMATIEVE CLAIMS');
    expect(VERIFICATIEPLICHT).toContain('SAMENHANG TUSSEN KOP, BEVINDING EN PASSAGE');
  });

  it('zetten het gedeelde blok in de vaste volgorde — die bepaalt de cache-sleutel', () => {
    const blok = bouwStabielGedeeld('20-08-2026');
    const iNota = blok.indexOf(bouwPseudonimiseringNota('20-08-2026').slice(0, 40));
    const iVerif = blok.indexOf(VERIFICATIEPLICHT.slice(0, 40));
    const iErnst = blok.indexOf(ERNST_CRITERIA.slice(0, 40));
    expect(iNota).toBeGreaterThanOrEqual(0);
    expect(iVerif).toBeGreaterThan(iNota);
    expect(iErnst).toBeGreaterThan(iVerif);
  });

  it('zet de datum in de pseudonimiseringsnota', () => {
    expect(bouwPseudonimiseringNota('20-08-2026')).toContain('20-08-2026');
  });

  it('is stabiel bij dezelfde datum — anders mist elke call de cache', () => {
    expect(bouwStabielGedeeld('20-08-2026')).toBe(bouwStabielGedeeld('20-08-2026'));
  });
});

describe('system prompts per call', () => {
  it('leveren gevulde tekst op, ook met lege optionele blokken', () => {
    expect(bouwSysStructuur(LEEG).length).toBeGreaterThan(2000);
    expect(bouwSysBevindingen(LEEG).length).toBeGreaterThan(8000);
    expect(bouwSysCrossDoc(LEEG).length).toBeGreaterThan(2000);
  });

  it('verwerken het documenttype-label', () => {
    expect(bouwSysStructuur({ ...LEEG, docTypLabel: 'Ouderschapsplan' })).toContain('Ouderschapsplan');
    expect(bouwSysBevindingen({ ...LEEG, docTypLabel: 'Ouderschapsplan' })).toContain('Ouderschapsplan');
  });

  it('voegen de MfN-instructie alleen toe als er een MfN-score is', () => {
    const zonder = bouwSysStructuur({ ...LEEG, heeftMfn: false });
    const met = bouwSysStructuur({
      ...LEEG, heeftMfn: true, mfnElemList: ['a', 'b', 'c'],
      mfnInstructie: '\n\n**mfn_score** — Beoordeel op MfN-vereisten.',
    });
    expect(met).toContain('mfn_score');
    expect(met).toContain('EXACT 3 items');
    expect(zonder).not.toContain('EXACT');
  });

  // Sinds 1 september 2026 krijgt cross_doc GEEN wetsartikelen meer: ~15.000 tokens die
  // bij twee documenten drie keer de deur uit gingen. Gemeten op cross-doc-hoofdverblijf,
  // twee rondes met en twee zonder: de kernbevinding werd in alle vier gevonden en de
  // invoer van die aanroep daalde van 25.826 naar 7.197 tokens. De juridische toetsing
  // van elk document afzonderlijk gebeurt in `bevindingen`, en die houdt ze wél.
  it('de cross-doc prompt draagt geen wetsartikelen meer', () => {
    const p = bouwSysCrossDoc({ docTypenLabel: 'convenant en ouderschapsplan' });
    expect(p).not.toContain('WETSARTIKELEN');
    expect(p).not.toMatch(/\[Art\. 1:\d+/);
    // Maar hij moet nog wél doen waarvoor hij bestaat.
    expect(p).toContain('convenant en ouderschapsplan');
    expect(p).toMatch(/ALLEEN ZICHTBAAR zijn door BEIDE documenten/);
  });

  it('laten optionele checkblokken weg als ze leeg zijn', () => {
    // Lege blokken mogen geen kale kopjes of dubbele witregels achterlaten.
    expect(bouwSysBevindingen(LEEG)).not.toContain('undefined');
    expect(bouwSysStructuur(LEEG)).not.toContain('undefined');
    expect(bouwSysCrossDoc(LEEG)).not.toContain('undefined');
  });
});

describe('voorwaardelijke fragmenten', () => {
  it('geven een lege string als de voorwaarde niet geldt', () => {
    // Belangrijk: leeg, niet undefined. Een undefined belandt als "undefined"
    // in de prompt en instrueert het model met een woord dat er niet hoort.
    expect(bouwAnderDocsNota([])).toBe('');
    expect(bouwRoepnamenNota([])).toBe('');
    expect(bouwRoepnamenNota(null)).toBe('');
    expect(bouwHvChecks(false)).toBe('');
    expect(bouwIprChecks('ouderschapsplan')).toBe('');
    expect(bouwMfnInstructie({ heeftMfn: false, docTypLabel: '', mfnElemList: [] })).toBe('');
  });

  it('vervoegt de notitie over meegeleverde documenten correct', () => {
    expect(bouwAnderDocsNota(['Ouderschapsplan'])).toContain('is ook aangeleverd');
    expect(bouwAnderDocsNota(['Ouderschapsplan', 'Convenant'])).toContain('zijn ook aangeleverd');
  });

  it('noemt elke roepnaam met de bijbehorende volledige naam', () => {
    const n = bouwRoepnamenNota([{ nepVoornaam: 'Thomas', nepVolledig: 'Thomas Bergman' }]);
    expect(n).toContain('"Thomas" als roepnaam van "Thomas Bergman"');
  });

  it('kiest de checklijst op documenttype, met een terugval', () => {
    expect(bouwJuridischeChecks('ouderschapsplan')).toContain('HOOFDVERBLIJFPLAATS');
    expect(bouwJuridischeChecks('convenant')).toContain('PARTNERALIMENTATIE');
    // Bijlagen en onbekende types krijgen de algemene instructie, geen lege string.
    expect(bouwJuridischeChecks('bijlage')).toContain('juridische juistheid');
  });

  it('geeft de IPR-checks alleen bij een convenant', () => {
    expect(bouwIprChecks('convenant')).toContain('INTERNATIONAAL PRIVAATRECHT');
  });

  it('nummert de MfN-elementen en telt ze', () => {
    const m = bouwMfnInstructie({ heeftMfn: true, docTypLabel: 'Convenant', mfnElemList: ['x', 'y'] });
    expect(m).toContain('Score_totaal = 2');
    expect(m).toContain('1. x');
    expect(m).toContain('2. y');
  });
});

describe('vakinhoudelijke regels in de verificatieplicht', () => {
  it('eist geen regeling voor een bestanddeel dat niet in het document staat', () => {
    // Aanleiding: een issue "Levensverzekeringen niet behandeld" op een convenant
    // waarin alleen "de eventueel verpande polissen" voorkomt — geen aangewezen polis.
    expect(VERIFICATIEPLICHT).toContain('GEEN REGELING EISEN VOOR WAT ER NIET IS');
    expect(VERIFICATIEPLICHT).toContain('eventueel verpande polissen');
  });

  it('scheidt de mfn_score van de issuelijst', () => {
    // Een MfN-element mag op "ontbreekt" staan zonder dat het een issue wordt.
    expect(VERIFICATIEPLICHT).toContain('maak er geen issue van');
  });
});

describe('vaststaande dossierfeiten', () => {
  it('noemt de relatievorm expliciet zodat die niet geraden hoeft te worden', () => {
    // Aanleiding: een ouderschapsplan kreeg het advies om overal "huwelijk" van te
    // maken, terwijl partijen geregistreerd partners zijn. Het model leidde dat af
    // uit een sectie over een mogelijk toekomstig huwelijk van een ouder.
    const blok = bouwStabielGedeeld('21-08-2026', ['geregistreerd_partnerschap']);
    expect(blok).toContain('GEREGISTREERD PARTNERSCHAP, geen huwelijk');
    expect(blok).toContain('ontbinding van het geregistreerd partnerschap');
  });

  it('schrijft voor dat het document wijkt, niet het feit', () => {
    const blok = bouwStabielGedeeld('21-08-2026', ['geregistreerd_partnerschap']);
    expect(blok).toContain('dan is het DOCUMENT wat gecorrigeerd moet worden');
  });

  it('waarschuwt dat voorwaardelijke passages geen feiten zijn', () => {
    const blok = bouwStabielGedeeld('21-08-2026', ['huwelijk']);
    expect(blok).toContain('VOORWAARDELIJKE EN TOEKOMSTIGE PASSAGES ZEGGEN NIETS');
  });

  it('zet de feiten vooraan, vóór de beoordelingsregels', () => {
    const blok = bouwStabielGedeeld('21-08-2026', ['huwelijk']);
    expect(blok.indexOf('VASTSTAANDE FEITEN'))
      .toBeLessThan(blok.indexOf('VERIFICATIEPLICHT'));
  });

  it('laat het blok weg als er geen bruikbare kenmerken zijn', () => {
    const zonder = bouwStabielGedeeld('21-08-2026', []);
    expect(zonder).not.toContain('VASTSTAANDE FEITEN');
    // Zonder kenmerken exact het oude gedrag — anders verschuift de cache-sleutel.
    expect(zonder).toBe(bouwStabielGedeeld('21-08-2026'));
  });

  it('negeert onbekende kenmerken zonder te breken', () => {
    const blok = bouwStabielGedeeld('21-08-2026', ['bestaat_niet', 'huwelijk']);
    expect(blok).toContain('Partijen zijn gehuwd');
    expect(blok).not.toContain('bestaat_niet');
  });
});

describe('verwijzing naar een ander document in het dossier', () => {
  it('verbiedt een ontbrekend-issue als het onderwerp elders is belegd', () => {
    // Aanleiding: "Kinderalimentatie niet geregeld in convenant" (HOOG), terwijl het
    // convenant in 1.1 zegt dat alle kinderafspraken in het ouderschapsplan staan.
    expect(VERIFICATIEPLICHT).toContain('VERWIJZING NAAR EEN ANDER DOCUMENT IN HETZELFDE DOSSIER');
    expect(VERIFICATIEPLICHT).toContain('al helemaal niet als \'hoog\'');
  });

  it('geldt voor elk onderwerp, niet alleen kinderafspraken', () => {
    expect(VERIFICATIEPLICHT).toContain('Dit geldt voor élk onderwerp');
  });

  it('accepteert een verwijzing die het onderwerp niet woordelijk noemt', () => {
    expect(VERIFICATIEPLICHT).toContain('hóéft niet woordelijk het onderwerp te noemen');
  });

  it('sluit hoog uit in de ernst-criteria zelf', () => {
    // De regel moet ook staan waar de ernst wordt bepaald, niet alleen in de plicht.
    expect(ERNST_CRITERIA).toContain("NOOIT 'hoog' voor een onderwerp dat volgens een expliciete verwijzing");
  });
});

describe('passage moet de fout uit de titel bevatten', () => {
  it('verbiedt een passage over een aanpalend onderwerp', () => {
    // Aanleiding: titel over kinderalimentatie, passage over partneralimentatie.
    expect(VERIFICATIEPLICHT).toContain('DE PASSAGE MOET DE FOUT UIT DE TITEL BEVATTEN');
    expect(VERIFICATIEPLICHT).toContain('geen zin over partneralimentatie zijn');
  });

  it('schrijft voor wat te doen als er geen passende zin is', () => {
    expect(VERIFICATIEPLICHT).toContain('Herformuleer het naar wat de aangewezen zin wél laat zien');
  });
});

describe('naamsvermelding van partijen', () => {
  it('schrijft voor de personalia te vergelijken met vermeldingen verderop', () => {
    // Gat gevonden door de eval van 21-08-2026: elf issues op een convenant waarin de
    // man "Sander Alexander Schreven" heet en de bankrekening op "Alexander Schreven"
    // staat — geen enkele ging over die naam.
    expect(VERIFICATIEPLICHT).toContain('NAAMSVERMELDING VAN PARTIJEN');
    expect(VERIFICATIEPLICHT).toContain('op bankrekeningen, in het ondertekeningsblok');
  });

  it('sluit normale verkortingen uit', () => {
    // "A. Schreven" of "de heer Schreven" mag geen bevinding opleveren.
    expect(VERIFICATIEPLICHT).toContain('is normaal en geen bevinding');
  });
});

describe('pensioen: verevening tegenover conversie', () => {
  const checks = bouwJuridischeChecks('convenant');

  it('legt het onderscheid uit in plaats van alleen de artikelnummers te noemen', () => {
    // Aanleiding: de eval vond het pensioenpunt wel, maar als volledigheidsgebrek.
    // Het convenant zegt "draagt over" — dat is conversie (art. 5), geen verevening.
    expect(checks).toContain('VEREVENING OF CONVERSIE');
    expect(checks).toContain('art. 5 WVPS');
  });

  it('noemt de woorden waaraan het te herkennen is', () => {
    expect(checks).toContain('"overdragen"');
    expect(checks).toContain('"verevenen"');
  });

  it('schrijft juridisch voor, niet volledigheid', () => {
    expect(checks).toContain('Rapporteer dit als juridisch, niet als volledigheidsgebrek');
  });

  it('raakt de checklijst van het ouderschapsplan niet', () => {
    expect(bouwJuridischeChecks('ouderschapsplan')).not.toContain('CONVERSIE');
  });
});

// ── Een tegenstrijdigheid is geen gemis ────────────────────────────────────
//
// Aanleiding (1 september 2026). Een bevinding die er in een eerdere run wél stond —
// het hypotheeknummer in het convenant week af van dat in de waardebepaling — was in een
// volgende run verdwenen. Het log zei alleen "6 duplicaat(en) verwijderd".
//
// De consolidatieprompt zegt dat twee issues over "hetzelfde onderwerp niet geregeld"
// één issue zijn, uitdrukkelijk óók als de passages verschillen. Zonder tegenwicht kan
// een tegenstrijdigheid over de hypotheek zo opgaan in een algemener issue dat er iets
// over de hypotheek ontbreekt — en dan is het concrete nummer weg.
//
// Een bovengrens op het aantal verwijderingen zou hier niet helpen: gemeten over de
// fixtures haalt deze stap routinematig 36 tot 65 procent weg, en dat is bedoeld gedrag.

describe('consolidatie: tegenstrijdigheid versus gemis', () => {
  it('verbiedt het samenvoegen van een tegenstrijdigheid met een gemis', () => {
    expect(SYS_CONSOLIDATIE).toMatch(/NOOIT SAMENVOEGEN/);
    expect(SYS_CONSOLIDATIE).toMatch(/TEGENSPREKEN/);
    expect(SYS_CONSOLIDATIE).toMatch(/bewaar ze allebei/i);
  });

  it('perkt de "hetzelfde onderwerp"-regel expliciet in', () => {
    // Zonder deze zin blijven de twee regels elkaar tegenspreken, en dan wint de
    // ruimste lezing — precies wat er bij de bijlage-bevinding ook gebeurde.
    expect(SYS_CONSOLIDATIE).toMatch(/geldt uitsluitend tussen twee gemis-issues/);
  });
});
