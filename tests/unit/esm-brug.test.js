/**
 * Unit test — de ESM-brug onderaan index.html
 *
 * index.html heeft geen build-stap. De modules uit src/ worden geladen in één
 * `<script type="module">`-blok, maar de rest van het bestand is klassieke code in
 * een gewoon script-blok. Module-scope is géén global scope: een geïmporteerde
 * functie bestaat alleen binnen dat blok, tenzij hij expliciet op `window` wordt
 * gezet.
 *
 * Op 21 augustus 2026 ging dat mis. `bouwVerificatieContext` en `bulletPrefix`
 * werden wel geïmporteerd maar niet doorgegeven, en de aanroep in `diepteAnalyse`
 * gooide op productie een ReferenceError. Niets in de testsuite ving dat: de
 * modules zelf waren getest, de brug ertussen niet.
 *
 * Deze test leest index.html als tekst en controleert de koppeling. Geen browser
 * nodig, en het faalt zodra iemand een import toevoegt zonder de window-regel.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HTML   = readFileSync(join(WORTEL, 'index.html'), 'utf8');

const MODULE_BLOK = HTML.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? '';
const KLASSIEK    = HTML.replace(/<script type="module">[\s\S]*?<\/script>/, '');

/** Alle namen uit `import { a, b } from …` in het moduleblok. */
function geimporteerdeNamen() {
  return [...MODULE_BLOK.matchAll(/import\s*\{([^}]+)\}/g)]
    .flatMap(m => m[1].split(','))
    .map(s => s.trim().split(/\s+as\s+/).pop())
    .filter(Boolean);
}

/** Namen die op window worden gezet. */
function opWindow() {
  return new Set([...MODULE_BLOK.matchAll(/window\.(\w+)\s*=/g)].map(m => m[1]));
}

/** Wordt de naam als functie aangeroepen buiten het moduleblok? */
function aangeroepenInKlassiek(naam) {
  return new RegExp(`\\b${naam}\\s*\\(`).test(KLASSIEK);
}

describe('ESM-brug in index.html', () => {
  it('heeft een moduleblok met imports', () => {
    expect(MODULE_BLOK.length).toBeGreaterThan(100);
    expect(geimporteerdeNamen().length).toBeGreaterThan(5);
  });

  it('zet elke import die de klassieke code aanroept ook op window', () => {
    const brug = opWindow();
    const ontbreekt = geimporteerdeNamen()
      .filter(naam => aangeroepenInKlassiek(naam) && !brug.has(naam));

    expect(
      ontbreekt,
      'Deze functies worden buiten het moduleblok aangeroepen maar staan niet op '
      + 'window. Dat geeft een ReferenceError zodra de code langskomt — voeg '
      + `window.<naam> = <naam>; toe onderaan het moduleblok: ${ontbreekt.join(', ')}`,
    ).toEqual([]);
  });

  it('zet niets op window dat niet geïmporteerd is', () => {
    // Vangt een tikfout in de brugregel, die anders undefined doorgeeft.
    const namen = new Set(geimporteerdeNamen());
    const spook = [...opWindow()].filter(n => !namen.has(n) && !/^app$/.test(n));
    expect(spook, `Op window gezet maar nergens geïmporteerd: ${spook.join(', ')}`).toEqual([]);
  });
});
