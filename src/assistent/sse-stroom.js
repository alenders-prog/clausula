/**
 * src/assistent/sse-stroom.js
 * Leest de SSE-stroom van /api/ai-assistent uit.
 *
 * De server stuurt deze regels:
 *   {"type":"fase",      "tekst":"Kennisbank raadplegen…"} — voortgang vóór het antwoord
 *   {"type":"delta",     "tekst":"…"}                      — een stuk van het antwoord
 *   {"type":"sectie",   "veld":"bronnen", "waarde":[…]}  — dit onderdeel, voor zover af
 *   {"type":"klaar",     "data":{…}}                       — het volledige object
 *   {"type":"fout",      "melding":"…"}                    — de server gaf het op
 *
 * Waarom apart van api-antwoord.js: dat bestand vangt af dat er géén antwoord komt.
 * Dit bestand verwerkt een antwoord dat in stukjes komt. Ze staan los omdat ook de
 * niet-streamende aanroepen (clausule, mail, resumé) de eerste nodig hebben.
 */

/** Knipt een tekstbuffer in complete SSE-berichten; de rest blijft staan. */
export function splitsBerichten(buffer) {
  const berichten = [];
  let rest = buffer;
  let grens;
  while ((grens = rest.indexOf('\n\n')) !== -1) {
    const blok = rest.slice(0, grens);
    rest = rest.slice(grens + 2);
    for (const regel of blok.split('\n')) {
      if (!regel.startsWith('data:')) continue;   // ": keepalive" en lege regels overslaan
      const nuttig = regel.slice(5).trim();
      if (nuttig) berichten.push(nuttig);
    }
  }
  return { berichten, rest };
}

/**
 * Leest de stroom en geeft het eindobject terug.
 *
 * @param {Response} resp
 * @param {{onDelta?:(stuk:string)=>void, onFase?:(tekst:string)=>void,
 *          onSectie?:(veld:string, waarde:unknown)=>void}} haken
 */
export async function leesStroom(resp, haken = {}) {
  const { onDelta, onFase, onSectie } = haken;
  const lezer = resp.body?.getReader();
  if (!lezer) throw new Error('De verbinding met de assistent gaf geen leesbare stroom.');

  const decoder = new TextDecoder();
  let buffer = '';
  let eind = null;

  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { berichten, rest } = splitsBerichten(buffer);
    buffer = rest;

    for (const ruw of berichten) {
      let bericht;
      // Een onleesbaar bericht is geen reden om de rest van de stroom weg te gooien.
      try { bericht = JSON.parse(ruw); } catch { continue; }

      if (bericht.type === 'delta' && bericht.tekst) onDelta?.(bericht.tekst);
      else if (bericht.type === 'fase') onFase?.(bericht.tekst || '');
      else if (bericht.type === 'sectie' && bericht.veld) onSectie?.(bericht.veld, bericht.waarde);
      else if (bericht.type === 'klaar') eind = bericht.data;
      else if (bericht.type === 'fout') throw new Error(bericht.melding || 'De assistent gaf een fout.');
    }
  }

  // Verbinding dicht zonder afsluitend bericht: de functie is afgekapt.
  if (!eind) throw new Error('De verbinding met de assistent viel weg voordat het antwoord af was.');
  return eind;
}
