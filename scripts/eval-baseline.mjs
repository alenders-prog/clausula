#!/usr/bin/env node
/**
 * scripts/eval-baseline.mjs
 * Legt de uitkomst van de laatste eval-run vast als baseline.
 *
 *   npm run test:eval        draait de eval en vergelijkt met de baseline
 *   npm run eval:baseline    verklaart de laatste run tot nieuwe baseline
 *
 * De baseline gaat wél in git — dat is het hele punt. `laatste-run-*.json` staat in
 * .gitignore en wordt bij elke run overschreven, waardoor de instructie "vergelijk
 * met de baseline" uit CLAUDE.md nergens op sloeg: het vergelijkingspunt was al weg
 * voordat je kon kijken.
 *
 * Vastleggen is een BESLUIT, geen bijproduct. Daarom een aparte opdracht: de diff
 * staat dan in de commit en iemand heeft ernaar gekeken. Ging de kwaliteit achteruit
 * en leg je dat vast, dan is dat zichtbaar in plaats van stilletjes de norm.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maakBaseline, vergelijk, verslag } from '../tests/helpers/eval-baseline.mjs';

const GOLDEN   = fileURLToPath(new URL('../tests/golden/', import.meta.url));
const BASELINE = join(GOLDEN, 'baseline');

const runs = existsSync(GOLDEN)
  ? readdirSync(GOLDEN).filter(f => f.startsWith('laatste-run-') && f.endsWith('.json'))
  : [];

if (!runs.length) {
  console.error('✗ Geen laatste-run-*.json gevonden. Draai eerst: npm run test:eval');
  process.exitCode = 1;
} else {
  mkdirSync(BASELINE, { recursive: true });
  console.log(`Baseline bijwerken uit ${runs.length} run(s):\n`);

  for (const bestand of runs) {
    const naam = bestand.replace(/^laatste-run-/, '').replace(/\.json$/, '');
    const run  = JSON.parse(readFileSync(join(GOLDEN, bestand), 'utf8'));
    const doel = join(BASELINE, `${naam}.json`);

    const oud = existsSync(doel) ? JSON.parse(readFileSync(doel, 'utf8')) : null;
    console.log(verslag(naam, vergelijk(oud, run.issues || [])));

    writeFileSync(doel, JSON.stringify({
      fixture: run.fixture ?? naam,
      ...maakBaseline(run.issues || []),
    }, null, 2) + '\n');
    console.log(`    → vastgelegd in tests/golden/baseline/${naam}.json\n`);
  }

  console.log('Neem de diff hierboven mee in je commitbericht — dan staat er waaróm de norm verschoof.');
}
