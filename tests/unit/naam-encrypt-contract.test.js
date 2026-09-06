/**
 * Unit tests — het afgesproken antwoordveld tussen api/naam-encrypt.js en de browser
 *
 * ── AANLEIDING (6 september 2026) ───────────────────────────────────────────
 *
 * `api/naam-encrypt.js` antwoordt met `{ blob }`. `index.html` las daaruit `namen_map`:
 *
 *     if (encResp.ok) ({ namen_map } = await encResp.json());
 *
 * Dat veld bestaat niet, dus `namen_map` bleef `undefined` — en omdát de aanroep slaagde
 * werd er niets gelogd. Elke `namen_map ? gepseudonimiseerd : onbewerkt` viel daarna in de
 * else-tak: rapport, classificatie, bestandsnaam én de volledige documenttekst
 * (`_teksten_per_pad`) gingen onbewerkt de database in.
 *
 * Gemeten toen het aan het licht kwam: 4 van de 4 screeningen in de database hadden geen
 * `namen_map`, van 19 augustus tot 6 september. De AVG-opzet uit de skill `avg-beleid`
 * — pseudonimiseren en de namen versleuteld bewaren — is nooit in werking geweest.
 *
 * Waarom niemand het zag: het gedrag op het scherm is identiek. Onbewerkt opslaan en
 * onbewerkt terugleggen geeft de mediator precies wat hij verwacht. Alleen de inhoud van
 * de database verschilt, en daar kijkt niemand.
 *
 * Deze test bewaakt daarom niet het gedrag maar de afspraak: beide kanten moeten hetzelfde
 * veld noemen. Zo'n verschil is met een browsertest niet te zien.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lees = (p) => readFileSync(join(WORTEL, p), 'utf8').replace(/\r\n/g, '\n');

describe('api/naam-encrypt.js', () => {
  const bron = lees('api/naam-encrypt.js');

  it('antwoordt met een veld `blob`', () => {
    expect(bron).toMatch(/JSON\.stringify\(\{\s*blob/);
  });

  it('noemt zijn antwoordveld nergens namen_map', () => {
    // Zou het endpoint ooit `namen_map` gaan heten, dan moet index.html mee — en dan
    // hoort deze test rood te worden in plaats van de opslag stil te laten degraderen.
    expect(bron).not.toMatch(/JSON\.stringify\(\{\s*namen_map/);
  });
});

describe('index.html leest hetzelfde veld', () => {
  const bron = lees('index.html');

  it('haalt `blob` uit het antwoord van naam-encrypt', () => {
    expect(bron).toMatch(/const \{ blob \} = await encResp\.json\(\)/);
  });

  it('destructureert geen veld dat het endpoint niet stuurt', () => {
    expect(bron).not.toMatch(/\(\{ namen_map \} = await encResp\.json\(\)\)/);
  });

  it('merkt het op als er tóch geen blob terugkomt', () => {
    // Een geslaagde aanroep zonder bruikbaar antwoord was precies de stille vorm die dit
    // drie weken heeft laten voortduren.
    expect(bron).toMatch(/naam-encrypt gaf geen blob terug/);
  });

  it('stuurt bij het ontsleutelen de kolom als `blob` mee', () => {
    // De kolom heet namen_map, het API-veld heet blob. Die kant was al goed; hier
    // vastgelegd zodat een latere opruimactie ze niet "gelijktrekt" en dan de laadkant
    // breekt.
    expect(bron).toMatch(/body: JSON\.stringify\(\{ blob: data\.namen_map \}\)/);
  });
});
