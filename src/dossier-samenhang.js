/**
 * src/dossier-samenhang.js — horen deze documenten bij hetzelfde dossier?
 *
 * Aanleiding (25 augustus 2026): de cross-document-analyse gaat ervan uit dat twee
 * documenten uit hetzelfde dossier komen. Dat is een aanname, geen toets. Belandt er
 * per ongeluk een document van een andere cliënt in dezelfde analyse, dan vergelijkt
 * de call ze braaf en levert een stroom "tegenstrijdigheden" op — andere namen, andere
 * kinderen, andere bedragen. Allemaal waar, allemaal zinloos, en het enige bruikbare
 * signaal — dít hoort niet bij elkaar — ontbreekt juist.
 *
 * Waarom hier en niet in de prompt: dat is gemeten. Een promptregel tegen één bekende
 * valse bevinding hield in zes runs vier keer stand en twee keer niet, en aanscherpen
 * veranderde daar niets aan (2 van 3 vóór, 2 van 3 ná). Een taalmodel geeft een neiging,
 * geen slot. Een naamvergelijking geeft elke keer dezelfde uitkomst en is te testen.
 *
 * Waarom vóór de analyse: de mediator kan dan nog afbreken. Achteraf melden kost een
 * volledige analyse en levert een rapport op dat toch weg moet.
 */

// Zelfde woordgrens-definitie als src/rapport/roepnaam-issues.js: letters, cijfers,
// apostroffen en koppeltekens horen bij een naam, al het andere is een grens.
// Zonder dit matcht "Bergman" ook in "Bergmanstraat".
const NAAMTEKEN = String.raw`\p{L}\p{N}'’\-`;

// Tussenvoegsels dragen geen onderscheidende informatie: half Nederland heet "van"
// iets. Ze meetellen zou twee willekeurige dossiers laten overlappen.
const TUSSENVOEGSELS = new Set([
  'van', 'de', 'der', 'den', 'het', 'te', 'ten', 'ter', 'in', 'op', 'aan',
  'du', 'la', 'le', 'di', 'da', 'dos', 'el',
]);

/**
 * Splitst een naam in losse, onderscheidende delen.
 * "Robin van den Bergman" → ['robin', 'bergman']
 */
export function naamDelen(naam) {
  return String(naam || '')
    .toLowerCase()
    .split(/[\s.]+/)
    .map(d => d.replace(new RegExp(`[^${NAAMTEKEN}]`, 'gu'), ''))
    .filter(d => d.length >= 3 && !TUSSENVOEGSELS.has(d));
}

/** Alle onderscheidende naamdelen uit een lijst namen, als één verzameling. */
export function alleNaamDelen(namen) {
  const uit = new Set();
  for (const naam of namen || []) for (const deel of naamDelen(naam)) uit.add(deel);
  return uit;
}

/**
 * Welke van de bekende naamdelen komen in deze tekst voor?
 * Op hele woorden, hoofdletterongevoelig.
 */
export function naamDelenInTekst(tekst, delen) {
  const t = String(tekst || '');
  const gevonden = new Set();
  for (const deel of delen) {
    const rx = new RegExp(`(?<![${NAAMTEKEN}])${deel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${NAAMTEKEN}])`, 'iu');
    if (rx.test(t)) gevonden.add(deel);
  }
  return gevonden;
}

const doorsnede = (a, b) => new Set([...a].filter(x => b.has(x)));

/**
 * Toetst of alle documenten dezelfde personen noemen.
 *
 * @param {object} opties
 * @param {Array<{bestandsnaam?: string, tekst?: string}>} opties.documenten
 * @param {string[]} opties.namen  alle bekende namen uit de classificatie
 *                                 (partijen én kinderen, formele naam en roepnaam)
 * @returns {{oordeel: 'ok'|'twijfel'|'mismatch', melding: string, perDocument: Array}}
 *
 * 'ok'       — elk paar documenten deelt voldoende namen, of er valt niets te zeggen
 * 'twijfel'  — er is overlap, maar minder dan de helft van de kleinste set
 * 'mismatch' — twee documenten noemen allebei bekende personen, en geen enkele dezelfde
 *
 * Een document waarin géén bekende naam voorkomt levert nooit een oordeel op. Dat komt
 * voor bij bijlagen (een taxatierapport, een jaaropgave) en is geen reden tot alarm;
 * zwijgen is daar juist het goede antwoord.
 */
export function toetsDossierSamenhang({ documenten = [], namen = [] } = {}) {
  const delen = alleNaamDelen(namen);

  const perDocument = documenten.map(d => ({
    bestandsnaam: d.bestandsnaam || '',
    inTekst:      naamDelenInTekst(d.tekst, delen),
    inBestandsnaam: naamDelenInTekst(d.bestandsnaam, delen),
  }));

  if (delen.size === 0 || perDocument.length < 2) {
    return { oordeel: 'ok', melding: '', perDocument };
  }

  let slechtste = 'ok';
  let melding   = '';

  for (let i = 0; i < perDocument.length; i++) {
    for (let j = i + 1; j < perDocument.length; j++) {
      const a = perDocument[i], b = perDocument[j];
      // Bestandsnaam telt mee als extra bewijs, maar mag nooit het enige zijn:
      // "convenant def2.pdf" bevat geen naam en zegt dus niets.
      const setA = new Set([...a.inTekst, ...a.inBestandsnaam]);
      const setB = new Set([...b.inTekst, ...b.inBestandsnaam]);
      if (setA.size === 0 || setB.size === 0) continue;

      const gedeeld = doorsnede(setA, setB);
      const score   = gedeeld.size / Math.min(setA.size, setB.size);

      let oordeel = 'ok';
      if (gedeeld.size === 0)  oordeel = 'mismatch';
      else if (score < 0.5)    oordeel = 'twijfel';
      if (oordeel === 'ok') continue;

      const rang = { ok: 0, twijfel: 1, mismatch: 2 };
      if (rang[oordeel] <= rang[slechtste]) continue;

      slechtste = oordeel;
      const noem = s => [...s].sort().join(', ');
      melding = oordeel === 'mismatch'
        ? `"${a.bestandsnaam}" noemt ${noem(setA)}; "${b.bestandsnaam}" noemt ${noem(setB)}. `
          + 'Geen enkele naam komt in beide documenten voor.'
        : `"${a.bestandsnaam}" noemt ${noem(setA)}; "${b.bestandsnaam}" noemt ${noem(setB)}. `
          + `Gedeeld: ${noem(gedeeld)}.`;
    }
  }

  return { oordeel: slechtste, melding, perDocument };
}

/**
 * De tekst voor het bevestigingsvenster. Apart gehouden van de toets zelf, zodat de
 * bewoording te testen is zonder een DOM en zonder de vergelijking na te bouwen.
 */
export function samenhangWaarschuwing(uitkomst) {
  if (!uitkomst || uitkomst.oordeel === 'ok') return '';
  const kop = uitkomst.oordeel === 'mismatch'
    ? 'Deze documenten lijken niet bij hetzelfde dossier te horen.'
    : 'Deze documenten noemen grotendeels verschillende personen.';
  return `${kop}\n\n${uitkomst.melding}\n\n`
    + 'Analyseren van documenten uit verschillende dossiers levert een rapport vol '
    + 'verschillen op die geen van alle iets betekenen.\n\n'
    + 'Toch doorgaan met de analyse?';
}
