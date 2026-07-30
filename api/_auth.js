/**
 * api/_auth.js — Gedeelde JWT-verificatie voor alle beveiligde endpoints
 *
 * Gebruik:
 *   import { verifieerJWT } from './_auth.js';
 *   const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
 *   if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });
 *
 * Geeft true als de token geldig is, false als hij ontbreekt of verlopen is.
 * Gebruikt SUPABASE_ANON_KEY met fallback naar SUPABASE_SERVICE_ROLE_KEY zodat
 * de check werkt ongeacht welke key is geconfigureerd.
 */

export async function verifieerJWT(token) {
  if (!token) return false;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  return res.ok;
}
