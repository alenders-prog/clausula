/**
 * Unit tests — src/tekst/taalcontroles.js
 *
 * De eis hier is niet "vindt veel" maar **nul valse meldingen**. Een luidruchtige melding
 * leert de mediator wegklikken, en dan mist hij ook de goede — dat is in dit project al
 * een keer gebeurd met de residu-balk (41 meldingen, 2 echt).
 *
 * De gevallen komen uit een echt ouderschapsplan en convenant van 6 september 2026.
 */

import { describe, it, expect } from 'vitest';
import { taalcontroles, dubbeleWoorden, leestekenNaAfkorting, spatieVoorLeesteken }
  from '../../src/tekst/taalcontroles.js';

const onderwerpen = (t) => taalcontroles(t).map((b) => b.onderwerp);

describe('dubbele woorden', () => {
  it('vindt het geval uit het convenant', () => {
    const uit = dubbeleWoorden('dat de de vrouw daarvoor zorgt');
    expect(uit).toHaveLength(1);
    expect(uit[0].onderwerp).toMatch(/dubbel woord 'de de'/);
  });

  it('meldt een kop die in de zin eronder herhaald wordt NIET', () => {
    // Gemeten op het echte document: van vier treffers waren er drie van deze soort.
    // Een kop staat op een eigen regel; dat is geen tikfout.
    expect(dubbeleWoorden('Wisselmomenten\n\nWisselmomenten spreken partijen af')).toHaveLength(0);
    expect(dubbeleWoorden('KOSTEN\n\nKosten van de kinderen')).toHaveLength(0);
    expect(dubbeleWoorden('Verjaardagen\n\n\n\nVerjaardagen worden gevierd')).toHaveLength(0);
  });

  it('meldt een hoofdletterwoord gevolgd door hetzelfde kleine woord niet', () => {
    // "Wisselmomenten wisselmomenten" op één regel is een kop plus zin, geen dubbeling.
    expect(dubbeleWoorden('Wisselmomenten wisselmomenten spreken partijen af')).toHaveLength(0);
  });

  it('meldt "De de" aan het zinsbegin wél', () => {
    expect(dubbeleWoorden('De de vrouw betaalt.')).toHaveLength(1);
  });

  it('laat losse letters met rust — dat is vaak een tabelkop', () => {
    expect(dubbeleWoorden('A A B B')).toHaveLength(0);
  });

  it('laat twee verschillende woorden met rust', () => {
    expect(dubbeleWoorden('de vrouw en de man')).toHaveLength(0);
  });
});

describe('dubbele punt na een afsluitende afkorting', () => {
  it('vindt het geval uit het ouderschapsplan', () => {
    const uit = leestekenNaAfkorting('zoals bloedprikken, inenten, beugel etc:');
    expect(uit).toHaveLength(1);
    expect(uit[0].onderwerp).toMatch(/etc/i);
    expect(uit[0].aanbeveling).toMatch(/punt/i);
  });

  it('werkt ook voor enz', () => {
    expect(leestekenNaAfkorting('boeken, schriften enz.:')).toHaveLength(1);
  });

  it('laat een correcte afsluiting met rust', () => {
    expect(leestekenNaAfkorting('bloedprikken, inenten, beugel etc.')).toHaveLength(0);
    expect(leestekenNaAfkorting('en zo verder etc. De ouders spreken af')).toHaveLength(0);
  });
});

describe('spatie vóór een leesteken', () => {
  it('vindt hem', () => {
    expect(spatieVoorLeesteken('de woning , de auto')).toHaveLength(1);
  });

  it('laat een nummering met rust', () => {
    // Uitgelezen PDF-tekst bevat kolomartefacten als "3 . 2"; dat is geen taalfout.
    expect(spatieVoorLeesteken('artikel 3 . 2 van het convenant')).toHaveLength(0);
  });

  it('laat gewone leestekens met rust', () => {
    expect(spatieVoorLeesteken('de woning, de auto en de inboedel.')).toHaveLength(0);
  });
});

describe('samen', () => {
  it('geeft de bevindingen op volgorde van voorkomen', () => {
    const t = 'De de vrouw regelt dit. Zoals inenten, beugel etc: en verder.';
    const uit = taalcontroles(t);
    expect(uit).toHaveLength(2);
    expect(uit[0].index).toBeLessThan(uit[1].index);
    expect(uit[0].onderwerp).toMatch(/dubbel woord/);
  });

  it('zwijgt op een schone tekst', () => {
    const t = 'Partijen komen overeen dat de woning wordt verkocht en de opbrengst '
            + 'bij helfte wordt gedeeld, conform artikel 3.2.1 van dit convenant.';
    expect(onderwerpen(t)).toEqual([]);
  });

  it('valt niet om op lege invoer', () => {
    expect(taalcontroles('')).toEqual([]);
    expect(taalcontroles(null)).toEqual([]);
    expect(taalcontroles(undefined)).toEqual([]);
  });
});
