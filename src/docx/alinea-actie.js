/**
 * src/docx/alinea-actie.js
 * Beslist wat de tracked-changes patcher met de volgende alinea moet doen.
 *
 * Aanleiding (21 augustus 2026): in een gegenereerd Word-document stond de
 * doorgehaalde tekst bovenaan en de vervangende tekst pas een halve pagina lager,
 * met niets ertussen.
 *
 * Oorzaak: de meer-alinea-lus stopt als de volgende alinea geen woorden deelt met
 * de originele tekst — maar die controle luidde `_kw.length > 0 && !overlap`. Bij
 * een LEGE alinea is `_kw.length` nul, dus de voorwaarde vuurde niet. De lege
 * alinea werd als verwijderd gemarkeerd (onzichtbaar, er staat niets) en
 * `lastDelPara` schoof mee. Omdat de invoeging aan díé alinea wordt gehangen,
 * landde de nieuwe tekst onderaan de hele reeks.
 *
 * Adobe's PDF→DOCX-conversie laat bij elke paginaovergang zulke lege alinea's
 * achter, dus dit treft elk document van meer dan één pagina.
 *
 * Lege alinea's worden nu overgeslagen zonder ze te markeren en zonder het
 * ankerpunt te verplaatsen. Wel met een grens: loopt het aantal op, dan is de
 * doorgehaalde tekst kennelijk afgelopen en stopt de lus.
 */

/** Hoeveel lege alinea's achtereen we accepteren als paginaovergang. */
export const MAX_LEGE_ALINEAS = 3;

/**
 * @param {object} args
 * @param {string} args.tekst              de tekst van de volgende alinea (getrimd)
 * @param {string} args.origineelNorm      genormaliseerde originele_tekst van de wijziging
 * @param {number} args.legeOpEenRij       hoeveel lege alinea's er net zijn overgeslagen
 * @returns {'stop'|'overslaan'|'verwijderen'}
 */
export function volgendeAlineaActie({ tekst, origineelNorm, legeOpEenRij = 0 }) {
  const t = (tekst || '').trim();

  // Lege alinea: paginaovergang of opmaakrestje. Niet markeren, niet meetellen —
  // maar ook niet eindeloos doorlopen.
  if (!t) return legeOpEenRij >= MAX_LEGE_ALINEAS ? 'stop' : 'overslaan';

  // Genummerde sectiekop: hier houdt de vorige passage op.
  if (/^\d+(\.\d+)*\.?[\t ]+[A-Z]/.test(t)) return 'stop';

  // Deelt deze alinea nog woorden met de originele tekst? Zo niet, dan zijn we
  // voorbij het blok dat vervangen wordt.
  const norm = t.toLowerCase();
  const kernwoorden = [...new Set(norm.match(/\b[a-z]{8,}\b/g) || [])];
  if (kernwoorden.length > 0 && !kernwoorden.some(w => (origineelNorm || '').includes(w))) {
    return 'stop';
  }

  return 'verwijderen';
}
