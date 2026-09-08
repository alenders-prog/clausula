/**
 * src/avg/half-vervangen.js — namen die maar half zijn vervangen
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * In een convenant stond bij de bankrekeningen "op naam van Erwin Huzen", terwijl de
 * personalia "Jan Willem Huzen" noemden. De namenkaart wordt uit de personalia gebouwd, dus
 * `Huzen` was bekend en `Erwin` niet. Na het pseudonimiseren stond er:
 *
 *     op naam van Erwin Bergman
 *
 * De achternaam vervangen, de voornaam niet. Dat is lastiger dan een gewone misser: het
 * ziet eruit als een pseudoniem, dus zowel de lezer als de residu-controle gaan eroverheen.
 * In de residubalk stond het tussen ruim veertig andere meldingen zonder dat iets aangaf
 * dat dit er één van een andere soort was.
 *
 * ── WAAROM ALLEEN MELDEN EN NIET REPAREREN ──────────────────────────────────
 *
 * De eerste versie hiervan verving de onbekende voornaam door die van de bijbehorende
 * nep-persoon. Dat dichtte de lek, maar de residu-tests lieten meteen zien wat het kost: een
 * niet-geleerde KINDnaam met dezelfde achternaam werd daarmee de voornaam van de vader. Twee
 * personen op één hoop, en dan redeneert het model over de verkeerde.
 *
 * Aanname A3 van de architectuurbeoordeling zegt dat een foute bevinding waarop een mediator
 * handelt het ergste is wat er kan gebeuren. Eén voornaam die naar de API gaat weegt daar
 * niet tegenop. Dus: signaleren, apart benoemen, en de mediator laten beslissen.
 *
 * ── HET SIGNAAL ─────────────────────────────────────────────────────────────
 *
 * Een nép-achternaam als "Bergman" staat alleen in de tekst omdat wíj hem daar hebben
 * gezet. Staat er een hoofdletterwoord direct vóór dat niet de bijbehorende nep-voornaam
 * is, dan is dat vrijwel zeker een echte naam die we niet kenden. Deterministisch, en het
 * vraagt geen langere namenlijst — die zou toch achterlopen op elke variant die een
 * mediator in een document zet.
 *
 * Aanhefwoorden en tussenvoegsels vallen er bewust buiten: "Dhr Bergman" en "Van Bergman"
 * zijn geen gemiste namen. De lijst hoeft niet volledig te zijn — een gemiste titel levert
 * hooguit een overbodige melding op, en dat is de goede kant om op te falen.
 */

/** Woorden die vóór een achternaam mogen staan zonder zelf een naam te zijn. */
const GEEN_NAAM = new Set([
  'de', 'den', 'der', 'van', 'ten', 'ter', 'te', 'het', 'op', 'in',
  'dhr', 'mevr', 'mr', 'mw', 'drs', 'ing', 'ir', 'prof', 'dr',
  'heer', 'mevrouw', 'partij', 'naam', 'namens', 'genaamd',
]);

/** Tekens die in een reguliere uitdrukking hun bijzondere betekenis moeten verliezen. */
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Zoekt namen waarvan alleen de achternaam is vervangen.
 *
 * @param {string} tekst    de al gepseudonimiseerde tekst
 * @param {Iterable<string>} nepNamen  volledige nep-namen, bv. "Thomas Bergman"
 * @returns {string[]} de aangetroffen combinaties, ontdubbeld — bv. ["Erwin Bergman"]
 */
export function vindHalveNamen(tekst, nepNamen) {
  const bron = String(tekst ?? '');
  const gevonden = new Set();
  if (!bron) return [];

  for (const volledig of nepNamen ?? []) {
    const delen = String(volledig ?? '').trim().split(/\s+/);
    if (delen.length !== 2) continue;                 // alleen "Voornaam Achternaam"
    const [fn, an] = delen;
    if (!/^[A-ZÀ-Þ]/.test(an)) continue;

    const rx = new RegExp(
      '(?<![A-Za-zÀ-ÿ])([A-ZÀ-Þ][A-Za-zÀ-ÿ]+)\\s+' + an.replace(ESCAPE, '\\$&')
      + '(?![A-Za-zÀ-ÿ])',
      'g',
    );

    for (const tref of bron.matchAll(rx)) {
      const voorwoord = tref[1];
      if (voorwoord === fn) continue;                        // al goed
      if (GEEN_NAAM.has(voorwoord.toLowerCase())) continue;  // titel of tussenvoegsel
      gevonden.add(voorwoord + ' ' + an);
    }
  }
  return [...gevonden];
}
