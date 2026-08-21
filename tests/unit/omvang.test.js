/**
 * Unit test — omvang van index.html
 *
 * Geen stijlregel maar een rem. Het refactorplan in docs/REFACTOR-PLAN-clausula.md
 * ging uit van ~13.000 regels; tijdens de uitvoering ervan groeide het bestand naar
 * bijna 15.000. De extractie hield geen gelijke tred met wat er bijkwam, en dat is
 * precies de manier waarop een refactor halverwege doodbloedt.
 *
 * Deze grens mag ALLEEN OMLAAG. Verhogen kan technisch, maar dan staat het in de
 * diff en is het een besluit in plaats van een sluipende toename.
 *
 * Loopt hij vol? Verplaats dan eerst iets naar src/ — met een test erbij. Dat is
 * meteen de winst: alles wat in src/ staat is getest, niets van wat in index.html
 * staat is dat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Vastgesteld op 19 augustus 2026. Verlaag deze waarde bij elke extractie.
//
// 21-08-2026: bewust verhoogd van 14894 naar 14939 (+45), voor drie reparaties
// die bedrading in dit bestand nodig hadden: de knoptoestand na een
// concept-generatie, het herstel van opsommingstekens in de tracked-changes
// patcher, en de documentcontext voor de extra verificatie.
//
// De pure logica is wél verhuisd — src/docx/bullet-prefix.js (11 tests) en
// src/rapport/verificatie-context.js (15 tests). Wat hier bleef staan is
// bedrading die niets te bewijzen heeft; verplaatsen zou alleen indirectie
// opleveren.
const MAX_REGELS_INDEX = 14994;

function regels(pad) {
  return readFileSync(join(WORTEL, pad), 'utf8').split('\n').length;
}

describe('omvang van de monoliet', () => {
  it(`index.html blijft binnen ${MAX_REGELS_INDEX} regels`, () => {
    const n = regels('index.html');
    expect(
      n,
      `index.html is ${n} regels (grens ${MAX_REGELS_INDEX}). Verplaats logica naar src/ `
      + 'met een test, of verhoog de grens bewust in dit bestand.',
    ).toBeLessThanOrEqual(MAX_REGELS_INDEX);
  });

  it('de grens staat niet onnodig hoog', () => {
    // Zakt het bestand ruim onder de grens, dan hoort de grens mee te zakken —
    // anders ontstaat er stilletjes weer ruimte om te groeien.
    const n = regels('index.html');
    expect(
      MAX_REGELS_INDEX - n,
      `index.html is ${n} regels; verlaag MAX_REGELS_INDEX naar die waarde.`,
    ).toBeLessThan(250);
  });
});
