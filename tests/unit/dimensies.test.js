/**
 * Unit tests — src/analyse/dimensies.js
 *
 * De helft hiervan zijn bronwachters. Reden: de fout die dit oplost was niet dat een
 * lijst verkeerd was, maar dat er zes waren en dat niemand kon zien welke de regel droeg
 * en welke de opmaak. Een test op de functies alleen laat dat terugkomen — er komt
 * gewoon een zevende lijst bij, en die kan er jaren staan zonder iets te melden.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  VOORRANG_DIMENSIES, WEERGAVE_DIMENSIES, WEERGAVE_ZONDER_CROSSDOC, zwaarsteDimensie,
} from '../../src/analyse/dimensies.js';

describe('de twee volgordes', () => {
  it('bevatten dezelfde vijf dimensies', () => {
    // Dít is de fout die stil kan optreden: een zesde dimensie die maar in één lijst
    // belandt. De volgorde mag verschillen, het gezelschap niet.
    expect([...VOORRANG_DIMENSIES].sort()).toEqual([...WEERGAVE_ZONDER_CROSSDOC].sort());
  });

  it('houden de voorrang uit de prompt aan', () => {
    // api/_prompts/bevindingen.js en de skill screening-categorien zeggen:
    // juridisch > conflicten > volledigheid > balans > grammatica.
    expect(VOORRANG_DIMENSIES).toEqual(
      ['juridisch', 'conflicten', 'volledigheid', 'balans', 'grammatica']);
  });

  it('zetten cross_doc alleen in de weergavelijst', () => {
    expect(WEERGAVE_DIMENSIES).toContain('cross_doc');
    expect(VOORRANG_DIMENSIES).not.toContain('cross_doc');
    expect(WEERGAVE_ZONDER_CROSSDOC).not.toContain('cross_doc');
  });

  it('zijn niet per ongeluk te wijzigen', () => {
    expect(Object.isFrozen(VOORRANG_DIMENSIES)).toBe(true);
    expect(Object.isFrozen(WEERGAVE_DIMENSIES)).toBe(true);
  });
});

describe('zwaarsteDimensie', () => {
  it('kiest volgens de voorrang, niet volgens de volgorde in de bevinding', () => {
    expect(zwaarsteDimensie(['balans', 'juridisch'])).toBe('juridisch');
    expect(zwaarsteDimensie(['grammatica', 'volledigheid'])).toBe('volledigheid');
  });

  it('laat conflicten winnen van volledigheid en balans', () => {
    // Het gemelde geval: het dashboard telde ["balans","conflicten"] als balans, omdat
    // het de weergavevolgorde aflíep. Die zet conflicten op vier.
    expect(zwaarsteDimensie(['balans', 'conflicten'])).toBe('conflicten');
    expect(zwaarsteDimensie(['volledigheid', 'conflicten'])).toBe('conflicten');
  });

  it('weegt cross_doc juridisch', () => {
    expect(zwaarsteDimensie(['cross_doc'])).toBe('juridisch');
  });

  it('valt terug bij onzin of niets', () => {
    expect(zwaarsteDimensie([])).toBe('volledigheid');
    expect(zwaarsteDimensie(null)).toBe('volledigheid');
    expect(zwaarsteDimensie(['onzin'])).toBe('volledigheid');
    expect(zwaarsteDimensie(['onzin'], 'grammatica')).toBe('grammatica');
  });
});

// ── Bronwachter: geen zevende lijst ─────────────────────────────────────────
//
// Zoekt naar array-literals die drie of meer dimensienamen op een rij zetten. Zo'n
// literal is per definitie een eigen kopie van de volgorde, en dan is de vraag welke van
// de twee betekenissen erin zit — precies wat er zes keer níet bij stond.
//
// Uitzonderingen staan hieronder mét reden. Een uitzondering zonder reden is geen
// uitzondering maar een gemiste.

const DIMS = ['juridisch', 'conflicten', 'volledigheid', 'balans', 'grammatica', 'cross_doc'];
const LITERAL = new RegExp(
  String.raw`\[\s*(?:'(?:${DIMS.join('|')})'\s*,\s*){2,}'(?:${DIMS.join('|')})'`, 'g');

/** Bestanden waar een eigen lijst wél klopt, met de reden erbij. */
const TOEGESTAAN = {
  'src/analyse/dimensies.js':
    'de bron zelf',
  'index.html':
    "één plek: de terugvallees van het oude rapportschema (r.grammatica, r.juridisch, …). "
    + 'Dat zijn sleutels van een schema uit 2025, geen dimensies — ze veranderen niet meer '
    + 'mee als er een dimensie bij komt, en moeten dat ook niet.',
};

/** Hoeveel literals er per bestand hoogstens mogen staan. */
const MAX = { 'src/analyse/dimensies.js': 2, 'index.html': 1 };

function bronBestanden(map, uit = []) {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) bronBestanden(pad, uit);
    else if (/\.(js|mjs)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

describe('bronwachter — de dimensielijst staat op één plek', () => {
  const wortel = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const paden = [...bronBestanden(join(wortel, 'src')), join(wortel, 'index.html')];

  for (const pad of paden) {
    const rel = pad.slice(wortel.length).replace(/[\\]/g, '/');
    it(`${rel} schrijft de lijst niet opnieuw uit`, () => {
      const treffers = readFileSync(pad, 'utf8').match(LITERAL) ?? [];
      if (!treffers.length) return;
      expect(TOEGESTAAN[rel],
        `${rel} zet ${treffers.length}× een eigen dimensielijst neer: ${treffers.join(' | ')}.\n`
        + 'Gebruik VOORRANG_DIMENSIES of WEERGAVE_DIMENSIES uit src/analyse/dimensies.js, '
        + 'of zet dit bestand in TOEGESTAAN met de reden waarom een eigen lijst hier klopt.',
      ).toBeTruthy();
      expect(treffers.length).toBeLessThanOrEqual(MAX[rel] ?? 0);
    });
  }
});
