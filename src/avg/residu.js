/**
 * src/avg/residu.js — wat er ná het anonimiseren nóg identificerend uitziet.
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * `naam-anonimiseer.js` vervangt wat het herként: namen uit de classificatie, IBAN, BSN,
 * postcode, adres, e-mail, telefoon, en sinds 4 september 2026 ook geboortedatum,
 * geboorteplaats, huwelijksplaats en werkgever (`persoonsdetails.js`).
 *
 * "Wat het herkent" is de hele beperking. Twee gaten die geen patroon dicht:
 *
 *   1. **Een naam die de classificatie niet ophaalde.** Nagespeeld op 4 september 2026:
 *      een convenantalinea ging er schoon uit op één woord na — "Jochem", de voornaam van
 *      een kind dat niet in de namenkaart stond. Er was geen enkel signaal dat dat gebeurde.
 *
 *   2. **Herleidbaarheid zonder patroon.** "de vrouw werkt als tandarts in het dorp waar
 *      beide partijen zijn opgegroeid" bevat geen naam, geen datum en geen adres, en is toch
 *      tot één persoon te herleiden. Daar bestaat geen regel voor — niet hier, en niet in
 *      enig ander regelgebaseerd systeem.
 *
 * Deze module lost gat 1 op en maakt gat 2 zichtbaar in plaats van het te verzwijgen.
 *
 * ── WAT DIT WEL EN NIET IS ──────────────────────────────────────────────────
 *
 * Dit is een **meting, geen garantie**. Nul residu betekent "geen van de patronen hieronder
 * vond nog iets", niet "deze tekst is niet herleidbaar". Dat onderscheid hoort ook in de
 * tekst die de mediator te zien krijgt: de app mag zeggen dát er gecontroleerd is en wat er
 * gevonden werd — niet dat het document "volledig geanonimiseerd" is. Die belofte kon nooit
 * worden waargemaakt en staat daarom niet meer in de app.
 *
 * ── DE AFWEGING DIE DE DREMPEL BEPAALT ──────────────────────────────────────
 *
 * Een hoofdlettermelder die álles meldt is waardeloos: een convenant staat vol met
 * "Rabobank", "Belastingdienst", "Gerechtshof Arnhem-Leeuwarden". Die verdwijnen in de ruis
 * en dan wordt de melding genegeerd — precies het lot van elke waarschuwing die te vaak
 * afgaat.
 *
 * Daarom een woordenlijst (`BEKEND`) van wat in dit domein normaal met een hoofdletter
 * staat. Gemeten op de vijf golden fixtures ná anonimisering: zie
 * `tests/unit/residu.test.js`, die de valse-positieventelling vastlegt zodat een
 * uitbreiding van de lijst aantoonbaar helpt in plaats van vermoedelijk.
 *
 * De lijst is bewust ruim aan de kant van "niet melden". Een gemiste voornaam is erg, maar
 * een melder die niemand meer leest mist ze allemaal.
 */

/** Placeholder van de anonimisering zelf — nooit residu. */
const PLACEHOLDER = /\[[A-Z_]+(?:_\d+)?\]/g;

/**
 * Wat in een Nederlands scheidingsdossier normaal met een hoofdletter staat en géén
 * persoonsgegeven is. Kleingeschreven opgeslagen; de vergelijking is hoofdletterloos.
 */
const BEKEND = new Set(`
artikel artikelen bijlage bijlagen hoofdstuk lid sub aanhef
januari februari maart april mei juni juli augustus september oktober november december
maandag dinsdag woensdag donderdag vrijdag zaterdag zondag
partijen partij man vrouw echtgenoot echtgenote ouders ouder kind kinderen
de het een en of maar want dus als dat die deze dit dan er is zijn was waren wordt worden
bw rv wetboek burgerlijk rechtsvordering wet awr wwft avg
rechtbank gerechtshof raad hoge hof kanton familie jeugdrecht
notaris mediator advocaat accountant makelaar taxateur
mfn nmi adr nvm nba kifid
belastingdienst kadaster kamer koophandel svb uwv cbs cak duo
rabobank abn amro ing sns asn triodos knab bunq regiobank volksbank
nationale nederlanden aegon achmea centraal beheer zilveren kruis vgz cz menzis
peildatum peiljaar boedel gemeenschap huwelijkse voorwaarden convenant
ouderschapsplan echtscheiding scheiding verdeling verrekening alimentatie
partneralimentatie kinderalimentatie hoofdverblijf omgang zorgregeling
woning hypotheek pand levering eigendom overwaarde restschuld
pensioen ouderdomspensioen nabestaandenpensioen wvps waardeoverdracht conversie
box eigenwoningforfait aftrek eigenwoningreserve
euro eur nederland nederlandse
verzoekschrift beschikking vonnis akte uittreksel gba brp
consideransen overwegende komen overeen aldus opgemaakt getekend
`.trim().split(/\s+/));

/** Vaste voorvoegsels: "Van der Meer" begint bij "Van", niet bij "Meer". */
const TUSSENVOEGSEL = /^(?:van|de|der|den|ter|te|ten|het|op|in|'t|aan)$/i;

/**
 * Zoekt wat er ná het anonimiseren nog identificerend uitziet.
 *
 * @param {string} tekst  de reeds geanonimiseerde tekst
 * @param {Iterable<string>} [pseudoniemen]
 *        de vervangnamen die de anonimisering zélf heeft ingezet — de sleutels van
 *        `naarEcht` uit `bouwAnonMap`. Zonder deze meldt de controle "Sammy Bergman" als
 *        residu, want van buiten is een pseudoniem niet van een echte naam te
 *        onderscheiden. Gemeten op de vijf golden fixtures: zonder deze parameter zes
 *        meldingen, alle zes een pseudoniem; mét deze parameter nul.
 * @returns {Array<{soort: string, waarde: string, context: string}>}
 *          `soort` is 'naam' (hoofdletterwoord dat geen bekend begrip is),
 *          'bsn' (negen losse cijfers), 'email' of 'telefoon'.
 */
export function zoekResidu(tekst, pseudoniemen = []) {
  const t = String(tekst ?? '');
  if (!t) return [];

  // Elk woord uit elk pseudoniem apart: "Sammy Bergman" komt ook los voor als "Bergman".
  const eigen = new Set();
  for (const p of pseudoniemen) {
    for (const deel of String(p).split(/\s+/)) if (deel) eigen.add(deel.toLowerCase());
  }

  // Placeholders wegmaskeren met evenveel tekens, zodat posities kloppen en de inhoud
  // ervan ("EMAIL", "GEBOORTEPLAATS") niet zelf als residu wordt gemeld.
  //
  // Het maskerteken is met opzet géén spatie. Met spaties ziet een placeholder aan het
  // begin van een regel eruit als inspringing, en dan slaat de zinsbegin-toets hieronder
  // het woord dat erop volgt over:
  //
  //     "…overeen.\n[WOONPLAATS_0] Jochem woont daar."   → Jochem werd niet gemeld
  //
  // Precies het geval dat deze module moet vangen. Een middelpunt houdt dezelfde lengte
  // — en dus dezelfde posities — maar telt niet als `\s` en niet als woordteken, zodat
  // `\b` zich gedraagt als bij een spatie. Gemeten op 5 september 2026; zie de test
  // "maskeert placeholders zonder een naam erna te verbergen".
  const MASKER = '·';
  const veilig = t.replace(PLACEHOLDER, (m) => MASKER.repeat(m.length));

  const gevonden = [];
  const gezien = new Set();
  const meld = (soort, waarde, index) => {
    const sleutel = `${soort}:${waarde.toLowerCase()}`;
    if (gezien.has(sleutel)) return;
    gezien.add(sleutel);
    gevonden.push({
      soort,
      waarde,
      context: t.slice(Math.max(0, index - 40), index + waarde.length + 40).replace(/\s+/g, ' ').trim(),
    });
  };

  // ── Wat een patroon heeft en er tóch nog staat ────────────────────────────
  // Dit hóórt leeg te zijn. Staat er iets, dan is er een lek in de vervanging zelf —
  // ernstiger dan een gemiste voornaam.
  for (const m of veilig.matchAll(/\b\d{9}\b/g))                                meld('bsn', m[0], m.index);
  for (const m of veilig.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) meld('email', m[0], m.index);
  for (const m of veilig.matchAll(/\b(?:\+31|0)\s?6[\s-]?\d{4}\s?\d{4}\b/g))    meld('telefoon', m[0], m.index);

  // ── Hoofdletterwoorden die geen bekend begrip zijn ────────────────────────
  // Het gat dat "Jochem" liet ontsnappen. Woorden aan het begin van een zin worden
  // overgeslagen: die staan er met een hoofdletter omdat het een zin is.
  const woord = String.raw`[A-ZÀ-Þ][a-zà-öø-ÿ'\-]{1,}`;
  const reeks = new RegExp(String.raw`\b(?:${woord})(?:\s+(?:van|de|der|den|ter|te|ten|het|'t)\s+${woord}|\s+${woord}){0,3}\b`, 'g');

  for (const m of veilig.matchAll(reeks)) {
    const heel = m[0];
    const voor = veilig.slice(0, m.index);

    // Zinsbegin of regelbegin: een hoofdletter zegt daar niets.
    //
    // Let op wat hier NIET bij staat: de dubbele punt. Die stond er eerst wel, en toen viel
    // precies de zaak weg waarvoor deze module is gebouwd — "Uit het huwelijk is geboren:
    // Jochem ter Kulve" is de gangbaarste plek in een convenant waar een kindnaam staat.
    // De test in `residu.test.js` houdt dat vast.
    // Een opsommingsteken hoort bij het regelbegin: "- Elke week van vrijdagmiddag" is het
    // woord "elke", niet de naam Elke. Dat kost wel iets — een naam die tóch als eerste
    // woord van een opsommingsregel staat, wordt gemist. Bewust geruild: die vorm komt in
    // convenanten nauwelijks voor, en "Kinderen: Emma Visser" (zelfde regel) blijft staan.
    if (/(?:^|[.!?]|\n)[\s\-–—•*]*(?:\d+[.)])?\s*$/.test(voor)) continue;

    const delen = heel.split(/\s+/);
    // Alles bekend → geen melding. Eén onbekend deel is genoeg, want "Jochem ter Bergman"
    // heeft "ter" in de lijst staan en zou anders wegvallen.
    const onbekend = delen.filter((d) => !BEKEND.has(d.toLowerCase()) && !TUSSENVOEGSEL.test(d));
    if (onbekend.length === 0) continue;

    // Alles wat overblijft is een pseudoniem → de anonimisering heeft juist gewérkt.
    if (onbekend.every((d) => eigen.has(d.toLowerCase()))) continue;

    meld('naam', heel, m.index);
  }

  return gevonden;
}

/**
 * Korte samenvatting voor de gebruiker: `{ aantal, perSoort }`.
 * Bewust géén oordeel ("veilig" / "onveilig") — dat zou de meting weer tot een
 * garantie maken, en dat is precies wat hier niet kan.
 */
export function vatResiduSamen(residu) {
  const perSoort = {};
  for (const r of residu) perSoort[r.soort] = (perSoort[r.soort] ?? 0) + 1;
  return { aantal: residu.length, perSoort };
}
