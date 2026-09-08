/**
 * Unit tests — welk documenttabblad hoort bij een passage
 *
 * `bepaalPassageDocIdx` koos HET EERSTE document waarvan een sectie vier inhoudswoorden op
 * rij uit de passage bevatte. Bij een convenant en een ouderschapsplan over dezelfde
 * mensen is dat te vaak het verkeerde: die delen moeiteloos "ouder kind verblijft
 * hoofdverblijf". De viewer sprong dan naar het andere tabblad — erger dan een verkeerde
 * markering, want dan sta je in het verkeerde stuk.
 *
 * Gevonden op 8 september 2026 bij het nalopen van de eigen bugfixes met de vraag "levert
 * dit mechanisme zijn belofte?" — zie CLAUDE.md. Het inzicht stond al opgeschreven in
 * src/viewer/uniek-fragment.js en was niet toegepast op de twee functies ernaast.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('bepaalPassageDocIdx', () => {
  const fn = bron.slice(bron.indexOf('function bepaalPassageDocIdx'),
                        bron.indexOf('function bepaalPassageDocIdx') + 2600);

  it('geeft bij een zwakke treffer alleen antwoord als één document hem heeft', () => {
    expect(fn).toMatch(/raak\.length === 1 \? raak\[0\] : null/);
  });

  it('geeft niet meer het eerste document terug dat toevallig matcht', () => {
    // De oude vorm: `if (secNorm.includes(...)) return idx;` binnen de venster-lus.
    const vensterLus = fn.slice(fn.indexOf('wrd.slice(i, i + 4)'));
    expect(vensterLus.slice(0, 200)).not.toMatch(/return idx;/);
  });

  it('houdt de sterke treffers wél als directe uitkomst', () => {
    // Een sectie die de hele passage bevat is aantoonbaar de juiste — daar hoeft niet
    // over gestemd te worden.
    expect(fn).toMatch(/secNorm\.includes\(pasNorm\)\) return idx;/);
  });
});

describe('vindPassageFractie', () => {
  const fn = bron.slice(bron.indexOf('function vindPassageFractie'),
                        bron.indexOf('function vindPassageFractie') + 1800);

  it('gebruikt een fragment dat maar één keer voorkomt', () => {
    expect(fn).toMatch(/kiesUniekFragment\(pasNorm, docNorm\)/);
    expect(fn).toMatch(/uniek\.voorkomens === 1/);
  });

  it('neemt niet meer de eerste treffer van een glijdend venster', () => {
    expect(fn).not.toMatch(/idx = docNorm\.indexOf\(wrd\.slice/);
  });
});
