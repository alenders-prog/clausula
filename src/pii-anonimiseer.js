/**
 * src/pii-anonimiseer.js — PII-anonimisering voor de AI-assistent
 *
 * Pure functie, geen afhankelijkheden. Vervangt financiële en contactpersoon-
 * gegevens door genummerde of vaste tokens vóór verzending naar de Anthropic API.
 *
 * Gebruik:
 *   piiAnonimiseer(tekst) → geanonimiseerde tekst
 *
 * Tokens:
 *   [IBAN_0], [IBAN_1], ...  — genummerd, consistent met api/_iban.js IBAN_RE
 *   [BSN]                    — persoonsnummer
 *   [POSTCODE]               — Nederlandse postcode
 *   [TEL]                    — telefoonnummer
 *   [EMAIL]                  — e-mailadres
 *
 * Geladen via ESM-bridge in index.html en assistent-mobiel.html (window.piiAnonimiseer).
 */
import { ibanRe, ibanSleutel, rekeningOverigRe, rekeningSleutel } from './iban-patroon.js';

export function piiAnonimiseer(tekst) {
  if (!tekst) return tekst;
  let t = tekst;

  // ── IBANs ──────────────────────────────────────────────────────────────────
  // EU-IBAN formaat: 2 landletters + 2 checkdigits + 10-26 BBAN-tekens.
  // Hetzelfde IBAN krijgt altijd hetzelfde token binnen één aanroep.
  // Consistent met [IBAN_n]-conventie in api/_iban.js (IBAN_RE).
  // Patroon uit src/iban-patroon.js — laat witruimte toe, want documenten schrijven
  // "NL28 RABO 0328582298". Zonder die spaties in het patroon bleven de tien cijfers
  // over en werden ze verderop als telefoonnummer gemaskeerd.
  let ibanTeller = 0;
  const ibanMap  = new Map();
  t = t.replace(ibanRe(), iban => {
    const sleutel = ibanSleutel(iban);
    if (!ibanMap.has(sleutel)) ibanMap.set(sleutel, `[IBAN_${ibanTeller++}]`);
    return ibanMap.get(sleutel);
  });

  // ── Rekeningnummers die geen IBAN zijn ─────────────────────────────────────
  // Beleggingsrekeningen ("NL046344501") en de oude puntnotatie ("60.75.97.461")
  // voldoen niet aan het IBAN-formaat en bleven daardoor onvervangen staan.
  // Zie src/iban-patroon.js voor de aanleiding en de afbakening.
  let rekTeller = 0;
  const rekMap  = new Map();
  t = t.replace(rekeningOverigRe(), nr => {
    const sleutel = rekeningSleutel(nr);
    if (!rekMap.has(sleutel)) rekMap.set(sleutel, `[REKENING_${rekTeller++}]`);
    return rekMap.get(sleutel);
  });

  // ── BSN ────────────────────────────────────────────────────────────────────
  // 9 opeenvolgende cijfers. Lookbehind "[A-Z]{4} " voorkomt false positive op
  // IBAN-accountcijfers: bankcode is altijd 4 hoofdletters (ABNA, RABO, …).
  // "BSN 123456789" wordt WEL vervangen — "BSN" heeft maar 3 letters.
  t = t.replace(/(?<![A-Z]{4} )\b\d{9}\b/g, '[BSN]');

  // ── Nederlandse postcodes ──────────────────────────────────────────────────
  // Formaat: 1234AB of 1234 AB
  t = t.replace(/\b(\d{4})\s?([A-Z]{2})\b/g, '[POSTCODE]');

  // ── Telefoonnummers ────────────────────────────────────────────────────────
  // Lookbehind "[A-Z\d]" voorkomt dat IBAN-accountcijfers als telefoon worden
  // gemaskeerd.
  t = t.replace(
    /(?<![A-Z\d])(?:0[1-9]\d{1,2}[-.\s]?\d{6,8}|\+31[-.\s]?[1-9]\d{8}|06[-.\s]?\d{8})(?!\d)/g,
    '[TEL]',
  );

  // ── E-mailadressen ─────────────────────────────────────────────────────────
  t = t.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  return t;
}
