// api/adobe-start.js
// POST — Upload PDF naar Adobe PDF Services en start PDF→DOCX export-job.
// Ontvangt: { pdfBase64: string }
// Retourneert: { jobUrl: string } — de Adobe job-status-URL voor polling.

import { verifieerJWT } from './_auth.js';

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const clientId     = process.env.ADOBE_CLIENT_ID;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'ADOBE_CLIENT_ID en/of ADOBE_CLIENT_SECRET ontbreken in de Vercel omgevingsvariabelen',
    });
  }

  const { pdfBase64 } = req.body || {};
  if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 ontbreekt in request body' });

  let pdfBuf;
  try {
    pdfBuf = Buffer.from(pdfBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Ongeldige base64-data' });
  }

  try {
    // ── Stap 1: Access token ophalen ──────────────────────
    const tokRes = await fetch('https://pdf-services.adobe.io/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    });
    if (!tokRes.ok) {
      throw new Error(`Adobe token-fout (${tokRes.status}): ${await tokRes.text()}`);
    }
    const { access_token } = await tokRes.json();

    // ── Stap 2: Presigned upload-URL + asset-ID ophalen ───
    const assetRes = await fetch('https://pdf-services.adobe.io/assets', {
      method:  'POST',
      headers: {
        'X-API-Key':     clientId,
        'Authorization': `Bearer ${access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ mediaType: 'application/pdf' }),
    });
    if (!assetRes.ok) {
      throw new Error(`Adobe asset-fout (${assetRes.status}): ${await assetRes.text()}`);
    }
    const { uploadUri, assetID } = await assetRes.json();

    // ── Stap 3: PDF uploaden naar S3 ──────────────────────
    const putRes = await fetch(uploadUri, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body:    pdfBuf,
    });
    if (!putRes.ok) {
      throw new Error(`S3-upload mislukt (${putRes.status})`);
    }

    // ── Stap 4: Export-job starten (PDF → DOCX) ───────────
    const jobRes = await fetch('https://pdf-services.adobe.io/operation/exportpdf', {
      method:  'POST',
      headers: {
        'X-API-Key':     clientId,
        'Authorization': `Bearer ${access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ assetID, targetFormat: 'docx' }),
    });
    if (!jobRes.ok) {
      throw new Error(`Adobe export-job fout (${jobRes.status}): ${await jobRes.text()}`);
    }

    const jobUrl = jobRes.headers.get('location');
    if (!jobUrl) throw new Error('Adobe gaf geen job-URL terug (Location-header ontbreekt)');

    return res.status(200).json({ jobUrl });
  } catch (err) {
    console.error('[adobe-start]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
