/**
 * Unit tests — een onzekere passagemarkering meldt zichzelf
 *
 * Gemeld op 8 september 2026: een bevinding over de kerst- en oud-en-nieuwregeling
 * markeerde de alinea over identiteitsbewijzen, twintig regels verderop. De kaartvolgorde
 * klopte; alleen de aangewezen plek niet.
 *
 * De oorzaak stond al in de code beschreven — een glijdend venster van vier woorden dat de
 * eerste treffer neemt — en fallback 2 was daar al voor gebouwd. Maar fallback 3 doet dat
 * venster alsnog, en meldde niet dat zijn uitkomst onbetrouwbaar is.
 *
 * De markering blijft staan: bij gescande documenten is het vaak de enige die er is. Maar
 * hij komt nu met het letterlijke citaat en een waarschuwing, zodat de mediator zelf ziet
 * of de plek klopt. Een stille verkeerde markering is erger dan geen.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('de banner kan waarschuwen', () => {
  it('kent een onzeker-stand', () => {
    expect(bron).toMatch(/function toonPassageBanner\(passage, onzeker = false\)/);
    expect(bron).toMatch(/Markering onzeker/);
  });

  it('ziet er anders uit dan een gewone verwijzing', () => {
    expect(bron).toMatch(/\.passage-banner\.onzeker\{/);
  });
});

describe('de twee zoekmethoden die het mis kunnen hebben, melden dat', () => {
  it('het glijdende venster van vier woorden toont het citaat erbij', () => {
    const idx = bron.indexOf("woorden.slice(i, i + 4).join(' ')");
    expect(idx).toBeGreaterThan(-1);
    expect(bron.slice(idx, idx + 800)).toMatch(/toonPassageBanner\(passage, true\)/);
  });

  it('een fragment dat meer dan één keer voorkomt ook', () => {
    const idx = bron.indexOf('_uniek.voorkomens !== 1');
    expect(idx).toBeGreaterThan(-1);
    expect(bron.slice(idx, idx + 120)).toMatch(/toonPassageBanner\(passage, true\)/);
  });

  it('een zekere treffer krijgt geen waarschuwing', () => {
    // Zonder deze grens zou elke markering een waarschuwing dragen en niemand hem lezen.
    const zeker = bron.match(/toonPassageBanner\(passage\)/g) || [];
    expect(zeker.length).toBeGreaterThan(0);
  });
});
