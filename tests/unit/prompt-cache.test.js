import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { systeemVeld, berichtInhoud, PROMPT_CACHE_AAN } from '../../src/api/prompt-cache.js';

const heeftMerk = (b) => Object.prototype.hasOwnProperty.call(b, 'cache_control');

// Aanleiding (31 augustus 2026): over een echte analyse werden 153.284 tokens naar de
// cache geschreven en nul gelezen — $0,115 premie per analyse voor niets. Er is ook geen
// route waarlangs hij wél gelezen wordt: de tooldefinitie hoort bij het voorvoegsel (en
// elke fase heeft een eigen tool), en gelijktijdig gestarte aanroepen missen een koude
// cache hoe dan ook.
describe('de cache staat uit, en dat is een besluit', () => {
  it('PROMPT_CACHE_AAN is uit', () => {
    expect(PROMPT_CACHE_AAN).toBe(false);
  });

  it('zet geen enkele markering in het system-veld', () => {
    const v = systeemVeld('Je bent een familierechtjurist.');
    expect(v).toHaveLength(1);
    expect(v[0].text).toContain('familierechtjurist');
    expect(heeftMerk(v[0])).toBe(false);
  });

  it('zet geen markering op blokken die daar wel voor in aanmerking komen', () => {
    const b = berichtInhoud([
      { text: 'gedeeld blok', cache: true },
      { text: 'wetsartikelen', cache: true },
      { text: 'de documenttekst' },
    ]);
    expect(b).toHaveLength(3);
    expect(b.every(x => !heeftMerk(x))).toBe(true);
  });
});

// De markering `cache: true` blijft bij de aanroepplekken staan: die zegt iets over de
// inhoud (dit blok is stabiel), niet over de instelling. Zet iemand de schakelaar om,
// dan moet precies dát gebeuren wat hier staat — niet meer en niet minder.
describe('met de cache aan', () => {
  const aan = { cacheAan: true };

  it('markeert het system-veld', () => {
    expect(systeemVeld('sys', aan)[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('markeert alleen de blokken met cache: true', () => {
    const b = berichtInhoud([
      { text: 'stabiel', cache: true },
      { text: 'wisselend' },
      { text: 'ook stabiel', cache: true },
    ], aan);
    expect(b.map(heeftMerk)).toEqual([true, false, true]);
  });

  it('markeert nooit een blok zonder vlag — dat zou de sleutel per aanroep laten wisselen', () => {
    // Een gemarkeerd blok dat per aanroep verandert (de documenttekst) maakt elk
    // voorvoegsel uniek: dan betaal je de premie én mist elke aanroep.
    const b = berichtInhoud([{ text: 'de documenttekst' }], aan);
    expect(heeftMerk(b[0])).toBe(false);
  });
});

describe('vorm en randgevallen', () => {
  it('accepteert een kale string als inhoud', () => {
    const b = berichtInhoud('gewoon tekst');
    expect(b).toEqual([{ type: 'text', text: 'gewoon tekst' }]);
  });

  it('levert altijd tekstblokken op, ook bij rare invoer', () => {
    expect(systeemVeld(null)[0]).toEqual({ type: 'text', text: '' });
    expect(berichtInhoud([{ cache: true }])[0]).toEqual({ type: 'text', text: '' });
    expect(berichtInhoud(null)).toEqual([{ type: 'text', text: '' }]);
    expect(berichtInhoud([])).toEqual([]);
  });

  it('laat de oorspronkelijke blokken ongemoeid', () => {
    const bron = [{ text: 'a', cache: true }];
    berichtInhoud(bron, { cacheAan: true });
    expect(bron[0]).toEqual({ text: 'a', cache: true });
  });
});

// De schakelaar is alleen een schakelaar zolang niemand er inline omheen bouwt. Eén
// vergeten `cache_control` in analyseer.js zet de premie terug zonder dat het opvalt —
// de kosten stijgen 11% en er is niets aan te zien.
describe('analyseer.js gaat via deze module', () => {
  const bron = readFileSync(new URL('../../api/analyseer.js', import.meta.url), 'utf8');

  it('bouwt system en berichtinhoud niet zelf', () => {
    expect(bron).toContain('systeemVeld(systemPrompt)');
    expect(bron).toContain('berichtInhoud(userContent)');
  });

  it('bevat nergens een losse cache_control', () => {
    expect(bron).not.toMatch(/cache_control/);
  });

  it('stuurt de beta-header voor caching niet meer mee', () => {
    // Zonder cache_control heeft die header geen functie; laten staan wekt de indruk
    // dat er nog gecachet wordt.
    expect(bron).not.toContain('prompt-caching-2024-07-31');
  });
});
