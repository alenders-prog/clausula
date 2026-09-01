/**
 * src/rapport/passage-herkomst.js — komt dit citaat uit het document dat geanalyseerd wordt?
 *
 * Aanleiding (1 september 2026). Onder het tabblad *Ouderschapsplan* stond een bevinding
 * over een inconsistente schrijfwijze in het **verdelingsoverzicht — een bijlage bij het
 * convenant**. De bevinding zei het zelfs zelf: "Hoewel dit een bijlage bij het convenant
 * betreft". Een mediator die daarop afgaat, zoekt in het verkeerde document.
 *
 * Elke analyse-aanroep krijgt één hoofddocument plus de bijlagen als context, onder de kop
 * "BIJLAGEN (ter context — niet apart analyseren)". Maar de grammatica-instructie zegt
 * "Scan het VOLLEDIGE document", en die twee botsen. Het model koos begrijpelijkerwijs de
 * ruimste lezing.
 *
 * Een promptregel erbij helpt, maar blijft een verzoek. Dit is de controle: een citaat dat
 * NIET in het hoofddocument staat en WEL in de bijlagen, komt aantoonbaar uit de bijlage.
 *
 * ── DE TOETS IS MET OPZET SCHEEF ────────────────────────────────────────────
 *
 * Passages matchen is niet waterdicht — het model citeert lang niet altijd letterlijk.
 * Alleen "niet in het hoofddocument gevonden" is dus veel te zwak om iets weg te gooien:
 * dat overkomt ook een legitieme bevinding met een parafrase. Pas als het citaat
 * ergens ánders wél positief te vinden is, weet je waar het vandaan komt.
 *
 * En zelfs dat is niet genoeg, want de trappen van `vindPositie` verschillen sterk in
 * hardheid. Drie inhoudswoorden op een rij ("bankrekening rabobank toedeling") staan zó
 * in een verdelingsoverzicht én in het convenant dat erover gaat; dat bewijst niets.
 * Vandaar twee verschillende lat-hoogtes:
 *
 *   blijven staan    élke trap in het hoofddocument volstaat, tot en met woorden3
 *   verwijderd       alleen een hárde treffer in de bijlage telt: letterlijk, de eerste
 *                    zestig tekens, of vier inhoudswoorden op een rij
 *
 * Alles daartussen is `onbekend` en blijft dus gewoon staan. Een onterecht getoonde
 * bevinding is hinderlijk; een weggegooide is onzichtbaar.
 */

import { bouwSkelet, vindPositie } from './doc-volgorde.js';

/** De drie mogelijke uitkomsten. */
export const HOOFD    = 'hoofd';
export const BIJLAGE  = 'bijlage';
export const ONBEKEND = 'onbekend';

/** Trappen die hard genoeg zijn om een bevinding op te verwijderen. Zie de nota hierboven. */
export const HARDE_TRAPPEN = new Set(['exact', 'begin', 'woorden4']);

/** Eén keer voorbereiden, dan per issue hergebruiken — het skelet bouwen kost werk. */
export function maakHerkomstToets({ hoofdTekst = '', contextTekst = '' } = {}) {
  const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ctxVan = (t) => ({ docNorm: t, inhoudSkelet: bouwSkelet(t, true), volSkelet: bouwSkelet(t, false) });

  const hoofd   = norm(hoofdTekst);
  const context = norm(contextTekst);
  const hoofdCtx   = hoofd ? ctxVan(hoofd) : null;
  const contextCtx = context ? ctxVan(context) : null;

  // Geen artikel meegeven: de artikeltrap zegt alleen iets over vólgorde binnen één
  // document, niet over herkomst. "Artikel 3" staat in elk stuk.
  const trapVan = (ctx, p) => vindPositie(ctx, { passages: [p] }).trap;

  /**
   * @param {string} passage  het citaat zoals het model het gaf
   * @returns {'hoofd'|'bijlage'|'onbekend'}
   */
  return function herkomst(passage) {
    const p = norm(passage);
    if (!p || !hoofdCtx) return ONBEKEND;

    // Staat hij op wélke manier dan ook in het hoofddocument, dan is er niets aan de
    // hand — ook als hij toevallig óók in een bijlage voorkomt.
    if (trapVan(hoofdCtx, p) !== 'geen') return HOOFD;

    // Niet in het hoofddocument. Nu moet de bijlage het hárd maken.
    if (contextCtx && HARDE_TRAPPEN.has(trapVan(contextCtx, p))) return BIJLAGE;

    return ONBEKEND;
  };
}

/**
 * Splitst een lijst issues in wat blijft en wat aantoonbaar uit een bijlage komt.
 *
 * @returns {{blijft: Array, uitBijlage: Array}}
 */
export function scheidBijlageIssues(issues, { hoofdTekst, contextTekst } = {}) {
  const lijst = Array.isArray(issues) ? issues : [];
  if (!contextTekst) return { blijft: lijst, uitBijlage: [] };

  const herkomst = maakHerkomstToets({ hoofdTekst, contextTekst });
  const blijft = [], uitBijlage = [];
  for (const iss of lijst) {
    (herkomst(iss?.passage) === BIJLAGE ? uitBijlage : blijft).push(iss);
  }
  return { blijft, uitBijlage };
}
