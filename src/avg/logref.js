/**
 * src/avg/logref.js — verwijzingen voor logregels, in plaats van cliëntgegevens
 *
 * ── WAAROM ──────────────────────────────────────────────────────────────────
 *
 * Onze eigen logregels dragen cliëntnamen. Een bestandsnaam is in dit vak
 * "Convenant Jansen-de Vries.pdf", en `api/analyseer.js` zette die in zes logregels.
 * Die logs staan bij Vercel — een externe verwerker, met een bewaartermijn waar wij niet
 * over gaan. Dat is een verwerking van persoonsgegevens die niets bijdraagt: bij het
 * opsporen van een storing gaat het om wélk document, niet om wiens document.
 *
 * Vandaar een verwijzing in plaats van de waarde. Dezelfde invoer geeft dezelfde
 * verwijzing, dus regels over hetzelfde document blijven aan elkaar te knopen — in de
 * server- én de browserlog, want beide gebruiken deze module.
 *
 * ── WAT DIT NIET IS ─────────────────────────────────────────────────────────
 *
 * Geen versleuteling en geen geheim. Het is een korte, niet-cryptografische hash: wie een
 * lijst kandidaat-bestandsnamen heeft, kan uitproberen welke bij een verwijzing hoort. Het
 * doel is dat namen niet in de logs stáán, niet dat de logs openbaar mogen.
 *
 * Bewust geen sha256: die is in de browser asynchroon (`crypto.subtle`), en een logregel
 * mag geen `await` nodig hebben. FNV-1a is synchroon, hier identiek in Node en browser, en
 * ruim genoeg voor een label — botsingen zijn bij dit gebruik hinder, geen fout.
 */

/** FNV-1a, 32 bits. Werkt op UTF-16-eenheden, dus ook op accenten en emoji. */
function fnv1a(tekst) {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Korte verwijzing naar een waarde: `voorvoegsel#a1b2c3d4`.
 * Lege of ontbrekende invoer geeft `voorvoegsel#leeg`, zodat een logregel nooit
 * "undefined" toont en het onderscheid met een echte waarde zichtbaar blijft.
 */
export function kortRef(waarde, voorvoegsel = 'ref') {
  if (typeof waarde !== 'string' || waarde.trim() === '') return `${voorvoegsel}#leeg`;
  return `${voorvoegsel}#${fnv1a(waarde)}`;
}

/**
 * Verwijzing naar een document. De extensie blijft staan — die is geen persoonsgegeven en
 * scheelt bij het lezen van een log: `doc#a1b2c3d4.pdf`.
 *
 * Een pad ervoor telt niet mee, zodat "map/Convenant.pdf" en "Convenant.pdf" dezelfde
 * verwijzing geven.
 */
export function docRef(bestandsnaam) {
  if (typeof bestandsnaam !== 'string' || bestandsnaam.trim() === '') return 'doc#leeg';
  const kaal = bestandsnaam.split(/[\\/]/).pop();
  const punt = kaal.lastIndexOf('.');
  const ext = punt > 0 ? kaal.slice(punt).toLowerCase() : '';
  return `${kortRef(kaal, 'doc')}${ext}`;
}

/** `[IBAN_0]`, `[IBAN-1]` — de placeholders die de browser en de server gebruiken. */
const PLACEHOLDER_RE = /^\[IBAN[_-]\d+\]$/i;

/**
 * Verwijzing naar een rekeningnummer.
 *
 * Een placeholder blijft ongewijzigd: die is al gepseudonimiseerd, en juist die nummering
 * is wat een logregel bruikbaar maakt. Een écht IBAN wordt een verwijzing.
 *
 * Dat dit nodig is: `api/_iban.js` matcht bewust beide vormen, omdat de validatie ook moet
 * werken op tekst die de pseudonimisering niet heeft gehaald. Precies in dat geval stond er
 * een volledig rekeningnummer in de log.
 *
 * Schrijfwijze doet er niet toe: "NL28 RABO 0328582298" en "NL28RABO0328582298" geven
 * dezelfde verwijzing.
 */
export function ibanRef(iban) {
  if (typeof iban !== 'string' || iban.trim() === '') return 'iban#leeg';
  const kaal = iban.trim();
  if (PLACEHOLDER_RE.test(kaal)) return kaal;
  return kortRef(kaal.replace(/\s+/g, '').toUpperCase(), 'iban');
}
