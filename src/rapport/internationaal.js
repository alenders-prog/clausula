/**
 * src/rapport/internationaal.js
 * Bepaalt of een dossier een internationaal element heeft.
 *
 * Aanleiding (23 augustus 2026). De analyse selecteert wetteksten door `topic_tags`
 * te matchen tegen `situatie_kenmerken.key`. Vijf chunks over internationaal
 * privaatrecht — welk huwelijksvermogensrecht geldt bij echtgenoten uit
 * verschillende landen, het wagonstelsel, de EU-verordening 2016/1103 — dragen de
 * tag `ipr`, en die staat in geen enkele kenmerk-key. Ze gingen dus bij géén enkele
 * classificatie mee, en er verscheen nergens een melding.
 *
 * Waarom dit in code kan en niet in de prompt hoeft: de classificatie legt de
 * nationaliteit van beide partijen al vast (`nationaliteit_a`, `nationaliteit_b`).
 * Het kenmerk is daaruit af te leiden, zonder de prompt of het schema te raken.
 *
 * Waarom niet gewoon hertaggen op een bestaand kenmerk: IPR is conditionele kennis.
 * Zou je het aan `huwelijk` hangen, dan gaat het bij élke huwelijksanalyse mee — een
 * paar duizend tokens ruis voor het overgrote deel van de dossiers waar beide
 * partijen Nederlands zijn.
 */

/** Schrijfwijzen waarin "Nederlands" in een classificatie terechtkomt. */
const NEDERLANDS = /^(nl|nederlands|nederlandse|dutch)$/i;

/** Duidt op meer dan één nationaliteit binnen één partij. */
const MEERVOUDIG = /\b(dubbel|dubbele|tweede|meerdere)\b|[\/,&+]| en /i;

function normaliseer(waarde) {
  return String(waarde ?? '')
    .trim()
    .replace(/\s*\(.*?\)\s*/g, ' ')   // "Nederlandse (sinds 2010)" → "Nederlandse"
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} natA nationaliteit partij A, zoals de classificatie hem vastlegde
 * @param {string} natB nationaliteit partij B
 * @returns {boolean} of er een internationaal element speelt
 */
export function heeftInternationaalElement(natA, natB) {
  const a = normaliseer(natA);
  const b = normaliseer(natB);

  // Niets vastgelegd: geen aanleiding. Het IPR-blok meesturen "voor de zekerheid"
  // zou het bij vrijwel elk dossier meesturen.
  if (!a && !b) return false;

  // Een dubbele nationaliteit bij één partij is op zichzelf al een internationaal element.
  if ((a && MEERVOUDIG.test(a)) || (b && MEERVOUDIG.test(b))) return true;

  // Eén van beiden niet-Nederlands.
  if (a && !NEDERLANDS.test(a)) return true;
  if (b && !NEDERLANDS.test(b)) return true;

  // Beide Nederlands, of alleen één ingevuld en die is Nederlands.
  return false;
}

/**
 * Kenmerken die uit de classificatie af te leiden zijn in plaats van door het model
 * benoemd te worden. Geeft een array terug om bij de zoektags te voegen.
 */
export function afgeleideKenmerken(classificatie = {}) {
  const uit = [];
  if (heeftInternationaalElement(classificatie.nationaliteit_a, classificatie.nationaliteit_b))
    uit.push('internationaal');
  return uit;
}
