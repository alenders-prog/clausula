/**
 * src/docx/bullet-prefix.js
 * Herkent opsommingstekens die als LETTERLIJK karakter in de tekst staan.
 *
 * Adobe's PDF→DOCX-conversie maakt van een opsomming geen Word-lijst (`w:numPr`)
 * maar zet het bolletje als gewoon teken vóór de tekst. Voor de tracked-changes
 * patcher betekent dat twee dingen:
 *
 *   1. Zoeken naar de originele zin moet ook lukken zonder dat bolletje.
 *   2. Wordt zo'n regel vervangen, dan verdwijnt het bolletje mét de doorgehaalde
 *      tekst. De ingevoegde tekst moet het dus terugkrijgen, anders staat de nieuwe
 *      regel als losse alinea onder een lijst — precies wat op 21 augustus 2026
 *      in een ouderschapsplan zichtbaar werd.
 *
 * De oude regex eiste witruimte ná het bolletje (`[●•◦▪\-\*>][\t ]+`). Adobe levert
 * juist `●Incidentele afwijking…` zonder spatie, waardoor geen enkele bullet in dat
 * document werd herkend.
 */

// Bolletjes die niets anders kunnen betekenen — witruimte erna is optioneel.
const HARDE_BULLETS = '●•◦▪‣∙·';
// Tekens die óók gewone interpunctie zijn. Alleen als bullet lezen mét witruimte erna,
// anders wordt "-5 graden" of "*nadruk*" ten onrechte een opsomming.
const ZACHTE_BULLETS = '\\-\\*>»–—';

const RE_HARD  = new RegExp(`^([\\t ]*[${HARDE_BULLETS}][\\t ]*)`);
const RE_ZACHT = new RegExp(`^([\\t ]*[${ZACHTE_BULLETS}][\\t ]+)`);

/**
 * Geeft het opsommingsvoorvoegsel van een regel terug, inclusief de witruimte
 * eromheen, of een lege string als de regel geen opsomming is.
 */
export function bulletPrefix(tekst) {
  if (typeof tekst !== 'string' || !tekst) return '';
  return tekst.match(RE_HARD)?.[1] ?? tekst.match(RE_ZACHT)?.[1] ?? '';
}

/**
 * Zet het voorvoegsel terug voor vervangende tekst.
 *
 * `bulletVerbruikt` zegt of het bolletje in de doorgehaalde tekst zat. Stond de
 * wijziging midden in de regel, dan staat het bolletje nog in het ongewijzigde
 * deel ervóór en zou herhalen een dubbele bullet opleveren.
 */
export function metBullet(nieuweTekst, prefix, bulletVerbruikt = true) {
  if (!nieuweTekst) return nieuweTekst ?? '';
  if (!prefix || !bulletVerbruikt) return nieuweTekst;
  if (bulletPrefix(nieuweTekst)) return nieuweTekst; // het model schreef zelf al een bullet
  return prefix + nieuweTekst;
}
