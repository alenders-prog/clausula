/**
 * src/tekst/placeholder-kern.js — mag deze plaatshouder ook zónder haken worden hersteld?
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * Een kaart in het rapport heette:
 *
 *     "Dubbele zin bij toedeling bankrekeningen IBAN_0 en IBAN_1"
 *
 * De plaatshouder die wij versturen is `[IBAN_0]`, mét haken, en `herstelAnonObj` zet die
 * netjes terug. Het model schreef hem in de titel echter zonder haken over, en dan grijpt
 * geen van de herstelrondes. De mediator las een technische code waar een rekeningnummer
 * hoorde te staan.
 *
 * ── WAAROM DIT EEN APARTE TOETS IS ──────────────────────────────────────────
 *
 * Zonder haken herstellen is riskant: een kern als `WOONPLAATS` of `NAAM` zou dan ook
 * gewone woorden in de tekst raken. Daarom alleen de vorm die in gewoon Nederlands niet
 * voorkomt: HOOFDLETTERS, een liggend streepje, een cijfer — `IBAN_0`, `TEL_1`,
 * `REKENING_12`. Een woord uit een convenant ziet er nooit zo uit.
 *
 * De grens ligt bewust bij de vórm en niet bij een lijst met toegestane namen: die lijst
 * zou achterlopen zodra er een nieuw type plaatshouder bij komt, en dan is het weer stil.
 */

/** De vorm die in lopende tekst niet voorkomt: HOOFDLETTERS_cijfer. */
const TECHNISCH = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_\d+$/;

/**
 * @param {string} kern  de plaatshouder zónder haken, bv. "IBAN_0"
 * @returns {boolean} of hij ook zonder haken veilig te vervangen is
 */
export function isTechnischeKern(kern) {
  return TECHNISCH.test(String(kern ?? '').trim());
}
