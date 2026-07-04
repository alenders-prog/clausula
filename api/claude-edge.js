/**
 * api/claude-edge.js — Edge Runtime proxy voor Anthropic Claude API
 *
 * Waarom Edge Runtime i.p.v. serverless?
 * - Serverless heeft een maximale executietijd (60-120s) die bij grote documenten
 *   overschreden wordt terwijl Claude nog aan het genereren is.
 * - Edge Runtime heeft geen wall-clock tijdslimiet voor streaming responses:
 *   de functie stuurt bytes door zodra ze binnenkomen en blijft leven zolang
 *   de verbinding open is.
 * - CPU-gebruik is minimaal (alleen request-parsing + byte-forwarding),
 *   ruim binnen de Edge CPU-limiet.
 *
 * De browser parseert de SSE-stream zelf (zie askClaudeForJson in index.html).
 */

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Alleen POST toegestaan' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── JWT-verificatie ────────────────────────────────────────────
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Niet geautoriseerd' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const authCheck = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': process.env.SUPABASE_ANON_KEY,
    },
  });
  if (!authCheck.ok) {
    return new Response(JSON.stringify({ error: 'Sessie verlopen — log opnieuw in' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // ─────────────────────────────────────────────────────────────

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY niet geconfigureerd' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();

  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
  };

  // Stuur prompt-caching beta-header door als de client die meestuurt
  const betaHeader = req.headers.get('anthropic-beta');
  if (betaHeader) headers['anthropic-beta'] = betaHeader;

  // Voeg stream: true toe — Anthropic stuurt dan Server-Sent Events
  const streamBody = { ...body, stream: true };

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(streamBody),
  });

  // Bij een fout (4xx/5xx): geef de foutbody terug als JSON, niet als stream
  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return new Response(errText, {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stuur de SSE-stream direct door naar de browser.
  // Minimaal CPU-gebruik: we forwarden alleen bytes, doen geen parsing.
  return new Response(anthropicRes.body, {
    status: 200,
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'X-Accel-Buffering': 'no', // Nginx-buffering uitzetten (Vercel gebruikt dit intern)
    },
  });
}
