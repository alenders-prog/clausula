/**
 * src/conversie/wachtschema.js — het tijdsbudget van een PDF→DOCX-conversie
 *
 * Aanleiding (29 augustus 2026). De conversie bleef staan op "Converteren… (1s)" en
 * kwam nooit meer terug. De oorzaak lag buiten onze code — `vercel dev` sluist het
 * antwoord van de functie via undici door, en bij een groot antwoord (de DOCX gaat als
 * base64 in JSON, ~1,5 MB) valt die socket soms weg. Undici zendt dan een `error`-event
 * dat niemand afvangt, en Node doodt daarop het hele proces. Er is dan niemand meer die
 * antwoordt.
 *
 * Maar dát de app daar oneindig op wachtte, was van ons. Twee fouten:
 *
 *  1. Geen van de fetches had een tijdslimiet. Een antwoord dat halverwege stilvalt
 *     laat `await fetch(...)` eeuwig staan.
 *
 *  2. De grens van 90 seconden kón niet vuren. Hij telde alleen de SLAAPTIJD tussen de
 *     pogingen op — niet de tijd die de aanroepen zelf kostten — en werd bovenaan de lus
 *     getoetst. Staat de lus stil in een `await`, dan komt hij daar nooit. Een vangnet
 *     dat bestaat maar niet af kan gaan is erger dan geen: het wekt de indruk dat het
 *     geval gedekt is.
 *
 * Vandaar dit bestand. De rekenpartij staat los van de lus zodat hij te toetsen is
 * zónder netwerk, en de grens is een WANDKLOK-grens: hij telt alles mee, ook een
 * aanroep die blijft hangen.
 *
 * De winst is niet de melding maar de terugval: bij een fout schakelt de analyse over
 * op PDF.js (index.html, `catch (adobeErr)`). Die code stond er al en werd alleen nooit
 * bereikt.
 */

import { tijdsbudget as _tijdsbudget } from '../tijdsbudget.js';

/** Oplopende wachttijd tussen twee pogingen: 1s, 2s, 4s, 8s, 8s, … */
export const POLL_WACHT = [1000, 2000, 4000, 8000];

/** Hoe lang een conversie in totaal mag duren, van de eerste byte tot de laatste. */
export const CONVERSIE_MAX_MS = 90_000;

/**
 * Tijdslimiet per losse aanroep. Gelijkgetrokken met de `maxDuration` in vercel.json
 * (adobe-start 60s, adobe-result 30s): loopt die limiet op de server af, dan is de
 * functie dood en heeft langer wachten geen zin meer.
 */
export const START_MAX_MS = 60_000;
export const POLL_MAX_MS   = 30_000;

/** De wachttijd vóór poging `poging` (0-gebaseerd). */
export function pollWacht(poging) {
  const i = Math.max(0, Math.min(Number(poging) || 0, POLL_WACHT.length - 1));
  return POLL_WACHT[i];
}

/**
 * Wat er nog van het budget over is.
 *
 * @param {object} p
 * @param {number} p.gestartOp     tijdstip van de eerste aanroep (ms)
 * @param {number} p.nu            huidig tijdstip (ms)
 * @param {number} [p.maxMs]       totale grens
 * @param {number} [p.perAanroepMs] grens voor deze ene aanroep
 * @returns {{verstreken:number, resterend:number, verlopen:boolean, aanroepMs:number}}
 *   `aanroepMs` is wat je aan `AbortSignal.timeout()` meegeeft: nooit langer dan wat er
 *   van het totaal over is, want anders zou één aanroep de grens alsnog overleven.
 */
export function tijdsbudget({ gestartOp, nu, maxMs = CONVERSIE_MAX_MS, perAanroepMs = POLL_MAX_MS } = {}) {
  return _tijdsbudget({ gestartOp, nu, maxMs, perAanroepMs });
}

/**
 * Mag er nóg een poging komen, gegeven wat er nog over is?
 *
 * Een poging beginnen die gegarandeerd niet meer af kan komen levert alleen een
 * verwarrende foutmelding op; dan is het eerlijker om de conversie hier te staken en
 * de terugval te laten doen wat hij moet doen. De ondergrens is de wachttijd plus een
 * seconde om iets zinnigs te kunnen doen.
 */
export function nogEenPoging({ gestartOp, nu, poging, maxMs = CONVERSIE_MAX_MS } = {}) {
  const { resterend } = tijdsbudget({ gestartOp, nu, maxMs });
  return resterend > pollWacht(poging) + 1000;
}

/**
 * De tekst bij een afgelopen budget. Zegt wat er gebeurde én wat de app nu doet, zodat
 * "de conversie is mislukt" niet als eindstation leest — er volgt een terugval.
 */
export function tijdslimietMelding(verstrekenMs) {
  const s = Math.round((Number(verstrekenMs) || 0) / 1000);
  return `De omzetting van de PDF duurde langer dan ${s} seconden en is gestaakt. `
       + 'De tekst wordt nu rechtstreeks uit de PDF gelezen.';
}
