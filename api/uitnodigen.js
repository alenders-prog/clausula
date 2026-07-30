/**
 * api/uitnodigen.js
 * POST { email, rol }  — Authorization: Bearer <jwt>
 *
 * 1. Verifieert JWT (caller moet admin zijn)
 * 2. Controleert dat het uitgenodigde e-maildomein overeenkomt met het org-domein
 * 3. Genereert uitnodigingstoken via maak_uitnodiging()
 * 4. Verstuurt uitnodigingsmail via Resend
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { verifieerJWT } from './_auth.js';

const sbService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  // Supabase-client met JWT (voor RLS-functies)
  const sbUser = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { email, rol = 'gebruiker' } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Geldig e-mailadres verplicht' });
  }
  if (!['admin', 'gebruiker'].includes(rol)) {
    return res.status(400).json({ error: 'Ongeldige rol' });
  }

  try {
    // ── Org-info ophalen (naam + domein) ─────────────────
    const { data: orgRows, error: orgErr } = await sbUser.rpc('org_info_voor_uitnodiging');
    if (orgErr) throw orgErr;
    const org = Array.isArray(orgRows) ? orgRows[0] : orgRows;
    if (!org?.org_id) {
      return res.status(403).json({ error: 'Geen admin-toegang' });
    }

    // ── Domeincontrole ────────────────────────────────────
    const uitgenodigdDomein = email.split('@')[1]?.toLowerCase();
    if (org.org_domein && uitgenodigdDomein !== org.org_domein.toLowerCase()) {
      return res.status(400).json({
        error: `Alleen e-mailadressen met @${org.org_domein} mogen worden uitgenodigd.`,
      });
    }

    // ── Token aanmaken ────────────────────────────────────
    const { data: uitnodiging, error: uitErr } = await sbUser.rpc('maak_uitnodiging', { p_rol: rol });
    if (uitErr) throw uitErr;
    const inv = Array.isArray(uitnodiging) ? uitnodiging[0] : uitnodiging;
    if (!inv?.token) throw new Error('Uitnodiging aanmaken mislukt');

    // ── Uitnodigingslink samenstellen ─────────────────────
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (req.headers.origin || 'http://localhost:3000');
    const link = `${origin}/registreer.html?invite=${inv.token}`;

    const verloopt = new Date(inv.vervalt_op).toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── E-mail versturen via Resend ───────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rolLabel = rol === 'admin' ? 'Beheerder' : 'Mediator';

    const { error: mailErr } = await resend.emails.send({
      from: `${org.org_naam} <onboarding@resend.dev>`,
      to: [email],
      subject: `Uitnodiging — ${org.org_naam} Documentscreening`,
      html: `
<!DOCTYPE html>
<html lang="nl">
<body style="margin:0;padding:0;background:#FAF6F0;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 16px">
    <table width="560" cellpadding="0" cellspacing="0"
           style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E1D6">
      <tr>
        <td style="background:#E8714A;padding:28px 40px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff">${org.org_naam}</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.85)">Documentscreening</p>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px">
          <h2 style="margin:0 0 16px;font-size:20px;color:#2B2825">Je bent uitgenodigd!</h2>
          <p style="margin:0 0 20px;color:#6B6358;line-height:1.6">
            Je hebt een uitnodiging ontvangen om als <strong>${rolLabel}</strong> deel te nemen aan
            het Documentscreening-platform van <strong>${org.org_naam}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:10px;background:#E8714A">
                <a href="${link}"
                   style="display:inline-block;padding:14px 28px;color:#fff;
                          text-decoration:none;font-weight:700;font-size:15px">
                  Account aanmaken →
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9E9589">
            Werkt de knop niet? Kopieer dan deze link:<br>
            <a href="${link}" style="color:#E8714A;word-break:break-all">${link}</a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#9E9589">
            Deze uitnodiging verloopt op ${verloopt}.
            Als je deze e-mail niet verwachtte, kun je hem negeren.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
    });

    if (mailErr) throw new Error(mailErr.message || 'E-mail versturen mislukt');

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[uitnodigen]', err);
    return res.status(500).json({ error: err.message || 'Versturen mislukt' });
  }
}
