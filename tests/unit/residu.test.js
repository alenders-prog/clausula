/**
 * tests/unit/residu.test.js
 *
 * Een melder heeft twee manieren om waardeloos te zijn, en beide zien er van buiten uit als
 * succes: hij gaat overal af (en wordt genegeerd), of hij gaat nergens af (en stelt gerust).
 * Daarom staan hier beide richtingen, allebei met een getal eronder.
 *
 *   Groen — nul meldingen op de vijf golden fixtures ná echte anonimisering.
 *   Rood  — de "Jochem"-zaak: een kindnaam die niet in de namenkaart stond en op
 *           4 september 2026 ongemerkt de deur uit ging.
 *
 * Die tweede is de reden dat deze module bestaat. Zonder hem is "geanonimiseerd" een
 * aanname; met hem is het een meting die kan tegenvallen.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zoekResidu, vatResiduSamen } from '../../src/avg/residu.js';
import { bouwAnonMap, anonimiseerTekst } from '../../src/naam-anonimiseer.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(hier, '..', 'golden', 'fixtures');

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

describe('gaat af op wat er écht doorheen glipt', () => {
  it('vindt een kindnaam die niet in de namenkaart stond — de zaak van 4 september 2026', () => {
    const { naarAnon, naarEcht } = bouwAnonMap({
      partij_a_naam: 'Willem ter Kulve',
      partij_b_naam: 'Rozemarijn Haverkate',
      // Jochem ontbreekt bewust: dát is het gebrek.
    });
    const na = anonimiseerTekst('Uit het huwelijk is geboren: Jochem ter Kulve.', naarAnon, tracker());

    const residu = zoekResidu(na, naarEcht.keys());
    expect(residu.map((r) => r.waarde).join(' ')).toContain('Jochem');
  });

  it('meldt een BSN die de vervanging heeft gemist', () => {
    expect(zoekResidu('Het nummer 123456789 staat er nog.')).toEqual([
      expect.objectContaining({ soort: 'bsn', waarde: '123456789' }),
    ]);
  });

  it('meldt een e-mailadres en een 06-nummer die zijn blijven staan', () => {
    const soorten = zoekResidu('Bereikbaar via j.dijk@example.nl of 06-12345678.').map((r) => r.soort);
    expect(soorten).toContain('email');
    expect(soorten).toContain('telefoon');
  });

  it('geeft context mee, zodat de mediator ziet wáár het staat', () => {
    const [eerste] = zoekResidu('Het kind, genaamd Jochem, woont bij de moeder.');
    expect(eerste.context).toContain('woont bij');
  });
});

describe('gaat niet af op wat normaal is', () => {
  it('meldt de pseudoniemen niet die de anonimisering zelf heeft ingezet', () => {
    // Zonder deze uitzondering meldt elk document residu, en dan leest niemand het meer.
    const { naarAnon, naarEcht } = bouwAnonMap({ partij_a_naam: 'Elke Janssen', partij_b_naam: 'Liam Visser' });
    const na = anonimiseerTekst('Elke Janssen en Liam Visser komen overeen.', naarAnon, tracker());

    expect(na).toContain('Bergman');                       // het pseudoniem staat er
    expect(zoekResidu(na, naarEcht.keys())).toEqual([]);    // en wordt niet gemeld
  });

  it('meldt instellingen, wetsverwijzingen en maandnamen niet', () => {
    const t = 'De rekening bij Rabobank valt onder art. 1:94 BW; zie Bijlage 2 van december.';
    expect(zoekResidu(t)).toEqual([]);
  });

  it('meldt een placeholder niet, en ook de inhoud ervan niet', () => {
    expect(zoekResidu('wonende te [WOONPLAATS_0], e-mail [EMAIL], geboren te [GEBOORTEPLAATS_1]')).toEqual([]);
  });

  it('maskeert placeholders zonder een naam erna te verbergen', () => {
    // Gevonden op 5 september 2026 bij het vastleggen van deze module. Er stond op de
    // maskerregel per ongeluk één NUL-byte in plaats van het bedoelde teken, waardoor git
    // het bestand als binair aanmerkte — geen leesbare diff meer op een module die de
    // grens naar een externe verwerker bewaakt.
    //
    // Het herstellen náár een spatie bleek een echt gat te openen: een spatiemasker ziet
    // er aan het begin van een regel uit als inspringing, waarna de zinsbegin-toets het
    // volgende woord overslaat. Gemeten: "Jochem" werd dan niet gemeld. Deze test houdt
    // beide plaatsen vast.
    for (const tekst of [
      'Het kind [WOONPLAATS_0] heet Jochem hier.',                  // middenin
      'Partijen komen overeen.\n[WOONPLAATS_0] Jochem woont daar.', // aan het regelbegin
    ]) {
      const namen = zoekResidu(tekst).map((r) => r.waarde).join(' ');
      expect(namen, `niet gemeld in: ${JSON.stringify(tekst)}`).toContain('Jochem');
    }
  });

  it('meldt een hoofdletter aan het begin van een zin niet', () => {
    expect(zoekResidu('Partijen komen overeen. Vervolgens wordt geleverd.')).toEqual([]);
  });
});

describe('nul residu op de golden fixtures, met een volledige namenkaart', () => {
  // Het getal dat de drempel rechtvaardigt: bij een classificatie die iederéén heeft
  // opgehaald hoort de uitkomst leeg te zijn. Loopt dit op na een wijziging aan `BEKEND` of
  // aan de anonimisering, dan is dat een echt signaal — geen ruis om weg te drukken.
  //
  // De namen hieronder komen uit de fixtures zelf, niet uit mijn hoofd: bij de eerste opzet
  // had ik ze verzonnen, waarop de controle "Thomas Hendrik Visser" en "Emma Visser" meldde.
  // Dat waren terechte vondsten — de fixture bevat die namen echt.
  const NAMEN = {
    'convenant-incompleet.json': {
      partij_a_naam: 'Alexander Johannes Schreven',
      partij_b_naam: 'Ingeborg van Zand',
      kinderen_namen: ['Maartje Schreven', 'Pascal Schreven'],
    },
    'convenant-tegenstrijdig.json': {
      partij_a_naam: 'Sander Alexander Schreven',
      partij_b_naam: 'Lisa van den Berg',
    },
    'ouderschapsplan-onvolledig.json': {
      partij_a_naam: 'Thomas Hendrik Visser',
      partij_b_naam: 'Sandra Visser-Janssen',
      kinderen_namen: ['Emma Visser', 'Liam Visser'],
    },
  };

  /** De cross-doc-fixtures dragen hun tekst in `documenten[]`, niet in `tekst`. */
  function fixtureTekst(bestand) {
    const j = JSON.parse(fs.readFileSync(path.join(fixtures, bestand), 'utf8'));
    return j.tekst ?? j.documenten.map((d) => d.tekst ?? '').join('\n\n');
  }

  for (const [bestand, cls] of Object.entries(NAMEN)) {
    it(`${bestand} levert geen valse meldingen`, () => {
      const { naarAnon, naarEcht } = bouwAnonMap(cls);
      const na = anonimiseerTekst(fixtureTekst(bestand), naarAnon, tracker());

      const residu = zoekResidu(na, naarEcht.keys());
      expect(residu.map((r) => `${r.soort}: ${r.waarde}`)).toEqual([]);
    });
  }

  it('meldt wél wat er overblijft als de classificatie een kind mist', () => {
    // Dezelfde fixture, maar `kinderen_namen` weggelaten — de Jochem-zaak, op echte tekst.
    // Dit is de test die aantoont dat de nullen hierboven iets betekenen: zonder deze zou
    // een controle die altijd niets vindt er precies zo groen uitzien.
    const { naarAnon, naarEcht } = bouwAnonMap({
      partij_a_naam: 'Thomas Hendrik Visser',
      partij_b_naam: 'Sandra Visser-Janssen',
    });
    const na = anonimiseerTekst(fixtureTekst('ouderschapsplan-onvolledig.json'), naarAnon, tracker());

    const namen = zoekResidu(na, naarEcht.keys()).map((r) => r.waarde).join(' ');
    expect(namen).toContain('Emma');
  });
});

describe('vatResiduSamen', () => {
  it('telt per soort en velt geen oordeel', () => {
    const samen = vatResiduSamen(zoekResidu('Contact: a@b.nl en 123456789.'));
    expect(samen).toEqual({ aantal: 2, perSoort: { bsn: 1, email: 1 } });
    // Bewust geen 'veilig'-vlag: dat zou de meting weer tot een garantie maken.
    expect(samen).not.toHaveProperty('veilig');
  });
});
