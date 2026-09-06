/**
 * src/tekst/taalcontroles.js — taalfouten die zonder woordenboek te vinden zijn
 *
 * ── WAAROM DETERMINISTISCH ──────────────────────────────────────────────────
 *
 * Een taalmodel doet spelling onbetrouwbaar. Dat is geen promptprobleem: de instructie
 * "rapporteer ELKE tikfout als apart issue" staat er al, en `wordtgekregen` werd toch
 * gemist. Uitputtend scannen over vijftien pagina's is precies waar een model zwak in is,
 * en het concurreert daarbij om uitvoertokens met de juridische toetsing. Twee identieke
 * runs verschilden gemeten 8 tot 10 bevindingen.
 *
 * Voor een deel van de fouten is een model ook helemaal niet nodig. Dit bestand doet
 * alleen dát deel: de gevallen die met zekerheid en zonder woordenlijst vast te stellen
 * zijn. Nul valse meldingen is hier de eis, niet een streven — een luidruchtige melding
 * leert de mediator wegklikken, en dan mist hij ook de goede.
 *
 * ── WAT HIER BEWUST NIET IN ZIT ─────────────────────────────────────────────
 *
 * Spelling (vraagt een woordenlijst plus een vakjargonlijst — apart besluit, want de
 * meting liet zien dat samenstellingen splitsen juist de échte fouten opslokt:
 * `wordtgekregen` = `wordt` + `gekregen`, structureel niet te onderscheiden van
 * `zorgverdeling` = `zorg` + `verdeling`).
 *
 * Zinsbouw en dt-fouten (vragen een taalkundige analyse; `word` is een geldig woord).
 */

/** Wat elke controle teruggeeft: genoeg om er een issue-kaart van te maken. */
function bevinding(soort, tekst, index, onderwerp, bevindingTekst, aanbeveling) {
  return { soort, tekst, index, onderwerp, bevinding: bevindingTekst, aanbeveling };
}

/**
 * Twee keer hetzelfde woord achter elkaar: "de de vrouw".
 *
 * Alleen binnen één regel. Over een regeleinde heen is het bijna altijd een kop die
 * herhaald wordt in de tekst eronder ("Wisselmomenten\n\nWisselmomenten spreken partijen
 * af…") — gemeten op een echt document: van vier treffers waren er drie van die soort.
 *
 * Woorden van één letter blijven buiten schot: "A A" kan een tabelkop zijn.
 */
export function dubbeleWoorden(tekst) {
  const uit = [];
  const re = /\b([A-Za-zÀ-ÿ]{2,})([ \t]+)(\1)\b/gi;
  for (const m of String(tekst ?? '').matchAll(re)) {
    const [heel, eerste, , tweede] = m;
    // Verschilt alleen de hoofdletter, dan is het meestal een kop die in de zin eronder
    // herhaald wordt: "Wisselmomenten wisselmomenten spreken partijen af". Maar "De de
    // vrouw" is wél een tikfout. Het onderscheid zit in de lengte: een verdubbeld
    // functiewoord is kort (de, het, een, van, dat), een herhaalde kop is een inhoudswoord.
    // Grens op vier letters; gemeten op een echt document gaf dat nul valse meldingen.
    if (eerste !== tweede && eerste.length > 4) continue;
    uit.push(bevinding(
      'dubbel_woord', heel, m.index,
      `Tikfout: dubbel woord '${eerste} ${tweede}'`,
      `Het woord '${eerste}' staat twee keer achter elkaar.`,
      `Verwijder één van beide: '${eerste}'.`,
    ));
  }
  return uit;
}

/**
 * Een dubbele punt achter een afkorting die een opsomming afsluit: "beugel etc:".
 *
 * `etc`, `enz` en `e.d.` sluiten een opsomming áf; er volgt geen opsomming meer. Gevonden
 * in een echt ouderschapsplan: "Lichte medische behandelingen, zoals bloedprikken,
 * inenten, beugel etc:".
 */
export function leestekenNaAfkorting(tekst) {
  const uit = [];
  const re = /\b(etc|enz|e\.d|ed)\.?\s*(:)/gi;
  for (const m of String(tekst ?? '').matchAll(re)) {
    uit.push(bevinding(
      'leesteken', m[0], m.index,
      `Onjuiste dubbele punt na '${m[1]}'`,
      `'${m[1]}.' sluit een opsomming af; een dubbele punt kondigt er juist één aan.`,
      `Vervang de dubbele punt door een punt: '${m[1]}.'.`,
    ));
  }
  return uit;
}

/**
 * Een spatie vóór een leesteken: "de woning , de auto".
 *
 * Alleen binnen een regel, en niet vóór een punt die bij een nummering hoort
 * ("3 . 2" komt in uitgelezen PDF-tekst voor als kolomartefact en is geen taalfout).
 */
export function spatieVoorLeesteken(tekst) {
  const uit = [];
  const re = /[A-Za-zÀ-ÿ][ \t]+([,;!?])/g;
  for (const m of String(tekst ?? '').matchAll(re)) {
    uit.push(bevinding(
      'leesteken', m[0], m.index,
      `Spatie vóór '${m[1]}'`,
      `Er staat een spatie tussen het woord en de '${m[1]}'.`,
      `Haal de spatie weg.`,
    ));
  }
  return uit;
}

/**
 * Alle deterministische controles achter elkaar.
 *
 * @param {string} tekst  de documenttekst, bij voorkeur al door normaliseerTekst
 * @returns {Array} bevindingen, op volgorde van voorkomen in het document
 */
export function taalcontroles(tekst) {
  const t = String(tekst ?? '');
  if (!t) return [];
  return [
    ...dubbeleWoorden(t),
    ...leestekenNaAfkorting(t),
    ...spatieVoorLeesteken(t),
  ].sort((a, b) => a.index - b.index);
}

/**
 * Haalt de bevindingen weg die het model al heeft gemeld.
 *
 * ── WAAROM DIT MOET ─────────────────────────────────────────────────────────
 *
 * Deze controles draaien in de browser en worden ná de server-consolidatie aan de lijst
 * toegevoegd. Die consolidatie ziet ze dus niet, en kan ze ook niet ontdubbelen.
 *
 * Dat is geen theoretisch risico. Gemeten over drie runs op hetzelfde documentpaar:
 *
 *     de de vrouw      model vindt hem 3 van de 3 keer   → altijd dubbel
 *     etc:             model vindt hem 0 van de 3 keer   → nooit dubbel
 *     wordtgekregen    1 van de 3
 *
 * Zonder deze filter zou een mediator bij élke analyse twee kaarten over hetzelfde
 * dubbele woord krijgen. Precies het soort ruis dat een lijst onbetrouwbaar maakt.
 *
 * ── DE TOETS ────────────────────────────────────────────────────────────────
 *
 * Komt het gevonden fragment letterlijk voor in de titel, bevinding of passage van een
 * bestaand issue, dan gaat dat over dezelfde fout. Dat is streng genoeg: "de de" of
 * "etc:" zijn geen tekenreeksen die per ongeluk in een bevinding staan.
 *
 * Bij twijfel valt de deterministische weg — die vindt hem volgende keer weer, terwijl de
 * modelbevinding meer uitleg draagt.
 */
export function filterAlGemeld(bevindingen, bestaandeIssues = []) {
  if (!Array.isArray(bevindingen) || bevindingen.length === 0) return [];
  const heleTekst = (bestaandeIssues ?? [])
    .map((i) => `${i?.onderwerp ?? ''} ${i?.bevinding ?? ''} ${i?.passage ?? ''}`)
    .join(' \n ')
    .toLowerCase().replace(/\s+/g, ' ');
  if (!heleTekst.trim()) return bevindingen;
  return bevindingen.filter((b) => {
    const fragment = String(b?.tekst ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    return fragment ? !heleTekst.includes(fragment) : true;
  });
}
