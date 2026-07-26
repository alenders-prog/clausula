/**
 * src/viewer/primaire-best.js
 *
 * Bouwt huidigePrimaireBest op vanuit gesorteerde rapport-documenten en de
 * beschikbare bestandenlijst. Bevat ook de helper-functies voor bestandsnaam-
 * herkenning en context-toewijzing.
 *
 * Alle functies zijn puur (geen DOM, geen globals) zodat ze unit-testbaar zijn.
 */

// Welk context-documenttype hoort bij welk hoofd-documenttype.
// Geen eigenaar → context is relevant voor alle hoofddocumenten.
export const CONTEXT_HOOFD_MAP = {
  zorgverdeling:          'ouderschapsplan',
  waarde_verdeling:       'convenant',
  huwelijkse_voorwaarden: 'convenant',
  pensioenopgave:         'convenant',
};

/**
 * Detecteert het doc_type van een bestandsnaam op basis van trefwoorden.
 */
export function raadDocType(bestandsnaam) {
  const n = bestandsnaam.toLowerCase();
  if (n.includes('convenant'))                                                    return 'convenant';
  if (n.includes('ouderschap'))                                                   return 'ouderschapsplan';
  if (n.includes('zorgverdeling') || n.includes('zorgregeling') || n.includes('zorg-')) return 'zorgverdeling';
  if (n.includes('huwelijkse') || n.includes('hvw') || /\bhv\b/.test(n))        return 'huwelijkse_voorwaarden';
  if (n.includes('waarde') || n.includes('waardebepaling') || n.includes('bijlage')) return 'waarde_verdeling';
  if (n.includes('pensioen'))                                                     return 'pensioenopgave';
  if (n.includes('paspoort') || n.includes('rijbewijs') || /\bid\b/.test(n))    return 'id_bewijs';
  return 'overig';
}

/**
 * Geeft aan of een context-documenttype relevant is voor een gegeven hoofd-documenttype.
 * Contexttypen zonder eigenaar zijn relevant voor alle hoofddocumenten.
 */
export function contextVoorHoofd(contextType, hoofdType) {
  const eigenaar = CONTEXT_HOOFD_MAP[contextType];
  return !eigenaar || eigenaar === hoofdType;
}

/**
 * Zoekt de bijbehorende File-objecten voor één rapport-document.
 *
 * Stap 1 — exacte naamMatch op doc.bestandsnaam
 * Stap 2 — fallback: raadDocType-heuristiek als naam niet matcht (bestandsnaam gewijzigd)
 *
 * @param {object}   doc           - { bestandsnaam, doc_type }
 * @param {object[]} bestandenLijst - Array van File-achtige objecten ({ name })
 * @returns {{ eigen: object[], gevondenVia: 'naam'|'heuristiek'|'geen' }}
 */
export function vindEigenBestanden(doc, bestandenLijst) {
  let eigen = bestandenLijst.filter(f => f.name === doc.bestandsnaam);
  if (eigen.length) return { eigen, gevondenVia: 'naam' };

  eigen = bestandenLijst.filter(f => raadDocType(f.name) === doc.doc_type);
  return { eigen, gevondenVia: eigen.length ? 'heuristiek' : 'geen' };
}

/**
 * Bouwt huidigePrimaireBest: per rapport-document een array van File-objecten
 * (hoofd + relevante context), gesorteerd in de volgorde van rDocsSorted.
 *
 * @param {object[]} rDocsSorted    - Gesorteerde rapport-documenten [{ bestandsnaam, doc_type }]
 * @param {object[]} bestandenLijst - Beschikbare File-objecten ({ name })
 * @param {object[]|null} contextMap - data.rapport._context_per_hoofd (null bij oudere rapporten)
 * @returns {object[][]}            - Per tab een array van File-objecten
 */
export function bouwPrimaireBest(rDocsSorted, bestandenLijst, contextMap) {
  const hoofdNamen = new Set(rDocsSorted.map(d => d.bestandsnaam).filter(Boolean));

  return rDocsSorted.map(doc => {
    const { eigen } = vindEigenBestanden(doc, bestandenLijst);

    if (contextMap) {
      // Opgeslagen context-toewijzing: alleen relevante contextbestanden per tab
      const mapping  = contextMap.find(m => m.bestandsnaam === doc.bestandsnaam);
      const ctxNamen = new Set(mapping?.context || []);
      const ctxBest  = bestandenLijst.filter(f => ctxNamen.has(f.name));
      return [...eigen, ...ctxBest];
    }

    // Oudere rapporten zonder _context_per_hoofd: gebruik type-mapping als fallback
    const eigenNamen   = new Set(eigen.map(f => f.name));
    const alleCtx      = bestandenLijst.filter(f => !hoofdNamen.has(f.name) && !eigenNamen.has(f.name));
    const relevanteCtx = alleCtx.filter(f => contextVoorHoofd(raadDocType(f.name), doc.doc_type || ''));
    return [...eigen, ...relevanteCtx];
  });
}
