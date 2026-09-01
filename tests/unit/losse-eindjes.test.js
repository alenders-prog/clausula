/**
 * tests/unit/losse-eindjes.test.js — de poort onder scripts/losse-eindjes.mjs
 *
 * Aanleiding (1 september 2026). Drie keer op één dag dezelfde fout: code die bestond,
 * getest was, en nergens werd aangeroepen. `sorteerOpType`, `bouwPrimaireBest`, en een
 * prompt die naar een tool-veld wees dat al een maand weg was. Geen van drieën gaf een
 * foutmelding; alle drie kwamen ze aan het licht doordat een mediator iets raars zag.
 *
 * Een script dat je met de hand moet draaien lost dat niet op — dat is precies hoe de
 * kennisbankcontrole eerder ook stil bleef. Deze test draait bij élke `npx vitest run`.
 *
 * ── WAAROM EEN PLAFOND EN GEEN NUL ──────────────────────────────────────────
 *
 * Er staan er nu acht, en die zijn niet in één ronde weg zonder haastwerk. Een test die
 * meteen op nul staat zou vandaag rood zijn en dus uitgezet worden — en dan is hij
 * minder waard dan geen test.
 *
 * Het plafond mag ALLEEN OMLAAG, net als de omvangsgrens. Verhogen kan, maar dan staat
 * het in de diff en is het een besluit. Ruim je er een op, verlaag het dan meteen: dat
 * is de enige manier waarop deze lijst krimpt in plaats van te blijven hangen.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const WORTEL = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

/**
 * Stand op 1 september 2026, na het aansluiten van sorteerOpType en bouwPrimaireBest.
 *
 *   4 × window-export uit src/chips/hml-counts.js die nergens wordt gebruikt, terwijl
 *       index.html op zes plekken zelf H/M/L telt.
 *
 * De vier test-only exports zijn 1 september afgehandeld: scheidBijlageIssues is
 * aangesloten (analyseer.js deed het ernaast na), issuesVan en zonderBullet zijn
 * weggehaald (speculatieve helpers), en bevestigdeTotp staat in TOEGESTAAN omdat de
 * 2FA-uitrol nog wacht.
 *
 * Beide staan met naam in de uitvoer van het script.
 */
const PLAFOND = 4;

function scan() {
  try {
    // Exitcode 1 bij bevindingen — vandaar de try. stdout draagt de UITKOMST-regel,
    // stderr de lijst zelf. Allebei nodig: de vorige hook las er maar één en gooide
    // daarmee precies de bevindingen weg.
    const uit = execFileSync(process.execPath, [join(WORTEL, 'scripts/losse-eindjes.mjs')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { stdout: uit, stderr: '', aantal: 0 };
  } catch (err) {
    const stdout = err.stdout || '', stderr = err.stderr || '';
    const m = stdout.match(/UITKOMST: (\d+) los/);
    return { stdout, stderr, aantal: m ? Number(m[1]) : -1 };
  }
}

describe('losse eindjes', () => {
  const { stdout, stderr, aantal } = scan();

  it('het script geeft een leesbare uitkomst', () => {
    // Zonder deze regel zou een script dat crasht als "nul bevindingen" tellen.
    expect(stdout, `geen UITKOMST-regel:\n${stdout}\n${stderr}`).toMatch(/UITKOMST:/);
    expect(aantal).toBeGreaterThanOrEqual(0);
  });

  it(`er zijn er hoogstens ${PLAFOND}`, () => {
    expect(aantal, `\n${stderr}\nVerlaag PLAFOND in dit bestand zodra je er een opruimt.\n`)
      .toBeLessThanOrEqual(PLAFOND);
  });

  it('het plafond staat niet onnodig hoog', () => {
    // Anders zakt de lat vanzelf: iemand ruimt iets op, en de ruimte blijft staan voor
    // het volgende losse eindje. Zo werd de omvangsgrens ook een wassen neus.
    expect(aantal, `er zijn er nog ${aantal}; zet PLAFOND op ${aantal}`).toBe(PLAFOND);
  });
});
