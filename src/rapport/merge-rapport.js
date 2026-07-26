/**
 * src/rapport/merge-rapport.js
 *
 * Bouwt huidigRapport op vanuit een basis-rapport (rp) en een sub-rapport (_subRap)
 * dat bij tab-wisseling actief wordt.
 *
 * Regels:
 * - samenvatting van het sub-rapport prevaleert; ontbreekt die dan lege string
 *   (nooit de samenvatting van het basis-rapport doorgeven — dat is de OP-samenvatting)
 * - _concepts worden samengevoegd: sub-rapport-concepts overschrijven basis-concepts
 *   per doc_type, maar eerder gegenereerde concepten (voorgaandConcepten) blijven bewaard
 */

/**
 * @param {object} rp                  - Het volledige basis-rapport
 * @param {object} subRap              - Het sub-rapport voor de geselecteerde tab (mag {})
 * @param {object|null} voorgaandConcepten - _concepts van het vorige huidigRapport (voor behoud)
 * @returns {object} - Nieuw huidigRapport
 */
export function bouwSubRapport(rp, subRap, voorgaandConcepten = null) {
  const merged = {
    ...rp,
    ...subRap,
    samenvatting: subRap.samenvatting ?? '',
  };

  if (voorgaandConcepten) {
    merged._concepts = {
      ...(merged._concepts || {}),
      ...voorgaandConcepten,
    };
  }

  return merged;
}
