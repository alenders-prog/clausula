/**
 * src/analyse/voortgang-status.js — wat er tijdens een analyse te zien is
 *
 * Aanleiding (31 augustus 2026). De zin "Bezig met juridische toets, balans en
 * grammatica…" verdween zodra het eerste verbeterpunt binnenkwam. In de code hing hij
 * aan de verkeerde vraag:
 *
 *     alleI.length > 0 ? <de kaarten> : nogBezig ? <de zin> : <geen issues>
 *
 * De zin was dus de andere tak van "er is nog niets", terwijl hij hoort te hangen aan
 * "er wordt nog gewerkt". Juist in de fase die ertoe doet lopen die twee uiteen: er
 * staan resultaten én er draait nog werk. Wat overbleef waren de veegjes op de grijze
 * fiches, en daaruit valt niet af te lezen waaróp gewacht wordt.
 *
 * Vandaar dat de beslissing hier staat en niet in de opmaak. Er zijn vier toestanden,
 * en het onderscheid tussen de eerste twee is precies wat er misging:
 *
 *   groot      — bezig, nog geen resultaten. De grote gecentreerde versie vult het
 *                lege scherm.
 *   compact    — bezig, er staan al resultaten. Eén regel in de sticky balk, die
 *                geen nieuwe ruimte kost en niet wegscrollt.
 *   afronding  — net klaar. Kort zichtbaar, want anders is het éínde van de analyse
 *                even onzichtbaar als het verloop: de veegjes stoppen, en dat is het.
 *   geen       — er valt niets te melden.
 *
 * De zin krimpt vanzelf naarmate dimensies binnenkomen. Dát is de voortgang die je
 * wilt zien; een animatie kan niet vertellen waar hij op wacht.
 */

import { lijstZin } from '../ui/lijst-zin.js';

/** Vaste volgorde, zodat de zin niet van volgorde wisselt tussen twee tekenbeurten. */
export const DIM_VOLGORDE = ['juridisch', 'volledigheid', 'balans', 'conflicten', 'cross_doc', 'grammatica'];

/** Hoe lang de afrondingsmelding blijft staan. */
export const AFRONDING_MS = 6000;

export const AFRONDING_TEKST = 'Analyse compleet';

/**
 * De dimensies die nog draaien, als kleine letters, in vaste volgorde.
 *
 * `dimLoadt` komt uit index.html en heeft een sleutel per dimensie. Alleen `true` telt:
 * een ontbrekende sleutel betekent "niet aan de orde" (cross_doc bij één document) en
 * niet "nog bezig".
 */
export function lopendeDimensies(dimLoadt = {}, labels = {}) {
  return DIM_VOLGORDE
    .filter(d => dimLoadt?.[d] === true)
    .map(d => String(labels[d] || d).toLowerCase());
}

/** "Bezig met juridische toets, balans en grammatica…" */
export function voortgangZin(dims) {
  const lijst = lijstZin(dims || []);
  return lijst ? `Bezig met ${lijst}…` : 'Bezig met analyseren…';
}

/**
 * De hele toestand in één keer.
 *
 * @param {object} p
 * @param {boolean} p.nogBezig
 * @param {number}  p.aantalIssues     aantal reeds getoonde verbeterpunten
 * @param {object}  p.dimLoadt
 * @param {object}  p.labels           DIM_LABELS uit index.html
 * @param {number}  [p.afgerondOp]     tijdstip waarop de analyse klaar was (ms), of null
 * @param {number}  [p.nu]
 * @returns {{modus:'groot'|'compact'|'afronding'|'geen', zin:string, dims:string[]}}
 */
export function voortgangStatus({
  nogBezig = false, aantalIssues = 0, dimLoadt = {}, labels = {},
  afgerondOp = null, nu = Date.now(), afrondingMs = AFRONDING_MS,
} = {}) {
  const dims = lopendeDimensies(dimLoadt, labels);

  if (nogBezig) {
    return {
      modus: aantalIssues > 0 ? 'compact' : 'groot',
      zin:   voortgangZin(dims),
      dims,
    };
  }

  const klaarSinds = afgerondOp == null ? Infinity : nu - afgerondOp;
  if (klaarSinds >= 0 && klaarSinds < afrondingMs) {
    return { modus: 'afronding', zin: AFRONDING_TEKST, dims: [] };
  }

  return { modus: 'geen', zin: '', dims: [] };
}
