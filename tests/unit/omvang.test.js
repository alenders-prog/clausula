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
//
// 23-08-2026: bewust verhoogd van 14939 naar 14994 (+55), voor het streamende
// antwoord van de assistent. Wat erbij kwam is uitsluitend DOM-bedrading: een
// labelwissel in de denkbubbel, het opbouwen van de voorvertoning, en de
// vertakking tussen stroom en JSON in de fetch.
//
// De redenerende delen staan wél in src/ — src/assistent/deelbare-json.js leest
// een veld uit JSON die nog binnenkomt (14 tests), src/assistent/sse-stroom.js
// haalt de stroom uit elkaar (10 tests). De bubbel verplaatsen zou betekenen dat
// _assistMd, _assistHerstelNamen en het container-element als parameters mee
// moeten; dat is indirectie zonder dat er een test bij komt die iets bewijst.
// 23-08-2026 (tweede keer die dag): verhoogd van 14994 naar 15028 (+34), voor het
// progressief tonen van de extra verificatie en het opmerken van een afgekapt
// antwoord. Ook dit is bedrading: het bijhouden van twee SSE-velden, een render
// tijdens de leeslus, en de opbouw van een meldingsblok.
//
// De redenerende delen staan in src/verificatie/stroom-status.js (15 tests):
// splitsen van analyse en voorstel, en het oordeel of de stroom is afgerond.
//
// 23-08-2026 (vierde keer): 15028 → 15082 (+54), voor de opmaak van het streamende
// antwoord: de .assist-bubble-wikkel die de voorvertoning miste, en de voortgangsregel
// die toont welk onderdeel nog onderweg is.
//
// ── Waarom er nu twee grenzen zijn ──
// Bij deze verhoging viel op dat 20 van de 54 regels CSS waren. De regel in CLAUDE.md
// gaat over logica — "nieuwe logica met een eigen redenering hoort in src/, met een
// unittest" — maar deze bewaker telde álles: stijl, opmaak en script door elkaar. Een
// stijlblok dat groeit is niet waar de rem voor bedoeld is, en er ís ook geen plek om
// CSS naartoe te verplaatsen: er is geen build-stap.
//
// Vandaar de tweede grens hieronder, op alleen de regels binnen <script>. Die meet wat
// de regel bedoelt. De totale grens blijft staan als vangnet tegen een bestand dat op
// een andere manier uitdijt, maar de JS-grens is degene die iets zegt.
//
// Verdeling op dit moment: 12.085 JavaScript · 2.157 CSS · 840 HTML.
const MAX_REGELS_INDEX = 15082;
const MAX_REGELS_JS     = 12085;

function regels(pad) {
  return readFileSync(join(WORTEL, pad), 'utf8').split('\n').length;
}

/** Regels binnen <script>-blokken; `src=`-verwijzingen tellen niet mee. */
function scriptRegels(pad) {
  const bron = readFileSync(join(WORTEL, pad), 'utf8');
  return [...bron.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .reduce((n, m) => n + m[1].split('\n').length, 0);
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

  it(`het script in index.html blijft binnen ${MAX_REGELS_JS} regels`, () => {
    // Dit is de grens die de regel uit CLAUDE.md daadwerkelijk uitdrukt. CSS en
    // HTML tellen niet mee: daar valt niets aan te extraheren, en groei daarin
    // zegt niets over toetsbaarheid.
    const n = scriptRegels('index.html');
    expect(
      n,
      `index.html bevat ${n} regels script (grens ${MAX_REGELS_JS}). Nieuwe logica met `
      + 'een eigen redenering hoort in src/ met een unittest — zie CLAUDE.md.',
    ).toBeLessThanOrEqual(MAX_REGELS_JS);
  });
});
