/**
 * api/_cross-doc-toewijzing.js
 * Bepaalt op welk documenttabblad een cross-document-issue thuishoort.
 *
 * Aanleiding (21 augustus 2026): het issue "Zorgkortingspercentages in
 * ouderschapsplan wijken af van de Tremanormen" stond onder *Convenant*, maar
 * sprong bij aanklikken naar het ouderschapsplan.
 *
 * Oorzaak: een issue met `betreft_documenten: ["convenant","ouderschapsplan"]`
 * ging naar béíde documenten, terwijl de passage maar uit één document komt. Op
 * het verkeerde tabblad is er dan niets om naartoe te springen, dus wisselt de
 * viewer van document — precies op het moment dat de gebruiker dat niet verwacht.
 *
 * Het schema zegt zelf al wat de bedoeling was: `passage_document` is "het
 * document dat aangepast moet worden". Daar hoort het issue dus te staan, en
 * nergens anders. Dat scheelt bovendien een dubbele kaart over twee tabbladen —
 * dezelfde klacht die eerder over de deduplicatie ging.
 */

/**
 * Het documenttype waar dit issue op thuishoort, of null als dat niet te bepalen
 * is. Volgorde van voorkeur:
 *   1. passage_document — waar de geciteerde zin staat;
 *   2. betreft_documenten[0] — volgens het schema hetzelfde document;
 *   3. niets, dan valt de beller terug op "naar alle documenten".
 */
export function doelDocument(issue) {
  const pd = issue?.passage_document;
  if (typeof pd === 'string' && pd.trim()) return pd.trim();

  const bd = issue?.betreft_documenten;
  if (Array.isArray(bd) && typeof bd[0] === 'string' && bd[0].trim()) return bd[0].trim();

  return null;
}

/**
 * Hoort dit issue op het tabblad van `docType`?
 *
 * Zonder bruikbare aanwijzing gaat het issue naar álle documenten — liever een
 * kaart te veel dan een bevinding die nergens zichtbaar is.
 */
export function hoortBijDocument(issue, docType) {
  const doel = doelDocument(issue);
  if (!doel) return true;
  return doel === docType;
}
