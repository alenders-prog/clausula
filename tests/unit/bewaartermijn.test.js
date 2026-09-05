/**
 * Unit tests — src/avg/bewaartermijn.js
 *
 * Aanleiding: B3 uit de architectuurbeoordeling. Er was geen enkel mechanisme dat een
 * geüpload document ooit verwijderde, terwijl `organisaties.retention_maanden` al sinds
 * `001_multitenancy.sql` op 12 stond en door niets werd gelezen.
 *
 * De belangrijkste eis staat in het laatste blok: onbruikbare invoer laat niets verwijderen.
 * Een opruimscript dat bij twijfel weggooit, gooit precies één keer te veel weg.
 */

import { describe, it, expect } from 'vitest';
import { vervalMoment, isVerlopen, bronbestandMelding } from '../../src/avg/bewaartermijn.js';

const dag = d => d.toISOString().slice(0, 10);

describe('vervalMoment', () => {
  it('telt de maanden op bij de uploaddatum', () => {
    expect(dag(vervalMoment('2026-08-14T10:00:00Z', 12))).toBe('2027-08-14');
    expect(dag(vervalMoment('2026-08-14T10:00:00Z', 1))).toBe('2026-09-14');
  });

  it('laat een termijn nooit korter worden dan hij zegt', () => {
    // 31 januari + 1 maand is in JavaScript 3 maart (2026 heeft geen schrikkeldag).
    // Dat zou het bestand twee dagen te vroeg laten verdwijnen als je terugrekent.
    expect(dag(vervalMoment('2026-01-31T10:00:00Z', 1))).toBe('2026-02-28');
    expect(dag(vervalMoment('2026-03-31T10:00:00Z', 1))).toBe('2026-04-30');
  });

  it('geeft null bij een onbruikbare termijn of datum', () => {
    expect(vervalMoment('2026-08-14T10:00:00Z', 0)).toBeNull();
    expect(vervalMoment('2026-08-14T10:00:00Z', -3)).toBeNull();
    expect(vervalMoment('2026-08-14T10:00:00Z', null)).toBeNull();
    expect(vervalMoment('geen datum', 12)).toBeNull();
    expect(vervalMoment(undefined, 12)).toBeNull();
  });
});

describe('isVerlopen', () => {
  const nu = new Date('2026-09-05T12:00:00Z');

  it('laat een vers bestand staan', () => {
    // Het oudste bestand in de bucket op 5 september 2026 was 22 dagen oud.
    expect(isVerlopen('2026-08-14T10:00:00Z', 12, nu)).toBe(false);
  });

  it('verwijdert een bestand waarvan de termijn voorbij is', () => {
    expect(isVerlopen('2025-08-14T10:00:00Z', 12, nu)).toBe(true);
  });

  it('telt de dag waarop de termijn afloopt als verlopen', () => {
    expect(isVerlopen('2025-09-05T12:00:00Z', 12, nu)).toBe(true);
    expect(isVerlopen('2025-09-05T12:00:01Z', 12, nu)).toBe(false);
  });

  it('volgt de termijn van de organisatie, niet een vaste waarde', () => {
    const geplaatst = '2026-06-01T10:00:00Z';
    expect(isVerlopen(geplaatst, 1, nu)).toBe(true);
    expect(isVerlopen(geplaatst, 12, nu)).toBe(false);
  });
});

describe('bij twijfel blijft het staan', () => {
  const nu = new Date('2026-09-05T12:00:00Z');

  it('verwijdert niets zonder bruikbare datum', () => {
    expect(isVerlopen(null, 12, nu)).toBe(false);
    expect(isVerlopen(undefined, 12, nu)).toBe(false);
    expect(isVerlopen('', 12, nu)).toBe(false);
    expect(isVerlopen('onzin', 12, nu)).toBe(false);
  });

  it('verwijdert niets zonder bruikbare termijn', () => {
    const oud = '2020-01-01T10:00:00Z';
    expect(isVerlopen(oud, 0, nu)).toBe(false);
    expect(isVerlopen(oud, null, nu)).toBe(false);
    expect(isVerlopen(oud, undefined, nu)).toBe(false);
    expect(isVerlopen(oud, NaN, nu)).toBe(false);
  });
});

describe('bronbestandMelding', () => {
  it('zegt dat de bewaartermijn de reden is, met de datum erbij', () => {
    const m = bronbestandMelding({ message: 'Object not found' }, '2027-08-14T00:00:00Z');
    expect(m).toMatch(/bewaartermijn/i);
    expect(m).toMatch(/14 augustus 2027/);
    expect(m).toMatch(/rapport en de bevindingen blijven/i);
  });

  it('houdt het voorzichtiger als er geen datum bekend is', () => {
    const m = bronbestandMelding({ statusCode: '404' });
    expect(m).toMatch(/staat niet meer in de opslag/i);
    expect(m).toMatch(/kan komen doordat/i);
  });

  it('laat een echte storing als storing klinken', () => {
    const m = bronbestandMelding({ message: 'Failed to fetch' });
    expect(m).toMatch(/^Download mislukt/);
    expect(m).not.toMatch(/bewaartermijn/i);
  });

  it('valt terug op iets leesbaars bij een fout zonder tekst', () => {
    expect(bronbestandMelding({})).toBe('Download mislukt: onbekende fout');
  });
});
