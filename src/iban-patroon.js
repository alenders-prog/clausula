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
 * Rekeningnummers die géén IBAN zijn — en dus door `ibanRe` niet werden gezien.
 *
 * Aanleiding (25 augustus 2026): een bewaard rapport uit een echte screening bevatte
 * drie rekeningidentificaties, letterlijk in de issue-titels:
 *
 *   NL046344501    beleggingsrekening (Peaks)
 *   NL414678501    idem, tweede rekening
 *   60.75.97.461   ABN, oude notatie van vóór de IBAN-overgang
 *
 * Geen van drieën voldoet aan het IBAN-formaat — NL + 2 cijfers + 4 LETTERS + 10
 * cijfers — dus ze werden nooit vervangen en gingen onbewerkt naar de Anthropic API.
 * Het viel niet op omdat ze er wél als IBAN uitzien; een controle die op geldige
 * IBANs zoekt, meldt hier niets.
 *
 * Twee vormen, allebei nauw gehouden:
 *   `NL` direct gevolgd door cijfers — kan nooit botsen met een echt NL-IBAN, want
 *   daar staan na de twee checkcijfers altijd vier letters.
 *   De oude puntnotatie 2.2.2.3 — te specifiek om op artikelnummering te matchen
 *   (die telt zelden vier delen, en nooit in deze cijferbreedtes).
 *
 * Bewust NIET erbij: een kaal getal van tien cijfers. Dat is niet te onderscheiden
 * van een telefoonnummer of een bedrag in centen, en de telefoonregel verderop dekt
 * het gangbare geval al af.
 */
export const REKENING_NL_KAAL_BRON = String.raw`\bNL\d{6,12}\b`;
export const REKENING_OUD_BRON     = String.raw`\b\d{2}\.\d{2}\.\d{2}\.\d{3}\b`;

/**
 * Alleen voor MASKEREN, nooit voor valideren — zie de afweging bij `ibanOfTokenRe`.
 * Draai hem ná `ibanRe`, zodat echte IBANs al vervangen zijn.
 */
export const rekeningOverigRe = (vlaggen = 'g') =>
  new RegExp(`(?:${REKENING_NL_KAAL_BRON}|${REKENING_OUD_BRON})`, vlaggen);

/** Punten en spaties weg, zodat "60.75.97.461" en "6075 97461" één sleutel delen. */
export const rekeningSleutel = (nr) => (nr || '').replace(/[\s.]/g, '');

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
