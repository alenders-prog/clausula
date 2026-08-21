/**
 * Unit tests — src/iban-patroon.js
 *
 * Aanleiding: een convenant schreef "NL28 RABO 0328582298" met spaties. Het
 * patroon in naam-anonimiseer.js stond die niet toe, waardoor de tien resterende
 * cijfers als telefoonnummer werden gemaskeerd — in het rapport stond
 * "NL28 RABO [TEL]" en het rekeningnummer was niet meer terug te zetten.
 */

import { describe, it, expect } from 'vitest';
import { ibanRe, ibanOfTokenRe, ibanSleutel } from '../../src/iban-patroon.js';

const treffers = (re, t) => t.match(re) ?? [];

describe('het geval dat aanleiding was', () => {
  it('herkent een NL-IBAN met spaties', () => {
    expect(treffers(ibanRe(), 'Rekeningnummer NL28 RABO 0328582298 op naam van'))
      .toEqual(['NL28 RABO 0328582298']);
  });

  it('laat de cijferreeks niet als telefoonnummer overblijven', () => {
    // 0328582298 is qua vorm een geldig Nederlands telefoonnummer.
    const tekst = 'NL28 RABO 0328582298';
    expect(tekst.replace(ibanRe(), '[IBAN]')).toBe('[IBAN]');
  });

  it('geeft dezelfde sleutel voor elke schrijfwijze van dezelfde rekening', () => {
    const vormen = ['NL28 RABO 0328582298', 'NL28RABO0328582298', 'NL28 RABO 0328 5822 98'];
    const sleutels = new Set(vormen.map(v => ibanSleutel(treffers(ibanRe(), v)[0])));
    expect(sleutels.size).toBe(1);
  });
});

describe('maskeren mag ruim zijn', () => {
  it('herkent buitenlandse IBANs aaneengeschreven', () => {
    expect(treffers(ibanRe(), 'BE68539007547034 en DE89370400440532013000')).toHaveLength(2);
  });

  it('raakt gewone getallen niet', () => {
    expect(treffers(ibanRe(), 'Saldo 0328582298 zonder banknaam ervoor')).toHaveLength(0);
    expect(treffers(ibanRe(), 'Bedrag € 2.336,- op 23-03-2026')).toHaveLength(0);
  });
});

describe('valideren moet strikt zijn', () => {
  it('telt een NL-IBAN met te veel cijfers niet mee', () => {
    // Een valse treffer laat filterIssuesOpIban een echte bevinding weggooien.
    expect(treffers(ibanOfTokenRe(), 'NL36RABO10114172430000')).toHaveLength(0);
  });

  it('herkent beide schrijfwijzen van de placeholder', () => {
    // De browser nummert met [IBAN_0], de server met [IBAN-1].
    expect(treffers(ibanOfTokenRe(), 'Zie [IBAN_0] en [IBAN-2]')).toEqual(['[IBAN_0]', '[IBAN-2]']);
  });

  it('neemt de internationale vorm bewust niet mee', () => {
    expect(treffers(ibanOfTokenRe(), 'BE68539007547034')).toHaveLength(0);
  });
});

describe('losse regex per aanroep', () => {
  it('houdt geen lastIndex vast tussen aanroepen', () => {
    const t = 'NL28 RABO 0328582298 en NL36 RABO 3285229357';
    expect(treffers(ibanRe(), t)).toHaveLength(2);
    expect(treffers(ibanRe(), t)).toHaveLength(2);
  });
});
