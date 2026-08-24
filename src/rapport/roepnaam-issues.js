/**
 * Roepnaam-issues per document
 *
 * Wanneer de classificatie een roepnaam vindt die sterk afwijkt van de
 * geboortenaam ("Erwin" bij "Jan Willem Huzen"), verschijnt daarover een
 * issue-kaart. Die kaart hoort bij het document waarín die roepnaam staat.
 *
 * Tot 24 augustus 2026 was het één lijst die aan élk document werd geplakt,
 * met een passage die uit het eerste document kwam waar de naam toevallig in
 * voorkwam. Gevolg: onder het ouderschapsplan stond een issue met een passage
 * over een bankrekening uit het convenant — een citaat dat in het getoonde
 * document niet te vinden was.
 *
 * Vandaar de toewijzing hier: per waarschuwing wordt bepaald in welke
 * documenten de roepnaam daadwerkelijk staat, en alleen dáár komt de kaart,
 * met de passage uit dát document.
 */

/** Escapet tekst voor gebruik in een reguliere expressie. */
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tekens die tot een naam kunnen behoren. Zonder woordgrens matcht "Jan" ook
// in "Janssen" en belandt de kaart onder een document dat de roepnaam niet
// noemt. Een kale \b volstaat niet: namen bevatten streepjes en apostrofs, en
// daar ligt volgens \b juist wél een grens.
const NAAMTEKEN = String.raw`\p{L}\p{N}'’\-`;

function maakPatroon(roepnaam) {
  return new RegExp(
    `(^|[^${NAAMTEKEN}])${esc(roepnaam)}(?![${NAAMTEKEN}])`,
    'iu',
  );
}

/** De regel waarin de roepnaam voorkomt, als passage voor de issue-kaart. */
function passageVoor(tekst, patroon) {
  const m = patroon.exec(tekst);
  if (!m) return '';
  const idx = m.index + m[1].length;
  const start = tekst.lastIndexOf('\n', idx);
  const end   = tekst.indexOf('\n', idx);
  return tekst.slice(start < 0 ? 0 : start + 1, end < 0 ? tekst.length : end).trim();
}

/** De issue-kaart zelf — tekst identiek aan wat er stond. */
export function maakRoepnaamIssue(w, passage = '') {
  const eersteFn = w.formeelVolledig.trim().split(/\s+/)[0];
  return {
    onderwerp:    `Roepnaam "${w.roepnaam}" niet formeel geïntroduceerd`,
    ernst:        'midden',
    dimensies:    ['volledigheid'],
    bevinding:    `"${w.roepnaam}" wijkt sterk af van de geboortennaam "${w.formeelVolledig}". De roepnaam wordt gebruikt in het document maar is niet formeel geïntroduceerd in de persoonsspecificatie.`,
    aanbeveling:  `Voeg toe aan de persoonsspecificatie: "${w.formeelVolledig}, hierna ook te noemen '${w.roepnaam}'" — of gebruik de geboortennaam "${eersteFn}" consequent in het document.`,
    passage,
    afgehandeld:  false,
    opmerking:    '',
  };
}

/**
 * Verdeelt de roepnaam-waarschuwingen over de documenten waar ze thuishoren.
 *
 * @param {Array<{roepnaam: string, formeelVolledig: string}>} waarschuwingen
 * @param {Array<{bestandsnaam: string, tekst: string}>} documenten
 * @returns {{
 *   perBestand: Map<string, object[]>,
 *   ongeplaatst: Array<{roepnaam: string, formeelVolledig: string}>,
 * }}
 *   `perBestand` bevat alleen bestandsnamen met minstens één kaart.
 *   `ongeplaatst` zijn waarschuwingen waarvan de roepnaam in géén document
 *   voorkomt; die kaarten komen dan bij álle documenten — een misplaatste
 *   kaart is hinderlijk, een verdwenen bevinding erger — en de aanroeper kan
 *   erop melden.
 */
export function bouwRoepnaamIssues(waarschuwingen = [], documenten = []) {
  const perBestand = new Map();
  const ongeplaatst = [];
  const geldig = (documenten || []).filter(d => d && d.bestandsnaam);

  const zet = (bestandsnaam, issue) => {
    if (!perBestand.has(bestandsnaam)) perBestand.set(bestandsnaam, []);
    perBestand.get(bestandsnaam).push(issue);
  };

  for (const w of waarschuwingen || []) {
    if (!w?.roepnaam || !w?.formeelVolledig) continue;
    const patroon = maakPatroon(w.roepnaam);
    const treffers = geldig.filter(d => patroon.test(d.tekst || ''));

    if (treffers.length) {
      for (const d of treffers) {
        zet(d.bestandsnaam, maakRoepnaamIssue(w, passageVoor(d.tekst || '', patroon)));
      }
    } else {
      ongeplaatst.push(w);
      for (const d of geldig) zet(d.bestandsnaam, maakRoepnaamIssue(w));
    }
  }

  return { perBestand, ongeplaatst };
}
