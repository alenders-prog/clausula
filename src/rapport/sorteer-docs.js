/**
 * src/rapport/sorteer-docs.js
 *
 * Canonieke volgorde voor document-types in multi-doc analyses.
 * Één bron van waarheid — vervangt de 7 lokale kopieën in index.html.
 */

export const DOC_VOLGORDE = { ouderschapsplan: 0, convenant: 1 };

/**
 * Sorteert een array van objecten met een `doc_type`-veld op canonieke volgorde.
 * Onbekende types komen achteraan (rang 9).
 * Geeft altijd een nieuwe array terug (muteert niet).
 */
export function sorteerOpDocType(items) {
  return [...items].sort(
    (a, b) => (DOC_VOLGORDE[a.doc_type] ?? 9) - (DOC_VOLGORDE[b.doc_type] ?? 9)
  );
}

/**
 * Sorteert een array van objecten met een `type`-veld (tray-items, effectieveHoofdItems).
 * Onbekende types komen achteraan (rang 9).
 * Geeft altijd een nieuwe array terug (muteert niet).
 */
export function sorteerOpType(items) {
  return [...items].sort(
    (a, b) => (DOC_VOLGORDE[a.type] ?? 9) - (DOC_VOLGORDE[b.type] ?? 9)
  );
}
