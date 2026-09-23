/**
 * tests/unit/dev-poort.test.js
 *
 * De bronwachter op de poort van de dev-server. `package.json` kan geen JavaScript
 * importeren, dus daar staat het getal noodgedwongen een tweede keer. Deze test bewaakt
 * dat die twee gelijk blijven — zonder wachter drijft het npm-script stil af, en dan
 * start je een server op de ene poort terwijl de eval de andere aanspreekt.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_POORT, DEV_ADRES } from '../../src/dev-poort.js';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8'));

describe('dev-poort', () => {
  it('is een geldige poort', () => {
    expect(Number.isInteger(DEV_POORT)).toBe(true);
    expect(DEV_POORT).toBeGreaterThan(1024);
    expect(DEV_POORT).toBeLessThan(65536);
  });

  it('bouwt het adres eruit op', () => {
    expect(DEV_ADRES).toBe(`http://localhost:${DEV_POORT}`);
  });

  it('botst niet met de poorten die al in gebruik zijn', () => {
    // 3000 is van de MfN-trainer, 3001 van de statische server in playwright.config.js,
    // 3100 was de tijdelijke uitwijk van de trainer. Zie de kop van src/dev-poort.js.
    expect([3000, 3001, 3100]).not.toContain(DEV_POORT);
  });
});

describe('bronwachter — package.json en de constante zeggen hetzelfde', () => {
  it('heeft een lokaal-script', () => {
    expect(pkg.scripts?.lokaal, 'package.json mist het lokaal-script').toBeTruthy();
  });

  it('gebruikt daarin dezelfde poort', () => {
    const genoemd = String(pkg.scripts.lokaal).match(/--listen\s+(\d+)/)?.[1];
    expect(genoemd, `--listen ontbreekt in "${pkg.scripts.lokaal}"`).toBeDefined();
    expect(Number(genoemd)).toBe(DEV_POORT);
  });
});

describe('bronwachter — playwright houdt zijn eigen poort', () => {
  it('draait op een andere poort dan de dev-server', () => {
    // Playwright serveert de statische bestanden zelf en heeft de API niet nodig; die
    // twee servers horen elkaar dus niet in de weg te zitten.
    const cfg = readFileSync(join(WORTEL, 'playwright.config.js'), 'utf8');
    const poorten = [...cfg.matchAll(/localhost:(\d+)|--listen\s+(\d+)/g)]
      .map((m) => Number(m[1] ?? m[2]));
    expect(poorten.length, 'geen poort gevonden in playwright.config.js').toBeGreaterThan(0);
    for (const p of poorten) expect(p, 'playwright botst met de dev-server').not.toBe(DEV_POORT);
  });
});
