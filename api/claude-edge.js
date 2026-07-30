// api/claude-edge.js — Claude API proxy (serverless)
// Oorspronkelijk Edge Runtime; omgezet naar serverless omdat vercel dev
// op Windows Edge worker-processen niet betrouwbaar kan beëindigen.
// maxDuration: 120 (zie vercel.json) geeft voldoende tijd voor streaming.

import { verifieerJWT } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Alleen POST toegestaan' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });

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
    res.status(anthropicRes.status).setHeader('Content-Type', 'application/json').end(errText);
    return;
  }

  // Stuur SSE-stream door naar de browser
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = anthropicRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}
