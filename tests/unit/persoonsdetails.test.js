/**
 * tests/unit/persoonsdetails.test.js
 *
 * De proef die het gebrek aantoonde, nu als test. Op 3 september 2026 bleef dit staan in de
 * tekst die naar Anthropic ging, nádat alle bestaande vervangingen hadden gedraaid:
 *
 *     Robin Bergman, geboren te Enschede op 12-12-1996, wonende te [POSTCODE_1]
 *     [WOONPLAATS_2] aan Markendoel 16, werkzaam bij Pensioenfonds Zorg en Welzijn.
 *
 * Terwijl de app aan de mediator beloofde dat documenten "volledig geanonimiseerd" het
 * kantoor verlaten.
 *
 * Het merendeel van deze tests gaat over de andere kant: wat er NIET vervaagd mag worden.
 * Een peildatum is geen persoonsgegeven, en een leveringsdatum wegpoetsen maakt de
 * verdelingstoets stuk. Vervagen is hier net zo goed een fout als laten staan.
 */

import { describe, it, expect } from 'vitest';
import { vervangPersoonsdetails } from '../../src/avg/persoonsdetails.js';

/** Zelfde vorm als de tracker in index.html: genummerd en terugzetbaar. */
function tracker() {
  const gezien = new Map();
  const tellers = {};
  return (type, waarde) => {
    const k = `${type}:${waarde}`;
    if (!gezien.has(k)) {
      tellers[type] = tellers[type] ?? 0;
      gezien.set(k, `[${type}_${tellers[type]++}]`);
    }
    return gezien.get(k);
  };
}
const vv = (t) => vervangPersoonsdetails(t, tracker());

describe('geboortedatum → alleen het jaar', () => {
  it('haalt dag en maand weg maar houdt het jaar', () => {
    expect(vv('geboren te Enschede op 12-12-1996')).toMatch(/geboren te \[GEBOORTEPLAATS_0\] in 1996/);
  });

  it('werkt ook als de datum vóór de plaats staat', () => {
    // "Jochem, geboren 03-04-2011 te Deventer" — de andere woordvolgorde.
    const uit = vv('Jochem, geboren 03-04-2011 te Deventer.');
    expect(uit).toContain('2011');
    expect(uit).not.toContain('03-04');
    expect(uit).not.toContain('Deventer');
  });

  it('leest een uitgeschreven maand', () => {
    const uit = vv('geboren op 12 december 1996');
    expect(uit).toContain('1996');
    expect(uit).not.toContain('december');
  });

  it('houdt het jaar heel — art. 1:157 lid 3 BW kent een grens bij 1 januari 1970', () => {
    // Zonder jaartal kan de analyse de alimentatietermijn niet meer bepalen. Dat is de
    // reden dat hier verlaagd wordt en niet verwijderd.
    expect(vv('de vrouw, geboren op 04-11-1969, ')).toContain('1969');
  });
});

describe('huwelijksdatum → maand en jaar', () => {
  it('verlaagt de precisie maar houdt de 1-1-2018-grens toetsbaar', () => {
    expect(vv('Partijen zijn gehuwd op 26-08-2022')).toMatch(/gehuwd in 08-2022/);
  });

  it('werkt ook als de datum vóór het woord "gehuwd" staat', () => {
    // "Partijen zijn op 26-08-2022 te Renkum gehuwd" — de gangbaarste vorm in een convenant.
    const uit = vv('Partijen zijn op 26-08-2022 te Renkum gehuwd.');
    expect(uit).toContain('08-2022');
    expect(uit).not.toContain('26-08');
  });

  it('herkent ook geregistreerd partnerschap', () => {
    expect(vv('geregistreerd partnerschap aangegaan op 01-03-2019')).toContain('03-2019');
  });
});

describe('wat er NIET vervaagd mag worden', () => {
  it('laat de peildatum staan', () => {
    // Geen persoonsgegeven, en de verdelingstoets scharniert erop.
    const t = 'De peildatum voor de verdeling is 01-07-2025.';
    expect(vv(t)).toBe(t);
  });

  it('laat een leverings- of ondertekeningsdatum staan', () => {
    const t = 'De levering vindt plaats op 15-09-2026 bij de notaris.';
    expect(vv(t)).toBe(t);
  });

  it('laat wetsverwijzingen met jaartallen met rust', () => {
    const t = 'art. 1:157 BW zoals dat sinds 1-1-2020 luidt';
    expect(vv(t)).toBe(t);
  });

  it('laat bedragen ongemoeid', () => {
    const t = 'De woning heeft een WOZ-waarde van EUR 450.000.';
    expect(vv(t)).toBe(t);
  });
});

describe('geboorteplaats, werkgever en adres zonder straatsuffix', () => {
  it('vervangt de geboorteplaats', () => {
    expect(vv('geboren te Enschede')).toBe('geboren te [GEBOORTEPLAATS_0]');
  });

  it('vervangt de werkgever na "werkzaam bij"', () => {
    expect(vv('werkzaam bij Pensioenfonds Zorg en Welzijn.')).toMatch(/werkzaam bij \[WERKGEVER_0\]\./);
  });

  it('vervangt een rechtsvorm die los in de tekst staat', () => {
    expect(vv('De aandelen in Kulve Advies B.V. worden toebedeeld.')).toMatch(/\[WERKGEVER_0\]/);
  });

  it('vervangt een adres waarvan de straatnaam geen suffix heeft', () => {
    // Dit is het geval dat het bestaande patroon liet staan: het eist -straat, -laan,
    // -weg, -plein en dergelijke, en "Markendoel" heeft er geen.
    expect(vv('wonende aan Markendoel 16')).toMatch(/wonende aan \[ADRES_0\]/);
  });

  it('raakt geen artikel- of bijlageverwijzing die op een adres lijkt', () => {
    for (const t of ['zoals bepaald in Bijlage 1', 'de verdeling op Peildatum 2']) {
      expect(vv(t)).toBe(t);
    }
  });

  it('geeft hetzelfde gegeven altijd dezelfde placeholder', () => {
    const uit = vv('geboren te Enschede. De ander is ook geboren te Enschede.');
    expect(uit.match(/\[GEBOORTEPLAATS_0\]/g)).toHaveLength(2);
  });
});

describe('zonder tracker blijven plaats en werkgever staan', () => {
  it('maar de datums worden wél verlaagd', () => {
    // Zelfde afspraak als bij de bestaande adres- en postcodevervanging: genummerde
    // placeholders vragen om een tracker. Datums niet — die worden verlaagd, niet vervangen,
    // en dat mag dus altijd.
    const uit = vervangPersoonsdetails('geboren te Enschede op 12-12-1996');
    expect(uit).toContain('Enschede');
    expect(uit).toContain('1996');
    expect(uit).not.toContain('12-12');
  });
});

describe('huwelijksplaats', () => {
  it('vervangt de plaats vóór het woord "gehuwd"', () => {
    expect(vv('Partijen zijn op 26-08-2022 te Renkum gehuwd.'))
      .toMatch(/te \[HUWELIJKSPLAATS_0\] gehuwd/);
  });

  it('en ook erna', () => {
    expect(vv('Partijen zijn gehuwd te Renkum op 26-08-2022.'))
      .toMatch(/\[HUWELIJKSPLAATS_0\]/);
  });

  it('raakt "wonende te" niet — dat is een andere plaats met een eigen patroon', () => {
    const uit = vv('wonende te Almelo, en werkzaam elders.');
    expect(uit).not.toContain('HUWELIJKSPLAATS');
  });
});
