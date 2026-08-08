/**
 * src/rapport/sorteer-docs.js
 *
 * Canonieke volgorde voor document-types in multi-doc analyses.
 * OP → Zorgverdeling → Convenant → Waarde → rest
 */

export const DOC_VOLGORDE = { ouderschapsplan: 0, zorgverdeling: 1, convenant: 10, waarde_verdeling: 11 };

/**
 * Sorteert een array van objecten met een `doc_type`-veld op canonieke volgorde.
 * Onbekende types komen achteraan (rang 99 — hoger dan elk bekend type).
 * Geeft altijd een nieuwe array terug (muteert niet).
 */
export function sorteerOpDocType(items) {
  return [...items].sort(
    (a, b) => (DOC_VOLGORDE[a.doc_type] ?? 99) - (DOC_VOLGORDE[b.doc_type] ?? 99)
  );
}

/**
 * Sorteert een array van objecten met een `type`-veld (tray-items, effectieveHoofdItems).
 * Onbekende types komen achteraan (rang 99 — hoger dan elk bekend type).
 * Geeft altijd een nieuwe array terug (muteert niet).
 */
export function sorteerOpType(items) {
  return [...items].sort(
    (a, b) => (DOC_VOLGORDE[a.type] ?? 99) - (DOC_VOLGORDE[b.type] ?? 99)
  );
}
