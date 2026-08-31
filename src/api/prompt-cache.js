/**
 * src/api/prompt-cache.js — of en hoe blokken naar de prompt-cache gaan
 *
 * ── WAAROM DE CACHE UITSTAAT ────────────────────────────────────────────────
 *
 * Gemeten op 31 augustus 2026, over een echte analyse van twee documenten:
 * **153.284 tokens aangelegd, nul gelezen.** Cache aanleggen kost 1,25× de invoerprijs
 * en lezen 0,1×, dus dat is $0,115 aan premie per analyse voor een voorraad die niemand
 * aanspreekt — 11% van de rekening van $1,08.
 *
 * En er is geen route waarlangs hij wél gelezen gaat worden. Twee redenen, allebei
 * gemeten:
 *
 *  1. **De tooldefinitie hoort bij het cache-voorvoegsel.** Zelfde tool met een ander
 *     system-vervolg leest de cache (4.931 gelezen); een ándere tool met exact hetzelfde
 *     gedeelde blok leest niets en legt opnieuw aan (4.927). Elke fase van de analyse
 *     heeft een eigen tool, dus tussen fasen valt principieel niets te delen — hoe je de
 *     promptblokken ook ordent. Dat maakt het voor de hand liggende advies ("zet het
 *     gedeelde blok vooraan in system") hier onuitvoerbaar.
 *
 *  2. **De aanroepen starten gelijktijdig.** Een cache wordt pas geschreven als een
 *     verzoek klaar is. Vier aanroepen die tegelijk beginnen missen dus allemaal, ook
 *     als hun voorvoegsel identiek zou zijn.
 *
 * Blijft over: hergebruik tússen analyses, binnen het venster van vijf minuten. Dat komt
 * in de praktijk vrijwel niet voor — één mediator, één dossier tegelijk.
 *
 * ── WANNEER JE HEM WEER AAN ZET ─────────────────────────────────────────────
 *
 * De cache verdient zich terug vanaf de éérste keer dat hij gelezen wordt: aanleggen
 * plus één keer lezen is 1,35 tegen 2,0 voor twee keer gewoon versturen. Zet hem dus aan
 * zodra aan alle drie is voldaan:
 *
 *   - twee of meer aanroepen delen dezelfde tooldefinitie, én
 *   - hun system prompt begint met een identiek blok, én
 *   - ze starten niet tegelijk koud (bijvoorbeeld door er een korte voorverwarm-aanroep
 *     vóór te zetten die de cache aanlegt).
 *
 * En toets het daarna: `cache_lees_tokens` in `api_verbruik` hoort dan op te lopen. Nul
 * gelezen betekent dat je alleen de premie betaalt.
 */

/** Uit, om de redenen hierboven. Eén plek, zodat het een besluit is en geen verstrooidheid. */
export const PROMPT_CACHE_AAN = false;

const MERK = { type: 'ephemeral' };

/**
 * Het `system`-veld van een Claude-verzoek.
 *
 * @param {string} systemPrompt
 * @param {{cacheAan?: boolean}} [opties]
 */
export function systeemVeld(systemPrompt, { cacheAan = PROMPT_CACHE_AAN } = {}) {
  const blok = { type: 'text', text: String(systemPrompt ?? '') };
  return [cacheAan ? { ...blok, cache_control: MERK } : blok];
}

/**
 * De inhoud van het gebruikersbericht.
 *
 * Blokken worden aangeleverd als `{ text, cache }`, waarbij `cache: true` betekent "dit
 * blok is stabiel genoeg om te bewaren". Die markering blijft staan ook als de cache
 * uitstaat: hij zegt iets over de inhoud, niet over de instelling — en zonder die kennis
 * is straks niet meer te zien wélke blokken in aanmerking kwamen.
 *
 * @param {Array<{text:string,cache?:boolean}>|string} userContent
 * @param {{cacheAan?: boolean}} [opties]
 */
export function berichtInhoud(userContent, { cacheAan = PROMPT_CACHE_AAN } = {}) {
  if (!Array.isArray(userContent)) {
    return [{ type: 'text', text: String(userContent ?? '') }];
  }
  return userContent.map((b) => {
    const blok = { type: 'text', text: String(b?.text ?? '') };
    return (cacheAan && b?.cache) ? { ...blok, cache_control: MERK } : blok;
  });
}
