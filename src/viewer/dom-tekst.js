/**
 * src/viewer/dom-tekst.js
 * Plakt de tekstnodes van een documentweergave aaneen tot één doorzoekbare string.
 *
 * Aanleiding (24 augustus 2026). Klikken op een issue over de kerstverdeling vond
 * de passage niet, terwijl die gewoon in het document stond. De passage liep over
 * twee bullets:
 *
 *     • …om met middernacht de andere ouder te contacteren en deze gelukkig
 *       nieuwjaar te wensen.
 *     • Oud & Nieuw: in de even jaren bij vader en in de oneven jaren bij moeder.
 *
 * De viewer plakte alle tekstnodes aan elkaar zónder scheidingsteken, dus in de
 * doorzoekbare tekst stond "…te wensen.Oud & Nieuw…" terwijl het citaat "…te
 * wensen. Oud & Nieuw…" luidde. Eén ontbrekende spatie, en de passage was
 * onvindbaar — zonder dat er iets misging dat je kon zien.
 *
 * ── Waarom niet gewoon overal een spatie ────────────────────────────────────
 * Omdat een woord ook over twee tekstnodes kan lopen: "vor<strong>dering</strong>"
 * zijn twee nodes binnen dezelfde alinea, en daar een spatie tussen zetten maakt
 * er "vor dering" van — dan wordt "vordering" onvindbaar. Het onderscheid is dus
 * niet "andere node" maar "ander blok".
 *
 * De DOM blijft buiten deze module: de aanroeper levert per stuk tekst mee in
 * welk blok het staat. Daardoor is de samenvoeging te toetsen zonder browser, en
 * dat is precies het deel waar de fout in zat.
 */

/** Elementen die een eigen tekstblok vormen; alles daarbinnen loopt door. */
export const BLOK_TAGS = new Set([
  'P', 'LI', 'DIV', 'TD', 'TH', 'TR', 'TABLE', 'SECTION', 'ARTICLE', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'UL', 'OL', 'DL', 'DT', 'DD', 'BR',
]);

/**
 * Voegt tekstdelen samen met een spatie tussen verschillende blokken.
 *
 * @param {Array<{tekst: string, blok: any}>} delen
 *   `blok` mag elk vergelijkbaar ding zijn (een element, een id, een getal); er
 *   wordt alleen op identiteit vergeleken.
 * @returns {{tekst: string, starts: number[]}}
 *   `starts[i]` is de positie waarop `delen[i].tekst` begint in `tekst` — nodig om
 *   een gevonden positie terug te vertalen naar de juiste node.
 */
export function voegTekstDelenSamen(delen) {
  let tekst = '';
  const starts = [];
  let vorigBlok;

  for (const deel of delen || []) {
    const stuk = deel?.tekst ?? '';
    // Spatie tussen twee blokken, maar niet:
    //  - vooraan (tekst nog leeg) — een lege eerste node zou anders een
    //    voorloopspatie opleveren en álle posities één opschuiven;
    //  - als er al witruimte staat — dubbele spaties verschuiven ze net zo goed.
    if (tekst.length > 0 && deel?.blok !== vorigBlok && !/\s$/.test(tekst) && /^\S/.test(stuk)) {
      tekst += ' ';
    }
    starts.push(tekst.length);
    tekst += stuk;
    vorigBlok = deel?.blok;
  }

  return { tekst, starts };
}
