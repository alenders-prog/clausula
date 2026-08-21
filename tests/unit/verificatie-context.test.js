/**
 * Unit tests — src/rapport/verificatie-context.js
 *
 * De twee gevallen die aanleiding waren, staan als eerste: het nihilbeding waarbij
 * de alinea eronder het oordeel kleurt, en de "ontbrekende" sectie Vorderingen die
 * wel degelijk bestaat onder een langere naam.
 */

import { describe, it, expect } from 'vitest';
import {
  vindPassage, sectiekopjes, omgeving, bouwVerificatieContext,
} from '../../src/rapport/verificatie-context.js';

const CONVENANT = `2.2.	Partneralimentatie

2.2.1.	Partijen stellen de partneralimentatie vast aan de hand van een draagkrachtberekening conform de tremanormen.

2.2.2.	Uit de draagkrachtberekening is gebleken dat er op dit moment wel behoefte, maar geen draagkracht is voor partneralimentatie. Partneralimentatie wordt om die reden niet overeengekomen.

Partijen komen overeen dat, indien er zich wijzigingen voordoen waardoor bij een van de partijen wel draagkracht ontstaat, zij een herberekening zullen laten maken voor de partneralimentatie.

2.2.3.	Indien een van de partijen een beroep dient te doen op een bijstandsuitkering, zal de betreffende gemeente een eigen alimentatieberekening maken.

3.	VERDELING PARTNERSCHAPSGEMEENSCHAP

3.11.	Vorderingen en schulden sociale verzekering

3.11.1.	Er is binnen de partnerschapsgemeenschap geen sprake van vorderingen of schulden sociale verzekering.

3.12.	De eenmanszaak

3.12.1.	De man heeft een eenmanszaak, LDV Mobility, ingeschreven bij de Kamer van Koophandel.`;

const PASSAGE_ALIMENTATIE = 'Uit de draagkrachtberekening is gebleken dat er op dit moment wel behoefte, '
  + 'maar geen draagkracht is voor partneralimentatie. Partneralimentatie wordt om die reden niet overeengekomen.';

describe('het nihilbeding-geval', () => {
  it('vindt de passage in het document', () => {
    expect(vindPassage(CONVENANT, PASSAGE_ALIMENTATIE)).toBeGreaterThanOrEqual(0);
  });

  it('neemt de herberekeningsclausule uit de alinea eronder mee', () => {
    // Precies de nuance die het oordeel over een nihilbeding verandert.
    expect(omgeving(CONVENANT, PASSAGE_ALIMENTATIE)).toContain('herberekening zullen laten maken');
  });

  it('neemt ook de alinea erboven mee', () => {
    expect(omgeving(CONVENANT, PASSAGE_ALIMENTATIE)).toContain('draagkrachtberekening conform de tremanormen');
  });
});

describe('het Vorderingen-geval', () => {
  it('vindt de sectie die volgens het issue niet zou bestaan', () => {
    const kopjes = sectiekopjes(CONVENANT);
    expect(kopjes.some(k => /Vorderingen en schulden sociale verzekering/.test(k))).toBe(true);
  });

  it('zet de kopjes in de context met een waarschuwing voor bijna-treffers', () => {
    const ctx = bouwVerificatieContext(CONVENANT, PASSAGE_ALIMENTATIE);
    expect(ctx).toContain('3.11.\tVorderingen en schulden sociale verzekering');
    expect(ctx).toContain('bijna-treffers');
  });
});

describe('sectiekopjes', () => {
  it('herkent genummerde kopjes op elk niveau', () => {
    const k = sectiekopjes(CONVENANT);
    expect(k.some(x => x.startsWith('2.2.'))).toBe(true);
    expect(k.some(x => x.startsWith('3.'))).toBe(true);
    expect(k.some(x => x.startsWith('3.12.'))).toBe(true);
  });

  it('slaat lange regels over, want dat zijn alineas en geen kopjes', () => {
    const k = sectiekopjes(CONVENANT);
    expect(k.every(x => x.length <= 120)).toBe(true);
  });

  it('respecteert het maximum', () => {
    const veel = Array.from({ length: 300 }, (_, i) => `${i}. Kopje ${i}`).join('\n');
    expect(sectiekopjes(veel, 50)).toHaveLength(50);
  });

  it('overleeft lege invoer', () => {
    expect(sectiekopjes('')).toEqual([]);
    expect(sectiekopjes(null)).toEqual([]);
  });
});

describe('vindPassage', () => {
  it('valt terug op een kortere prefix bij kleine tekstverschillen', () => {
    const licht_anders = PASSAGE_ALIMENTATIE.replace('om die reden', 'daarom') + ' Extra staart.';
    expect(vindPassage(CONVENANT, licht_anders)).toBeGreaterThanOrEqual(0);
  });

  it('geeft -1 bij een passage die er niet in staat', () => {
    expect(vindPassage(CONVENANT, 'Een volstrekt andere zin over pensioenverevening en WVPS.')).toBe(-1);
  });

  it('geeft -1 bij te korte of lege invoer', () => {
    expect(vindPassage(CONVENANT, 'kort')).toBe(-1);
    expect(vindPassage('', PASSAGE_ALIMENTATIE)).toBe(-1);
  });
});

describe('bouwVerificatieContext', () => {
  it('geeft leeg terug zonder documenttekst — dan geldt het oude gedrag', () => {
    expect(bouwVerificatieContext('', PASSAGE_ALIMENTATIE)).toBe('');
    expect(bouwVerificatieContext(null, PASSAGE_ALIMENTATIE)).toBe('');
  });

  it('geeft de kopjes ook zonder vindbare passage', () => {
    const ctx = bouwVerificatieContext(CONVENANT, 'Zin die nergens voorkomt in dit document.');
    expect(ctx).toContain('SECTIEKOPJES');
    expect(ctx).not.toContain('DOCUMENTCONTEXT ROND DE PASSAGE');
  });

  it('instrueert expliciet om de omringende tekst mee te wegen', () => {
    expect(bouwVerificatieContext(CONVENANT, PASSAGE_ALIMENTATIE))
      .toContain('een alinea verderop kan de bevinding weerleggen');
  });
});
