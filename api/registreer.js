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
import { timingSafeEqual } from 'node:crypto';

const sbDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Vergelijking in constante tijd: een gewone === lekt via het tijdsverschil hoeveel
// tekens er klopten, waarmee een code teken voor teken te raden is.
function veiligGelijk(a, b) {
  const ba = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // Even lang maken zodat ook de lengte niet uit de looptijd af te leiden is.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

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

  const { kantoorNaam, registratieCode } = req.body || {};

  // ── Registratiecode ───────────────────────────────────
  // Zonder deze poort kan iedereen die de URL kent een kantoor aanmaken en op
  // onze rekening analyses draaien. Bewust fail closed: is REGISTRATIE_CODE niet
  // gezet, dan gaat er niemand door — een lege env-variabele mag geen open deur zijn.
  const verwacht = process.env.REGISTRATIE_CODE || '';
  if (!verwacht) {
    console.error('[registreer] REGISTRATIE_CODE ontbreekt — registratie geweigerd');
    return res.status(503).json({ error: 'Registratie is tijdelijk niet beschikbaar.' });
  }
  if (!veiligGelijk(String(registratieCode || ''), verwacht)) {
    console.warn(`[registreer] onjuiste registratiecode vanaf ${ip}`);
    return res.status(403).json({ error: 'Ongeldige registratiecode.' });
  }

  const naam = (kantoorNaam || '').trim();
  if (naam.length < 2)  return res.status(400).json({ error: 'Kies een naam voor je kantoor.' });
  if (naam.length > 100) return res.status(400).json({ error: 'Kies een kortere naam (max 100 tekens).' });

  try {
    // Geeft bewust een eenmalig token terug en NIET het organisatie-id: de browser
    // mag nooit bepalen bij welk kantoor iemand hoort. De trigger op auth.users
    // wisselt dit token in voor de organisatie en de rol.
    const { data: token, error } = await sbDb
      .rpc('registreer_kantoor_met_token', { kantoor_naam: naam });
    if (error) throw error;
    return res.status(200).json({ ok: true, uitnodiging_token: token });
  } catch (err) {
    console.error('[registreer]', err);
    return res.status(500).json({ error: err.message || 'Organisatie aanmaken mislukt.' });
  }
}
