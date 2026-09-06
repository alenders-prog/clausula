/**
 * src/tekst/normaliseer.js — typografische tekens terugbrengen tot gewone letters
 *
 * ── AANLEIDING (6 september 2026) ───────────────────────────────────────────
 *
 * Bij een spellingsmeting op een echt convenant bleken er **49 Unicode-ligaturen** in de
 * uitgelezen tekst te staan: `betreﬀende`, `ﬁscale`, `ﬁnanciële`, `speciﬁek`, `opheﬀen`.
 * Dat is één teken (U+FB00–U+FB06) waar twee letters horen.
 *
 * Voor een lezer valt dat niet op. Voor élke letterlijke tekstvergelijking in deze app
 * wel, en dat zijn er nogal wat:
 *
 *   • de passage bij een bevinding terugzoeken in het document (`vindPositie`)
 *   • `zoek_tekst` / `vervang_door` bij de conceptgeneratie
 *   • het bijlagefilter, dat passages tegen de bijlagetekst houdt
 *   • de residu-controle en de ontdubbeling op passage
 *
 * Schrijft het model "financiële" met gewone letters, en staat er `ﬁnanciële` in het
 * document, dan vindt geen van die vergelijkingen iets. De melding die de gebruiker dan
 * ziet is "Originele tekst niet gevonden (overgeslagen)" — een wijziging die stil wegvalt.
 *
 * ── WAT HIER WEL EN NIET IN HOORT ───────────────────────────────────────────
 *
 * Alleen tekens die een ANDERE SCHRIJFWIJZE zijn van dezelfde letters. Geen correcties,
 * geen opschoning, geen witruimte-opmaak: dit bestand mag de betekenis van een document
 * niet raken. Wie hier een regel toevoegt die iets vervángt in plaats van normaliseert,
 * verandert het stuk van de mediator.
 *
 * Aanhalingstekens en streepjes staan er wél in: een krul-apostrof en een gedachtestreepje
 * breken dezelfde vergelijkingen, en de betekenis blijft gelijk.
 */

/** Ligaturen: één teken waar twee of drie letters horen. */
const LIGATUREN = {
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl',
  'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st',
  'Ĳ': 'IJ', 'ĳ': 'ij',
};

/** Typografische varianten van tekens die in een vergelijking meedoen. */
const TYPOGRAFIE = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '′': "'", '″': '"',
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '​': '', '﻿': '',
};

const ALLE = { ...LIGATUREN, ...TYPOGRAFIE };
const RE = new RegExp(`[${Object.keys(ALLE).join('')}]`, 'g');

/**
 * Vervangt ligaturen en typografische varianten door hun gewone tegenhanger.
 * Laat de tekst verder ongemoeid — geen trim, geen witruimte samenvouwen.
 */
export function normaliseerTekst(tekst) {
  if (typeof tekst !== 'string' || !tekst) return tekst ?? '';
  return tekst.replace(RE, (c) => ALLE[c]);
}

/**
 * Hoeveel tekens zou `normaliseerTekst` aanpassen? Voor logging en meting — zo is te
 * zien of een documentsoort er veel of geen bevat, zonder de tekst zelf te tonen.
 */
export function telAfwijkendeTekens(tekst) {
  if (typeof tekst !== 'string' || !tekst) return 0;
  return (tekst.match(RE) ?? []).length;
}
