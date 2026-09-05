/**
 * src/avg/persoonsdetails.js — de persoonsgegevens die de naamvervanging laat staan.
 *
 * Aanleiding (3–4 september 2026). De app beloofde de mediator dat documenten "volledig
 * geanonimiseerd" het kantoor verlaten. Nagespeeld met een gewone convenantalinea bleef dit
 * staan nadat alle bestaande vervangingen hadden gedraaid:
 *
 *     Robin Bergman, geboren te Enschede op 12-12-1996, wonende te [POSTCODE_1]
 *     [WOONPLAATS_2] aan Markendoel 16, werkzaam bij Pensioenfonds Zorg en Welzijn.
 *
 * Geboortedatum, geboorteplaats, werkgever, en een adres waarvan de straatnaam niet op
 * -straat/-laan/-weg eindigt. Geboortedatum plus geboorteplaats plus werkgever is in
 * Nederland vrijwel altijd tot één persoon te herleiden.
 *
 * ── WAT ER MET DATUMS GEBEURT, EN WAAROM NIET MEER ──────────────────────────
 *
 * Datums wéghalen kan niet: de analyse heeft ze nodig. De huwelijksdatum bepaalt of er
 * beperkte of algehele gemeenschap geldt (de grens van 1-1-2018), de geboortedatum bepaalt
 * de alimentatieduur (art. 1:157 lid 3 BW kent een aparte termijn voor wie op of vóór
 * 1 januari 1970 is geboren), en de leeftijd van een kind bepaalt het hoorrecht en de
 * doorloop na het twaalfde jaar.
 *
 * Daarom wordt de precisie verlaagd in plaats van de datum verwijderd. Dat besluit is niet
 * nieuw: het staat sinds 8 augustus 2026 in de skill `avg-beleid` en is toen toegepast op
 * het feitenblok van de assistent (`api/_feiten.js`, `maandJaarUitDatum` en
 * `leeftijdUitDatum`). Wat ontbrak is dezelfde regel op de documenttekst zelf.
 *
 *     geboortedatum    → alleen het jaar        ("geboren in 1996")
 *     huwelijksdatum   → maand en jaar          ("gehuwd in 08-2022")
 *     overige datums   → blijven staan          peildatum, levering, ondertekening
 *
 * Die laatste regel is bewust: een peildatum is geen persoonsgegeven, en hem vervagen zou
 * de verdelingstoets onbruikbaar maken.
 *
 * ── DE GRENS VAN DEZE AANPAK ────────────────────────────────────────────────
 *
 * Patronen vangen wat een patroon heeft. Ze vangen niet:
 *
 *     "de vrouw werkt als tandarts in het dorp waar beide partijen zijn opgegroeid"
 *
 * Dat is herleidbaar en er is geen regel voor. Daarom hoort bij deze module een
 * residu-controle (`src/avg/residu.js`) die meet wat er ná het vervangen nog identificerend
 * uitziet. "Geanonimiseerd" is daarmee een meting en geen aanname — en dat is precies het
 * verschil dat de app tegenover een mediator moet kunnen waarmaken.
 */

/** Datums zoals ze in Nederlandse akten voorkomen. */
const MAANDEN = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december';
const DATUM = String.raw`(?:(\d{1,2})[-/\s](\d{1,2}|${MAANDEN})[-/\s](\d{4})|(\d{1,2})\s+(${MAANDEN})\s+(\d{4}))`;

/** Maandnaam → nummer, voor het terugbrengen tot maand-jaar. */
const MAANDNR = Object.fromEntries(MAANDEN.split('|').map((m, i) => [m, String(i + 1).padStart(2, '0')]));

/** Haalt jaar en maand uit een gevonden datum, ongeacht de schrijfwijze. */
function jaarEnMaand(m) {
  // Twee alternatieven in DATUM: cijfermaand of maandnaam vóór het jaar.
  const maandRuw = m[2] ?? m[5];
  const jaar     = m[3] ?? m[6];
  const maand = /^\d+$/.test(maandRuw ?? '')
    ? String(maandRuw).padStart(2, '0')
    : MAANDNR[String(maandRuw).toLowerCase()] ?? '';
  return { jaar, maand };
}

/**
 * Verlaagt de precisie van geboorte- en huwelijksdatums, en vervangt geboorteplaats,
 * werkgever en adressen zonder straatnaamsuffix.
 *
 * @param {string} tekst
 * @param {(type: string, waarde: string) => string} [piiPh]
 *        genummerde placeholders; zonder deze blijven plaats en werkgever staan, net als
 *        bij de bestaande adres- en postcodevervanging.
 */
export function vervangPersoonsdetails(tekst, piiPh = null) {
  let t = String(tekst ?? '');
  if (!t) return t;

  // ── Geboortedatum → alleen het jaar ───────────────────────────────────────
  // Zowel "geboren op 12-12-1996" als "geboren 03-04-2011 te Deventer".
  t = t.replace(new RegExp(String.raw`(\bgeboren\b[^.,;]{0,25}?\b(?:op\s+)?)${DATUM}`, 'gi'),
    (heel, voor, ...rest) => `${voor.replace(/\bop\s+$/i, 'in ')}${jaarEnMaand(['', ...rest]).jaar}`);

  // ── Huwelijksdatum → maand en jaar ────────────────────────────────────────
  // Beide woordvolgordes: "gehuwd op 26-08-2022" én "op 26-08-2022 te X gehuwd".
  const HUW = String.raw`gehuwd|getrouwd|huwelijk|geregistreerd\s+partnerschap|partnerschap\s+aangegaan`;
  t = t.replace(new RegExp(String.raw`(\b(?:${HUW})\b[^.;]{0,40}?\b(?:op\s+)?)${DATUM}`, 'gi'),
    (heel, voor, ...rest) => {
      const { jaar, maand } = jaarEnMaand(['', ...rest]);
      return `${voor.replace(/\bop\s+$/i, 'in ')}${maand ? `${maand}-${jaar}` : jaar}`;
    });
  t = t.replace(new RegExp(String.raw`\b(?:op\s+)?${DATUM}([^.;]{0,40}?\b(?:${HUW})\b)`, 'gi'),
    (heel, ...rest) => {
      const na = rest[rest.length - 3];   // de laatste capture vóór offset/string
      const { jaar, maand } = jaarEnMaand(['', ...rest]);
      return `in ${maand ? `${maand}-${jaar}` : jaar}${na}`;
    });

  if (!piiPh) return t;

  // ── Geboorteplaats ────────────────────────────────────────────────────────
  // "geboren te Enschede", en ook "geboren 03-04-2011 te Deventer" — de plaats staat soms
  // vóór en soms ná de datum. Eén patroon met een venster dekt beide.
  t = t.replace(/(\bgeboren\b[^.,;]{0,30}?\bte\s+)(?!\[)([A-Z][a-zA-ZÀ-ÿ\-']{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿ\-']{2,})?)/g,
    (heel, voor, plaats) => `${voor}${piiPh('GEBOORTEPLAATS', plaats.trim())}`);

  // ── Huwelijksplaats ───────────────────────────────────────────────────────
  // "op 26-08-2022 te Renkum gehuwd" en "gehuwd te Renkum". Dezelfde soort als de
  // geboorteplaats: op zichzelf onschuldig, in combinatie met een jaartal en een
  // gemeente een sterke aanwijzing naar één akte in de burgerlijke stand.
  t = t.replace(new RegExp(String.raw`(\bte\s+)(?!\[)([A-Z][a-zA-ZÀ-ÿ\-']{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿ\-']{2,})?)(?=[^.;]{0,20}?\b(?:${HUW})\b)`, 'g'),
    (heel, voor, plaats) => `${voor}${piiPh('HUWELIJKSPLAATS', plaats.trim())}`);
  t = t.replace(new RegExp(String.raw`(\b(?:${HUW})\b[^.;]{0,20}?\bte\s+)(?!\[)([A-Z][a-zA-ZÀ-ÿ\-']{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿ\-']{2,})?)`, 'g'),
    (heel, voor, plaats) => `${voor}${piiPh('HUWELIJKSPLAATS', plaats.trim())}`);

  // ── Werkgever ─────────────────────────────────────────────────────────────
  // "werkzaam bij X", "in dienst bij X", en losstaande rechtsvormen.
  t = t.replace(/(\b(?:werkzaam|in\s+dienst|werkgever|dienstverband)\b[^.;]{0,20}?\bbij\s+)(?!\[)([A-Z][^,.;]{2,60}?)(?=\s*[,.;]|$)/gi,
    (heel, voor, org) => `${voor}${piiPh('WERKGEVER', org.trim())}`);
  t = t.replace(/(?<!\[)\b((?:[A-Z][\w'&-]*\s+){0,4}(?:B\.?V\.?|N\.?V\.?|V\.?O\.?F\.?|Stichting|Pensioenfonds)(?:\s+[A-Z][\w'&-]*){0,4})/g,
    (heel, org) => piiPh('WERKGEVER', org.trim()));

  // ── Adres zonder herkenbaar straatsuffix ──────────────────────────────────
  // Het bestaande adrespatroon eist -straat, -laan, -weg, -plein en dergelijke.
  // "Markendoel 16" heeft er geen en bleef daardoor staan. Alleen vervangen in een
  // adres-context, anders raakt dit ook "aan Bijlage 1" of "op Peildatum 3".
  t = t.replace(/((?:wonende|woonachtig|gelegen|adres|de\s+woning|het\s+pand)[^.;]{0,40}?\b(?:aan|op)\s+(?:de\s+|het\s+)?)(?!\[)([A-Z][\w'-]{2,}(?:\s+[A-Z][\w'-]+)?\s+\d{1,4}[a-zA-Z]?)\b/gi,
    (heel, voor, adres) => `${voor}${piiPh('ADRES', adres.trim())}`);

  return t;
}
