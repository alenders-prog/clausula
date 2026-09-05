/**
 * src/naam-anonimiseer.js — Naam- en PII-pseudonimisering voor de AI-assistent
 *
 * Twee geëxporteerde pure functies:
 *   bouwAnonMap(classificatie, bronNamen?)  → { naarAnon, naarEcht, naarEchtVolledig, roepnamen, waarschuwingen }
 *   anonimiseerTekst(tekst, naarAnon, piiPh?) → geanonimiseerde tekst
 *
 * Gebruikt door index.html (via ESM-bridge op window) en assistent-mobiel.html.
 * Geen DOM-afhankelijkheden; geschikt voor unit-tests in Node/Vitest.
 */

import { ibanRe, ibanSleutel, rekeningOverigRe, rekeningSleutel } from './iban-patroon.js';
import { vervangPersoonsdetails } from './avg/persoonsdetails.js';
import { WOONPLAATSEN } from './avg/woonplaatsen.js';

/**
 * Eén patroon voor alle 2379 ondubbelzinnige woonplaatsnamen, langste eerst.
 *
 * Langste eerst is geen detail: anders vangt "Loon" de eerste helft van "Loon op Zand" en
 * blijft "op Zand" staan. Met deze volgorde matcht de langste naam die past, dus
 * "Hendrik-Ido-Ambacht" en "Alphen aan den Rijn" komen er heel uit. 321 van de namen zijn
 * meerdelig, dus dat is geen randgeval.
 *
 * Woordgrenzen met lookarounds en niet met \b: accenten tellen niet mee in \w, en dan
 * matcht "Únlü" of "Súdwest-Fryslân" niet. Zelfde reden als in src/avg/residu.js.
 *
 * Eén keer opgebouwd bij het laden. Gemeten op een convenant van 60.000 tekens: 0,4 ms.
 */
const PLAATS_RE = (() => {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namen = [...WOONPLAATSEN].sort((a, b) => b.length - a.length).map(esc);
  return new RegExp(`(?<![A-Za-zÀ-ÿ0-9])(?:${namen.join('|')})(?![A-Za-zÀ-ÿ0-9])`, 'g');
})();

// ── Nep-namenpools ────────────────────────────────────────────────────────────
//
// De voornamen zijn bewust GESLACHTSNEUTRAAL. Dat is geen stijlkeuze maar een
// reparatie: de pools werden op volgorde uitgedeeld, zonder naar geslacht te
// kijken. Een meisje werd zo "Finn" en een jongen "Lotte", waarna Claude in de
// aangeleverde tekst las: "Finn stemt in met de afspraken die over háár zijn
// gemaakt." Dat is een echte tegenstrijdigheid — in tekst die wij zelf hadden
// gemaakt. Na het terugzetten van de namen hield de mediator een verwijt over
// dat over onze nepnaam ging en in zijn document nergens te vinden was.
//
// Meegeven welk geslacht bij welke naam hoort zou dat ook oplossen, maar alleen
// als de classificatie het goed leest — en bij twee vrouwen of twee mannen
// klopt een op-volgorde-verdeelde pool per definitie niet. Een naam die géén
// geslacht uitdrukt kan door geen enkel voornaamwoord worden tegengesproken.
//
// Eisen aan een naam die je hier toevoegt:
//   1. geen duidelijk geslachtssignaal (dat is de hele reden van deze lijst);
//   2. minstens vier letters — korte namen lopen kans als deel van een ander
//      woord te worden geraakt bij het terugzetten;
//   3. Nederlands-plausibel — een exotische naam kan Claude op het spoor van
//      een internationaal element zetten dat er niet is;
//   4. niet in de andere pool, zodat een kind en een ouder nooit samenvallen;
//   5. GEEN gewoon Nederlands woord — zie hieronder.
// Bewaakt door tests/unit/naam-anonimiseer.test.js.
//
// De achternamen dragen geen geslacht, maar wél een tweede val, en daar liep het
// op 24 augustus 2026 mis. In de pool stond `Oud`. Dat is een bestaande
// achternaam, maar ook een doodgewoon woord — en "oud en nieuw" staat in élk
// ouderschapsplan onder de feestdagen. Het terugzetten van de namen is
// hoofdletterongevoelig, dus die zin werd:
//
//     "de wissel op oud en nieuw"  →  "de wissel op Lenders en nieuw"
//
// De mediator las een bevinding over een regeling "Lenders & Nieuw" die nergens
// bestond. Oud, Wester en Kroon zijn daarom vervangen door achternamen die geen
// woord zijn. Een nepnaam mag niets betekenen: geen geslacht, en ook geen
// woordenboekbetekenis.
//
// Voornaam en achternaam zijn aparte componenten: voornaam en achternaam van
// een verkorte naam ("Martijn Jasperse") krijgen elk hun EIGEN component:
//   "martijn"  → "Robin"    (nep.fn, alleen voornaam)
//   "jasperse" → "Bergman"  (nep.an, alleen achternaam)
// Resultaat: "Martijn Jasperse" → "Robin Bergman" (één keer, niet dubbel).
// Vroeger (string "Robin Bergman"): beide deelvervangingen → "Robin Bergman
// Robin Bergman" → Claude meldde vals alarm "dubbele naam".
export const NEP_PERSONEN = [
  { fn: 'Robin',   an: 'Bergman'  },
  { fn: 'Sammy',   an: 'Hartwijk' },
  { fn: 'Chris',   an: 'Doornbos' },
  { fn: 'Dani',    an: 'Elzinga'  },
  { fn: 'Jamie',   an: 'Nijhuis'  },
  { fn: 'Rowan',   an: 'Dragt'    },
  { fn: 'Bobbie',  an: 'Bakkenes' },
  { fn: 'Toni',    an: 'Veldhuis' },
  { fn: 'Charlie', an: 'Hoekstra' },
  { fn: 'Frankie', an: 'Stavast'  },
];

// Kindernamen: alleen voornamen (generiek, niet herkenbaar).
export const NEP_KINDEREN = ['Juul', 'Indy', 'Bowie', 'Novi', 'Jodi', 'Kimi', 'Nikki', 'Ronnie'];

// ── bouwAnonMap ───────────────────────────────────────────────────────────────
// Bouwt drie maps:
//   naarAnon        : lowercase-naam → nep-naam         (voor case-insensitieve vervanging)
//   naarEcht        : nep-naam/legacy-ph → roepnaam     (korte naam voor issue-titels/tekst)
//   naarEchtVolledig: nep-naam/legacy-ph → formele naam (volledige naam voor passage-herstel)
//
// bronNamen: optionele array van bestandsnamen/dossiernamen voor roepnaam-detectie.
//   In index.html: app.bestanden.map(f => f.name)
//   In assistent-mobiel.html en tests: [] of weggelaten
/**
 * Plaatsnamen die géén woonplaats-placeholder mogen worden.
 *
 * Landen zijn geen woonplaats maar een rechtsgebied, en de analyse rekent erop: de
 * IPR-toets in `src/rapport/internationaal.js` leidt uit "partijen wonen in verschillende
 * landen" af welke verordening geldt. Zou "Duitsland" hier [WOONPLAATS_0] worden, dan
 * verdwijnt precies het gegeven waarop die toets draait — en dat is geen persoonsgegeven
 * dat weg moet, maar een juridisch feit dat blijven moet.
 *
 * Bewust kort gehouden. Elke naam hier is een uitzondering op de bescherming, dus hij
 * hoort alleen te groeien met een reden die opgeschreven kan worden.
 */
/**
 * Staat er vlak vóór de plaatsnaam een gerecht? Dan blijft de plaats staan.
 * Zie de toelichting bij de aanroep in `anonimiseerTekst`.
 */
const GERECHT_ERVOOR = /\b(rechtbank|gerechtshof|hof|hoge\s+raad|kantonrechter)\b[^.;]{0,25}$/i;

const NIET_WOONPLAATS = new RegExp(
  '^(?:'
  + ['Nederland', 'België', 'Belgie', 'Duitsland', 'Frankrijk', 'Spanje', 'Italië', 'Italie',
     'Portugal', 'Polen', 'Turkije', 'Marokko', 'Suriname', 'Indonesië', 'Indonesie',
     'Engeland', 'Verenigd Koninkrijk', 'Ierland', 'Luxemburg', 'Oostenrijk', 'Zwitserland',
     'Denemarken', 'Zweden', 'Noorwegen', 'Griekenland', 'Hongarije', 'Roemenië', 'Roemenie',
     'Bulgarije', 'Tsjechië', 'Tsjechie', 'Slowakije', 'Kroatië', 'Kroatie',
     'Curaçao', 'Curacao', 'Aruba', 'Bonaire', 'Amerika', 'Verenigde Staten', 'Canada',
     'Australië', 'Australie'].join('|')
  + ')$', 'i');

export function bouwAnonMap(classificatie, bronNamen = []) {
  const naarAnon         = new Map(); // key = lowercase echte naam,  value = nep-naam
  const naarEcht         = new Map(); // key = nep-naam / legacy-ph,  value = roepnaam (kort)
  const naarEchtVolledig = new Map(); // key = nep-naam / legacy-ph,  value = formele naam (volledig)
  const _gedetecteerdRoepnamen = []; // lokaal — teruggegeven via roepnamen-sleutel
  const waarschuwingen   = []; // roepnamen die sterk afwijken van de formele naam

  // Helpt bepalen of een roepnaam sterk afwijkt van de formele naam.
  // Geeft true als er voldoende gelijkenis is (substring, prefix, identiek).
  const _roepnaamLijkt = (roepnaamLc, formeleNaamStr) => {
    if (!formeleNaamStr) return true; // bij twijfel geen waarschuwing
    return formeleNaamStr.toLowerCase().split(/\s+/).some(vn =>
      vn === roepnaamLc || vn.includes(roepnaamLc) || roepnaamLc.includes(vn) ||
      (vn.length >= 3 && roepnaamLc.length >= 3 && vn.startsWith(roepnaamLc.slice(0, 3)))
    );
  };

  let _persIdx = 0;
  let _kindIdx = 0;

  // Registreer een echte naam → nep-naam koppeling.
  // nep: {fn, an}-object voor personen, of string voor kinderen/fallback-placeholders.
  // legacyPh: optionele [PERSOON_A]-stijl placeholder voor backward-compat
  // met bestaande Supabase-data die nog de oude placeholders bevat.
  function registreer(echt, nep, legacyPh = null) {
    if (!echt || echt.trim().length < 2) return;
    const e = echt.trim();
    const eLc = e.toLowerCase();
    const isObj = nep && typeof nep === 'object';
    const nepVolledig = isObj ? `${nep.fn} ${nep.an}` : nep;

    // naarEcht: voor herstel nep-naam → roepnaam (korte naam voor issue-titels/tekst)
    if (!naarEcht.has(nepVolledig)) naarEcht.set(nepVolledig, e);
    if (isObj) {
      // nep.fn én nepVolledig → roepnaam (eerste woord) zodat kaarten korte naam tonen
      // ipv de volledige juridische naam. nepVolledig wordt eerst op 'e' gezet (hierboven)
      // zodat de legacy guard werkt, daarna overschreven met roepnaam.
      const roepnaam = e.split(/\s+/)[0];
      naarEcht.set(nepVolledig, roepnaam);
      if (!naarEcht.has(nep.fn)) naarEcht.set(nep.fn, roepnaam);
      // Bezitsvorm nep-voornaam ("Thomas's") → roepnaam bezitsvorm ("Luuks")
      if (!naarEcht.has(nep.fn + 's')) naarEcht.set(nep.fn + 's', roepnaam + 's');
      // nep.an (achternaam-component) → alleen het laatste naamsdeel van de echte naam.
      // "Thomas Bergman" wordt al correct hersteld (langste match gaat voor).
      // "Sander Bergman" geeft anders "Sander Alexander Johannes Franciscus Schreven" —
      // met deze fix geeft het "Sander Schreven" (de verkorte bankrekening-vorm).
      const echteAchternaam = e.split(/\s+/).pop();
      if (!naarEcht.has(nep.an)) naarEcht.set(nep.an, echteAchternaam);
    }
    if (legacyPh && !naarEcht.has(legacyPh)) naarEcht.set(legacyPh, e);

    // naarEchtVolledig: nep-naam → documentvorm (voor passage/bevinding-herstel)
    // Volwassenen (isObj=true): volledige formele naam → Block B overschrijft later naar roepnaam+achternaam.
    // Kinderen (isObj=false, string nep): eerste voornaam — documenten gebruiken zelden de volledige kindernaam.
    naarEchtVolledig.set(nepVolledig, isObj ? e : e.split(/\s+/)[0]);
    if (isObj) {
      const roepnaamVol = e.split(/\s+/)[0];
      if (!naarEchtVolledig.has(nep.fn)) naarEchtVolledig.set(nep.fn, roepnaamVol);
      if (!naarEchtVolledig.has(nep.fn + 's')) naarEchtVolledig.set(nep.fn + 's', roepnaamVol + 's');
      const echteAcht = e.split(/\s+/).pop();
      if (!naarEchtVolledig.has(nep.an)) naarEchtVolledig.set(nep.an, echteAcht);
    }
    if (legacyPh && !naarEchtVolledig.has(legacyPh)) naarEchtVolledig.set(legacyPh, e);

    // naarAnon: volledige echte naam → volledige nep-naam
    if (!naarAnon.has(eLc)) naarAnon.set(eLc, nepVolledig);

    const delen = e.split(/\s+/);

    // Voornaam → ALLEEN voornaam-component (nep.fn), niet de volledige nep-naam.
    // Voorkomt: "Martijn" → "Thomas Bergman" wat samen met "Jasperse" → "Thomas Bergman"
    // een dubbeling geeft.
    const voornaam = delen[0];
    const nepVoornaam = isObj ? nep.fn : nepVolledig;
    if (voornaam.length > 3 && !naarAnon.has(voornaam.toLowerCase())) {
      naarAnon.set(voornaam.toLowerCase(), nepVoornaam);
    }
    // Bezitsvorm ("Peters" als verwijzing naar "Peter") — vervangt ook door nep-voornaam
    // zodat Claude de partij herkent en geen valse "onbekende naam"-melding geeft.
    if (voornaam.length > 3 && !naarAnon.has((voornaam + 's').toLowerCase())) {
      naarAnon.set((voornaam + 's').toLowerCase(), nepVoornaam);
    }

    if (delen.length >= 2) {
      // Achternaam → ALLEEN achternaam-component (nep.an), niet de volledige nep-naam
      const nepAchternaam = isObj ? nep.an : nepVolledig;
      const achterNaamVolledig = delen.slice(1).join(' ');
      if (achterNaamVolledig.length > 3 && !naarAnon.has(achterNaamVolledig.toLowerCase())) {
        naarAnon.set(achterNaamVolledig.toLowerCase(), nepAchternaam);
      }
      // Alleen het allerlaatste woord (bijv. "Leeuwen" uit "van Leeuwen")
      const achterst = delen[delen.length - 1];
      if (achterst.length > 4 && !naarAnon.has(achterst.toLowerCase())) {
        naarAnon.set(achterst.toLowerCase(), nepAchternaam);
      }
    }
  }

  const naamA = classificatie?.partij_a_naam;
  const naamB = classificatie?.partij_b_naam;

  // Verwijder achternaam-registratie als beide partijen dezelfde achternaam hebben
  // (anders wordt "De Vries" ten onrechte altijd aan partij A gekoppeld)
  const achtA = naamA ? naamA.trim().split(/\s+/).slice(1).join(' ').toLowerCase() : '';
  const achtB = naamB ? naamB.trim().split(/\s+/).slice(1).join(' ').toLowerCase() : '';
  const gedeeldeAcht = achtA && achtA === achtB;

  registreer(naamA, NEP_PERSONEN[_persIdx++], '[PERSOON_A]');
  registreer(naamB, NEP_PERSONEN[_persIdx++], '[PERSOON_B]');

  // Roepnamen uit classificatie (door Haiku expliciet geëxtraheerd).
  // Registreer als alias voor hetzelfde nep-naam paar zodat bijv. "Manon ten Brink"
  // correct gepseudonymiseerd wordt ook al staat de formele naam "Herma Eugenie ten Brink"
  // in partij_b_naam. Werkt ook als de roepnaam-detectie via bestandsnamen mislukt.
  for (const [rnVeld, nepIdx, formeleNaam] of [
    ['partij_a_roepnaam', 0, naamA],
    ['partij_b_roepnaam', 1, naamB],
  ]) {
    const _rn = (classificatie?.[rnVeld] || '').trim().split(/\s+/)[0]; // alleen voornaam
    if (!_rn || _rn.length < 2) continue;
    const _nep = NEP_PERSONEN[nepIdx];
    if (!_nep || typeof _nep !== 'object') continue;
    const _rnLc = _rn.toLowerCase();
    // Voornaam-alias (bijv. "manon" → "Sammy")
    if (!naarAnon.has(_rnLc)) naarAnon.set(_rnLc, _nep.fn);
    if (!naarAnon.has(_rnLc + 's')) naarAnon.set(_rnLc + 's', _nep.fn);
    // Roepnaam + achternaam (bijv. "manon ten brink" → "Sammy Hartwijk")
    if (formeleNaam) {
      const _achterdelenFormeel = formeleNaam.trim().split(/\s+/).slice(1);
      if (_achterdelenFormeel.length) {
        const _metAcht = _rnLc + ' ' + _achterdelenFormeel.join(' ').toLowerCase();
        if (!naarAnon.has(_metAcht)) naarAnon.set(_metAcht, `${_nep.fn} ${_nep.an}`);
        // Kortere variant: alleen tussenvoegsels + achternaam (slaat middelnamen over)
        const _tuss = new Set(['van','de','den','der','het','ten','ter','al','el','bin','ul','bte']);
        let _ks = _achterdelenFormeel.length - 1;
        while (_ks > 0 && _tuss.has(_achterdelenFormeel[_ks - 1].toLowerCase())) _ks--;
        if (_ks > 0 && _ks < _achterdelenFormeel.length) {
          const _kortAcht = _rnLc + ' ' + _achterdelenFormeel.slice(_ks).join(' ').toLowerCase();
          if (!naarAnon.has(_kortAcht)) naarAnon.set(_kortAcht, `${_nep.fn} ${_nep.an}`);
        }
      }
    }
    // naarEcht: overschrijf formele voornaam met roepnaam voor zichtbare namen in de UI
    const _cap = _rn.charAt(0).toUpperCase() + _rn.slice(1);
    naarEcht.set(_nep.fn, _cap);
    naarEcht.set(_nep.fn + 's', _cap + 's');
    naarEcht.set(`${_nep.fn} ${_nep.an}`, _cap);
    // Zet ook naarEchtVolledig voor fn-sleutels op de roepnaam zodat de merge bij opslaan
    // (naarEcht + naarEchtVolledig, volledig wint) de roepnaam niet overschrijft met de formele voornaam.
    // De fn+an-combinatie ("Sammy Hartwijk") blijft formeel in naarEchtVolledig voor passage-herstel.
    naarEchtVolledig.set(_nep.fn, _cap);
    naarEchtVolledig.set(_nep.fn + 's', _cap + 's');

    // Waarschuwing als roepnaam sterk afwijkt van formele naam (bijv. "Manon" vs "Herma Eugenie")
    if (!_roepnaamLijkt(_rnLc, formeleNaam)) {
      waarschuwingen.push({ roepnaam: _cap, formeelVolledig: formeleNaam });
    }
  }

  // Bij gedeelde achternaam: verwijder die uit de map (voorkómt foutieve toewijzing)
  if (gedeeldeAcht && achtA) {
    naarAnon.delete(achtA);
    const achtstA = achtA.split(/\s+/).pop();
    if (achtstA) naarAnon.delete(achtstA);
  }

  // Kinderen — elk kind krijgt eigen nep-voornaam (+ legacy [KIND_N] voor backward-compat)
  const kinderen = Array.isArray(classificatie?.kinderen_namen) ? classificatie.kinderen_namen : [];
  kinderen.forEach((naam, i) => {
    const nepKind = NEP_KINDEREN[_kindIdx++] || `Kind${_kindIdx}`;
    registreer(naam, nepKind, `[KIND_${i + 1}]`);
    // registreer() gebruikt isObj=false voor kinderen → naarEcht slaat volledige naam op.
    // Overschrijf met roepnaam zodat kaarten de korte naam tonen (ook na laden vanuit Supabase).
    const roepnaamKind = naam.trim().split(/\s+/)[0];
    if (roepnaamKind) {
      naarEcht.set(nepKind, roepnaamKind);
      naarEcht.set(nepKind + 's', roepnaamKind + 's');
      naarEcht.set(`[KIND_${i + 1}]`, roepnaamKind);
    }
  });

  // Overige betrokkenen
  if (classificatie?.mediator_naam) registreer(classificatie.mediator_naam, NEP_PERSONEN[_persIdx++] || '[MEDIATOR]', '[MEDIATOR]');
  if (classificatie?.notaris_naam)  registreer(classificatie.notaris_naam,  NEP_PERSONEN[_persIdx++] || '[NOTARIS]',  '[NOTARIS]');

  // Roepnaam-detectie via bestandsnamen / dossiernaam.
  // bronNamen: array van strings (bestandsnamen, dossiernaam) — doorgegeven door de caller.
  // In index.html: app.bestanden.map(f => f.name) + evt. dossier-velden.
  const _bronNamen = [
    classificatie?.dossier_naam || '',
    classificatie?.dossier_partij_a || '',
    classificatie?.dossier_partij_b || '',
    ...bronNamen,
  ].filter(Boolean);

  if (_bronNamen.length) {
    const _tussenvoegels = new Set(['van','de','den','der','het','ten','ter','al','el','bin','ul','bte']);
    const _partijen = [
      naamA ? { naam: naamA, nep: NEP_PERSONEN[0] } : null,
      naamB ? { naam: naamB, nep: NEP_PERSONEN[1] } : null,
    ].filter(Boolean);

    for (const { naam, nep } of _partijen) {
      const isObj = nep && typeof nep === 'object';
      if (!isObj) continue;

      const delen        = naam.trim().split(/\s+/);
      const formeleVn    = delen[0].toLowerCase();
      const achternamen  = delen.slice(1)
        .map(d => d.toLowerCase())
        .filter(d => d.length > 3 && !_tussenvoegels.has(d));
      if (!achternamen.length) continue;

      for (const bron of _bronNamen) {
        const bronLc  = bron.toLowerCase();
        // Achternaam aanwezig in deze bron?
        if (!achternamen.some(a => bronLc.includes(a))) continue;

        // Beperk de scan tot het segment dat de achternaam van DEZE partij bevat.
        // Voorkomt dat "Manon" uit "Peter Dikkeschei - Manon ten Brink" als roepnaam
        // van Peter wordt geregistreerd (verkeerde partij pikt het eerder op).
        const _segm = bronLc.split(/\s*[-–]\s+/);
        const scanTekst = _segm.length > 1
          ? (_segm.find(s => achternamen.some(a => s.includes(a))) || bronLc)
          : bronLc;

        // Kandidaat-roepnamen: woorden langer dan 3 tekens, niet formele voornaam,
        // niet al geregistreerd, geen achternaam-deel, geen tussenvoegsels
        const bronWoorden = scanTekst.split(/[\s\-_.,;:()[\]{}'"!?/\\]+/)
          .filter(w => w.length > 3 && !_tussenvoegels.has(w));

        for (const woord of bronWoorden) {
          if (woord === formeleVn) continue;
          if (naarAnon.has(woord)) continue;
          if (achternamen.includes(woord)) continue;

          // Roepnaam gevonden — registreer als alias voor dezelfde nep-voornaam
          naarAnon.set(woord, nep.fn);
          naarAnon.set(woord + 's', nep.fn); // bezitsvorm

          // Ook de combinaties "roepnaam + achternaamsuffix" registreren zodat bijv.
          // "Manon ten Brink" op bankrekeningen niet als onbekende derde wordt geflagd.
          const _deelLc = naam.trim().toLowerCase().split(/\s+/);
          const _naFormeleVn = _deelLc.slice(1); // alles na de formele voornaam
          if (_naFormeleVn.length > 0) {
            const _nepVol = `${nep.fn} ${nep.an}`;
            const _volCombo = woord + ' ' + _naFormeleVn.join(' ');
            if (!naarAnon.has(_volCombo)) naarAnon.set(_volCombo, _nepVol);
            // Kortere variant: sla middelnamen over, houd alleen tussenvoegsels + achternaam.
            let _ks = _naFormeleVn.length - 1;
            while (_ks > 0 && _tussenvoegels.has(_naFormeleVn[_ks - 1])) _ks--;
            if (_ks > 0) {
              const _kortCombo = woord + ' ' + _naFormeleVn.slice(_ks).join(' ');
              if (!naarAnon.has(_kortCombo)) naarAnon.set(_kortCombo, _nepVol);
            }
          }

          // naarEcht: losse nep-voornaam (nep.fn) → roepnaam, altijd.
          // nepVolledig ("Sammy Hartwijk") → roepnaam ALLEEN als de roepnaam lijkt op
          // de formele voornaam (bijv. "Peter" ≈ "Peter Adriaan"). Bij sterk afwijkende
          // roepnamen (bijv. "Manon" ≠ "Herma") blijft nepVolledig → "Herma" (formele voornaam,
          // gezet door registreer()), zodat bevindingen correct zeggen "geïntroduceerd als Herma"
          // in plaats van de misleidende "geïntroduceerd als Manon".
          const roepnaamDisplay = woord.charAt(0).toUpperCase() + woord.slice(1);
          naarEcht.set(nep.fn, roepnaamDisplay);
          naarEcht.set(nep.fn + 's', roepnaamDisplay + 's');
          if (_roepnaamLijkt(woord, naam)) {
            // Vergelijkbare roepnaam: ook nepVolledig → roepnaam (bijv. "Thomas Bergman" → "Peter")
            naarEcht.set(`${nep.fn} ${nep.an}`, roepnaamDisplay);
            // naarEchtVolledig: roepnaam + kortste achternaamsuffix (zonder middelnamen)
            // zodat passage "Peter Dikkeschei" toont ipv "Peter Adriaan Dikkeschei".
            const _naamDelen = naam.trim().split(/\s+/);
            const _naDelen   = _naamDelen.slice(1);
            const _naDeLc    = _naDelen.map(d => d.toLowerCase());
            let _ksV = _naDelen.length - 1;
            while (_ksV > 0 && _tussenvoegels.has(_naDeLc[_ksV - 1])) _ksV--;
            const _suffix = _naDelen.slice(_ksV).join(' ');         // "ten Brink" of "Dikkeschei"
            // naarEchtVolledig[nepVolledig] NIET overschrijven: registreer() heeft de formele naam
            // al gezet ("Herma Eugenie ten Brink"). Passages uit de introductiezin moeten die
            // formele documentvorm tonen, niet de roepnaam+achternaam.
          } else {
            // Sterk afwijkende roepnaam (bijv. "Dieneke" vs "Grada Berendina Roseboom"):
            // nep.fn alleen → roepnaam zodat body-tekst "Thomas betaalt" → "Dieneke betaalt".
            // nepVolledig ("Thomas Bergman") wordt NIET overschreven — registreer() heeft al
            // de formele naam ("Grada Berendina Roseboom") gezet voor intro-passages.
            naarEchtVolledig.set(nep.fn, roepnaamDisplay);
            // (geen set voor nepVolledig: formele naam uit registreer() blijft bewaard)
          }

          // Bewaar voor prompt-injectie: pseudo-namen zodat Claude het kan controleren
          // zonder dat echte namen worden blootgesteld.
          _gedetecteerdRoepnamen.push({ nepVoornaam: nep.fn, nepVolledig: `${nep.fn} ${nep.an}` });

          // Waarschuwing als roepnaam sterk afwijkt van formele naam
          if (!_roepnaamLijkt(woord, naam)) {
            const dispWoord = woord.charAt(0).toUpperCase() + woord.slice(1);
            // Alleen toevoegen als niet al gedetecteerd via Haiku-blok
            if (!waarschuwingen.some(w => w.roepnaam.toLowerCase() === woord)) {
              waarschuwingen.push({ roepnaam: dispWoord, formeelVolledig: naam });
            }
          }

          break; // Eerste kandidaat per partij per bron is genoeg
        }
        break; // Eerste bron met achternaam is genoeg
      }
    }
  }

  return { naarAnon, naarEcht, naarEchtVolledig, roepnamen: _gedetecteerdRoepnamen, waarschuwingen };
}

// ── anonimiseerTekst ──────────────────────────────────────────────────────────
// Vervang namen en gevoelige PII in platte tekst door placeholders.
// piiPh: optionele getPh(type, value)-functie van _maakPiiTracker() voor
//        genummerde en terugzetbare adres-/postcode-placeholders.
//        Zonder piiPh worden adressen/postcodes/woonplaatsen NIET geanonimiseerd.
export function anonimiseerTekst(tekst, naarAnon, piiPh = null) {
  // Alleen op lege tekst meteen terug. Tot 24 augustus 2026 stond hier ook
  // `|| !naarAnon?.size`, en dat had een gevolg dat niemand bedoelde: vond de
  // classificatie geen enkele naam, dan werd de tekst ONGEWIJZIGD teruggegeven —
  // dus ook zonder dat adres, postcode, BSN, telefoonnummer en e-mailadres waren
  // vervangen. Die gingen dan onbewerkt naar de Anthropic API. Een lege namenmap
  // is geen reden om de PII-vervanging over te slaan; het zijn twee losse dingen.
  if (!tekst) return tekst;
  let t = tekst;

  // Namen: langste eerst (voorkomt dat voornaam ná volledige naam matcht).
  // Vervang case-insensitief via regex; naarAnon-keys zijn al lowercase.
  // Gebruik (?<![a-zA-ZÀ-ÿ]) / (?![a-zA-ZÀ-ÿ]) als woordgrens zodat accenten
  // en samengestelde namen correct worden behandeld.
  // Geen of lege map: geen namen te vervangen, maar de PII-stappen hieronder draaien wél.
  const gesorteerd = naarAnon?.size
    ? [...naarAnon.entries()].sort((a, b) => b[0].length - a[0].length)
    : [];
  for (const [echtLc, ph] of gesorteerd) {
    try {
      // Escape regex-speciale tekens in de naam
      const rx = new RegExp(
        '(?<![A-Za-zÀ-ÿ])' + echtLc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-zÀ-ÿ])',
        'gi'
      );
      t = t.replace(rx, ph);
    } catch { /* ongeldige naam — overslaan */ }
  }

  // PII-patronen:
  // - IBANs vervangen door genummerde placeholders [IBAN_0], [IBAN_1], ... (AVG).
  //   De server herkent ze via de uitgebreide IBAN_RE die ook [IBAN_n] matcht.
  //   Alleen als piiPh aanwezig (= server-gebonden aanroepen); passage-normalisatie-aanroepen
  //   gebruiken naarAnon dat na de eerste aanroep de IBAN-mapping al bevat.
  // Patroon uit src/iban-patroon.js — laat witruimte toe. Stond hier eerder zonder,
  // waardoor "NL28 RABO 0328582298" niet werd herkend en de tien resterende cijfers
  // even verderop als telefoonnummer werden gemaskeerd.
  // Sleutel op de spatieloze vorm, zodat dezelfde rekening altijd hetzelfde nummer krijgt.
  if (piiPh) t = t.replace(ibanRe(), iban => piiPh('IBAN', ibanSleutel(iban)));
  // - Rekeningnummers die geen IBAN zijn: beleggingsrekeningen ("NL046344501") en de
  //   oude puntnotatie ("60.75.97.461"). Die vielen buiten ibanRe en gingen dus
  //   onbewerkt naar de API — zie de toelichting in src/iban-patroon.js.
  //   NA de IBAN-stap, zodat echte IBANs hier al vervangen zijn.
  if (piiPh) t = t.replace(rekeningOverigRe(), nr => piiPh('REKENING', rekeningSleutel(nr)));
  // - BSN maskeren: uniek persoonskenmerk, nooit nodig voor analyse.
  // - Lookbehind (?<![A-Z]{4} ): voorkomt false positive op IBAN-accountcijfers
  //   (bankcode is altijd 4 hoofdletters, bijv. ABNA). "BSN 123456789" wordt WEL
  //   vervangen — "BSN" heeft maar 3 letters.
  t = t.replace(/(?<![A-Z]{4} )\b\d{9}\b/g, '[BSN]');

  if (piiPh) {
    // Straatnamen + huisnummer VOOR postcode (postcode-regex mag geen straatdelen opslokken).
    // Vangt samengestelde namen eindigend op gangbare straat-suffixen.
    // Het optionele woord vóór de straatnaam moet met een HOOFDLETTER beginnen.
    // Zonder die eis slokte het patroon een willekeurig voorafgaand woord op:
    // "Bergstraat 12 en Bergstraat 12" leverde "Bergstraat 12" én "en Bergstraat 12"
    // op, dus twee verschillende placeholders voor hetzelfde adres — waarna een
    // analyse twee woningen kon zien waar er één staat. "Van Goghstraat 5" en
    // "Prof Zeemanweg 14" blijven wél heel; lidwoorden als "de" horen niet in de
    // placeholder en blijven gewoon in de tekst staan.
    t = t.replace(/\b(?:[A-Z][\w'-]*\s+)?\w+(?:straat|laan|weg|plein|park|singel|gracht|kade|dijk|hof|dreef|steeg|boulevard|allee)\s+\d+[a-zA-Z]?\b/g,
      adres => piiPh('ADRES', adres.trim()));
    // Nederlandse postcodes: 1234AB of 1234 AB
    t = t.replace(/\b(\d{4})\s?([A-Z]{2})\b/g,
      (_, d, l) => piiPh('POSTCODE', `${d} ${l}`));
    // Woonplaats direct na postcode-placeholder: "[POSTCODE_0] Almelo"
    t = t.replace(/(\[POSTCODE_\d+\])\s+([A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,})?)/g,
      (_, ph, stad) => `${ph} ${piiPh('WOONPLAATS', stad.trim())}`);
    // Woonplaats na "wonende te / woonachtig te / gevestigd te" — óók met "in".
    // "woonachtig in Holten" glipte erdoor omdat het patroon alleen "te" kende.
    //
    // GEEN i-vlag, en het ankerwoord daarom met de hoofdletter erin geschreven. Met /i
    // wordt namelijk óók `[A-Z]` hoofdletterongevoelig, en dan matcht het tweede,
    // optionele naamdeel gewoon het volgende woord: "wonende te Holten wordt verkocht"
    // ving "Holten wordt" als plaatsnaam en verving beide door één placeholder. Er
    // verdween dus tekst uit het document dat naar Claude gaat — niet alleen een
    // plaatsnaam. Die vlag stond hier vanaf het begin; gevonden op 5 september 2026 met
    // een testbatterij die ook de gevallen bevatte die níét vervangen mogen worden.
    t = t.replace(/\b([Ww]oonachtig|[Ww]onende?|[Gg]evestigd|[Gg]edomicilieerd|[Ii]ngeschreven)\s+(te|in)\s+(?!\[)([A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,})?)/g,
      (heel, prefix, vz, stad) => (NIET_WOONPLAATS.test(stad.trim())
        ? heel
        : `${prefix} ${vz} ${piiPh('WOONPLAATS', stad.trim())}`));

    // Woonplaats bij de woning zelf: "de echtelijke woning is gelegen te Holten",
    // "de woning te Holten wordt verkocht". Dit is in een convenant de gangbaarste
    // aanduiding van de echtelijke woning en werd door geen enkel patroon geraakt: die
    // vragen om een postcode, om "wonende te", of om een adres-placeholder ervóór.
    // Gevonden op 5 september 2026, doordat de residu-controle "Holten" bleef melden.
    //
    // Verankerd aan een woord dat over een woning gaat. Een los "te <Hoofdletter>" is
    // bewust níét genoeg — dat komt in juridische tekst overal voor ("te zijner tijd",
    // "de rechtbank te Deventer"), en dat laatste is bovendien geen persoonsgegeven maar
    // wel een gegeven dat de analyse nodig heeft.
    // Ook hier geen i-vlag — zie de toelichting hierboven. "De woning wordt te koop
    // gezet" liet met /i het woord "koop" als plaatsnaam vervangen.
    t = t.replace(/\b([Gg]elegen|[Ww]oning|[Ww]oonhuis|[Pp]and)\b([^.;]{0,25}?\b(?:te|in)\s+)(?!\[)([A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,})?)/g,
      (heel, anker, tussen, stad) => (NIET_WOONPLAATS.test(stad.trim())
        ? heel
        : `${anker}${tussen}${piiPh('WOONPLAATS', stad.trim())}`));
    // Woonplaats direct na een adres-placeholder: "[ADRES_0] te Utrecht", ook zonder "te".
    // Dit is de gangbaarste vorm in een convenant ("de woning aan de Bergstraat 12 te
    // Utrecht") en werd tot 24 augustus 2026 door geen van de patronen hierboven geraakt:
    // die vragen om een postcode ervóór of om "wonende te". De plaatsnaam ging dus mee.
    // Verankerd aan de placeholder, want een los "te <Hoofdletter>" komt te vaak voor.
    // Het tussenwoord wordt teruggezet zoals het er stond — een "te" toevoegen die er
    // niet was verandert de documenttekst zonder reden.
    t = t.replace(/(\[ADRES_\d+\])(\s+(?:te\s+)?)(?!\[)([A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,})?)/g,
      (heel, ph, tussen, stad) => (/^(De|Het|Een|Partijen|Deze|Dit)$/.test(stad.split(/\s+/)[0])
        ? heel                                            // zinsbegin, geen plaatsnaam
        : `${ph}${tussen}${piiPh('WOONPLAATS', stad.trim())}`));
  }

  // Geboortedatum, geboorteplaats, werkgever en adressen zonder straatsuffix.
  // Ná de naam- en adresvervanging: die zetten placeholders neer waar deze patronen
  // omheen werken ("geboren te [WOONPLAATS_0]" mag niet nog eens worden gevangen).
  t = vervangPersoonsdetails(t, piiPh);

  // ── Plaatsnamen op naam herkend, als laatste vangnet ───────────────────────
  //
  // De patronen hierboven herkennen de CONTEXT ("geboren te", "wonende te", "de woning
  // gelegen te"), en context is onbegrensd. Gemeten op 5 september 2026: van dertien
  // gewone convenantformuleringen met een plaatsnaam erin lekten er twaalf — de
  // dagtekening ("Holten, 12 maart 2026"), het kadaster ("gemeente Holten, sectie C"),
  // de notaris ("ten overstaan van notaris mr. X te Deventer"), "verhuist naar",
  // "blijft in … wonen". Elk daarvan een nieuw ankerwoord geven is dweilen.
  //
  // Deze stap draait het om: herken de plaats zelf, waar hij ook staat. Bewust ná de
  // ankers, zodat het specifiekere type wint — "geboren te Deventer" wordt
  // [GEBOORTEPLAATS_0] en niet [WOONPLAATS_0], en dat onderscheid staat in de prompt.
  //
  // Wat deze lijst niet dekt (buitenlandse plaatsen, verdwenen namen, spellingsvarianten)
  // blijft de taak van de ankers, en wat geen van beide vangt meldt src/avg/residu.js.
  // Zie de toelichting in src/avg/woonplaatsen.js.
  //
  // OVERWOGEN EN NIET GEDAAN: alleen vervangen als er in dezelfde zin een persoonsnaam,
  // postcode of straatnaam staat. Dat sluit aan bij B1 — een plaats identificeert niet
  // op zichzelf maar in combinatie — en het is hier goedkoop te bouwen, want die drie
  // staan er op dit punt al als placeholder. Niet gedaan omdat de meting geen
  // overmatching laat zien (op de vijf golden fixtures: vier treffers, alle vier een
  // echte plaats) én omdat het precies de gevallen kost waarvoor deze stap er is: de
  // dagtekening "Holten, 12 maart 2026" en "kadastraal bekend gemeente Holten" hebben
  // geen naam of adres in dezelfde zin. Blijkt er later wél overmatching, dan is dit de
  // eerstvolgende knop.
  // NIET_WOONPLAATS geldt óók hier, en dat is niet vanzelfsprekend: "Nederland" is een
  // échte BAG-woonplaats (een buurtschap bij Barneveld), net als "Zeeland" in Noord-Brabant.
  // Zonder deze toets zou "partijen zijn woonachtig in Nederland" een placeholder worden
  // en viel precies het gegeven weg waarop de IPR-toets draait. Gevonden doordat een
  // bestaande test omviel.
  if (piiPh) {
    t = t.replace(PLAATS_RE, (plaats, index, heel) => {
      if (NIET_WOONPLAATS.test(plaats)) return plaats;
      // Zittingsplaats van een gerecht blijft staan — besluit van de eigenaar, 5 september
      // 2026, omwille van de leesbaarheid van het stuk.
      //
      // De afweging, zodat ze terug te vinden is als iemand dit wil omdraaien: de
      // bevoegde rechtbank is die van de woonplaats van verweerder (art. 262 Rv), dus
      // "rechtbank te Deventer" wijst in de praktijk naar waar een partij woont — terwijl
      // die woonplaats er elders juist uit gaat. En pseudonimiseren zou de juridische
      // toets niet kosten: dezelfde plaats krijgt dezelfde placeholder, dus "woonachtig te
      // [WOONPLAATS_0] … rechtbank te [WOONPLAATS_0]" laat nog steeds zien dát het
      // dezelfde plaats is. Omdraaien is deze `if` weghalen.
      if (GERECHT_ERVOOR.test(heel.slice(Math.max(0, index - 40), index))) return plaats;
      return piiPh('WOONPLAATS', plaats);
    });
  }

  // Telefoonnummers: 06-xxxxxxxx, 0xx-xxxxxxx, +31-formaten, met spaties/streepjes
  // (?<![A-Z\d]) voorkomt dat IBAN-accountcijfers als telefoon worden gemaskeerd
  t = t.replace(/(?<![A-Z\d])(?:0[1-9]\d{1,2}[-.\s]?\d{6,8}|\+31[-.\s]?[1-9]\d{8}|06[-.\s]?\d{8})(?!\d)/g, '[TEL]');
  // E-mailadressen
  t = t.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  return t;
}
