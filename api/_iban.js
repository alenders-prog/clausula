/**
 * api/_iban.js — IBAN-validatie voor screeningresultaten
 *
 * Verwijdert issues die een rekeningnummer benoemen dat niet exact in de
 * documenttekst staat, en lost tegenstrijdige IBAN-conclusies op door het
 * minder ernstige issue te verwijderen.
 *
 * De browser vervangt echte NL-IBANs vóór verzending naar de server door
 * genummerde placeholders [IBAN_0], [IBAN_1], … (AVG-pseudonimisering).
 * Deze regex matcht beide vormen zodat de validatie werkt met zowel echte
 * als gepseudonimiseerde teksten.
 */

export const IBAN_RE = /(?:\bNL\d{2}[A-Z]{4}\d{10}\b|\[IBAN_\d+\])/g;

export function ibanSet(tekst) {
  return new Set(tekst.match(new RegExp(IBAN_RE.source, 'g')) ?? []);
}

export function ibanUitIssue(iss) {
  const txt = [iss.passage, iss.bevinding, iss.onderwerp, iss.aanbeveling].filter(Boolean).join(' ');
  return [...txt.matchAll(new RegExp(IBAN_RE.source, 'g'))].map(m => m[0]);
}

const ERNST_RANG   = { hoog: 0, midden: 1, laag: 2 };
const AANWEZIG_RE  = /\bopgenomen\b|\bvermeld\b|\bstaat in\b|\baanwezig\b/i;
const ONTBREEKT_RE = /\bontbreekt\b|\bniet opgenomen\b|\bniet vermeld\b|\bniet aanwezig\b/i;

/**
 * Filtert issues op IBAN-correctheid:
 * 1. Verwijdert issues waarvan een vermeld IBAN niet exact in docTekst staat.
 * 2. Bij tegenstrijdige conclusies over hetzelfde IBAN (ontbreekt vs. aanwezig)
 *    wordt het minder ernstige issue verwijderd.
 */
export function filterIssuesOpIban(issues, docTekst) {
  const ibanInDoc = ibanSet(docTekst);
  if (ibanInDoc.size === 0) return issues;

  // Stap 1 — verwijder issues met een IBAN dat niet in het document staat
  const stap1 = issues.filter(iss => {
    const ibans = ibanUitIssue(iss);
    if (ibans.length === 0) return true;
    const onbekend = ibans.filter(iban => !ibanInDoc.has(iban));
    if (onbekend.length > 0) {
      console.warn(`[iban] verwijderd (onbekend IBAN ${onbekend.join(', ')}): "${iss.onderwerp}"`);
      return false;
    }
    return true;
  });

  // Stap 2 — tegenstrijdige conclusies over hetzelfde IBAN oplossen
  const perIban = new Map();
  for (const iss of stap1) {
    for (const iban of ibanUitIssue(iss)) {
      if (!perIban.has(iban)) perIban.set(iban, { aanwezig: [], ontbreekt: [] });
      const slot  = perIban.get(iban);
      const tekst = [iss.bevinding, iss.onderwerp].filter(Boolean).join(' ');
      if (AANWEZIG_RE.test(tekst))       slot.aanwezig.push(iss);
      else if (ONTBREEKT_RE.test(tekst)) slot.ontbreekt.push(iss);
    }
  }

  const teVerwijderen = new Set();
  for (const [iban, { aanwezig, ontbreekt }] of perIban) {
    if (aanwezig.length === 0 || ontbreekt.length === 0) continue;
    const conflict = [...aanwezig, ...ontbreekt]
      .sort((a, b) => (ERNST_RANG[a.ernst] ?? 9) - (ERNST_RANG[b.ernst] ?? 9));
    for (const iss of conflict.slice(1)) {
      console.warn(`[iban] tegenstrijdig verwijderd (${iban}): "${iss.onderwerp}"`);
      teVerwijderen.add(iss);
    }
  }

  return stap1.filter(iss => !teVerwijderen.has(iss));
}
