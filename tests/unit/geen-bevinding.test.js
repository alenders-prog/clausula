/**
 * Unit tests — src/rapport/geen-bevinding.js
 *
 * Het gemelde geval: een bevinding met ernst HOOG, "Behoefte partneralimentatie: berekening
 * is rekenkundig correct", met als aanbeveling "Geen aanpassing vereist; de berekening is
 * correct." De prompt verbiedt dat expliciet; dit is het vangnet eronder.
 */

import { describe, it, expect } from 'vitest';
import { isBevestiging, filterBevestigingen } from '../../src/rapport/geen-bevinding.js';

const iss = (aanbeveling, over = {}) =>
  ({ onderwerp: 'Iets', ernst: 'midden', bevinding: 'Uitleg.', aanbeveling, ...over });

describe('wat eruit gaat', () => {
  it('het gemelde geval', () => {
    expect(isBevestiging(iss('Geen aanpassing vereist; de berekening is correct.'))).toBe(true);
  });

  it('varianten die op hetzelfde neerkomen', () => {
    for (const a of [
      'Geen actie nodig.',
      'Geen wijziging vereist',
      'geen correctie noodzakelijk — het bedrag klopt',
      'Niets te doen.',
    ]) expect(isBevestiging(iss(a))).toBe(true);
  });
});

describe('wat blijft staan, en dat is het punt', () => {
  it('een bevinding die "correct" gebruikt maar wél iets vraagt', () => {
    // Zou de toets naar de bevindingstekst kijken in plaats van de aanbeveling, dan
    // sneuvelde dit — en dat is een echt gebrek in een stuk dat naar de rechter gaat.
    expect(isBevestiging(iss('Vul de ontbrekende ingangsdatum in; het bedrag is correct.'))).toBe(false);
  });

  it('een aanbeveling die pas verderop "geen" zegt', () => {
    expect(isBevestiging(iss('Neem een motiveringsbepaling op, zodat er geen discussie ontstaat.'))).toBe(false);
  });

  it('een lege of ontbrekende aanbeveling', () => {
    // Geen aanbeveling is geen bevestiging: dan is er simpelweg niets ingevuld.
    expect(isBevestiging(iss(''))).toBe(false);
    expect(isBevestiging({})).toBe(false);
    expect(isBevestiging(null)).toBe(false);
  });
});

describe('filterBevestigingen', () => {
  it('haalt ze eruit en geeft terug wat er weg is', () => {
    const lijst = [
      iss('Vul de ingangsdatum in.'),
      iss('Geen aanpassing vereist; de berekening is correct.', { ernst: 'hoog' }),
      iss('Verwijder de dubbele zin.'),
    ];
    const { issues, verwijderd } = filterBevestigingen(lijst);
    expect(issues).toHaveLength(2);
    expect(verwijderd).toHaveLength(1);
    expect(verwijderd[0].ernst).toBe('hoog');
  });

  it('geeft dezelfde lijst terug als er niets weg hoeft', () => {
    const lijst = [iss('Vul de ingangsdatum in.')];
    const uit = filterBevestigingen(lijst);
    expect(uit.issues).toBe(lijst);
    expect(uit.verwijderd).toEqual([]);
  });

  it('valt niet om op lege invoer', () => {
    expect(filterBevestigingen(null).issues).toEqual([]);
    expect(filterBevestigingen(undefined).verwijderd).toEqual([]);
  });
});

// ── De bedrading ────────────────────────────────────────────────────────────
//
// Het filter hoort vóór de consolidatie te draaien: een bevestiging die tot dáár komt,
// telt mee in de ontdubbeling en kan een echte bevinding verdringen.
import { readFileSync } from 'node:fs';

describe('de bedrading in api/analyseer.js', () => {
  const bron = readFileSync(new URL('../../api/analyseer.js', import.meta.url), 'utf8');

  it('roept het filter aan', () => {
    expect(bron).toMatch(/filterBevestigingen\(rawIssues\)/);
  });

  it('doet dat vóór de IBAN-controle en dus vóór de consolidatie', () => {
    expect(bron.indexOf('filterBevestigingen(rawIssues)'))
      .toBeLessThan(bron.indexOf('filterIssuesOpIban(_zonderBevestiging'));
  });

  it('logt wat het weghaalt', () => {
    // Een filter dat stil verwijdert is niet te vertrouwen — dat is vandaag drie keer
    // gebleken.
    expect(bron).toMatch(/\[bevestiging\]/);
  });
});
