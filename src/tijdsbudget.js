/**
 * src/tijdsbudget.js — hoeveel tijd is er nog?
 *
 * Eén regel, op twee plekken nodig: bij de PDF-conversie in de browser en bij de
 * Claude-aanroepen op de server. Hij staat hier los zodat er geen tweede, iets
 * andere versie ontstaat.
 *
 * **Een tijdsgrens is een wandklokgrens.** Hij telt álles mee — het wachten én de
 * aanroepen zelf — en de limiet van één aanroep is nooit langer dan wat er van het
 * totaal over is.
 *
 * Waarom dat laatste ertoe doet: zonder die afkapping overleeft één aanroep de grens
 * alsnog, en dan is de grens een suggestie. Dat is precies wat er op 29 augustus 2026
 * misging bij de conversie (de grens telde alleen de slaaptijd en werd bovenaan de lus
 * getoetst) en op 31 augustus bij de analyse (geen enkele Claude-aanroep had een
 * limiet, dus een trage aanroep at de hele functieduur op en nam de rest mee).
 */

/**
 * @param {object} p
 * @param {number} p.gestartOp      begin van het geheel (ms)
 * @param {number} p.nu             huidig tijdstip (ms)
 * @param {number} p.maxMs          grens voor het geheel
 * @param {number} p.perAanroepMs   grens voor deze ene aanroep
 * @returns {{verstreken:number, resterend:number, verlopen:boolean, aanroepMs:number}}
 */
export function tijdsbudget({ gestartOp, nu, maxMs, perAanroepMs } = {}) {
  const verstreken = Math.max(0, (Number(nu) || 0) - (Number(gestartOp) || 0));
  const grens      = Number.isFinite(maxMs) ? maxMs : 0;
  const perAanroep = Number.isFinite(perAanroepMs) ? perAanroepMs : grens;
  const resterend  = Math.max(0, grens - verstreken);
  return {
    verstreken,
    resterend,
    verlopen:  resterend <= 0,
    aanroepMs: Math.max(0, Math.min(perAanroep, resterend)),
  };
}
