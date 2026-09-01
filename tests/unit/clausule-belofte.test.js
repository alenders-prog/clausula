/**
 * tests/unit/clausule-belofte.test.js
 *
 * "Hieronder een juridisch volledige clausule." — en dan niets.
 *
 * De onderliggende fout (een verwijzing naar het niet-bestaande veld clausule.tekst) is
 * in de prompt rechtgezet; deze controle is het vangnet. De scherpe rand zit in wat er
 * NIET als gebroken belofte mag tellen: een antwoord dat het woord clausule gebruikt
 * zonder er een aan te kondigen, en een korte clausule die er wél staat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  beoordeelClausuleBelofte, vulClausuleBelofteAan,
  MIN_CLAUSULE_TEKENS, BELOFTE_NOTA,
} from '../../src/assistent/clausule-belofte.js';

// Het antwoord uit het gemelde geval, ingekort maar met de zin die het misging.
const GEMELD = 'De aangeleverde tekst is juridisch onvoldoende: ze mist de wettelijke '
  + 'grondslag (art. 1:94 BW), een expliciete peildatum, een bewustverklaring van partijen '
  + 'over het privékarakter én een afstandsformulering voor eventuele vergoedingsrechten '
  + '(art. 1:87 BW). Hieronder een juridisch volledige clausule.';

const ECHTE_CLAUSULE = 'Hieronder de clausule.\n\n'
  + '1. Partijen stellen vast dat het vermogen dat door de vrouw is opgebouwd na 1 juli 2025 '
  + 'buiten de beperkte gemeenschap van goederen valt als bedoeld in art. 1:94 lid 2 BW.\n'
  + '2. Partijen verklaren zich bewust te zijn van de gevolgen hiervan en doen over en weer '
  + 'afstand van eventuele vergoedingsrechten als bedoeld in art. 1:87 BW.';

describe('beoordeelClausuleBelofte', () => {
  it('betrapt het gemelde geval', () => {
    const oordeel = beoordeelClausuleBelofte({ intent: 'clausule', antwoord: GEMELD });
    expect(oordeel.gebroken).toBe(true);
    expect(oordeel.reden).toMatch(/Hieronder/);
    // De aankondiging staat aan het eind; wat erop volgt is de staart van diezelfde
    // zin, veel te weinig voor een clausule.
    expect(oordeel.reden).toMatch(/minimaal 120 verwacht/);
  });

  it('laat een antwoord mét clausule met rust', () => {
    expect(beoordeelClausuleBelofte({ intent: 'clausule', antwoord: ECHTE_CLAUSULE }).gebroken)
      .toBe(false);
  });

  it('kijkt alleen bij intent=clausule', () => {
    // Een casus-antwoord mag "hieronder" zeggen zonder iets te beloven; daar hoort de
    // inhoud in andere velden (opties, signalen) en niet in het antwoord.
    for (const intent of ['casus', 'kennisvraag', 'opties', undefined]) {
      expect(beoordeelClausuleBelofte({ intent, antwoord: GEMELD }).gebroken).toBe(false);
    }
  });

  it('rekent het woord clausule zonder aankondiging niet als belofte', () => {
    // Dit is de valse positief die de controle onbruikbaar zou maken: het model dat
    // uitlegt dát er een clausule nodig is, zonder te zeggen dat hij volgt.
    const geen = 'Een aparte clausule is hier niet nodig; de wet regelt dit al in art. 1:94 BW.';
    expect(beoordeelClausuleBelofte({ intent: 'clausule', antwoord: geen }).gebroken).toBe(false);
  });

  it('herkent de gangbare aankondigingen', () => {
    for (const zin of [
      'Hieronder de tekst.', 'Hierna de tekst.', 'De onderstaande clausule volstaat.',
      'De clausule volgt hier.', 'De bepaling luidt als volgt:',
    ]) {
      expect(beoordeelClausuleBelofte({ intent: 'clausule', antwoord: zin }).gebroken)
        .toBe(true);
    }
  });

  it('gaat om met een leeg of ontbrekend antwoord', () => {
    expect(beoordeelClausuleBelofte({ intent: 'clausule', antwoord: '' }).gebroken).toBe(false);
    expect(beoordeelClausuleBelofte({}).gebroken).toBe(false);
    expect(beoordeelClausuleBelofte().gebroken).toBe(false);
  });

  it('legt de grens waar hij ligt', () => {
    // Direct achter de aankondiging plakken, anders telt de tekst ertussen mee en
    // toetst deze test de grens niet waar hij ligt. (Eerst zo gebouwd, ging rood.)
    const kort = 'Hieronder ' + 'a'.repeat(MIN_CLAUSULE_TEKENS - 1);
    const lang = 'Hieronder ' + 'a'.repeat(MIN_CLAUSULE_TEKENS);
    expect(beoordeelClausuleBelofte({ intent: 'clausule', antwoord: kort }).gebroken).toBe(true);
    expect(beoordeelClausuleBelofte({ intent: 'clausule', antwoord: lang }).gebroken).toBe(false);
  });
});

describe('vulClausuleBelofteAan', () => {
  it('zet de nota eronder bij een gebroken belofte', () => {
    const oordeel = beoordeelClausuleBelofte({ intent: 'clausule', antwoord: GEMELD });
    const uit = vulClausuleBelofteAan(GEMELD, oordeel);
    expect(uit.startsWith(GEMELD)).toBe(true);
    expect(uit).toContain(BELOFTE_NOTA);
    expect(uit).toMatch(/Clausule opstellen/);   // de mediator moet weten wat te doen
  });

  it('laat een ingelost antwoord letterlijk zoals het was', () => {
    const oordeel = beoordeelClausuleBelofte({ intent: 'clausule', antwoord: ECHTE_CLAUSULE });
    expect(vulClausuleBelofteAan(ECHTE_CLAUSULE, oordeel)).toBe(ECHTE_CLAUSULE);
    expect(vulClausuleBelofteAan(ECHTE_CLAUSULE, null)).toBe(ECHTE_CLAUSULE);
  });
});

// ── Bedrading ──────────────────────────────────────────────────────────────

describe('ai-assistent.js', () => {
  const bron = readFileSync(new URL('../../api/ai-assistent.js', import.meta.url), 'utf8');

  it('roept de controle aan en gebruikt de uitkomst', () => {
    expect(bron).toMatch(/beoordeelClausuleBelofte\(output\)/);
    expect(bron).toMatch(/output\.antwoord = vulClausuleBelofteAan\(output\.antwoord, belofte\)/);
  });

  it('verwijst niet meer naar het veld dat niet bestaat', () => {
    // Dit was de hele oorzaak: de beschrijving van het antwoordveld stuurde het model
    // naar `clausule.tekst`, en dat veld staat niet in het schema. Het model schreef
    // daarop keurig zijn intro en liet de clausule weg.
    // Alleen de beschrijving die het model leest — de nota erboven mág het veld
    // noemen, die legt juist uit waarom het weg moest.
    const beschrijving = bron.slice(bron.indexOf("description: 'Kernantwoord"));
    expect(beschrijving.slice(0, 400)).not.toMatch(/clausule\.tekst/);
    expect(beschrijving.slice(0, 400)).toMatch(/geen apart clausuleveld/);
  });

  it('en dat veld bestaat inderdaad niet in het schema', () => {
    // Als iemand het ooit wél toevoegt, moet de regel hierboven mee veranderen —
    // anders staat er een verbod op een verwijzing die dan juist klopt.
    const schema = bron.slice(bron.indexOf("required: ['intent', 'antwoord', 'vervolgacties']"));
    expect(schema.slice(0, schema.indexOf('\n  },'))).not.toMatch(/^\s{6}clausule:/m);
  });
});
