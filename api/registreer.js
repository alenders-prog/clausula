/**
 * api/registreer.js
 * POST { kantoorNaam }
 * → Maakt alleen de organisatie aan en retourneert het org-id.
 * Gebruikersaccount wordt daarna BROWSER-SIDE aangemaakt via db.auth.signUp()
 * (Supabase auth.admin werkt niet met service role key in deze configuratie)
 */

import { createClient } from '@supabase/supabase-js';

const sbDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  const { kantoorNaam } = req.body || {};
  if (!kantoorNaam?.trim()) {
    return res.status(400).json({ error: 'Kies een naam voor je kantoor.' });
  }

  try {
    const { data: orgId, error } = await sbDb
      .rpc('registreer_nieuw_kantoor', { kantoor_naam: kantoorNaam.trim() });
    if (error) throw error;
    return res.status(200).json({ ok: true, organisatie_id: orgId });
  } catch (err) {
    console.error('[registreer]', err);
    return res.status(500).json({ error: err.message || 'Organisatie aanmaken mislukt.' });
  }
}
