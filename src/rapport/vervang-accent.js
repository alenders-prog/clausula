/**
 * src/rapport/vervang-accent.js — laat zien wát er verandert in een vervangvoorstel.
 *
 * Aanleiding (1 september 2026). Een mediator meldde: "Aanbeveling geeft aan dat dezelfde
 * zin vervangen moet worden door dezelfde zin." Dat was niet zo — er zaten twee woorden
 * verschil in — maar in een aanbeveling van anderhalve regel met twee bijna gelijke
 * citaten is dat verschil niet te zien. En een voorstel waarvan je het verschil niet ziet,
 * kun je niet beoordelen.
 *
 * ── DE SCHERPE RAND: NIET ELK PAAR CITATEN IS EEN VERVANGING ────────────────
 *
 * Gemeten over 75 aanbevelingen uit de golden fixtures: vier bevatten twee citaten, en
 * daarvan is er precies één een vervang-paar:
 *
 *   wél   Vervang 'De echtelijke woning' door 'De gezamenlijke woning' in artikel 2.1.
 *   niet  Voeg een bepaling toe, bijvoorbeeld: 'Het partnerpensioen blijft in stand…'
 *         of, als partijen afstand doen: 'De vrouw doet afstand van…'
 *
 * Die laatste drie zijn álternatieven. Twee ongerelateerde teksten naast elkaar leggen en
 * de verschillen markeren geeft daar een kerstboom van accenten die niets betekent —
 * erger dan geen accent. Daarom herkent `splitsVervanging` alleen een expliciete
 * vervang-formulering met béíde citaten erin, en geeft hij in alle andere gevallen null.
 *
 * ── WAAROM PREFIX EN SUFFIX AFPELLEN, EN GEEN ECHTE DIFF ────────────────────
 *
 * Bij een vervangvoorstel zijn oud en nieuw per definitie bijna gelijk; het verschil zit
 * in het midden. Gemeenschappelijk begin en einde afpellen levert daar precies het goede
 * antwoord, in tien regels, zonder de valkuilen van een LCS-implementatie die niemand
 * naleest. Zijn de teksten tóch heel verschillend, dan blijft er een groot midden over —
 * dat is dan ook eerlijk: er verandert veel.
 */

/**
 * Formuleringen waarin het tweede citaat de vervanging van het eerste is.
 * Bewust smal: liever geen accent dan een accent op iets dat geen vervanging is.
 */
const VERVANG_VORMEN = [
  /\bvervang\b[^'"‘“]*/i,
  /\bwijzig\b[^'"‘“]*/i,
  /\bverander\b[^'"‘“]*/i,
];

/** Het woord tussen de twee citaten dat de vervanging aanwijst. */
const KOPPELWOORD = /^[^'"‘’“”]*\b(door|in|naar|tot)\b[^'"‘’“”]*$/i;

const AANHALING = /['"‘’“”]/;

/** Alle citaten in de tekst, met hun plek. */
function citaten(tekst) {
  const uit = [];
  const re = /(['"‘“])([^'"’”]{3,300})(['"’”])/g;
  let m;
  while ((m = re.exec(tekst))) uit.push({ tekst: m[2], start: m.index, eind: re.lastIndex });
  return uit;
}

/**
 * Splitst een aanbeveling in "vervang <oud> door <nieuw>", of geeft null als het er geen is.
 *
 * @returns {{voor: string, oud: string, midden: string, nieuw: string, na: string}|null}
 */
export function splitsVervanging(aanbeveling) {
  const t = String(aanbeveling || '');
  if (!VERVANG_VORMEN.some(re => re.test(t))) return null;

  const q = citaten(t);
  if (q.length !== 2) return null;          // drie citaten: geen eenduidig paar

  const midden = t.slice(q[0].eind, q[1].start);
  if (!KOPPELWOORD.test(midden)) return null;

  // De vervang-formulering moet vóór het eerste citaat staan. "Voeg toe, bijvoorbeeld
  // 'A' … of vervang later 'B'" is geen paar.
  const voor = t.slice(0, q[0].start);
  if (!VERVANG_VORMEN.some(re => re.test(voor))) return null;

  return { voor, oud: q[0].tekst, midden, nieuw: q[1].tekst, na: t.slice(q[1].eind) };
}

/** Woorden mét de witruimte die erop volgt, zodat samenvoegen de tekst exact teruggeeft. */
function stukken(tekst) {
  return String(tekst).match(/\S+\s*/g) || [];
}

/**
 * Welke woorden verschillen tussen oud en nieuw.
 *
 * @returns {{oud: Array<{tekst: string, anders: boolean}>, nieuw: Array<...>}}
 */
export function woordAccenten(oud, nieuw) {
  const a = stukken(oud), b = stukken(nieuw);
  const gelijk = (x, y) => x.trim().toLowerCase() === y.trim().toLowerCase();

  let kop = 0;
  while (kop < a.length && kop < b.length && gelijk(a[kop], b[kop])) kop++;

  let staart = 0;
  while (staart < a.length - kop && staart < b.length - kop
         && gelijk(a[a.length - 1 - staart], b[b.length - 1 - staart])) staart++;

  const merk = (arr) => arr.map((tekst, i) => ({
    tekst, anders: i >= kop && i < arr.length - staart,
  }));
  return { oud: merk(a), nieuw: merk(b) };
}

/**
 * De aanbeveling als HTML, met het verschil gemarkeerd. Geeft null als het geen
 * vervangvoorstel is — de aanroeper toont dan gewoon de platte tekst.
 *
 * @param {string} aanbeveling
 * @param {(s: string) => string} esc  de escape-functie van de aanroeper
 */
export function accentueerAanbeveling(aanbeveling, esc) {
  const v = splitsVervanging(aanbeveling);
  if (!v) return null;

  const { oud, nieuw } = woordAccenten(v.oud, v.nieuw);
  // Verandert er niets, dan is dát het bericht. Een voorstel dat dezelfde tekst
  // teruggeeft is een fout van het model, en die hoort zichtbaar te zijn in plaats van
  // als een gewone aanbeveling te worden getoond.
  const identiek = !oud.some(d => d.anders) && !nieuw.some(d => d.anders);

  // De witruimte ná een woord blijft búíten de markering. `stukken()` plakt hem aan het
  // woord vast zodat samenvoegen de tekst exact teruggeeft, maar meegekleurd loopt het
  // accent door tot aan het volgende woord en oogt het als een slordige selectie.
  const bouw = (delen, klasse) => delen.map(d => {
    if (!d.anders) return esc(d.tekst);
    const m = d.tekst.match(/^([\s\S]*?)(\s*)$/);
    return `<mark class="${klasse}">${esc(m[1])}</mark>${esc(m[2])}`;
  }).join('');

  // De aanhalingstekens horen om élk citaat, niet om het geheel — anders leest het als
  // één lange aanhaling met een koppelwoord erin.
  const kern = identiek
    ? `<span class="vv-gelijk">“${esc(v.oud)}”</span>`
      + ` <em class="vv-let-op">— oud en nieuw zijn identiek</em>`
    : `<span class="vv-oud">“${bouw(oud, 'vv-weg')}”</span>`
      + `${esc(v.midden)}`
      + `<span class="vv-nieuw">“${bouw(nieuw, 'vv-erbij')}”</span>`;

  return `${esc(v.voor)}${kern}${esc(v.na)}`;
}
