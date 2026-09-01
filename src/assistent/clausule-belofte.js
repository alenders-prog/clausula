/**
 * src/assistent/clausule-belofte.js — is de beloofde clausule er ook echt?
 *
 * Aanleiding (1 september 2026). Een mediator vroeg of een tekst juridisch voldoende
 * was. De assistent antwoordde:
 *
 *   "De aangeleverde tekst is juridisch onvoldoende: ze mist de wettelijke grondslag
 *    (art. 1:94 BW), een expliciete peildatum … Hieronder een juridisch volledige
 *    clausule."
 *
 * Daaronder stonden aannames, signalen, een vraag over de huwelijksdatum en een knop
 * "Andere stijl". Geen clausule.
 *
 * De oorzaak was één regel in het tool-schema. Het antwoordveld werd beschreven als
 * "max 2 zinnen intro bij … clausule (tekst in clausule.tekst)" — en `clausule.tekst`
 * bestaat niet en heeft nooit bestaan. Het model deed precies wat er stond: het schreef
 * de twee zinnen intro en had geen veld voor de rest. Dat is nu rechtgezet.
 *
 * ── WAAROM ER DAARNAAST EEN CONTROLE STAAT ──────────────────────────────────
 *
 * Zo'n gebroken belofte is van buiten niet van een normaal antwoord te onderscheiden.
 * Er komt geen fout, er ontbreekt geen veld, de JSON is geldig. Je ziet alleen een
 * antwoord dat raar eindigt — en dat is precies het soort gebrek dat maanden blijft
 * zitten omdat niemand kan aanwijzen wát er mis is.
 *
 * Deze controle kijkt of een aankondiging ("hieronder volgt", "onderstaande clausule")
 * gevolgd wordt door genoeg tekst om een clausule te kúnnen zijn. Zo niet, dan wordt de
 * belofte niet stil gelaten: de aanroeper logt het en zet er een zichtbare regel onder.
 * Liever een mediator die weet dat er iets ontbreekt dan een die zoekt naar tekst die
 * er niet is.
 */

/**
 * Zinsneden waarmee het model een clausule aankondigt. Het gaat om de aankondiging,
 * niet om het woord "clausule" — "een clausule is hier niet nodig" belooft niets.
 */
const RE_BELOFTE = new RegExp([
  'hieronder\\b',
  'hierna\\b',
  'onderstaande?\\b',
  'volgt hier',
  'als volgt\\s*[:.]',
  'luidt als volgt',
].join('|'), 'i');

/**
 * Hoeveel tekst er ná de aankondiging moet staan voordat het een clausule kán zijn.
 *
 * Een juridisch volledige clausule is in de praktijk enkele honderden tekens. Deze
 * grens ligt bewust laag: hij hoeft geen korte clausule af te keuren, alleen een
 * aankondiging te betrappen waar niets op volgt. In het gemelde geval stond er nul.
 */
export const MIN_CLAUSULE_TEKENS = 120;

/**
 * @param {object} p
 * @param {string} p.intent    de intent die het model koos
 * @param {string} p.antwoord  het antwoordveld
 * @returns {{gebroken: boolean, reden: string}}
 */
export function beoordeelClausuleBelofte({ intent, antwoord } = {}) {
  const tekst = String(antwoord || '');
  if (intent !== 'clausule') return { gebroken: false, reden: '' };

  const m = tekst.match(RE_BELOFTE);
  if (!m) return { gebroken: false, reden: '' };

  const na = tekst.slice(m.index + m[0].length).trim();
  if (na.length >= MIN_CLAUSULE_TEKENS) return { gebroken: false, reden: '' };

  return {
    gebroken: true,
    reden: `intent=clausule kondigt een clausule aan ("${m[0]}") maar er volgt `
         + `${na.length} teken(s) — minimaal ${MIN_CLAUSULE_TEKENS} verwacht`,
  };
}

/** Wat de mediator te zien krijgt in plaats van een antwoord dat halverwege ophoudt. */
export const BELOFTE_NOTA =
  '_De clausuletekst ontbreekt in dit antwoord. Vraag hem opnieuw op via '
  + '"Clausule opstellen" — dan wordt hij volledig opgesteld._';

/**
 * Zet de nota onder een antwoord dat een clausule belooft maar er geen geeft.
 * Laat het antwoord ongemoeid als de belofte wél is ingelost.
 */
export function vulClausuleBelofteAan(antwoord, oordeel) {
  if (!oordeel?.gebroken) return antwoord;
  return `${String(antwoord || '').trimEnd()}\n\n${BELOFTE_NOTA}`;
}
