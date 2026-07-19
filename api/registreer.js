/**
 * api/registreer.js
 * POST { kantoorNaam }
 * → Maakt alleen de organisatie aan en retourneert het org-id.
 * Gebruikersaccount wordt daarna BROWSER-SIDE aangemaakt via db.auth.signUp()
 * (Supabase auth.admin werkt niet met service role key in deze configuratie)
 *
 * Rate limiting: best-effort in-memory throttle per IP (max 5/uur per serverless instantie).
 * Werkt niet over meerdere Vercel-instanties heen; Vercel Firewall (Pro) is de robuuste oplossing.
 */

import { createClient } from '@supabase/supabase-js';

const sbDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Best-effort throttle — niet persistent over cold starts
const _rateMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'onbekend';
  if (!checkRateLimit(ip)) {
    console.warn(`[registreer] rate limit bereikt: ${ip}`);
    return res.status(429).json({ error: 'Te veel pogingen. Probeer het later opnieuw.' });
  }

  const { kantoorNaam } = req.body || {};
  const naam = (kantoorNaam || '').trim();
  if (naam.length < 2)  return res.status(400).json({ error: 'Kies een naam voor je kantoor.' });
  if (naam.length > 100) return res.status(400).json({ error: 'Kies een kortere naam (max 100 tekens).' });

  try {
    const { data: orgId, error } = await sbDb
      .rpc('registreer_nieuw_kantoor', { kantoor_naam: naam });
    if (error) throw error;
    return res.status(200).json({ ok: true, organisatie_id: orgId });
  } catch (err) {
    console.error('[registreer]', err);
    return res.status(500).json({ error: err.message || 'Organisatie aanmaken mislukt.' });
  }
}
