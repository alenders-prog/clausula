/**
 * api/naam-encrypt.js — Versleutel naamkoppeling server-side
 *
 * POST { entries: [[placeholder, echteNaam], ...] }
 * → { blob: "<base64>" }
 *
 * De browser stuurt de plaintext naarEcht-entries; de server versleutelt
 * met AES-256-GCM (NAAM_ENCRYPTION_KEY). De Supabase-database ziet nooit
 * de echte namen — alleen de versleutelde blob.
 *
 * Auth: vereist geldig Supabase JWT (Bearer token).
 */

import { versleutelNamen } from './_crypto.js';
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
    const { entries } = await req.json();
    if (!Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ blob: null }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    const blob = await versleutelNamen(entries);
    return new Response(JSON.stringify({ blob }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[naam-encrypt]', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
