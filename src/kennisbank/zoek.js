/**
 * src/kennisbank/zoek.js
 * Zoeken in `legal_chunks`: semantisch waar het kan, op woorden waar het moet.
 *
 * Aanleiding (23 augustus 2026). De kennisbank werd doorzocht met
 * `ilike('content', '%' + eerste_woord + '%')` — alleen het eerste woord van de
 * zoekopdracht, en zonder sortering. Gemeten over twaalf realistische vragen
 * leverden er zes nul relevante chunks op. Het model kreeg materiaal dat er half
 * naast zat en zocht opnieuw; vandaar drie tot vijf zoekrondes per vraag.
 *
 * Waarom semantisch en niet beter woordzoeken: op "heeft de vertrekkende partij
 * nog zeggenschap over de woning" hoort art. 3:170 BW het antwoord te zijn, maar
 * het woord "zeggenschap" staat niet in die chunk. Relevante chunks in de top 5,
 * over dezelfde twaalf vragen:
 *
 *     eerste woord (oud)          11
 *     alle woorden + score        22
 *     semantisch (voyage-law-2)   34    en geen enkele vraag zonder treffer
 *
 * De woordvariant blijft bestaan als terugval. Valt Voyage weg, dan is zoeken op
 * woorden nog altijd twee keer zo goed als wat er stond — en een assistent die
 * zonder kennisbank antwoordt is erger dan een die hem half raakt.
 */

const MODEL = 'voyage-law-2';

/**
 * Woorden waar niet op gezocht moet worden. Niet omdat ze zeldzaam zijn, maar
 * omdat ze in juridische tekst juist overal staan: wie op "echtscheiding" zoekt
 * krijgt de hele kennisbank terug.
 */
const NIETSZEGGEND = new Set([
  'welke', 'welk', 'wordt', 'worden', 'hebben', 'heeft', 'staan', 'zonder', 'tijdens',
  'geldt', 'zijn', 'over', 'voor', 'niets', 'partners', 'partner', 'beiden', 'andere',
  'ander', 'deze', 'daar', 'waar', 'moet', 'moeten', 'kunnen', 'mogen', 'echtscheiding',
  'scheiding', 'scheiden', 'huwelijk', 'partijen', 'situatie', 'geval', 'vraag',
]);

/** De woorden waarop het zinvol is te zoeken. */
export function zoekwoorden(zoektermen) {
  return [...new Set(
    String(zoektermen ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9:\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !NIETSZEGGEND.has(w)),
  )];
}

/**
 * Rangschikt kandidaat-chunks op hoeveel zoekwoorden ze raken. Een treffer in de
 * citatie of een tag telt zwaarder dan een treffer ergens in de lopende tekst:
 * "art. 1:88 BW" in de titel zegt meer dan het woord "woning" in alinea vier.
 */
export function rangschik(chunks, woorden, aantal = 5) {
  if (!Array.isArray(chunks) || !woorden?.length) return (chunks || []).slice(0, aantal);
  return chunks
    .map(c => {
      const kop  = `${c.citation ?? ''} ${(c.topic_tags ?? []).join(' ')}`.toLowerCase();
      const body = `${c.content ?? ''}`.toLowerCase();
      let score = 0;
      for (const w of woorden) {
        if (kop.includes(w))  score += 3;
        else if (body.includes(w)) score += 1;
      }
      return { chunk: c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, aantal)
    .map(x => x.chunk);
}

/** Eén zoekopdracht omzetten naar een vector. Geeft null als dat niet lukt. */
export async function embedZoekvraag(zoektermen, apiKey, fetchImpl = fetch) {
  if (!apiKey || !zoektermen?.trim()) return null;
  try {
    const res = await fetchImpl('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, input: [zoektermen], input_type: 'query' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[kennisbank] Voyage ${res.status} — terugval op woordzoeken`);
      return null;
    }
    const json = await res.json();
    return json?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.warn(`[kennisbank] embedding mislukt (${err.message}) — terugval op woordzoeken`);
    return null;
  }
}

/**
 * Zoekt chunks bij een zoekopdracht.
 *
 * Semantisch als het kan; anders op woorden. Beide paden geven hetzelfde terug,
 * zodat de aanroeper niet hoeft te weten welke route gelopen is.
 *
 * @param {object}   supabase
 * @param {string}   zoektermen
 * @param {string[]} [tags]      optionele filtering op topic_tags
 * @param {object}   opties      { apiKey, aantal, fetchImpl }
 * @returns {Promise<{chunks: Array, methode: 'semantisch'|'woorden'|'geen'}>}
 */
export async function zoekChunks(supabase, zoektermen, tags, opties = {}) {
  const { apiKey, aantal = 5, fetchImpl = fetch } = opties;

  const vector = await embedZoekvraag(zoektermen, apiKey, fetchImpl);
  if (vector) {
    const { data, error } = await supabase.rpc('zoek_legal_chunks', {
      query_embedding: vector,
      aantal,
      filter_tags: tags?.length ? tags : null,
    });
    if (!error) return { chunks: data ?? [], methode: 'semantisch' };
    // De functie ontbreekt of pgvector staat uit: draai kennisbank-semantisch.sql.
    console.warn(`[kennisbank] zoek_legal_chunks mislukt (${error.message}) — terugval op woordzoeken`);
  }

  const woorden = zoekwoorden(zoektermen);
  if (!woorden.length) return { chunks: [], methode: 'geen' };

  let q = supabase.from('legal_chunks').select('citation, content, topic_tags')
    .or(woorden.map(w => `content.ilike.%${w}%`).join(','))
    .limit(40);
  if (tags?.length) q = q.overlaps('topic_tags', tags);

  const { data, error } = await q;
  if (error) {
    console.warn(`[kennisbank] woordzoeken mislukt: ${error.message}`);
    return { chunks: [], methode: 'geen' };
  }
  return { chunks: rangschik(data ?? [], woorden, aantal), methode: 'woorden' };
}
