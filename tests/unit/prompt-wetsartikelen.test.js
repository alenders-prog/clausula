/**
 * Unit test — wetsartikelen in de screening-prompts
 *
 * Aanleiding (24 augustus 2026). De convenant-checklist zei:
 *
 *   "Bij nihilbeding: bewust en geïnformeerd (art. 1:159 BW)? Termijn max 12 jaar
 *    (art. 1:157 BW)?"
 *
 * Twee fouten in één regel. Art. 1:158 BW is de overeenkomst zelf (de grondslag
 * van het nihilbeding); art. 1:159 BW is het OPTIONELE niet-wijzigingsbeding.
 * Door 1:159 als eis te noemen, beval de screening een niet-wijzigingsbeding aan
 * bij een convenant dat één alinea verder juist voorzag in herberekening bij
 * gewijzigde omstandigheden — het tegenovergestelde van wat partijen wilden.
 * En de termijn van twaalf jaar is oud recht: sinds 1 januari 2020 is de
 * hoofdregel de helft van de huwelijksduur met een maximum van vijf jaar.
 *
 * Waarom een test en niet een review: dit is geen codefout. De JavaScript klopte,
 * de prompt laadde, er kwam geen foutmelding — er stond alleen een verkeerd
 * nummer in een zin. Daar kijkt een lezer overheen; een tabel niet.
 *
 * De tabel hieronder is met de hand onderhouden en dekt de artikelen die in de
 * praktijk door elkaar lopen. Loopt hij vast op een nieuwe, terechte formulering,
 * breid hem dan uit — maar controleer eerst de wettekst.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Alle promptbestanden plus de twee plekken die zelf prompttekst bevatten. */
function promptRegels() {
  const map = join(WORTEL, 'api/_prompts');
  const paden = readdirSync(map).filter(f => f.endsWith('.js')).map(f => join('api/_prompts', f));
  paden.push('api/analyseer.js', 'api/_feiten.js');

  const regels = [];
  for (const pad of paden) {
    const bron = readFileSync(join(WORTEL, pad), 'utf8').split('\n');
    bron.forEach((tekst, i) => regels.push({ pad, nr: i + 1, tekst }));
  }
  return regels;
}

/** Elk "art. 1:159 BW" / "art. 1:157 lid 3 BW" op een regel → ['1:159', '1:157']. */
function artikelen(tekst) {
  return [...tekst.matchAll(/art(?:ikel)?\.?\s*(\d+:\d+[a-z]?)/gi)].map(m => m[1]);
}

// Begrip → het artikel waar het thuishoort. `tenzij` vangt regels op die het
// begrip alleen noemen om het van een ander artikel te ONDERSCHEIDEN.
const HOORT_BIJ = [
  {
    begrip:  /niet-wijzigingsbeding/i,
    artikel: '1:159',
    uitleg:  'het niet-wijzigingsbeding staat in art. 1:159 BW ("kan worden bedongen"), niet in 1:158',
  },
  {
    begrip:  /nihilbeding/i,
    artikel: '1:158',
    tenzij:  /niet-wijzigingsbeding|1:159a|participatiewet|1:401|1:400/i,
    uitleg:  'de grondslag van het nihilbeding is art. 1:158 BW; 1:159 is het losse, optionele niet-wijzigingsbeding',
  },
];

describe('wetsartikelen in de screening-prompts', () => {
  const regels = promptRegels();

  it('leest de promptbestanden daadwerkelijk in', () => {
    // Zonder deze controle slaagt alles hieronder ook als het pad niet klopt.
    expect(regels.length).toBeGreaterThan(200);
    expect(regels.some(r => /nihilbeding/i.test(r.tekst))).toBe(true);
  });

  for (const { begrip, artikel, tenzij, uitleg } of HOORT_BIJ) {
    it(`koppelt ${begrip.source} aan art. ${artikel} BW`, () => {
      const fout = regels.filter(r => {
        if (!begrip.test(r.tekst)) return false;
        if (tenzij && tenzij.test(r.tekst)) return false;
        const gevonden = artikelen(r.tekst);
        if (!gevonden.length) return false;          // geen artikel genoemd — prima
        return !gevonden.includes(artikel);
      });
      expect(
        fout.map(r => `${r.pad}:${r.nr} — ${r.tekst.trim().slice(0, 120)}`),
        `Verkeerd wetsartikel bij een begrip: ${uitleg}.`,
      ).toEqual([]);
    });
  }

  it('noemt de twaalfjaarstermijn nooit zonder erbij te zeggen dat het oud recht is', () => {
    // Sinds 1-1-2020: helft van de huwelijksduur, maximaal vijf jaar (art. 1:157
    // lid 1 BW). Twaalf jaar geldt alleen voor verzoeken van vóór die datum.
    // Regels over de leeftijd van kinderen (lid 4) vallen hier terecht buiten.
    const OUD_RECHT = /oud(e)? recht|oude termijn|v[óo]{1,2}r 1 januari 2020|tot 2020/i;
    const fout = regels.filter(r =>
      /(twaalf|12)\s*jaar/i.test(r.tekst)
      && /alimentatie|levensonderhoud/i.test(r.tekst)
      && !/kind/i.test(r.tekst)
      && !OUD_RECHT.test(r.tekst));
    expect(
      fout.map(r => `${r.pad}:${r.nr} — ${r.tekst.trim().slice(0, 120)}`),
      'De termijn van twaalf jaar is vervangen door de helft van de huwelijksduur '
      + 'met een maximum van vijf jaar (art. 1:157 lid 1 BW, sinds 1-1-2020). Noem hem '
      + 'alleen met de aantekening dat het oud recht is.',
    ).toEqual([]);
  });
});
