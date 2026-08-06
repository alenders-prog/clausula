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

// ── bouwAnonMap ───────────────────────────────────────────────────────────────
// Bouwt drie maps:
//   naarAnon        : lowercase-naam → nep-naam         (voor case-insensitieve vervanging)
//   naarEcht        : nep-naam/legacy-ph → roepnaam     (korte naam voor issue-titels/tekst)
//   naarEchtVolledig: nep-naam/legacy-ph → formele naam (volledige naam voor passage-herstel)
//
// bronNamen: optionele array van bestandsnamen/dossiernamen voor roepnaam-detectie.
//   In index.html: app.bestanden.map(f => f.name)
//   In assistent-mobiel.html en tests: [] of weggelaten
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

  // Nep-namenpool als {fn, an}-objecten: voornaam en achternaam van een verkorte naam
  // ("Martijn Jasperse") krijgen elk hun EIGEN component:
  //   "martijn"  → "Thomas"   (nep.fn, alleen voornaam)
  //   "jasperse" → "Bergman"  (nep.an, alleen achternaam)
  // Resultaat: "Martijn Jasperse" → "Thomas Bergman" (één keer, niet dubbel).
  // Vroeger (string "Thomas Bergman"): beide deelvervangingen → "Thomas Bergman Thomas Bergman"
  // → Claude meldde vals alarm "dubbele naam". Fix: component-mapping per naamsdeel.
  const NEP_PERSONEN = [
    { fn: 'Thomas',   an: 'Bergman'  },
    { fn: 'Lisette',  an: 'Hartwijk' },
    { fn: 'Florian',  an: 'Oud'      },
    { fn: 'Nathalie', an: 'Wester'   },
    { fn: 'Bastiaan', an: 'Kroon'    },
    { fn: 'Eveline',  an: 'Dragt'    },
    { fn: 'Rutger',   an: 'Bakkenes' },
    { fn: 'Simone',   an: 'Veldhuis' },
    { fn: 'Jeroen',   an: 'Hoekstra' },
    { fn: 'Yvonne',   an: 'Stavast'  },
  ];
  // Kindernamen: alleen voornamen (generiek, niet herkenbaar)
  const NEP_KINDEREN = ['Finn', 'Lotte', 'Stef', 'Mila', 'Bram', 'Sofie', 'Tim', 'Emma'];
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
    // Voornaam-alias (bijv. "manon" → "Lisette")
    if (!naarAnon.has(_rnLc)) naarAnon.set(_rnLc, _nep.fn);
    if (!naarAnon.has(_rnLc + 's')) naarAnon.set(_rnLc + 's', _nep.fn);
    // Roepnaam + achternaam (bijv. "manon ten brink" → "Lisette Hartwijk")
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
    // De fn+an-combinatie ("Lisette Hartwijk") blijft formeel in naarEchtVolledig voor passage-herstel.
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
          // nepVolledig ("Lisette Hartwijk") → roepnaam ALLEEN als de roepnaam lijkt op
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
  if (!tekst || !naarAnon?.size) return tekst;
  let t = tekst;

  // Namen: langste eerst (voorkomt dat voornaam ná volledige naam matcht).
  // Vervang case-insensitief via regex; naarAnon-keys zijn al lowercase.
  // Gebruik (?<![a-zA-ZÀ-ÿ]) / (?![a-zA-ZÀ-ÿ]) als woordgrens zodat accenten
  // en samengestelde namen correct worden behandeld.
  const gesorteerd = [...naarAnon.entries()].sort((a, b) => b[0].length - a[0].length);
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
  if (piiPh) t = t.replace(/\bNL\d{2}[A-Z]{4}\d{10}\b/g, iban => piiPh('IBAN', iban));
  // - BSN maskeren: uniek persoonskenmerk, nooit nodig voor analyse.
  // - Lookbehind (?<![A-Z]{4} ): voorkomt false positive op IBAN-accountcijfers
  //   (bankcode is altijd 4 hoofdletters, bijv. ABNA). "BSN 123456789" wordt WEL
  //   vervangen — "BSN" heeft maar 3 letters.
  t = t.replace(/(?<![A-Z]{4} )\b\d{9}\b/g, '[BSN]');

  if (piiPh) {
    // Straatnamen + huisnummer VOOR postcode (postcode-regex mag geen straatdelen opslokken).
    // Vangt samengestelde namen eindigend op gangbare straat-suffixen.
    t = t.replace(/\b(?:\w+\s+)?\w+(?:straat|laan|weg|plein|park|singel|gracht|kade|dijk|hof|dreef|steeg|boulevard|allee)\s+\d+[a-zA-Z]?\b/gi,
      adres => piiPh('ADRES', adres.trim()));
    // Nederlandse postcodes: 1234AB of 1234 AB
    t = t.replace(/\b(\d{4})\s?([A-Z]{2})\b/g,
      (_, d, l) => piiPh('POSTCODE', `${d} ${l}`));
    // Woonplaats direct na postcode-placeholder: "[POSTCODE_0] Almelo"
    t = t.replace(/(\[POSTCODE_\d+\])\s+([A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,})?)/g,
      (_, ph, stad) => `${ph} ${piiPh('WOONPLAATS', stad.trim())}`);
    // Woonplaats na "wonende te / woonachtig te / gevestigd te"
    t = t.replace(/\b(woonachtig|wonende?|gevestigd|gedomicilieerd)\s+te\s+(?!\[)([A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,}(?:\s+[A-Z][a-zA-ZÀ-ÿÀ-ɏ\-]{2,})?)/gi,
      (_, prefix, stad) => `${prefix} te ${piiPh('WOONPLAATS', stad.trim())}`);
  }

  // Telefoonnummers: 06-xxxxxxxx, 0xx-xxxxxxx, +31-formaten, met spaties/streepjes
  // (?<![A-Z\d]) voorkomt dat IBAN-accountcijfers als telefoon worden gemaskeerd
  t = t.replace(/(?<![A-Z\d])(?:0[1-9]\d{1,2}[-.\s]?\d{6,8}|\+31[-.\s]?[1-9]\d{8}|06[-.\s]?\d{8})(?!\d)/g, '[TEL]');
  // E-mailadressen
  t = t.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  return t;
}
