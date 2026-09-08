/**
 * src/analyse/dimensies.js — de vijf dimensies, op één plek
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * De vijf dimensienamen stonden in zes losse lijsten, in drie verschillende volgordes:
 *
 *   index.html  filterknoppen (2×)   jur, vol, bal, conf, cross_doc, gram
 *   index.html  categorieënraster    jur, conf, vol, bal, gram
 *   index.html  cirkels bij bewaard  vol, jur, bal, gram, conf
 *   index.html  rapportTool          vol, jur, bal, gram          ← conflicten ontbrak
 *   voortgang-status.js              jur, vol, bal, conf, cross_doc, gram
 *   statistieken.js  CATEGORIEEN     jur, vol, bal, conf, gram
 *
 * Twee dingen waren daaraan te zien, en geen van beide zou opvallen bij het lezen van
 * één zo'n lijst.
 *
 * 1. `rapportTool` miste `conflicten`. Dat viel niemand op omdat die tool sinds de
 *    analyse naar de server verhuisde nergens meer wordt aangeroepen — hij is met dit
 *    commit verwijderd. Een lijst die zó ver achterloopt dat hij niet meer draait.
 *
 * 2. `statistieken.hoofdCategorie` liep CATEGORIEEN af om "de zwaarste categorie" te
 *    kiezen. Maar CATEGORIEEN is een wéérgavevolgorde en de voorrang staat anders: de
 *    prompt en de skill `screening-categorien` zeggen juridisch > conflicten >
 *    volledigheid > balans > grammatica. Een bevinding met ["balans","conflicten"] telde
 *    op het dashboard dus als balans. Geen foutmelding, alleen een cijfer dat naar de
 *    verkeerde kaart ging.
 *
 * ── HET ONDERSCHEID DAT ONTBRAK ─────────────────────────────────────────────
 *
 * Er zijn hier twee soorten volgorde, en die zijn niet uitwisselbaar:
 *
 *   VOORRANG_DIMENSIES  een regel. Welke dimensie wint als een bevinding er meer draagt.
 *                       Komt uit de prompt; wijzigt alleen als de prompt wijzigt.
 *   WEERGAVE_DIMENSIES  een keuze. Waar de knoppen en tellers op het scherm staan.
 *                       Mag verschuiven zonder dat er iets aan de analyse verandert.
 *
 * Dat het raster de voorrangsvolgorde aanhoudt en de filterknoppen niet, is dus geen
 * slordigheid maar een verschil in betekenis. Wat wél moest worden vastgelegd is dat de
 * twee dezelfde vijf dimensies bevatten — dát is de fout die stil kan optreden als er
 * ooit een zesde dimensie bij komt. `tests/unit/dimensies.test.js` bewaakt het.
 */

/**
 * De voorrangsvolgorde uit de prompt. Draagt een bevinding meer dan één dimensie, dan
 * wint de eerste die hier voorkomt.
 *
 * Zie de skill `screening-categorien`, sectie Categorietoewijzing. Wijzig dit niet
 * zonder de prompt in `api/_prompts/bevindingen.js` mee te nemen — dan gaan het model
 * en het dashboard elk hun eigen kant op.
 */
export const VOORRANG_DIMENSIES = Object.freeze([
  'juridisch', 'conflicten', 'volledigheid', 'balans', 'grammatica',
]);

/**
 * De volgorde waarin dimensies op het scherm verschijnen: filterknoppen, voortgang,
 * dashboardtabel. `cross_doc` staat hier wél bij — het is geen eigen dimensie van een
 * bevinding maar wel een eigen knop, want de mediator wil die apart kunnen zien.
 */
export const WEERGAVE_DIMENSIES = Object.freeze([
  'juridisch', 'volledigheid', 'balans', 'conflicten', 'cross_doc', 'grammatica',
]);

/** De weergavevolgorde zonder cross_doc — voor plaatsen waar alleen echte dimensies tellen. */
export const WEERGAVE_ZONDER_CROSSDOC = Object.freeze(
  WEERGAVE_DIMENSIES.filter((d) => d !== 'cross_doc'),
);

/**
 * De zwaarste dimensie van een bevinding, volgens de voorrangsregel.
 *
 * @param {string[]} dimensies
 * @param {string} [terugval] wat te melden als er niets herkenbaars in staat
 * @returns {string}
 */
export function zwaarsteDimensie(dimensies, terugval = 'volledigheid') {
  const dims = Array.isArray(dimensies) ? dimensies : [];
  for (const d of VOORRANG_DIMENSIES) if (dims.includes(d)) return d;
  // cross_doc is geen eigen rij: het is een bevinding die pas tussen twee documenten
  // zichtbaar werd, en die weegt juridisch.
  if (dims.includes('cross_doc')) return 'juridisch';
  return terugval;
}
