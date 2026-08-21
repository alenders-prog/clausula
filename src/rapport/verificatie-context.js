/**
 * src/rapport/verificatie-context.js
 * Bouwt de documentcontext die de extra verificatie nodig heeft.
 *
 * Aanleiding (21 augustus 2026), twee issues op dezelfde dag:
 *
 *   1. "Partneralimentatie: geen nihilbeding vastgelegd" beoordeelde de passage
 *      zonder de alinea er direct onder — juist de herberekeningsclausule die het
 *      oordeel kleurt.
 *   2. "Het artikel 'Vorderingen' is nergens in het convenant terug te vinden"
 *      terwijl §3.11 "Vorderingen en schulden sociale verzekering" heet. Een
 *      afwezigheidsclaim op een sectienaam die net anders luidt.
 *
 * De extra verificatie kon geen van beide corrigeren, want die kreeg alleen het
 * issue en de kennisbank mee — nooit het document. Twee dingen lossen dat op: de
 * tekst rond de passage, en de lijst met sectiekopjes zodat "deze sectie bestaat
 * niet" toetsbaar wordt.
 */

/** Ruwe tekst vergelijkbaar maken: kleine letters, één spatie, geen leestekens. */
function norm(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Zoekt de passage in de documenttekst en geeft de positie terug.
 * Valt terug op een kortere prefix als de volledige passage niet letterlijk
 * voorkomt — extractie en pseudonimisering laten kleine verschillen achter.
 */
export function vindPassage(documentTekst, passage) {
  const doc = norm(documentTekst);
  const p   = norm(passage);
  if (!doc || p.length < 12) return -1;

  for (const lengte of [p.length, 80, 40, 24]) {
    if (lengte > p.length) continue;
    const idx = doc.indexOf(p.slice(0, lengte));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Alle regels die eruitzien als een genummerd sectiekopje: "3.", "3.11.",
 * "2.2.4" — met een titel erachter. Daarmee is een claim over een ontbrekende
 * sectie na te lopen zonder het hele document mee te sturen.
 */
export function sectiekopjes(documentTekst, maxAantal = 120) {
  const regels = (documentTekst || '').split('\n');
  const kopjes = [];
  for (const regel of regels) {
    const r = regel.trim();
    if (!r || r.length > 120) continue;
    if (/^\d+(\.\d+)*\.?[\t ]+\S/.test(r)) kopjes.push(r);
    if (kopjes.length >= maxAantal) break;
  }
  return kopjes;
}

/**
 * Tekst rondom de passage. Ruim naar achteren, want de alinea ná de passage
 * bevatte in beide gevallen hierboven de nuance die het oordeel veranderde.
 */
export function omgeving(documentTekst, passage, voor = 700, na = 1600) {
  const idx = vindPassage(documentTekst, passage);
  if (idx < 0) return '';
  // De index komt uit de genormaliseerde tekst; die is korter dan het origineel.
  // Schaal terug naar de ruwe tekst zodat we niet middenin een woord knippen.
  const factor = documentTekst.length / Math.max(1, norm(documentTekst).length);
  const ruw    = Math.round(idx * factor);
  const start  = Math.max(0, ruw - voor);
  const eind   = Math.min(documentTekst.length, ruw + na);
  return documentTekst.slice(start, eind).trim();
}

/**
 * Het blok dat aan de verificatieprompt wordt toegevoegd. Leeg als er geen
 * bruikbare context is — dan valt de verificatie terug op het oude gedrag.
 */
export function bouwVerificatieContext(documentTekst, passage) {
  if (!documentTekst) return '';
  const rond   = omgeving(documentTekst, passage);
  const kopjes = sectiekopjes(documentTekst);
  if (!rond && !kopjes.length) return '';

  const delen = [];
  if (rond) {
    delen.push(
      '[DOCUMENTCONTEXT ROND DE PASSAGE]\n'
      + 'Dit is de omringende tekst, inclusief wat er direct vóór en ná de passage staat.\n'
      + 'Beoordeel het issue in dit licht: een alinea verderop kan de bevinding weerleggen.\n\n'
      + rond + '\n[/DOCUMENTCONTEXT]',
    );
  }
  if (kopjes.length) {
    delen.push(
      '[SECTIEKOPJES IN HET DOCUMENT]\n'
      + 'Beweert het issue dat een sectie of artikel ontbreekt, controleer dat dan hier.\n'
      + 'Let op bijna-treffers: een verwijzing naar "artikel Vorderingen" kan slaan op een\n'
      + 'sectie die "Vorderingen en schulden sociale verzekering" heet. Dat is geen\n'
      + 'ontbrekende sectie maar hooguit een onnauwkeurige verwijzing.\n\n'
      + kopjes.join('\n') + '\n[/SECTIEKOPJES]',
    );
  }
  return delen.join('\n\n');
}
