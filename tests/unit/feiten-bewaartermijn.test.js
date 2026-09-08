/**
 * Unit tests — pasBewaartermijnToe in src/dashboard/feiten.js
 *
 * `analyse_feiten.gebruiker_id` verwijst naar een persoon en wordt na achttien maanden
 * weggehaald door `anonimiseer_oude_feiten()`. Wie daarna opnieuw wegschrijft, zet hem er
 * weer op — tenzij hij deze regel toepast.
 *
 * Op 8 september 2026 deed scripts/feiten-sync.mjs dat wél en de browser niet. Twee
 * schrijvers naar dezelfde tabel, één die de afspraak kende. Deze tests leggen de regel
 * vast op de plek waar beide erbij kunnen, en de bronwachter onderaan bewaakt dat ze hem
 * allebei gebruiken.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  pasBewaartermijnToe, bewaargrens, feitSleutel, BEWAARTERMIJN_MAANDEN,
} from '../../src/dashboard/feiten.js';

const NU = Date.parse('2026-09-08T10:00:00Z');
const regel = (over = {}) => ({
  screening_id: 's1', doc_type: 'convenant', gebruiker_id: 'u-1',
  geanalyseerd_op: '2026-09-01T10:00:00Z', ...over,
});

describe('een regel die al bestaat', () => {
  it('neemt gebruiker_id over uit de database, ook als die is geanonimiseerd', () => {
    // Dit is de hele reden dat deze functie bestaat: de bewaartermijn mag niet worden
    // teruggedraaid door een gewone opslagactie.
    const [uit] = pasBewaartermijnToe(
      [regel()],
      [{ screening_id: 's1', doc_type: 'convenant', gebruiker_id: null }],
      NU,
    );
    expect(uit.gebruiker_id).toBeNull();
  });

  it('laat een nog niet geanonimiseerde verwijzing staan zoals hij is', () => {
    const [uit] = pasBewaartermijnToe(
      [regel({ gebruiker_id: 'u-nieuw' })],
      [{ screening_id: 's1', doc_type: 'convenant', gebruiker_id: 'u-oud' }],
      NU,
    );
    expect(uit.gebruiker_id).toBe('u-oud');
  });

  it('koppelt op screening én documenttype, niet alleen op screening', () => {
    // Sinds 08-09-2026 heeft één analyse meerdere regels. Koppelen op screening alleen
    // zou het ouderschapsplan de anonimisering van het convenant geven, of andersom.
    const uit = pasBewaartermijnToe(
      [regel({ doc_type: 'convenant' }), regel({ doc_type: 'ouderschapsplan' })],
      [{ screening_id: 's1', doc_type: 'convenant', gebruiker_id: null }],
      NU,
    );
    expect(uit[0].gebruiker_id).toBeNull();      // bestond al, geanonimiseerd
    expect(uit[1].gebruiker_id).toBe('u-1');     // nieuw en recent
  });
});

describe('een regel die nog niet bestaat', () => {
  it('houdt de verwijzing als de analyse recent is', () => {
    const [uit] = pasBewaartermijnToe([regel()], [], NU);
    expect(uit.gebruiker_id).toBe('u-1');
  });

  it('schrijft hem meteen zonder verwijzing weg als hij ouder is dan de termijn', () => {
    const [uit] = pasBewaartermijnToe([regel({ geanalyseerd_op: '2023-01-01T00:00:00Z' })], [], NU);
    expect(uit.gebruiker_id).toBeNull();
  });

  it('legt de grens op achttien maanden', () => {
    expect(BEWAARTERMIJN_MAANDEN).toBe(18);
    const maanden = (NU - bewaargrens(NU).getTime()) / (30.44 * 864e5);
    expect(Math.round(maanden)).toBe(18);
  });
});

describe('randgevallen', () => {
  it('valt niet om op lege invoer', () => {
    expect(pasBewaartermijnToe(null, null, NU)).toEqual([]);
    expect(pasBewaartermijnToe([], undefined, NU)).toEqual([]);
  });

  it('raakt de doorgegeven regels niet aan', () => {
    const oorspronkelijk = regel();
    pasBewaartermijnToe([oorspronkelijk], [{ screening_id: 's1', doc_type: 'convenant', gebruiker_id: null }], NU);
    expect(oorspronkelijk.gebruiker_id).toBe('u-1');
  });

  it('maakt de sleutel uit screening en documenttype', () => {
    expect(feitSleutel({ screening_id: 's1', doc_type: 'convenant' })).toBe('s1|convenant');
  });
});

describe('de bedrading — beide schrijvers passen de regel toe', () => {
  // Dít is wat er ontbrak. De regel stond in het ene bestand en niet in het andere, en
  // dat was aan geen van beide te zien.
  for (const bestand of ['index.html', 'scripts/feiten-sync.mjs']) {
    it(`${bestand} roept pasBewaartermijnToe aan vóór het wegschrijven`, () => {
      const bron = readFileSync(new URL(`../../${bestand}`, import.meta.url), 'utf8');
      expect(bron).toMatch(/pasBewaartermijnToe\(/);
    });
  }
});
