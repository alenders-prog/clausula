/**
 * src/conversie/run-opmaak.js — welke opmaak krijgt vervangen tekst in een DOCX?
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * In het conceptvoorbeeld werd vervangen tekst op sommige plekken opeens kleiner
 * weergegeven. De oorzaak stond in één regel: de opmaak werd overgenomen van de EERSTE
 * `<w:r>` in de alinea.
 *
 * In Word is die eerste run vaak niet de lopende tekst. Bij "2ᵈᵉ kerstdag" is het het
 * superscript `de`, met een eigen kleinere `w:sz`. Bij een alinea die met een cursief woord
 * begint is het dat woord. De hele vervanging nam die opmaak dan over.
 *
 * ── DE REGEL ────────────────────────────────────────────────────────────────
 *
 * Neem de opmaak van de run met de MEESTE tekst. Dat is vrijwel altijd de lopende tekst;
 * superscripts, losse cursieve woorden en nummeropmaak zijn kort. Het is een schatting, maar
 * een die zich naar het document voegt in plaats van naar de volgorde van de XML.
 *
 * Bij gelijke lengte wint de eerste — dan is er geen reden om af te wijken van wat er stond.
 * Heeft geen enkele run opmaak, dan null: Word gebruikt dan de stijl van de alinea, en dat
 * is precies goed.
 *
 * Deze module raakt de DOM niet zelf: hij krijgt de runs en geeft er één terug. Zo is hij
 * te toetsen zonder browser, en dat is de reden dat hij hier staat en niet in index.html.
 */

/**
 * @param {Array<{tekstLengte: number, rPr: *}>} runs  per run de lengte van zijn tekst en
 *   zijn opmaakknoop (of null als hij die niet heeft)
 * @returns {*} de opmaakknoop die de vervanging moet krijgen, of null
 */
export function kiesRunOpmaak(runs) {
  let beste = null;
  let besteLengte = -1;
  for (const run of runs ?? []) {
    const lengte = Number(run?.tekstLengte) || 0;
    if (lengte > besteLengte) { besteLengte = lengte; beste = run?.rPr ?? null; }
  }
  return beste;
}
