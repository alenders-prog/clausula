// api/genereer-concept.js
// POST — Verwerkt aangevinkte analysepunten in een verbeterde versie van het document.
// Retourneert JSON: { documentTekst, wijzigingen }
// wijzigingen bevat originele_tekst + aangepaste_tekst voor track-changes weergave.

import https from 'https';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

// Omzeilt Vercel/undici headersTimeout door Node's https.request() te gebruiken,
// dat geen headers-timeout kent (alleen een inactiviteits-timeout op de socket).
function anthropicPost(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(payload),
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 115_000, // 115 s socket-inactiviteits-timeout (< Vercel maxDuration 120s)
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`JSON-parse mislukt: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout (115 s)')); });
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd' });

  const { documentTekst, aangevinkt, documentType, bestandsnaam } = req.body;
  if (!documentTekst?.trim()) return res.status(400).json({ error: 'documentTekst ontbreekt' });
  if (!aangevinkt?.length)    return res.status(400).json({ error: 'Geen aangevinkte punten' });

  // ── Hulpfunctie: verbeterpunt formatteren voor de prompt ──────────
  const formatItem = (item, nr) => {
    const cat  = item.categorie || '?';
    const loc  = item.onderwerp || item.locatie || item.sectie || item.signalering || '';
    const bev  = item.bevinding || item.toelichting || item.probleem || item.signalering || '';
    const sug  = item.aanbeveling || item.suggestie || '';
    const opm  = item.opmerking || '';
    const pas  = item.passage   || item.citaat || '';
    const dims = Array.isArray(item.dimensies) && item.dimensies.length ? item.dimensies.join(', ') : '';
    let tekst = `[${nr}] (${cat}${dims ? ' — ' + dims : ''})`;
    if (loc) tekst += `\n   Onderwerp: ${loc}`;
    if (bev) tekst += `\n   Bevinding: ${bev}`;
    if (sug) tekst += `\n   Aanbeveling: ${sug}`;
    if (opm) tekst += `\n   Opmerking mediator: ${opm}`;
    if (pas) tekst += `\n   Passage in document: "${pas}"`;
    return tekst;
  };

  const systemPrompt =
`Je bent een ervaren Nederlandse juridische documentschrijver gespecialiseerd in echtscheidingsdocumenten. Je taak is het aanpassen van specifieke passages op basis van de gegeven verbeterpunten.

KERNREGELS:
1. Geef ALLEEN de gewijzigde passages terug — herschrijf NOOIT het volledige document.
2. Behoud de formele toon, nummering en stijl van het origineel in de aangepaste tekst.
3. Verwijder NOOIT volledige artikelen of secties tenzij een verbeterpunt dit expliciet vereist.
4. Als een aanpassing logische gevolgen heeft voor een ander artikel, vermeld dat dan in ook_aangepast. Wijzig die andere artikelen NIET — alleen noemen, niet aanpassen.
5. Als een verbeterpunt een concrete "Suggestie" bevat, gebruik die formulering letterlijk tenzij het de samenhang schaadt.
6. Gebruik NIET de termen "Partij A" of "Partij B" als het origineel concrete namen gebruikt — behoud die namen.
7. Genereer per verbeterpunt PRECIES ÉÉN item in wijzigingen. Kies voor originele_tekst de KLEINSTE aaneengesloten passage:
   • Betreft het één bullet-punt of één zin → gebruik uitsluitend die ene bullet of zin (plus eventueel de directe verklarende zin erna als die onlosmakelijk deel uitmaakt van hetzelfde punt).
   • Nooit aangrenzende bullet-punten, andere alinea's of andere secties toevoegen aan originele_tekst.
   • Concreet voorbeeld: bevinding over "Hemelvaartsdag" → originele_tekst = uitsluitend de Hemelvaartsdag-regel; NIET ook de Koningsdag-regel of naburige regels.
8. Als de bevinding betrekking heeft op een specifieke sectie of artikel, pas dan UITSLUITEND tekst uit DIEZELFDE sectie aan. Raak tekst uit andere secties nooit aan.
9. Het woord 'CONCEPT' of 'DRAFT' in de documenttekst is een documentwatermerk — neem dit NOOIT op in originele_tekst en verander nooit een passage die met 'CONCEPT' begint.

VERVANGING VAN BESTAANDE TEKST (meest gebruikelijk):
10. Vul originele_tekst met de EXACTE woordelijke tekst uit het document (inclusief nummering, spaties en leestekens).
    De tekst wordt letterlijk gezocht — elke afwijking betekent dat de wijziging niet toegepast kan worden.
    Neem minimaal één volledige zin op. Laat invoeg_na leeg ("").

INVOEGEN VAN NIEUWE SECTIES (alleen als het verbeterpunt een nieuw artikel/sectie vereist):
11. Laat originele_tekst leeg ("").
    Vul invoeg_na met de EXACTE tekst van het laatste woord/zin van het artikel NA welke ingevoegd wordt.
    Vul aangepaste_tekst met de volledige nieuwe sectietekst (inclusief nummering).
    Dit is alleen voor inhoud die volledig NIEUW is en niet al ergens in het document staat.`;

  // ── Tool-definitie ────────────────────────────────────────────────
  // Alleen wijzigingen ophalen — NIET het volledige document herschrijven.
  // Het document wordt serverside gereconstrueerd door de wijzigingen toe te passen.
  const tool = {
    name: 'document_wijzigingen',
    description: 'Levert uitsluitend de gewijzigde passages (origineel → aangepast). Het volledige document hoeft NIET te worden herhaald.',
    input_schema: {
      type: 'object',
      properties: {
        wijzigingen: {
          type: 'array',
          description: 'Één item per verbeterpunt — alleen de gewijzigde passages, niet het hele document',
          items: {
            type: 'object',
            properties: {
              item_nr:         { type: 'integer', description: 'Nummer van het verbeterpunt (1-based)' },
              artikel:         { type: 'string',  description: 'Welk artikel of welke sectie is gewijzigd of toegevoegd' },
              wat_gewijzigd:   { type: 'string',  description: 'Beknopte omschrijving van de aanpassing (max 2 zinnen)' },
              originele_tekst: { type: 'string',  description: 'VERVANGING: de EXACTE woordelijke tekst uit het document die vervangen wordt. Leeg laten bij nieuwe secties.' },
              invoeg_na:       { type: 'string',  description: 'INVOEGING: de EXACTE tekst van de zin/het artikel NA welke de nieuwe sectie ingevoegd wordt. Leeg laten bij vervangingen.' },
              aangepaste_tekst:{ type: 'string',  description: 'De nieuwe/vervangende tekst zoals die in het document moet staan' },
              ook_aangepast:   {
                type: 'array',
                items: { type: 'string' },
                description: 'Andere artikelen/secties die vanwege samenhang óók zijn aangepast (leeg als geen)',
              },
            },
            required: ['item_nr', 'artikel', 'wat_gewijzigd', 'originele_tekst', 'invoeg_na', 'aangepaste_tekst', 'ook_aangepast'],
          },
        },
      },
      required: ['wijzigingen'],
    },
  };

  try {
    // ── Parallel batching: max 5 verbeterpunten per Claude-call ──────
    // Meerdere kleine calls tegelijk zijn sneller dan één grote call,
    // omdat de outputgeneratie de bottleneck is (niet de inputverwerking).
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < aangevinkt.length; i += BATCH_SIZE) {
      batches.push(aangevinkt.slice(i, i + BATCH_SIZE));
    }
    console.log(`[genereer-concept] ${aangevinkt.length} punten in ${batches.length} batch(es) van max ${BATCH_SIZE}`);

    const batchResultaten = await Promise.all(batches.map(async (batch, bIdx) => {
      const offsetNr  = bIdx * BATCH_SIZE; // globale nummering behouden
      const itemsTekst = batch.map((item, i) => formatItem(item, offsetNr + i + 1)).join('\n\n');

      const userPrompt =
`DOCUMENTTYPE: ${documentType || 'echtscheidingsdocument'}

TE VERWERKEN VERBETERPUNTEN (${batch.length} van ${aangevinkt.length} stuks, nummers ${offsetNr + 1}–${offsetNr + batch.length}):
${itemsTekst}

Geef per verbeterpunt ALLEEN de gewijzigde passage terug.
- Bestaande tekst aanpassen → originele_tekst invullen, invoeg_na leeg laten.
- Nieuw artikel toevoegen → invoeg_na invullen (tekst NA welke ingevoegd wordt), originele_tekst leeg laten.
Herschrijf het volledige document NIET.

ORIGINEEL DOCUMENT:
${documentTekst}`;

      const { status, body: json } = await anthropicPost(apiKey, {
        model:       'claude-sonnet-4-6',
        max_tokens:  4096, // per batch van 5: ruim voldoende voor complexe wijzigingen
        temperature: 0,
        system:      systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      });

      if (status >= 400) {
        throw new Error(`Anthropic API fout batch ${bIdx + 1} (${status}): ${JSON.stringify(json)}`);
      }
      if (json.stop_reason === 'max_tokens') {
        console.warn(`[genereer-concept] batch ${bIdx + 1}: max_tokens bereikt — sommige wijzigingen mogelijk afgekapt`);
        // Gooi een herkenbare fout zodat de client dit kan tonen
        throw new Error(`Tokenbudget bereikt voor batch ${bIdx + 1}. Selecteer minder verbeterpunten tegelijk (max 5 aanbevolen).`);
      }

      const toolUse = json.content?.find(b => b.type === 'tool_use');
      return toolUse?.input?.wijzigingen || [];
    }));

    const wijzigingen = batchResultaten.flat();

    // ── Hulpfuncties voor tekst-matching ─────────────────────────────────
    // Normaliseert tekst: zachte koppeltekens, non-breaking spaties,
    // typografische aanhalingstekens, em/en-dash en overbodige witruimte.
    const normaliseer = (s) => (s || '')
      .replace(/­/g, '')                          // zachte koppeltekens
      .replace(/[   ]/g, ' ')           // non-breaking/dunne spaties
      .replace(/[‘’`´]/g, "'")     // curly/backtick single quotes
      .replace(/[“”«»„]/g, '"') // curly double quotes
      .replace(/…/g, '...')                       // ellipsis
      .replace(/[–—―]/g, '-')           // en/em/horizontale streep
      .replace(/\s+/g, ' ')                            // meerdere spaties
      .trim();

    // Bouwt een regex die tolerant is voor whitespace-variaties in rawText.
    // Elk spatie-karakter in de zoekterm matcht één of meer whitespace-tekens.
    const maakRegex = (zoekTekst) => {
      const norm = normaliseer(zoekTekst);
      const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patroon = escaped.replace(/ /g, '[\\s\\u00A0\\u00AD]+');
      return new RegExp(patroon, 's'); // dotAll: . matcht ook newlines
    };

    // Vindt zoekTekst in docTekst (exact, dan flex) en retourneert {start, end} of null.
    const vindPositie = (docTekst, zoekTekst) => {
      if (!zoekTekst?.trim()) return null;
      // 1. Exacte match
      const exactIdx = docTekst.indexOf(zoekTekst);
      if (exactIdx >= 0) return { start: exactIdx, end: exactIdx + zoekTekst.length };
      // 2. Flexibele regex-match (whitespace + speciale tekens)
      const match = maakRegex(zoekTekst).exec(docTekst);
      if (match) return { start: match.index, end: match.index + match[0].length };
      return null;
    };

    // ── Reconstructie ────────────────────────────────────────────────────
    // Probleem bij sequentieel toepassen: vervanging A wijzigt de tekst, waarna
    // vervanging B z'n originele_tekst niet meer exact vindt en de regex-fallback
    // een veel groter stuk kan matchen (cascade-effect).
    //
    // Oplossing: posities bepalen in het ORIGINELE document, overlappen detecteren,
    // dan in OMGEKEERDE volgorde toepassen (achter→voor zodat posities stabiel blijven).

    // Validatie 1: verwijder wijzigingen met een identieke aangepaste_tekst (dubbele toepassing).
    // Dit vangt het geval dat Claude dezelfde correctie in meerdere secties wil toepassen,
    // terwijl slechts één sectie het daadwerkelijke probleem bevat.
    const _gezienAangepast = new Set();
    const gevalideerdWijzigingen = [];
    for (const w of wijzigingen) {
      if (w.aangepaste_tekst == null) continue;
      // Gebruik de eerste 300 genormaliseerde tekens als fingerprint
      const fp = normaliseer(w.aangepaste_tekst).slice(0, 300);
      if (fp && _gezienAangepast.has(fp)) {
        console.warn(`[genereer-concept] item ${w.item_nr} overgeslagen — identieke aangepaste_tekst als eerder item (dubbele toepassing): "${w.aangepaste_tekst.slice(0, 60)}…"`);
        continue;
      }
      if (fp) _gezienAangepast.add(fp);

      // Validatie 2: skip als originele_tekst een documentwatermerk bevat.
      // PDF-extractie plaatst 'CONCEPT' of 'DRAFT' soms midden in de tekst;
      // als dit in originele_tekst zit, is het een foutief groot bereik.
      if (/\bCONCEPT\b|\bDRAFT\b/i.test(w.originele_tekst || '')) {
        console.warn(`[genereer-concept] item ${w.item_nr} overgeslagen — originele_tekst bevat documentwatermerk: "${(w.originele_tekst || '').slice(0, 80)}…"`);
        continue;
      }

      // Validatie 3: skip als originele_tekst over een sectie-/artikelgrens gaat.
      // Herkend doordat na de eerste regel een sectieheader-patroon verschijnt:
      // "3. Identiteitsbewijzen", "Artikel 4.1 ..." etc. (cijfer + punt + hoofdletter).
      const _origRegels = (w.originele_tekst || '').split(/\r?\n/);
      const _beslaat_meerdere_secties = _origRegels.length > 2 &&
        _origRegels.slice(1).some(r => /^\s*\d+\.\s+[A-Z]/.test(r.trim()));
      if (_beslaat_meerdere_secties) {
        console.warn(`[genereer-concept] item ${w.item_nr} overgeslagen — originele_tekst beslaat meerdere secties: "${(w.originele_tekst || '').slice(0, 80)}…"`);
        continue;
      }

      gevalideerdWijzigingen.push(w);
    }

    // Stap 1: zoek positie van elke wijziging in het ORIGINELE document
    const gepositioneerd = [];
    for (const w of gevalideerdWijzigingen) {
      if (w.aangepaste_tekst == null) continue;
      const heeftInvoegNa  = w.invoeg_na?.trim();
      const heeftOrigineel = w.originele_tekst?.trim();

      if (heeftInvoegNa) {
        const pos = vindPositie(documentTekst, w.invoeg_na);
        if (pos) {
          gepositioneerd.push({ ...w, _start: pos.end, _end: pos.end, _invoeg: true });
        } else {
          console.warn(`[genereer-concept] invoeg_na niet gevonden voor item ${w.item_nr}: "${w.invoeg_na?.slice(0, 60)}…"`);
        }
      } else if (heeftOrigineel) {
        const pos = vindPositie(documentTekst, w.originele_tekst);
        if (pos) {
          // Validatie 2: skip als de match begint bij een CONCEPT-watermerk.
          // PDF-extractie plaatst 'CONCEPT' soms direct voor sectietekst;
          // een match hier wijst op een foutieve passages-selectie door Claude.
          const matchBegin = documentTekst.slice(pos.start, Math.min(pos.start + 8, pos.end)).toUpperCase();
          if (matchBegin.startsWith('CONCEPT') || matchBegin.startsWith('DRAFT')) {
            console.warn(`[genereer-concept] item ${w.item_nr} overgeslagen — match begint bij documentwatermerk: "${documentTekst.slice(pos.start, pos.start + 60)}…"`);
          } else {
            gepositioneerd.push({ ...w, _start: pos.start, _end: pos.end, _invoeg: false });
          }
        } else {
          console.warn(`[genereer-concept] originele_tekst niet gevonden voor item ${w.item_nr}: "${w.originele_tekst?.slice(0, 60)}…"`);
        }
      }
    }

    // Stap 2: sorteer op positie in het document
    gepositioneerd.sort((a, b) => a._start - b._start || a._end - b._end);

    // Stap 3: verwijder overlappende vervangingen (eerste wint bij conflict)
    const gefilterd = [];
    let _maxEind = -1;
    for (const w of gepositioneerd) {
      if (w._invoeg || w._start >= _maxEind) {
        gefilterd.push(w);
        if (!w._invoeg) _maxEind = w._end;
      } else {
        console.warn(`[genereer-concept] item ${w.item_nr} overgeslagen — overlapt eerder bereik (pos ${w._start} < eind ${_maxEind}): "${(w.originele_tekst || '').slice(0, 60)}…"`);
      }
    }

    // Stap 4: pas toe in OMGEKEERDE volgorde (achter→voor) zodat posities stabiel blijven
    let docTekst = documentTekst;
    let toegepast = 0;

    for (const w of [...gefilterd].reverse()) {
      if (w._invoeg) {
        docTekst = docTekst.slice(0, w._start) + '\n\n' + w.aangepaste_tekst + docTekst.slice(w._start);
      } else {
        docTekst = docTekst.slice(0, w._start) + w.aangepaste_tekst + docTekst.slice(w._end);
      }
      toegepast++;
    }
    console.log(`[genereer-concept] ${toegepast}/${wijzigingen.length} wijzigingen toegepast (${gevalideerdWijzigingen.length} na dedup-validatie, ${gepositioneerd.length} gevonden in doc, ${gefilterd.length} na overlap-filter)`);

    return res.status(200).json({
      documentTekst: docTekst,
      wijzigingen,
    });
  } catch (err) {
    console.error('[genereer-concept]', err);
    return res.status(500).json({ error: err.message });
  }
}
