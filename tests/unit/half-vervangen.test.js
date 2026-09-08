/**
 * Unit tests — src/avg/half-vervangen.js
 *
 * Het gemelde geval: een convenant noemde bij de bankrekeningen "Erwin Huzen" terwijl de
 * personalia "Jan Willem Huzen" gaven. `Huzen` was bekend, `Erwin` niet — dus na het
 * pseudonimiseren stond er "Erwin Bergman". Half vervangen, en dat leest als een pseudoniem,
 * dus in een lijst van veertig residu-meldingen viel het niemand op.
 *
 * De eerste versie repareerde dit door de voornaam te vervangen. De residu-tests lieten
 * meteen zien wat dat kost: een niet-geleerde kindnaam met dezelfde achternaam werd dan de
 * voornaam van de vader. Twee personen op één hoop — en dat weegt zwaarder dan één voornaam
 * die naar de API gaat. Vandaar: melden, niet repareren.
 */

import { describe, it, expect } from 'vitest';
import { vindHalveNamen } from '../../src/avg/half-vervangen.js';

const NEP = ['Thomas Bergman', 'Lisette Hartwijk'];

describe('het gemelde geval', () => {
  it('herkent "Erwin Bergman" als half vervangen', () => {
    expect(vindHalveNamen('Rekeningnummer op naam van Erwin Bergman, welke op peildatum', NEP))
      .toEqual(['Erwin Bergman']);
  });

  it('meldt elke combinatie één keer', () => {
    const tekst = 'Erwin Bergman en Erwin Bergman en Marieke Hartwijk';
    expect(vindHalveNamen(tekst, NEP)).toEqual(['Erwin Bergman', 'Marieke Hartwijk']);
  });

  it('verandert de tekst niet', () => {
    // Het gaat om signaleren. Vervangen zou een niet-geleerde kindnaam met dezelfde
    // achternaam tot de vader maken, en dan redeneert het model over de verkeerde persoon.
    const tekst = 'op naam van Erwin Bergman';
    vindHalveNamen(tekst, NEP);
    expect(tekst).toBe('op naam van Erwin Bergman');
  });
});

describe('wat het niet meldt', () => {
  it('een naam die al goed staat', () => {
    expect(vindHalveNamen('Thomas Bergman betaalt', NEP)).toEqual([]);
  });

  it('aanhefwoorden en tussenvoegsels', () => {
    for (const voor of ['Dhr', 'Mevr', 'Van', 'De', 'Heer']) {
      expect(vindHalveNamen(`${voor} Bergman tekent`, NEP)).toEqual([]);
    }
  });

  it('de achternaam alleen', () => {
    expect(vindHalveNamen('De rekening van Bergman', NEP)).toEqual([]);
  });

  it('een woord in kleine letters ervoor', () => {
    expect(vindHalveNamen('de rekening bergman', NEP)).toEqual([]);
  });
});

describe('randgevallen', () => {
  it('valt niet om op lege invoer', () => {
    expect(vindHalveNamen('', NEP)).toEqual([]);
    expect(vindHalveNamen(null, NEP)).toEqual([]);
    expect(vindHalveNamen('Erwin Bergman', null)).toEqual([]);
  });

  it('negeert nep-namen die geen twee delen hebben', () => {
    expect(vindHalveNamen('Erwin Bergman', ['Bergman', 'Jan de Vries Bergman'])).toEqual([]);
  });
});
