/**
 * api/_verbruik.js — meet een Claude-aanroep en schrijft hem weg
 *
 * Onderstreepje voorop: Vercel maakt van élk bestand in api/ een functie, en het
 * Hobby-plan staat er twaalf toe. Bestanden met een liggend streepje tellen niet mee.
 *
 * ── DE REGEL DIE BOVEN ALLES GAAT ──────────────────────────────────────────
 *
 *   Mislukt het meten, dan gaat de aanroep gewoon door.
 *
 * Een analyse van twee minuten mag niet stranden omdat een insert niet lukte. Alles
 * hieronder vangt daarom zijn eigen fouten af en meldt ze hoogstens in de log. Dat is
 * precies het patroon waar dit project eerder op stukliep — een stille `catch` die een
 * echt probleem verzwolg — dus staat er een `console.warn` in met een herkenbaar
 * voorvoegsel, en nooit een lege catch.
 *
 * Wat er NIET in de tabel komt: prompts, antwoorden, zoektermen. Alleen tellingen en
 * een fase uit een vaste woordenlijst. Zie src/api/kosten.js en
 * docs/avg-verwerkersovereenkomst.md.
 */
import { bouwVerbruikRegel, foutsoortVan } from '../src/api/kosten.js';

// Bij élke aanroep uit de omgeving lezen, niet één keer bij het laden van de module.
// Een module-brede constante wordt ingevuld op het moment van importeren; is de
// omgeving dan nog niet compleet, dan staat het meten permanent uit — ook nadat de
// variabele wél is gezet. Dat is precies het soort schakelaar dat niemand ooit terug
// ziet staan.
const omgeving = () => ({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

/**
 * Schrijft één regel weg. Wacht niet op het resultaat; de aanroeper hoeft hier niets
 * mee te doen.
 */
export function schrijfVerbruik(regel) {
  const { url: URL, key: KEY } = omgeving();
  if (!URL || !KEY || !regel) return;
  fetch(`${URL}/rest/v1/api_verbruik`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(regel),
  }).then(r => {
    if (!r.ok) return r.text().then(t =>
      console.warn('[verbruik] wegschrijven mislukt:', r.status, t.slice(0, 200)));
  }).catch(e => console.warn('[verbruik] wegschrijven mislukt:', e.message));
}

/**
 * Meet een Claude-aanroep.
 *
 * Geeft een meter terug waar de aanroeper drie dingen aan kwijt kan: het moment van
 * het eerste token, het usage-blok, en of het gelukt is. Bewust géén wrapper om de
 * fetch heen: de vier aanroepplekken verschillen te veel (streamend, niet-streamend,
 * met retries, doorgeefluik) en een omhulsel dat op alle vier past zou meer verbergen
 * dan besparen.
 *
 * @param {object} context  { endpoint, fase, model, organisatieId, gebruikerId, screeningId }
 */
export function meetAanroep(context = {}) {
  const t0 = Date.now();
  let eersteToken = null;
  let usage = null;

  return {
    /** Eerste stukje antwoord binnen. Alleen de eerste aanroep telt. */
    eersteTokenNu() { if (eersteToken === null) eersteToken = Date.now() - t0; },

    /**
     * Het usage-blok van Anthropic. Bij streamen komt dat in twee stukken:
     * `message_start` draagt de invoertellingen, `message_delta` de uitvoertelling.
     * Daarom samenvoegen in plaats van overschrijven — anders blijft er van de
     * invoerkant niets over en lijkt elke gestreamde aanroep bijna gratis.
     */
    usage(nieuw) {
      if (!nieuw) return;
      usage = { ...(usage || {}), ...Object.fromEntries(
        Object.entries(nieuw).filter(([, v]) => typeof v === 'number')) };
    },

    /** Gelukt: schrijf de regel weg. */
    klaar(extra = {}) {
      schrijfVerbruik(bouwVerbruikRegel({
        ...context, ...extra, usage,
        duurMs: Date.now() - t0, eersteTokenMs: eersteToken, geslaagd: true,
      }));
    },

    /**
     * Mislukt: schrijf hem óók weg. Een timeout is juist wat je wilt zien staan — de
     * klacht van 28 augustus 2026 was er een waarvan nergens een spoor te vinden was.
     * Wat er aan tokens al binnen was telt mee: die zijn betaald, ook al kwam het
     * antwoord niet af.
     */
    mislukt(fout, extra = {}) {
      schrijfVerbruik(bouwVerbruikRegel({
        ...context, ...extra, usage,
        duurMs: Date.now() - t0, eersteTokenMs: eersteToken,
        geslaagd: false, foutsoort: foutsoortVan(fout),
      }));
    },
  };
}

/**
 * Haalt het usage-blok uit een SSE-regel van Anthropic.
 *
 * `message_start` draagt `message.usage` met de invoerkant (inclusief de cachevelden),
 * `message_delta` draagt `usage` met de uitvoerkant. Beide zijn nodig; wie alleen de
 * laatste pakt, mist de hele invoertelling.
 */
export function usageUitSse(bericht) {
  if (!bericht || typeof bericht !== 'object') return null;
  if (bericht.type === 'message_start') return bericht.message?.usage ?? null;
  if (bericht.type === 'message_delta') return bericht.usage ?? null;
  return null;
}
