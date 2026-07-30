/**
 * api/naam-decrypt.js — Ontsleutel naamkoppeling server-side
 *
 * POST { blob: "<base64>" }
 * → { entries: [[placeholder, echteNaam], ...] }
 *
 * Alleen voor geauthenticeerde gebruikers. De blob is per screening opgeslagen
 * in screeningen.namen_map; de browser vraagt de ontsleuteling aan bij laden.
 *
 * Auth: vereist geldig Supabase JWT (Bearer token).
 */

import { ontsleutelNamen } from './_crypto.js';
import { verifieerJWT } from './_auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Alleen POST toegestaan' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!await verifieerJWT(token)) {
    return new Response(JSON.stringify({ error: 'Niet geautoriseerd' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { blob } = await req.json();
    if (!blob) {
      return new Response(JSON.stringify({ entries: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    const entries = await ontsleutelNamen(blob);
    return new Response(JSON.stringify({ entries }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[naam-decrypt]', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
