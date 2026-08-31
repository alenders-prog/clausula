// api/adobe-result.js
// POST — Controleer de status van een Adobe PDF→DOCX export-job.
// Ontvangt: { jobUrl: string }
// Retourneert:
//   { status: 'in_progress' }                   — nog bezig
//   { status: 'done', docxBase64: string }       — klaar, DOCX als base64
//   HTTP 500 + { error }                         — mislukt

import { verifieerJWT } from './_auth.js';
import JSZip from 'jszip';

// Elke aanroep naar Adobe krijgt een eigen tijdslimiet.
//
// Aanleiding (29 augustus 2026): geen van deze fetches had er een. Op productie
// valt dat niet op — Vercel schiet de functie na maxDuration dood en de browser
// krijgt een fout. Maar `vercel dev` handhaaft maxDuration NIET, dus lokaal bleef
// een trage Adobe-aanroep oneindig wachten. De conversie bleef staan op
// "Converteren… (1s)" en kwam nooit meer terug; de 90-secondengrens in de browser
// kon niet vuren, want die wordt bovenaan de lus getoetst en de lus stond stil in
// een await.
//
// De waarden blijven ruim onder de maxDuration van dit endpoint, zodat een
// afgelopen limiet hier een nette foutmelding oplevert in plaats van een
// doodgeschoten functie.

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
      signal:  AbortSignal.timeout(8000),
    });
    if (!tokRes.ok) throw new Error(`Adobe token-fout (${tokRes.status})`);
    const { access_token } = await tokRes.json();

    // ── Job-status opvragen ────────────────────────────────
    const statusRes = await fetch(jobUrl, {
      headers: {
        'X-API-Key':     clientId,
        'Authorization': `Bearer ${access_token}`,
      },
      signal: AbortSignal.timeout(8000),
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

    const docxRes = await fetch(downloadUri, { signal: AbortSignal.timeout(15000) });
    if (!docxRes.ok) throw new Error(`DOCX download mislukt (${docxRes.status})`);

    const rawBuf     = Buffer.from(await docxRes.arrayBuffer());
    const docxBuf    = await fixDocxArtifacts(rawBuf);
    const docxBase64 = docxBuf.toString('base64');

    return res.status(200).json({ status: 'done', docxBase64 });
  } catch (err) {
    console.error('[adobe-result]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── DOCX post-processing ──────────────────────────────────────────────────────
// Verwijdert twee artefacten van Adobe's PDF→DOCX conversie:
//  1. Lege pagina's: paragrafen die uitsluitend een <w:sectPr> bevatten (geen tekst-runs)
//     worden door Word als extra pagina gerenderd.
//  2. Dubbele voettekst: als Word-footers (word/footer*.xml) al "paraaf"-tekst bevatten,
//     worden identieke body-paragrafen verwijderd.
async function fixDocxArtifacts(buf) {
  try {
    const zip = await JSZip.loadAsync(buf);

    // Controleer of er echte Word-footers zijn met paraaf-inhoud
    const footerFiles = Object.keys(zip.files).filter(n => /^word\/footer\d*\.xml$/.test(n));
    let hasProperFooter = false;
    for (const fname of footerFiles) {
      const content = await zip.file(fname).async('string');
      if (content.toLowerCase().includes('paraaf')) { hasProperFooter = true; break; }
    }

    const docFile = zip.file('word/document.xml');
    if (!docFile) return buf;

    let xml = await docFile.async('string');

    // Verwerk elke <w:p>…</w:p> — w:p is nooit genest in valide OOXML
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
      const hasRuns  = /<w:r[ >]/.test(para);
      const hasSectPr = /<w:sectPr[ >]/.test(para);

      // 1. Lege pagina: sectie-einde zonder tekst-runs
      if (hasSectPr && !hasRuns) return '';

      // 2. Dubbele voettekst: verwijder body-instanties als Word-footer al bestaat
      if (hasProperFooter && hasRuns) {
        const tekst = para.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (tekst.includes('paraaf') && tekst.length < 80) return '';
      }

      return para;
    });

    zip.file('word/document.xml', xml);
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (e) {
    console.warn('[adobe-result] DOCX post-processing mislukt, origineel wordt teruggegeven:', e.message);
    return buf;
  }
}
