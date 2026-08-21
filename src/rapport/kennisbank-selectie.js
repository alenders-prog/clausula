/**
 * src/rapport/kennisbank-selectie.js
 * Bepaalt welke wetsartikelen met de extra verificatie meegaan.
 *
 * Aanleiding (21 augustus 2026): een verificatie schreef "(art. 1:80c lid 3 BW jo.
 * art. 828 Rv, trainingskennis — verifieer bij twijfel)" en even verderop hetzelfde
 * label bij art. 1:247 BW. Dat laatste artikel zit wél in de kennisbank, met de tags
 * `gezag`, `ouderschapsplan` en `kinderen_minderjarig`.
 *
 * Twee oorzaken in de oude selectie:
 *
 *   1. De artikelnummers werden uit het ISSUE gehaald. De chunks worden dus gekozen
 *      vóórdat het antwoord bestaat; redeneert de verificatie naar een ander artikel,
 *      dan is die chunk er per definitie niet. Onoplosbaar via de issuetekst alleen —
 *      daarom komen de situatiekenmerken van het dossier er nu bij, hetzelfde
 *      mechanisme dat de analyse al gebruikt (topic_tags tegen kenmerk-keys).
 *
 *   2. Het patroon `\d+:\d+` vindt alleen artikelen mét dubbele punt. `art. 828 Rv`
 *      en alle WVPS-artikelen (art. 2, 5, 11) waren daarmee onvindbaar, terwijl het
 *      commentaar beweerde dat "art. 157" ook matchte.
 */

/** Artikelen als "1:88", "3:170", "1:247a" — Burgerlijk Wetboek. */
const RE_BW = /\b(\d+:\d+[a-z]?)\b/gi;

/**
 * Artikelen zonder dubbele punt, mét wetsaanduiding erachter: "art. 828 Rv",
 * "artikel 5 WVPS". De wetsnaam is verplicht — een kale "art. 5" levert te veel
 * valse treffers op in een kennisbank vol artikelnummers.
 */
const RE_WET = /\bart(?:ikel)?\.?\s*(\d+[a-z]?)\s+(Rv|WVPS|Wet\s?VPS|Fw|Awb)\b/gi;

/**
 * Zoektermen voor het citation-veld, in volgorde van betrouwbaarheid.
 * Dubbele treffers worden verwijderd; maximaal `max` termen.
 */
export function artikelVerwijzingen(tekst, max = 8) {
  const gevonden = [];
  const zie = new Set();

  for (const m of String(tekst || '').matchAll(RE_BW)) {
    const t = m[1].toLowerCase();
    if (!zie.has(t)) { zie.add(t); gevonden.push(t); }
  }
  for (const m of String(tekst || '').matchAll(RE_WET)) {
    // Zoek op nummer én wet, zodat "5 WVPS" niet matcht op "art. 5 Fw".
    const t = `${m[1]} ${m[2]}`.toLowerCase().replace(/\s+/g, ' ');
    if (!zie.has(t)) { zie.add(t); gevonden.push(t); }
  }
  return gevonden.slice(0, max);
}

/**
 * Voegt de gevonden chunks samen tot één lijst, zonder dubbelingen en op volgorde
 * van herkomst: eerst wat op artikelnummer is gevonden (het meest specifiek), dan
 * wat op de situatiekenmerken van het dossier past, dan de trefwoord-terugval.
 *
 * @param {{artikel?:Array, tags?:Array, trefwoord?:Array}} bronnen
 */
export function voegChunksSamen(bronnen = {}, max = 6) {
  const uit = [];
  const zie = new Set();
  for (const groep of [bronnen.artikel, bronnen.tags, bronnen.trefwoord]) {
    for (const c of (Array.isArray(groep) ? groep : [])) {
      const sleutel = c?.citation;
      if (!sleutel || zie.has(sleutel)) continue;
      zie.add(sleutel);
      uit.push(c);
      if (uit.length >= max) return uit;
    }
  }
  return uit;
}

/**
 * Trefwoord voor de laatste terugval: het langste woord uit de titel, want dat is
 * doorgaans het onderwerp ("pensioenverevening", "hoofdverblijfplaats"). De oude
 * versie nam het eerste woord langer dan vijf letters, wat op "Ontbinding
 * geregistreerd partnerschap" het weinigzeggende "Ontbinding" opleverde.
 */
export function trefwoord(titel, terugval = '') {
  const woorden = `${titel || ''} ${terugval || ''}`
    .replace(/vanuit AI Assistent/i, '')
    .split(/[^\p{L}]+/u)
    .filter(w => w.length > 5);
  if (!woorden.length) return '';
  return woorden.reduce((a, b) => (b.length > a.length ? b : a));
}
