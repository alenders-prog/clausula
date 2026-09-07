/**
 * Elk endpoint controleert kantoorlidmaatschap, niet alleen de token.
 *
 * ── AANLEIDING ──────────────────────────────────────────────────────────────
 *
 * Op 5 september 2026 bleek een geldige Supabase-token niets te zeggen over lidmaatschap
 * van een kantoor: wie zich kon aanmelden maar geen profielrij had, kwam overal binnen.
 * Dat is toen gerepareerd met `magApiGebruiken` — maar op drie van de acht endpoints. De
 * andere vijf bleven op `verifieerJWT` staan, en dat was aan niets te zien: ze hadden
 * allemaal keurig een auth-blok.
 *
 * Onder die vijf zat `naam-decrypt.js`, dat cliëntnamen ontsleutelt.
 *
 * Deze test maakt er een regel van in plaats van een gewoonte. Komt er een endpoint bij,
 * dan gaat hij rood totdat de controle erin staat of het bestand bewust in
 * `ZONDER_CONTROLE` is gezet — en dat laatste staat dan in de diff.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const API = new URL('../../api/', import.meta.url);

/**
 * Endpoints die de controle NIET horen te hebben, met de reden erbij.
 * Alleen uitbreiden als de reden net zo hard is als deze.
 */
const ZONDER_CONTROLE = {
  // Wie zich registreert heeft per definitie nog geen profiel. De bescherming zit hier in
  // het uitnodigingstoken: zonder geldige uitnodiging komt er geen account.
  'registreer.js': 'registratie gaat vooraf aan het profiel',
};

const endpoints = readdirSync(API)
  .filter((n) => n.endsWith('.js') && !n.startsWith('_'))
  .sort();

describe('toegangscontrole op de endpoints', () => {
  it('vindt de endpoints (anders bewijst deze test niets)', () => {
    // Zonder deze controle zou een verkeerd pad een lege lijst geven en zou élke
    // assertie hieronder slagen zonder iets te toetsen.
    expect(endpoints.length).toBeGreaterThanOrEqual(8);
  });

  for (const naam of endpoints) {
    const bron = readFileSync(new URL(naam, API), 'utf8');

    if (ZONDER_CONTROLE[naam]) {
      it(`${naam} — bewust zonder controle: ${ZONDER_CONTROLE[naam]}`, () => {
        expect(bron).not.toMatch(/magApiGebruiken\s*\(/);
      });
      continue;
    }

    it(`${naam} roept magApiGebruiken aan en gebruikt de uitkomst`, () => {
      expect(bron).toMatch(/magApiGebruiken\s*\(/);
      // Aanroepen is niet genoeg: de uitkomst moet het verzoek ook echt kunnen stoppen.
      // De ene helft van de endpoints noemt hem `toegang`, de andere `_toegang` — dat
      // verschil is historisch en niet de moeite van een hernoemronde waard.
      expect(bron).toMatch(/!\s*_?toegang\.toegestaan/);
      expect(bron).toMatch(/_?toegang\.http/);
    });

    it(`${naam} doet dat vóór het de payload aanraakt`, () => {
      // Positie in het bestand zegt niets — deze endpoints hebben koppen van dertig regels,
      // waardoor een controle bovenaan de handler op 60% van het bestand staat. Wat er wél
      // toe doet: eerst toestemming, dan pas de body lezen of ermee werken.
      const start = bron.indexOf('magApiGebruiken(');
      expect(start).toBeGreaterThan(-1);

      const werk = [/req\.json\(\)/, /req\.body/].
        map((re) => bron.search(re)).filter((i) => i > -1);
      for (const i of werk) expect(start).toBeLessThan(i);
    });
  }
});
