// api/adobe-result.js
// POST — Controleer de status van een Adobe PDF→DOCX export-job.
// Ontvangt: { jobUrl: string }
// Retourneert:
//   { status: 'in_progress' }                   — nog bezig
//   { status: 'done', docxBase64: string }       — klaar, DOCX als base64
//   HTTP 500 + { error }                         — mislukt

import { verifieerJWT } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const clientId     = process.env.ADOBE_CLIENT_ID;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Adobe credentials ontbreken' });
  }

  const { jobUrl } = req.body || {};
  if (!jobUrl) return res.status(400).json({ error: 'jobUrl ontbreekt' });

  try {
    // ── Nieuw access token (tokens zijn kortlevend) ───────
    const tokRes = await fetch('https://pdf-services.adobe.io/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    });
    if (!tokRes.ok) throw new Error(`Adobe token-fout (${tokRes.status})`);
    const { access_token } = await tokRes.json();

    // ── Job-status opvragen ────────────────────────────────
    const statusRes = await fetch(jobUrl, {
      headers: {
        'X-API-Key':     clientId,
        'Authorization': `Bearer ${access_token}`,
      },
    });
    if (!statusRes.ok) {
      throw new Error(`Status-check fout (${statusRes.status}): ${await statusRes.text()}`);
    }
    const statusData = await statusRes.json();

    const st = (statusData.status || '').toLowerCase().replaceAll(' ', '_');

    if (st === 'in_progress') {
      return res.status(200).json({ status: 'in_progress' });
    }

    if (st === 'failed') {
      throw new Error(
        `Adobe conversie mislukt: ${JSON.stringify(statusData.error || statusData)}`
      );
    }

    // ── Status 'done': DOCX downloaden en als base64 terugsturen ──
    const downloadUri = statusData.asset?.downloadUri;
    if (!downloadUri) {
      throw new Error('Adobe-respons bevat geen downloadUri');
    }

    const docxRes = await fetch(downloadUri);
    if (!docxRes.ok) throw new Error(`DOCX download mislukt (${docxRes.status})`);

    const docxBuf    = Buffer.from(await docxRes.arrayBuffer());
    const docxBase64 = docxBuf.toString('base64');

    return res.status(200).json({ status: 'done', docxBase64 });
  } catch (err) {
    console.error('[adobe-result]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
