/**
 * src/api/kosten.js — wat een Claude-aanroep kostte
 *
 * Eén plek voor de prijzen en de berekening. Prijzen veranderen, en de factoren voor
 * de prompt-cache zijn de plek waar het stil misgaat: cache LEZEN kost een tiende van
 * de gewone invoerprijs, cache SCHRIJVEN kost een kwart méér. Wie die twee verwisselt
 * rekent zichzelf twaalfeneenhalf keer rijk of arm, en aan het bedrag is niet te zien
 * dat er iets niet klopt.
 *
 * Waarom de uitkomst wordt opgeslagen in plaats van bij het tonen berekend: anders zou
 * een regel uit vorig jaar met de prijs van vandaag worden herrekend, en dan is het
 * geen historie meer.
 */

/**
 * Prijzen per miljoen tokens, in dollar. Bijgewerkt 29 augustus 2026.
 *
 * Staat er een model niet bij, dan valt de berekening terug op `STANDAARD` en meldt
 * `kostenVanUsage` dat in `onbekendModel`. Stilzwijgend nul teruggeven zou een nieuw
 * model gratis laten lijken.
 */
export const PRIJZEN = {
  'claude-sonnet-4-6': { invoer: 3.00,  uitvoer: 15.00 },
  'claude-sonnet-5':   { invoer: 3.00,  uitvoer: 15.00 },
  'claude-opus-4-6':   { invoer: 5.00,  uitvoer: 25.00 },
  'claude-opus-5':     { invoer: 5.00,  uitvoer: 25.00 },
  'claude-haiku-4-5':  { invoer: 1.00,  uitvoer:  5.00 },
};

export const STANDAARD = { invoer: 3.00, uitvoer: 15.00 };

/** Cache lezen is een tiende van de invoerprijs; cache aanleggen een kwart duurder. */
export const CACHE_LEES_FACTOR    = 0.10;
export const CACHE_SCHRIJF_FACTOR = 1.25;

/** Modelnaam normaliseren: Anthropic hangt er soms een datum aan. */
export function normaliseerModel(model) {
  const m = String(model || '').trim();
  if (PRIJZEN[m]) return m;
  // "claude-sonnet-4-6-20260101" → "claude-sonnet-4-6"
  const zonderDatum = m.replace(/-\d{8}$/, '');
  return PRIJZEN[zonderDatum] ? zonderDatum : m;
}

/**
 * Berekent de kosten van één aanroep.
 *
 * @param {object} usage  het usage-blok van Anthropic
 * @param {string} model
 * @returns {{usd:number, onbekendModel:boolean, verdeling:object}}
 */
export function kostenVanUsage(usage, model) {
  const naam = normaliseerModel(model);
  const prijs = PRIJZEN[naam];
  const p = prijs || STANDAARD;

  const invoer        = Math.max(0, usage?.input_tokens ?? 0);
  const uitvoer       = Math.max(0, usage?.output_tokens ?? 0);
  const cacheLees     = Math.max(0, usage?.cache_read_input_tokens ?? 0);
  const cacheSchrijf  = Math.max(0, usage?.cache_creation_input_tokens ?? 0);

  const verdeling = {
    invoer:       invoer       * p.invoer  / 1e6,
    uitvoer:      uitvoer      * p.uitvoer / 1e6,
    cacheLees:    cacheLees    * p.invoer  * CACHE_LEES_FACTOR    / 1e6,
    cacheSchrijf: cacheSchrijf * p.invoer  * CACHE_SCHRIJF_FACTOR / 1e6,
  };

  const usd = Object.values(verdeling).reduce((a, b) => a + b, 0);
  // Zes decimalen: een zoekronde kost ordegrootte $0,001 en zou anders op nul uitkomen.
  return { usd: Math.round(usd * 1e6) / 1e6, onbekendModel: !prijs, verdeling };
}

/**
 * Vaste woordenlijst voor `fase`. Vrije tekst zou hier alsnog een zoekterm kunnen
 * worden, en die komt van de gebruiker en kan een cliëntnaam bevatten.
 */
export const FASEN = new Set([
  // analyseer.js
  'structuur', 'bevindingen', 'cross_doc', 'consolidatie',
  // ai-assistent.js
  'zoekronde', 'afronding', 'clausule', 'klanttekst', 'mail', 'samenvatting',
  // claude-edge.js — komt uit de browser mee
  'concept', 'classificatie', 'vraag_antwoord', 'verificatie',
  'onbekend',
]);

export const veiligeFase = (f) => FASEN.has(String(f || '')) ? String(f) : 'onbekend';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Laat alleen iets door dat écht een uuid is.
 *
 * `screening_id` komt uit de browser: de analyse begint vóórdat de screening bestaat,
 * dus de browser maakt de sleutel vooraf en geeft hem mee. Alles wat van de client komt
 * kan van alles zijn, en de kolom is een uuid — een andere waarde laat het wegschrijven
 * stilletjes mislukken en dan is de hele regel weg, niet alleen het label.
 */
export const veiligeUuid = (v) => UUID_RE.test(String(v ?? '')) ? String(v) : null;

/**
 * Bouwt de regel voor `api_verbruik`.
 *
 * Losgehouden van het wegschrijven zodat de vorm te toetsen is zonder database — en
 * zodat er, net als bij de feitentabel, één plek is die bepaalt wat er in die tabel
 * terechtkomt.
 */
export function bouwVerbruikRegel({
  endpoint, fase, model, usage,
  duurMs, eersteTokenMs,
  organisatieId, gebruikerId, screeningId,
  geslaagd = true, foutsoort = null,
} = {}) {
  const { usd } = kostenVanUsage(usage, model);
  return {
    organisatie_id: organisatieId ?? null,
    gebruiker_id:   gebruikerId ?? null,
    screening_id:   veiligeUuid(screeningId),
    endpoint:       String(endpoint || 'onbekend'),
    fase:           veiligeFase(fase),
    model:          normaliseerModel(model) || null,
    input_tokens:         Math.max(0, usage?.input_tokens ?? 0),
    output_tokens:        Math.max(0, usage?.output_tokens ?? 0),
    cache_lees_tokens:    Math.max(0, usage?.cache_read_input_tokens ?? 0),
    cache_schrijf_tokens: Math.max(0, usage?.cache_creation_input_tokens ?? 0),
    kosten_usd:      usd,
    duur_ms:         Number.isFinite(duurMs) ? Math.round(duurMs) : null,
    eerste_token_ms: Number.isFinite(eersteTokenMs) ? Math.round(eersteTokenMs) : null,
    geslaagd:  !!geslaagd,
    foutsoort: geslaagd ? null : (foutsoort || 'onbekend'),
    gestart_op: new Date().toISOString(),
  };
}

/**
 * Herkent waaróm een aanroep mislukte, uit de foutmelding.
 *
 * Een timeout apart kunnen tellen is het halve punt van deze tabel: de klacht van
 * 28 augustus 2026 ("het antwoord verschijnt half en verdwijnt dan") was een timeout
 * waarvan nergens een spoor terug te vinden was.
 */
export function foutsoortVan(fout) {
  const m = String(fout?.message || fout || '');
  if (/timeout|tijdslimiet|niet binnen de beschikbare tijd|AbortError|TimeoutError/i.test(m)) return 'timeout';
  if (/viel weg|afgebroken|aborted/i.test(m)) return 'afgebroken';
  if (/Claude \d{3}|HTTP \d{3}|status \d{3}/i.test(m)) return 'http';
  return 'onbekend';
}
