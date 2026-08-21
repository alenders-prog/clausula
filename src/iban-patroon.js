/**
 * src/iban-patroon.js — één definitie van het IBAN-patroon
 *
 * Aanleiding (21 augustus 2026): een convenant schreef rekeningnummers als
 * `NL28 RABO 0328582298`, met spaties. Het patroon in naam-anonimiseer.js stond
 * geen spaties toe, dus het IBAN werd niet herkend. De tien losse cijfers bleven
 * over — en `0328582298` is niet te onderscheiden van een Nederlands
 * telefoonnummer, dus de volgende regel maakte er `[TEL]` van.
 *
 * Zichtbaar gevolg in het rapport: "NL28 RABO [TEL]". En omdat [TEL] een vast
 * token is en geen genummerde placeholder, was er niets om bij het tonen terug te
 * zetten — het rekeningnummer was weg.
 *
 * Er stonden drie verschillende patronen in de code:
 *   src/naam-anonimiseer.js   \bNL\d{2}[A-Z]{4}\d{10}\b        zonder spaties
 *   src/pii-anonimiseer.js    \b[A-Z]{2}\d{2}[A-Z0-9]{10,26}\b zonder spaties
 *   api/analyseer.js          \bNL\d{2}\s*[A-Z]{4}\s*\d{10}\b  mét spaties
 *
 * Vandaar dat de server sommige nummers wél als [IBAN-n] herkende en de browser
 * dezelfde nummers niet. Eén definitie voorkomt dat ze opnieuw uiteenlopen.
 */

/**
 * Nederlands IBAN, met optionele witruimte tussen alle groepen.
 * Dekt `NL28RABO0328582298`, `NL28 RABO 0328582298` en `NL28 RABO 0328 5822 98`.
 */
export const IBAN_NL_BRON = String.raw`\bNL\d{2}\s?[A-Z]{4}(?:\s?\d){10}\b`;

/**
 * Buitenlandse IBANs, aaneengeschreven. Bewust ZONDER spatietolerantie: bij een
 * onbekende landopbouw zou `(?:\s?[A-Z0-9]){10,26}` doorlopen in de woorden erna
 * ("DE89… EN DAN" slikt " EN DAN" op). Voor Nederland kennen we de vorm exact —
 * 2 cijfers, 4 letters, 10 cijfers — en kan het wél veilig.
 *
 * Gevolg: een Belgisch rekeningnummer mét spaties wordt niet herkend. Dat was
 * altijd al zo; het is hier vastgelegd zodat het een keuze blijft en geen omissie.
 */
export const IBAN_INT_BRON = String.raw`\b[A-Z]{2}\d{2}[A-Z0-9]{10,26}\b`;

/**
 * De placeholders die eerder in de keten gezet kunnen zijn. Twee schrijfwijzen,
 * historisch gegroeid: de browser nummert met een liggend streepje onder
 * (`[IBAN_0]`), de server met een koppelteken (`[IBAN-1]`). Beide moeten herkend
 * blijven worden, anders valt validatie achteraf om.
 */
export const IBAN_TOKEN_BRON = String.raw`\[IBAN[-_]\d+\]`;

/**
 * Nieuwe RegExp per aanroep: een gedeelde /g-regex houdt lastIndex vast tussen
 * aanroepen en slaat dan treffers over.
 *
 * Nederland eerst: die tak staat spaties toe en moet dus voorrang krijgen op de
 * aaneengeschreven internationale tak.
 */
export const ibanRe = (vlaggen = 'g') =>
  new RegExp(`(?:${IBAN_NL_BRON}|${IBAN_INT_BRON})`, vlaggen);

/**
 * IBANs én reeds vervangen placeholders, voor validatie en vergelijking.
 *
 * Bewust STRIKTER dan `ibanRe`: hier zit alleen de Nederlandse vorm in, niet de
 * ruime internationale. De twee patronen dienen tegengestelde belangen:
 *
 *   maskeren  — te ruim is veilig: er verdwijnt hooguit iets extra's uit de tekst.
 *   valideren — te ruim is schadelijk: `filterIssuesOpIban` verwíjdert issues op
 *               basis van deze match, dus een valse treffer kost een echte bevinding.
 *
 * Vandaar dat `NL36RABO10114172430000` (te veel cijfers) hier níét meetelt.
 */
export const ibanOfTokenRe = (vlaggen = 'g') =>
  new RegExp(`(?:${IBAN_NL_BRON}|${IBAN_TOKEN_BRON})`, vlaggen);

/** Spaties weg, zodat `NL28 RABO 0328582298` en `NL28RABO0328582298` één sleutel delen. */
export const ibanSleutel = (iban) => (iban || '').replace(/\s+/g, '');
