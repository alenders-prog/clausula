// api/_feiten.js
// Deterministisch: juridische feiten extraheren, injecteren en valideren.
// Geen Claude-aanroepen, geen externe dependencies — puur op basis van dossierdata.
// Geëxporteerd zodat unit-tests elk onderdeel afzonderlijk kunnen raken.

// ── Patronen ──────────────────────────────────────────────────────────────────

const HV_PATRONEN = [
  { regex: /koude\s+uitsluiting/i,               waarde: 'koude_uitsluiting' },
  { regex: /beperkte\s+gemeenschap/i,             waarde: 'beperkte_gemeenschap' },
  { regex: /algehele\s+gemeenschap/i,             waarde: 'algehele_gemeenschap' },
  { regex: /gemeenschap\s+van\s+goederen/i,       waarde: 'algehele_gemeenschap' },
  { regex: /periodiek\s+verrekenbeding/i,         waarde: 'periodiek_verrekenbeding' },
  { regex: /finaal\s+verrekenbeding/i,            waarde: 'finaal_verrekenbeding' },
];

const RELATIE_PATRONEN = [
  { regex: /samenwon(?:en|ers|end)/i,             waarde: 'samenwoners' },
  { regex: /wonen\s+samen/i,                       waarde: 'samenwoners' },
  { regex: /geregistreerd\s+partnerschap/i,       waarde: 'geregistreerd_partnerschap' },
];

// Woning-eigenaar: "man heeft woning aangebracht", "woning op naam van man", etc.
const WONING_MAN_PATRONEN = [
  /woning\s+op\s+naam\s+van\s+(?:de\s+)?man/i,
  /(?:de\s+)?man\s+(?:heeft\s+)?(?:de\s+)?woning\s+aangebracht/i,
  /staat\s+van\s+aanbrengsten.*?(?:de\s+)?man.*?woning/i,
  /staat\s+van\s+aanbrengsten.*?woning.*?(?:de\s+)?man/i,
  /woning\s+(?:is\s+)?(?:privébezit|eigendom)\s+van\s+(?:de\s+)?man/i,
];

const WONING_VROUW_PATRONEN = [
  /woning\s+op\s+naam\s+van\s+(?:de\s+)?vrouw/i,
  /(?:de\s+)?vrouw\s+(?:heeft\s+)?(?:de\s+)?woning\s+aangebracht/i,
  /staat\s+van\s+aanbrengsten.*?(?:de\s+)?vrouw.*?woning/i,
  /staat\s+van\s+aanbrengsten.*?woning.*?(?:de\s+)?vrouw/i,
  /woning\s+(?:is\s+)?(?:privébezit|eigendom)\s+van\s+(?:de\s+)?vrouw/i,
];

// ── Laag 1a: resolvedFields verrijken vanuit vrije tekst ──────────────────────

export function verrijkResolvedFields(resolvedFields = {}, dossierContext = '') {
  const tekst = [dossierContext, ...Object.values(resolvedFields)].join(' ');
  const result = { ...resolvedFields };

  // HV-stelsel: structuurveld heeft prioriteit, anders extraheer uit tekst
  if (!result.hv_stelsel) {
    for (const { regex, waarde } of HV_PATRONEN) {
      if (regex.test(tekst)) { result.hv_stelsel = waarde; break; }
    }
  }

  // Relatievorm: idem
  if (!result.relatievorm) {
    for (const { regex, waarde } of RELATIE_PATRONEN) {
      if (regex.test(tekst)) { result.relatievorm = waarde; break; }
    }
  }

  // Woning-eigenaar: alleen extraheer als nog onbekend
  if (!result.woning_eigenaar) {
    if (WONING_MAN_PATRONEN.some(p => p.test(tekst)))   result.woning_eigenaar = 'man';
    else if (WONING_VROUW_PATRONEN.some(p => p.test(tekst))) result.woning_eigenaar = 'vrouw';
  }

  return result;
}

// ── Laag 1b: feiten + belang-analyse blok samenstellen ───────────────────────
// De [BELANG-ANALYSE] vertelt Claude concreet of een convenant-bepaling relevant is.
// Zo hoeft de system-prompt geen feiten meer te infereren — die staan er al.

export function bouwFeitenBlok(rijkeFields = {}) {
  const feiten  = [];
  const belang  = [];

  const hv          = (rijkeFields.hv_stelsel          || '').toLowerCase();
  const relatie     = (rijkeFields.relatievorm          || '').toLowerCase();
  const uitsl       = (rijkeFields.uitsluitingsclausule || '').toLowerCase();
  const pensioenVer = (rijkeFields.pensioen_verevening  || '').toLowerCase();
  const co          = rijkeFields.co_ouderschap;
  const eigenaar    = rijkeFields.woning_eigenaar; // 'man' | 'vrouw' | undefined

  // ── Vermogensregime ──────────────────────────────────────────────────────────
  if (hv.includes('koude') || hv.includes('uitsluiting')) {
    feiten.push(
      'Vermogensregime: KOUDE UITSLUITING.',
      'Elk vermogensbestanddeel is privébezit van de inbrenger/verwerver.',
      '"Gezamenlijk eigendom" is NOOIT de default-aanname — uitsluitend als beide namen aantoonbaar op de akte staan.',
      'Privéschuld van partij A is niet de schuld van partij B (geen mede-aansprakelijkheid als default).',
    );

    if (eigenaar === 'man') {
      feiten.push('Woning: privébezit man (aangebracht; koude uitsluiting).');
      belang.push(
        'Woning na ontbinding: uitsluitend belang van de man. Vrouw heeft geen eigendomsrecht, geen aanspraak op verkoopopbrengst.',
        'Risico\'s rond de woning (huurbescherming, hypotheekbeding) zijn het eigenrisico van de man.',
        'CONVENANT-CONCLUSIE: een bepaling over gebruik of ingebruikgeving van de woning hoort NIET in het convenant — het is het eigenrisico van de man. Na de ontbinding beslist de man autonoom.',
      );
    } else if (eigenaar === 'vrouw') {
      feiten.push('Woning: privébezit vrouw (aangebracht; koude uitsluiting).');
      belang.push(
        'Woning na ontbinding: uitsluitend belang van de vrouw. Man heeft geen eigendomsrecht, geen aanspraak op verkoopopbrengst.',
        'CONVENANT-CONCLUSIE: een bepaling over de woning hoort NIET in het convenant vanuit mans perspectief — het is het eigenrisico van de vrouw.',
      );
    } else {
      belang.push(
        'Woning-eigenaar: onbekend (niet expliciet in dossier). Bij koude uitsluiting is woning privébezit van de inbrenger.',
        'CONVENANT-CONCLUSIE: stel eerst vast wie de woning heeft aangebracht voordat je een convenant-aanbeveling doet.',
      );
    }

  } else if (hv.includes('beperkt')) {
    feiten.push(
      'Vermogensregime: BEPERKTE GEMEENSCHAP (huwelijk na 1-1-2018).',
      'Privévermogen vóór huwelijk en erfenissen/schenkingen blijven privé; schulden vóór huwelijk zijn privéschulden.',
    );
  } else if (hv.includes('algehele') || hv.includes('gemeenschap')) {
    feiten.push(
      'Vermogensregime: ALGEHELE GEMEENSCHAP (huwelijk vóór 1-1-2018).',
      'In beginsel valt alles in de gemeenschap, tenzij uitdrukkelijk privé (uitsluitingsclausule, verknochtheid).',
    );
  } else if (hv.includes('periodiek')) {
    feiten.push(
      'Vermogensregime: PERIODIEK VERREKENBEDING.',
      'Nooit verrekend → Stolp-jurisprudentie (HR 2000): gehele aanwezige vermogen wordt vermoed uit niet-verrekend inkomen te bestaan.',
    );
  } else if (hv.includes('finaal')) {
    feiten.push(
      'Vermogensregime: FINAAL VERREKENBEDING.',
      'Verrekening bij scheiding/overlijden alsof gemeenschap bestond, tenzij HV anders bepalen.',
    );
  }

  // ── Relatievorm ──────────────────────────────────────────────────────────────
  if (relatie.includes('samenwon')) {
    feiten.push(
      'Relatievorm: SAMENWONERS.',
      'Geen WVPS, geen partneralimentatie (art. 1:157 BW), geen art. 1:88 BW, geen wettelijke gemeenschap.',
      'Aanspraken uitsluitend via samenlevingscontract of art. 6:212 BW.',
    );
    belang.push('WVPS en partneralimentatie zijn NIET van toepassing — genereer daar geen signalen over.');
  } else if (relatie.includes('geregistreerd')) {
    feiten.push('Relatievorm: GEREGISTREERD PARTNERSCHAP — gelijkgesteld aan huwelijk voor WVPS, art. 1:88 BW en partneralimentatie.');
  }

  // ── Uitsluitingsclausule ──────────────────────────────────────────────────────
  if (uitsl === 'ja' || uitsl === 'aanwezig') {
    feiten.push('Uitsluitingsclausule aanwezig: erfenis/schenking ontvangen met uitsluitingsclausule is privébezit van de ontvanger.');
    belang.push('Erfenis/schenking met uitsluitingsclausule: andere partij heeft geen aanspraak op dit vermogen of de opbrengst ervan.');
  }

  // ── Pensioenverevening ────────────────────────────────────────────────────────
  if (pensioenVer.includes('uitgeslo') || pensioenVer === 'nee' || pensioenVer === 'geen') {
    feiten.push('Pensioenverevening: NIET van toepassing.');
    belang.push('Genereer geen signalen over pensioenrechten of verevening van de andere partij.');
  }

  // ── Co-ouderschap ─────────────────────────────────────────────────────────────
  if (co === true || co === 'ja' || String(co) === 'true') {
    feiten.push(
      'Co-ouderschap 50/50: IACK, WKB en kinderbijslag vereisen splitsing.',
      'Hoofdverblijf voor BRP bij één ouder (HR 2021, ECLI:NL:HR:2021:1513).',
    );
  }

  // ── Blok samenstellen ─────────────────────────────────────────────────────────
  if (!feiten.length && !belang.length) return '';

  const delen = [];
  if (feiten.length) {
    delen.push(
      '[JURIDISCHE FEITEN — vastgesteld uit dossier; behandel als harde feiten bij aannames én signalen]\n' +
      feiten.map(f => `- ${f}`).join('\n') + '\n[/JURIDISCHE FEITEN]',
    );
  }
  if (belang.length) {
    delen.push(
      '[BELANG-ANALYSE — gebruik als leidraad voor de convenant-afweging]\n' +
      belang.map(b => `- ${b}`).join('\n') + '\n[/BELANG-ANALYSE]',
    );
  }
  return delen.join('\n\n');
}

// ── Kenmerk-mapping (spiegelt _kenmerkNaarResolvedFields in index.html) ──────
// Zet situatie_kenmerken-array (bijv. ['koude_uitsluiting', 'gehuwd']) om naar
// een resolvedFields-object. Wordt server-side gebruikt in ai-assistent.js.

export function kenmerkNaarFields(kenmerken = []) {
  const rf = {};
  for (const k of kenmerken) {
    if      (k.includes('gehuwd') && !k.includes('huwelijkse')) rf.relatievorm = 'gehuwd';
    else if (k.includes('geregistreerd'))                        rf.relatievorm = 'geregistreerd partnerschap';
    else if (k.includes('samenwon') || k === 'samenwoners')      rf.relatievorm = 'samenwoners';
    else if (k.includes('ongehuwd') || k.includes('geen_contract')) rf.relatievorm = 'ongehuwd zonder contract';

    if      (k === 'geen_kinderen')                              rf.kinderen_minderjarig = 'nee';
    else if (k.includes('kinderen') && k !== 'geen_kinderen')   rf.kinderen_minderjarig = 'ja';
    if      (k === 'kinderen_co_ouderschap')                     rf.co_ouderschap = 'ja';

    if      (k === 'eigen_woning' || k === 'woning_eigen')       rf.eigen_woning = 'ja';
    else if (k.includes('geen_eigen') || k === 'huurwoning')     rf.eigen_woning = 'nee';
    if      (k.startsWith('woning_bestemming_'))                 rf.woning_bestemming = k.replace('woning_bestemming_', '').replace(/_/g, ' ');

    if      (k === 'koude_uitsluiting')  { rf.huwelijkse_voorwaarden = 'ja'; rf.hv_stelsel = 'koude uitsluiting'; }
    else if (k === 'verrekenbeding')     { rf.huwelijkse_voorwaarden = 'ja'; rf.hv_stelsel = 'verrekenbeding'; }
    else if (k === 'huwelijkse_voorwaarden' && !rf.huwelijkse_voorwaarden) rf.huwelijkse_voorwaarden = 'ja';
    if      (k === 'uitsluitingsclausule' && !rf.uitsluitingsclausule) rf.uitsluitingsclausule = 'ja';
    if      (k.includes('gemeenschap') && !k.includes('huwelijkse')) rf.huwelijkse_voorwaarden = 'nee';

    if      (k.startsWith('bedrijf') || k.includes('ondernemer')) rf.ondernemer = 'ja';
    if      (k.includes('pensioen_verevening')) rf.pensioen_verevening = 'ja';
    else if (k.includes('pensioen'))            rf.pensioen = 'ja';
    if      (k === 'partneralimentatie_ja' || k === 'partneralimentatie') rf.partneralimentatie = 'ja';
    else if (k === 'partneralimentatie_nee')    rf.partneralimentatie = 'nee';
    if      (k.includes('internationaal'))      rf.internationaal_element = 'ja';
  }
  if (!rf.relatievorm && rf.huwelijkse_voorwaarden === 'ja') {
    rf.relatievorm = 'gehuwd of geregistreerd partnerschap';
  }
  return rf;
}

// ── Laag 2: post-processing consistentievalidatie ─────────────────────────────
// Verwijdert aantoonbaar onjuiste signalen op basis van vastgestelde feiten.

export function valideerConsistentie(output, rijkeFields = {}) {
  const hv          = (rijkeFields.hv_stelsel          || '').toLowerCase();
  const relatie     = (rijkeFields.relatievorm          || '').toLowerCase();
  const pensioenVer = (rijkeFields.pensioen_verevening  || '').toLowerCase();
  const aannames    = (output.aannames || []).join(' ').toLowerCase();

  const isPrivébezit = hv.includes('koude') || hv.includes('uitsluiting') ||
    aannames.includes('privébezit') || aannames.includes('koude uitsluiting');
  const isSamenwoners       = relatie.includes('samenwon');
  const pensioenUitgesloten = pensioenVer.includes('uitgeslo') ||
    pensioenVer === 'nee' || pensioenVer === 'geen';

  output.signalen = (output.signalen || []).filter(s => {
    const t = s.tekst.toLowerCase();

    // Privébezit: verwijder signalen die niet-eigenaar als gerechtigde/aansprakelijke aanmerken
    if (isPrivébezit) {
      const isWrong =
        (t.includes('mede-eigenaar') ||
         t.includes('gerechtigde') ||
         t.includes('verkoopopbrengst') ||
         t.includes('belang bij de woning') ||
         (t.includes('aansprakelijk') && t.includes('hypotheek'))) &&
        (s.perspectief === 'balans' || s.perspectief === 'financieel');
      if (isWrong) {
        console.warn('[_feiten] verwijderd (privébezit-contradictie):', s.tekst.slice(0, 80));
        return false;
      }
    }

    // Samenwoners: WVPS en partneralimentatie zijn niet van toepassing
    if (isSamenwoners) {
      const isWrong =
        t.includes('pensioenverevening') ||
        t.includes('wvps') ||
        (t.includes('partneralimentatie') && !t.includes('geen recht'));
      if (isWrong) {
        console.warn('[_feiten] verwijderd (samenwoners-contradictie):', s.tekst.slice(0, 80));
        return false;
      }
    }

    // Pensioen uitgesloten
    if (pensioenUitgesloten && t.includes('pensioenverevening') && !t.includes('uitgesloten')) {
      console.warn('[_feiten] verwijderd (pensioen-contradictie):', s.tekst.slice(0, 80));
      return false;
    }

    return true;
  });

  return output;
}
