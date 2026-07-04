// Genereert het rapport als RTF — Word opent dit net zo native als .docx,
// maar dit heeft geen enkele externe library nodig (dus geen risico meer
// op een module die Vercel niet goed meebundelt).

function rtfEscape(text) {
  return String(text ?? '')
    .split('')
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (ch === '\\') return '\\\\';
      if (ch === '{') return '\\{';
      if (ch === '}') return '\\}';
      if (code > 127) return `\\u${code}?`;
      return ch;
    })
    .join('');
}

function par(text, { bold = false, italic = false, kleur = false, size = 22 } = {}) {
  let codes = `\\fs${size} `;
  if (kleur) codes += '\\cf1 ';
  if (bold) codes += '\\b ';
  if (italic) codes += '\\i ';
  return `${codes}${rtfEscape(text)}\\b0\\i0\\cf0\\par\n`;
}

function vinkje(aan) {
  return aan ? '☑ ' : '☐ ';
}

function regelsVoorItem({ vinkjeAan, koptekst, body, citaat, opmerking }) {
  let rtf = par(vinkje(vinkjeAan) + koptekst, { bold: true, size: 24 });
  if (body) rtf += par(body, { size: 22 });
  if (citaat) rtf += par(citaat, { italic: true, size: 20 });
  if (opmerking) rtf += par(`Opmerking: ${opmerking}`, { italic: true, kleur: true, size: 20 });
  return rtf;
}

function sectie(titel, items, naarRegels) {
  let rtf = par(titel, { bold: true, size: 30 });
  if (!items || items.length === 0) {
    rtf += par('Geen opmerkingen.', { italic: true });
    return rtf;
  }
  for (const item of items) rtf += naarRegels(item);
  return rtf;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });
  try {
    const { bestandsnaam, classificatie, rapport } = req.body;
    if (!classificatie || !rapport) return res.status(400).json({ error: 'classificatie en rapport zijn verplicht' });

    let body = '';
    body += par('Documentscreening', { bold: true, size: 40 });
    body += par(bestandsnaam || '(onbekend bestand)', { italic: true });
    body += par(`Type: ${classificatie.doc_type}`, { size: 22 });
    body += par(classificatie.samenvatting || '', { size: 22 });

    body += sectie('Samenvatting', [1], () => par(rapport.samenvatting || '', { size: 22 }));

    if (Array.isArray(rapport.issues)) {
      // Nieuw schema v2
      const DIMLBL = { volledigheid: 'Volledigheid', juridisch: 'Juridisch', balans: 'Balans', grammatica: 'Grammatica' };
      body += sectie('Verbeterpunten', rapport.issues, (iss) =>
        regelsVoorItem({
          vinkjeAan: iss.afgehandeld,
          koptekst:  `${iss.onderwerp} (${iss.ernst})` +
            (iss.dimensies?.length ? ' — ' + iss.dimensies.map(d => DIMLBL[d] || d).join(', ') : ''),
          body:      iss.bevinding,
          citaat:    iss.aanbeveling ? `Aanbeveling: ${iss.aanbeveling}` : '',
          opmerking: iss.opmerking,
        })
      );
    } else {
      // Oud schema (backward compat)
      body += sectie('Volledigheid', rapport.volledigheid, (v) =>
        regelsVoorItem({ vinkjeAan: v.afgehandeld, koptekst: `${v.sectie} — ${v.status}`, body: v.toelichting, opmerking: v.opmerking })
      );
      body += sectie('Juridische juistheid', rapport.juridisch, (j) =>
        regelsVoorItem({ vinkjeAan: j.afgehandeld, koptekst: `${j.onderwerp} (${j.ernst})`, body: j.bevinding, citaat: j.citaat, opmerking: j.opmerking })
      );
      body += sectie('Balans tussen partijen', rapport.balans, (b) =>
        regelsVoorItem({ vinkjeAan: b.afgehandeld, koptekst: `${b.signalering} (${b.ernst})`, opmerking: b.opmerking })
      );
      body += sectie('Grammatica & taal', rapport.grammatica, (g) =>
        regelsVoorItem({ vinkjeAan: g.afgehandeld, koptekst: g.locatie, body: `${g.probleem} → ${g.suggestie}`, opmerking: g.opmerking })
      );
    }

    const rtfDocument =
      '{\\rtf1\\ansi\\ansicpg1252\\deff0' +
      '{\\fonttbl{\\f0 Calibri;}}' +
      '{\\colortbl;\\red199\\green90\\blue56;}' +
      '\\f0\n' +
      body +
      '}';

    const veiligeNaam = (bestandsnaam || 'rapport').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_');
    res.setHeader('Content-Type', 'application/rtf');
    res.setHeader('Content-Disposition', `attachment; filename="screening-${veiligeNaam}.rtf"`);
    return res.status(200).send(rtfDocument);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
