// api/claude-edge.js — Claude API proxy (serverless)
// Oorspronkelijk Edge Runtime; omgezet naar serverless omdat vercel dev
// op Windows Edge worker-processen niet betrouwbaar kan beëindigen.
// maxDuration: 120 (zie vercel.json) geeft voldoende tijd voor streaming.

import { gebruikerContext } from './_auth.js';
import { meetAanroep, usageUitSse, wachtOpVerbruik } from './_verbruik.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Alleen POST toegestaan' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const ctx = await gebruikerContext(token);
  if (!ctx) return res.status(401).json({ error: 'Niet geautoriseerd' });

  // Dit endpoint is een doorgeefluik: het stuurt de body van de browser ongewijzigd
  // door en weet dus niet wát het doet. De fase komt daarom uit een eigen header en
  // niet uit de body — die gaat letterlijk naar Anthropic en mag er geen veld bij
  // krijgen dat daar niet hoort.
  //
  // De waarde wordt in src/api/kosten.js tegen een vaste woordenlijst gehouden. Een
  // header komt van de browser en is dus door de gebruiker te beïnvloeden; ongefilterd
  // zou daar tekst in kunnen belanden die in deze tabel niet thuishoort.
  const meter = meetAanroep({
    endpoint: 'claude-edge',
    fase:     req.headers['x-clausula-fase'],
    model:    req.body?.model,
    organisatieId: ctx.organisatieId,
    gebruikerId:   ctx.gebruikerId,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd' });
  }

  const body = req.body;

  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
  };

  const betaHeader = req.headers['anthropic-beta'];
  if (betaHeader) headers['anthropic-beta'] = betaHeader;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    meter.mislukt(new Error(`Claude ${anthropicRes.status}`));
    // Eerst de meting weg, dán pas antwoorden. Deze tak keert terug vóór de try/finally
    // onderaan, waar `wachtOpVerbruik()` staat — dus zonder deze regel verdampt de regel
    // zodra de functie na het antwoord bevriest. Juist de gevallen die je wilt zien
    // staan (een 429 of 500 van Anthropic) waren daardoor de enige die niet werden
    // vastgelegd. Gevonden door de ultrareview van 1 september 2026; dezelfde fout was
    // op 31 augustus al in analyseer.js gerepareerd.
    await wachtOpVerbruik();
    res.status(anthropicRes.status).setHeader('Content-Type', 'application/json').end(errText);
    return;
  }

  // Stuur SSE-stream door naar de browser
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  // Meelezen zónder de doorgifte te veranderen: de bytes gaan onaangeroerd door,
  // en een kopie wordt ontleed om het usage-blok eruit te halen. Alles daarvan zit in
  // een eigen try — een fout in het meelezen mag de stroom naar de browser nooit
  // onderbreken. Dat is hier extra belangrijk: dit endpoint draagt de concepten.
  const reader  = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  let sniffBuffer = '';

  const leesMee = (value) => {
    try {
      sniffBuffer += decoder.decode(value, { stream: true });
      let grens;
      while ((grens = sniffBuffer.indexOf('\n\n')) !== -1) {
        const blok = sniffBuffer.slice(0, grens);
        sniffBuffer = sniffBuffer.slice(grens + 2);
        for (const regel of blok.split('\n')) {
          if (!regel.startsWith('data:')) continue;
          let ev;
          try { ev = JSON.parse(regel.slice(5).trim()); } catch { continue; }
          const u = usageUitSse(ev);
          if (u) meter.usage(u);
          if (ev.type === 'content_block_delta') meter.eersteTokenNu();
        }
      }
      // Onbegrensd laten groeien zou bij een stroom zonder lege regel het geheugen
      // vullen. Twee blokken is ruim; wat erbuiten valt kost hooguit een meting.
      if (sniffBuffer.length > 65_536) sniffBuffer = sniffBuffer.slice(-8_192);
    } catch (e) {
      console.warn('[claude-edge] meelezen mislukt:', e.message);
    }
  };

  let afgebroken = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writable) break; // client verbroken
      leesMee(value);
      res.write(Buffer.from(value));
    }
  } catch (err) {
    afgebroken = err;
    // Een client die wegklikt is verwacht en mag stil blijven. Elke andere fout
    // (bijv. de Anthropic-stream die afbreekt) levert de gebruiker een half
    // antwoord zonder melding — die moet dus wél in de logs zichtbaar zijn.
    const clientWeg = ['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'ABORT_ERR'];
    if (!res.destroyed && !clientWeg.includes(err?.code) && err?.name !== 'AbortError') {
      console.error('[claude-edge] stream afgebroken:', err);
    }
  } finally {
    // Ook een afgebroken stroom wordt geteld: de tokens die al binnen waren zijn
    // betaald, en juist deze regels laten zien waar het misgaat.
    if (afgebroken) meter.mislukt(afgebroken);
    else meter.klaar();
    // Pas afsluiten als de meting weg is — daarna mag de functie bevriezen.
    await wachtOpVerbruik();
    if (!res.destroyed) res.end();
  }
}
