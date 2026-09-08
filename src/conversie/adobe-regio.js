/**
 * src/conversie/adobe-regio.js — in welke regio Adobe onze PDF's verwerkt
 *
 * ── WAAROM DIT BESTAAT (8 september 2026) ───────────────────────────────────
 *
 * De PDF→DOCX-conversie stuurt het ORIGINELE bestand naar Adobe: `pdfBase64`, met de
 * namen van cliënten erin. Ongepseudonimiseerd, want de conversie moet de opmaak van het
 * aangeleverde stuk behouden. Dat is de enige plek in de keten waar een onbewerkt
 * cliëntdocument het apparaat verlaat — de tekst voor de AI-analyse gaat wél
 * gepseudonimiseerd de deur uit.
 *
 * Tot vandaag ging dat naar `pdf-services.adobe.io`, en dat is de Amerikaanse standaard.
 *
 * Adobe kent twee regio's: `ue1` (Verenigde Staten) en `ew1` (Europa, verwerkt en
 * opgeslagen in eu-west-1, Ierland). Uit hun documentatie:
 *
 *   "For invoking region specific PDF Services API endpoints, hostnames needs to be
 *    changed to the following pattern: https://pdf-services-{regionCode}.adobe.io"
 *
 * ── WAAROM EEN SCHAKELAAR EN GEEN VASTE WAARDE ──────────────────────────────
 *
 * De ontwikkelaarsdocumentatie noemt geen voorwaarde ("Once you purchase PDF Services
 * API, its APIs can be configured to process the documents in a specified region"), maar
 * Adobe's Trust Center zegt "Enterprise customers can choose the region". Die twee sluiten
 * een abonnementsafhankelijkheid niet uit, en dat is alleen met een echte conversie vast
 * te stellen.
 *
 * Vandaar `ADOBE_REGIO`: standaard Europa, en één omgevingsvariabele om terug te vallen
 * als het abonnement het niet blijkt te dragen. De terugval geeft exact de hostnaam die
 * er vóór 8 september 2026 stond, zodat "terug" ook echt terug is.
 *
 * Onbekende waarden vallen naar EUROPA, niet naar de VS. Een typefout in een
 * omgevingsvariabele hoort geen doorgifte naar de Verenigde Staten op te leveren die
 * niemand ziet.
 */

/** De hostnaam zoals hij vóór de regiokeuze in de code stond. */
const HOST_VS = 'https://pdf-services.adobe.io';
const HOST_EU = 'https://pdf-services-ew1.adobe.io';

/** Wat we als "de Verenigde Staten" accepteren; al het andere is Europa. */
const VS_NAMEN = new Set(['us', 'ue1', 'vs']);

/**
 * @param {string} [regio]  waarde van ADOBE_REGIO; leeg of onbekend betekent Europa
 * @returns {string}        hostnaam zonder afsluitende schuine streep
 */
export function adobeHost(regio) {
  return VS_NAMEN.has(String(regio ?? '').trim().toLowerCase()) ? HOST_VS : HOST_EU;
}

/** Draait deze aanroep buiten de EU? Voor de logregel, zodat het niet stil gebeurt. */
export function buitenEu(regio) {
  return adobeHost(regio) === HOST_VS;
}

export { HOST_EU, HOST_VS };
