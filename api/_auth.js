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

import { PROFIEL } from '../src/auth/toegang.js';

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

/**
 * Verifieert de token én geeft terug wie het is.
 *
 * `verifieerJWT` doet dezelfde aanroep maar gooit het antwoord weg. Sinds er verbruik
 * per gebruiker wordt vastgelegd (api/_verbruik.js) is die id nodig, en een tweede
 * ronde naar /auth/v1/user zou hetzelfde verzoek nog eens doen. Endpoints die de
 * context nodig hebben roepen deze aan in plaats van verifieerJWT.
 *
 * De organisatie komt uit `gebruikersprofiel` en vraagt dus een tweede aanroep. Dat is
 * één keer per verzoek, niet per Claude-aanroep.
 *
 * Faalt de profiellookup, dan komt er `{ gebruikerId, organisatieId: null }` terug in
 * plaats van null: de aanroep mag doorgaan, er ontbreekt alleen een label bij de
 * meting. Meten mag nooit een analyse tegenhouden.
 *
 * `profielStatus` zegt wáárom `organisatieId` leeg is, en dat onderscheid is de hele
 * grond onder `magApiGebruiken` in src/auth/toegang.js: een gebruiker zonder profielrij
 * is uit zijn kantoor verwijderd en hoort geweigerd te worden, maar een mislukte lookup
 * is een storing en mag geen weigering worden. Op `organisatieId === null` beslissen
 * gooit die twee op één hoop.
 *
 * @returns {Promise<{gebruikerId: string, organisatieId: string|null, profielStatus: string}|null>}
 */
export async function gebruikerContext(token) {
  if (!token) return null;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!res.ok) return null;

  let gebruikerId = null;
  try { gebruikerId = (await res.json())?.id ?? null; } catch { /* geen id in het antwoord */ }
  if (!gebruikerId) return null;

  let organisatieId = null;
  let profielStatus = PROFIEL.ONBEKEND;
  try {
    const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sleutel) {
      const p = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/gebruikersprofiel`
        + `?id=eq.${gebruikerId}&select=organisatie_id`,
        { headers: { apikey: sleutel, Authorization: `Bearer ${sleutel}` } });
      if (p.ok) {
        const rijen = await p.json();
        // Een leeg antwoord is een vaststelling en geen storing: de rij bestaat niet.
        // Precies dat is de toestand die verwijder_gebruiker achterlaat.
        if (!Array.isArray(rijen) || rijen.length === 0) {
          profielStatus = PROFIEL.GEEN_PROFIEL;
        } else {
          organisatieId = rijen[0]?.organisatie_id ?? null;
          profielStatus = organisatieId ? PROFIEL.GEVONDEN : PROFIEL.GEEN_ORG;
        }
      } else {
        console.warn('[auth] profiel ophalen gaf HTTP', p.status);
      }
    }
  } catch (e) {
    console.warn('[auth] organisatie ophalen mislukt:', e.message);
  }

  return { gebruikerId, organisatieId, profielStatus };
}
