/**
 * Unit tests — src/concept/vervangbaar.js
 *
 * Het gemelde geval: twee correcties op hetzelfde soort fout, één werd doorgevoerd en de
 * andere niet. `etc.:` haalde de oude grens van vijf tekens, `etc:` niet — en er werd
 * niets gelogd, dus van buiten leek het alsof de wijziging niet nodig was.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { magZoeken, MIN_LENGTE } from '../../src/concept/vervangbaar.js';

describe('het gemelde geval', () => {
  it('laat "etc:" door — vier tekens, viel onder de oude grens van vijf', () => {
    expect(magZoeken('etc:').ok).toBe(true);
  });

  it('laat "etc.:" ook door, zoals altijd al', () => {
    expect(magZoeken('etc.:').ok).toBe(true);
  });

  it('houdt beide correcties gelijk — dát was de klacht', () => {
    // Twee kaarten voor twee vindplaatsen van dezelfde fout hoorden allebei te werken.
    expect(magZoeken('etc:').ok).toBe(magZoeken('etc.:').ok);
  });
});

describe('de ondergrens', () => {
  it('weigert een origineel dat te kort is om het juiste voorkomen aan te wijzen', () => {
    // "de" zou het eerste beste woord in het document raken. Een fout concept is erger
    // dan een overgeslagen correctie: dan wijst niemand het aan.
    expect(magZoeken('de').ok).toBe(false);
    expect(magZoeken('a').ok).toBe(false);
  });

  it('weigert lege en witte invoer', () => {
    for (const v of ['', '   ', null, undefined]) expect(magZoeken(v).ok).toBe(false);
  });

  it('geeft altijd een reden terug als het niet mag', () => {
    // Stil overslaan is wat deze fout onzichtbaar hield.
    expect(magZoeken('de').reden).toMatch(/te kort/i);
    expect(magZoeken('de').reden).toContain(String(MIN_LENGTE));
    expect(magZoeken('').reden).toMatch(/leg[e]?/i);
  });

  it('geeft geen reden als het wél mag', () => {
    expect(magZoeken('etc:').reden).toBe('');
  });
});

describe('de bedrading in index.html', () => {
  const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('gebruikt magZoeken in plaats van een losse lengtevergelijking', () => {
    expect(bron).toMatch(/magZoeken\(normOrig\)/);
    expect(bron).not.toMatch(/normOrig\.length < 5/);
  });

  it('logt de reden bij het overslaan', () => {
    // Zonder deze regel is de fout weer net zo onzichtbaar als hij was.
    const idx = bron.indexOf('magZoeken(normOrig)');
    expect(idx).toBeGreaterThan(-1);
    expect(bron.slice(idx, idx + 400)).toMatch(/console\.warn/);
  });
});
