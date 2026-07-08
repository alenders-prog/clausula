/**
 * api/analyseer.js — Edge Runtime analyse via Server-Sent Events (SSE)
 *
 * AVG-conforme architectuur:
 *   - De BROWSER pseudonimiseert de documenttekst (namen → [PERSOON_A], IBAN → [IBAN], etc.)
 *     VOORDAT de tekst naar deze server gestuurd wordt.
 *   - De SERVER ontvangt alleen pseudoniemen — nooit echte namen of BSN-nummers.
 *   - De server retourneert pseudonieme resultaten; de browser de-pseudonimiseert lokaal.
 *
 * Transport: Server-Sent Events (SSE)
 *   - Stuur per Claude-call één event zodra het klaar is:
 *       { type: 'structuur', bestandsnaam, result }
 *       { type: 'juridisch', bestandsnaam, result }
 *       { type: 'balans',    bestandsnaam, result }
 *   - Keepalive elke 5s (`: keepalive`) zodat Vercel de verbinding open houdt
 *   - Eindigen met { type: 'klaar' } of { type: 'fout', error }
 *   - Bij max_tokens: { type: 'max_tokens', bestandsnaam, tool }  (analyse gaat door)
 *   - Deduplicatie: naar de browser verplaatst (dedupIssues in index.html)
 *
 * Auth:   vereist Supabase JWT via Authorization: Bearer <token>
 * Retry:  tot 2× herpoging bij netwerk/5xx-fouten
 */

import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

// ── Hulpfunctie: JSON-fout als reguliere Response ─────────────────────────────
function errResp(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Claude helper (non-streaming, prompt-caching) met retry ──────────────────
async function askClaude(systemPrompt, userContent, tool, maxTokens = 6000, model = 'claude-sonnet-4-6') {
  const systemField = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  const messageContent = Array.isArray(userContent)
    ? userContent.map(b => b.cache
        ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } }
        : { type: 'text', text: b.text })
    : [{ type: 'text', text: userContent }];

  const body = {
    model,
    max_tokens:  maxTokens,
    system:      systemField,
    messages:    [{ role: 'user', content: messageContent }],
    tools:       [tool],
    tool_choice: { type: 'tool', name: tool.name },
  };

  let lastErr;
  for (let poging = 0; poging <= 2; poging++) {
    if (poging > 0) {
      console.warn(`[analyseer/${tool.name}] Herpoging ${poging}/2, wacht ${poging * 5}s…`);
      await new Promise(r => setTimeout(r, poging * 5000));
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'prompt-caching-2024-07-31',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.stop_reason === 'max_tokens') {
          const err = new Error(`Tokenbudget bereikt voor ${tool.name}`);
          err.isMaxTokens = true;
          throw err;
        }
        const toolUse = json.content?.find(b => b.type === 'tool_use');
        if (!toolUse) throw new Error('Claude gaf geen tool-aanroep terug.');
        return toolUse.input;
      }
      if (res.status === 400 || res.status === 401) throw new Error(`Claude fout (${res.status}): ${await res.text()}`);
      lastErr = new Error(`Claude fout (${res.status})`);
      console.warn(`[analyseer/${tool.name}] HTTP ${res.status} — herpoging…`);
    } catch (err) {
      // Gooi direct bij max_tokens of auth-fout (geen zin om opnieuw te proberen)
      if (err.isMaxTokens || err.message.startsWith('Claude fout (4') || poging === 2) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

// ── Pre-groepeer issues op gedeelde onderwerp-tekst ──────────────────────────
// Twee strategieën om verwante issues te detecteren:
//   A. LCP ≥ 15 tekens (genormaliseerd, op woordgrens afgekapt)
//      → vangt "Kinderalimentatie — volledig afwezig" + "Kinderalimentatie: bedrag …"
//   B. ≥ 2 gedeelde significante woorden (≥5 tekens, geen stopwoorden)
//      → vangt "Nihilbeding kinderalimentatie …" + "Kinderalimentatie nihilbeding …"
//        (zelfde woorden, andere volgorde — LCP = 0 maar overlap = 2 woorden)
function preGroepeerOpPrefix(issues) {
  const ERNST_ORD = { hoog: 0, midden: 1, laag: 2 };

  // Veelvoorkomende woorden die NIET als onderscheidend gelden
  const STOPWOORDEN = new Set([
    'de','het','een','van','en','in','op','bij','voor','met','aan','is','zijn',
    'als','tot','te','om','door','of','zonder','naar','dat','niet','er','die',
    'dit','ook','maar','dan','zo','nu','wel','nog','al','geen','elke','alle',
    'heeft','wordt','worden','heeft','werd','waren','zijn','over','naar','onder',
  ]);

  const normOnd = (s) => (s || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Strategie A: Longest Common Prefix (afgekapt op woordgrens)
  const lcpLen = (a, b) => {
    const na = normOnd(a), nb = normOnd(b);
    let i = 0;
    while (i < na.length && i < nb.length && na[i] === nb[i]) i++;
    while (i > 0 && na[i - 1] !== ' ') i--;
    return i;
  };

  // Strategie B: significante woorden ophalen (≥5 tekens, geen stopwoord)
  const sleutelwoorden = (s) =>
    new Set(normOnd(s).split(/\s+/).filter(w => w.length >= 5 && !STOPWOORDEN.has(w)));

  // Gecombineerde check: A óf B
  const zijnVerwant = (ondA, ondB) => {
    if (lcpLen(ondA, ondB) >= 15) return true;
    const kA = sleutelwoorden(ondA);
    const kB = sleutelwoorden(ondB);
    let raak = 0;
    for (const w of kA) if (kB.has(w)) raak++;
    return raak >= 2;
  };

  const resultaat = [];
  const gebruikt  = new Set();

  for (let i = 0; i < issues.length; i++) {
    if (gebruikt.has(i)) continue;
    const ref   = issues[i];
    const groep = [{ ...ref }];
    gebruikt.add(i);

    for (let j = i + 1; j < issues.length; j++) {
      if (gebruikt.has(j)) continue;
      const cand = issues[j];
      if (zijnVerwant(ref.onderwerp, cand.onderwerp)) {
        groep.push({ ...cand });
        gebruikt.add(j);
        console.log(`[consolidatie] merge: "${ref.onderwerp}" ↔ "${cand.onderwerp}"`);
      }
    }

    if (groep.length === 1) { resultaat.push(groep[0]); continue; }

    // Merge: zwaarste ernst, gecombineerde dimensies, meest informatieve teksten
    const merged = { ...groep[0] };
    for (let k = 1; k < groep.length; k++) {
      const o = groep[k];
      if ((ERNST_ORD[o.ernst] ?? 1) < (ERNST_ORD[merged.ernst] ?? 1)) merged.ernst = o.ernst;
      merged.dimensies  = [...new Set([...(merged.dimensies  || []), ...(o.dimensies  || [])])];
      if ((o.bevinding   || '').length > (merged.bevinding   || '').length) merged.bevinding   = o.bevinding;
      if ((o.aanbeveling || '').length > (merged.aanbeveling || '').length) merged.aanbeveling = o.aanbeveling;
      if (!merged.passage && o.passage) merged.passage = o.passage;
    }
    resultaat.push(merged);
  }

  return resultaat;
}

// ── MfN-elementen ─────────────────────────────────────────────────────────────
const MFN_ELEMENTEN = {
  convenant: [
    'Persoonsgegevens beide partijen (namen, geboortedaten, adressen)',
    'Huwelijksdatum, -gemeente en eventuele huwelijkse voorwaarden',
    'Minderjarige kinderen vermeld (namen, geboortedaten)',
    'Eigen woning: eigendom, bestemming (verkoop/toedeling) en waarde',
    'Hypotheek: overname of aflossing en ontslag hoofdelijke aansprakelijkheid',
    'Bankrekeningen en spaargeld: verdeling of verrekening',
    'Pensioenverevening conform WVPS art. 2 of schriftelijke afwijking (art. 5 WVPS)',
    'Levensverzekeringen: eigenaar, begunstiging en afkoop/voortzetting',
    'Schulden: verdeling en aansprakelijkheid naar derden',
    'Partneralimentatie: bedrag + indexering, of nihilbeding met motivering',
    'Kinderalimentatie: berekening conform Tremanormen + indexering',
    'Fiscale afwikkeling: fiscaal partnerschap tot welke datum, verdeling aanslagen/teruggaven',
    'Overig vermogen: effecten, beleggingen, crypto, overige roerende zaken',
    'Datum van ondertekening',
    'Handtekeningen beide partijen',
  ],
  ouderschapsplan: [
    'Gezag: gezamenlijk ouderlijk gezag bevestigd of verzoek eenhoofdig (art. 1:247 BW)',
    'Hoofdverblijfplaats kind aangewezen (art. 826 Rv)',
    'Zorgregeling: reguliere weekomgang gespecificeerd (dagen, tijden)',
    'Vakantieregeling: zomervakantie, andere vakanties verdeeld',
    'Feestdagen- en bijzondere dagenregeling (kerst, verjaardag, vader/moederdag)',
    'Informatie- en consultatieverplichting (art. 1:377b BW)',
    'Kinderalimentatie: berekening conform Tremanormen (art. 1:404 BW)',
    'Indexering kinderalimentatie jaarlijks',
    'School- en opleidingsbeslissingen: overleg en besluitvorming geregeld',
    'Medische beslissingen en zorgbeslissingen',
    'Omgang bij ziekte of afwezigheid (inhaalregeling of niet)',
    'Geschillenregeling of mediationclausule (art. 1:253a BW)',
  ],
};

// ── Tool-schema's ─────────────────────────────────────────────────────────────
const mfnScoreSchema = {
  type: 'object',
  properties: {
    score_aanwezig:  { type: 'integer' },
    score_totaal:    { type: 'integer' },
    elementen: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          element:     { type: 'string' },
          status:      { type: 'string', enum: ['aanwezig', 'onvolledig', 'ontbreekt'] },
          toelichting: { type: 'string' },
        },
        required: ['element', 'status'],
      },
    },
    extra_elementen: { type: 'array', items: { type: 'string' } },
  },
  required: ['score_aanwezig', 'score_totaal', 'elementen'],
};

const issueItem = {
  type: 'object',
  properties: {
    onderwerp:   { type: 'string' },
    ernst:       { type: 'string', enum: ['laag', 'midden', 'hoog'] },
    dimensies:   { type: 'array', items: { type: 'string' } },
    bevinding:   { type: 'string' },
    aanbeveling: { type: 'string' },
    // Verbatim citaat (1-2 zinnen) uit het document waarop dit issue betrekking heeft.
    // Leeg laten bij ontbrekende secties (er is niets om te citeren).
    passage: { type: 'string' },
  },
  required: ['onderwerp', 'ernst', 'dimensies', 'bevinding', 'aanbeveling'],
};

function maakStructuurTool(heeftMfn) {
  return {
    name: 'registreer_structuur',
    description: 'Registreert samenvatting, volledigheid-issues en optioneel MfN-score.',
    input_schema: {
      type: 'object',
      properties: {
        ...(heeftMfn ? { mfn_score: mfnScoreSchema } : {}),
        samenvatting: { type: 'string' },
        issues: { type: 'array', items: issueItem },
      },
      required: heeftMfn ? ['mfn_score', 'samenvatting', 'issues'] : ['samenvatting', 'issues'],
    },
  };
}

const juridischTool = {
  name: 'registreer_juridisch',
  description: 'Registreert juridische bevindingen.',
  input_schema: {
    type: 'object',
    properties: { issues: { type: 'array', items: issueItem } },
    required: ['issues'],
  },
};

const balansGramTool = {
  name: 'registreer_balans_grammatica',
  description: 'Registreert balans- en grammatica-issues.',
  input_schema: {
    type: 'object',
    properties: { issues: { type: 'array', items: issueItem } },
    required: ['issues'],
  },
};

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST') return errResp('Alleen POST toegestaan', 405);

  // ── Auth: Supabase JWT valideren ──────────────────────────────────────────
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return errResp('Niet geautoriseerd', 401);

  const authCheck = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!authCheck.ok) return errResp('Sessie verlopen — log opnieuw in', 401);

  // ── Body parsen ───────────────────────────────────────────────────────────
  let classificatie, documenten;
  try {
    const b = await req.json();
    classificatie = b.classificatie;
    documenten    = b.documenten;
  } catch {
    return errResp('Ongeldige request body', 400);
  }
  if (!classificatie || !Array.isArray(documenten) || !documenten.length) {
    return errResp('classificatie en documenten[] zijn verplicht', 400);
  }

  // ── SSE stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      // Emit één SSE-event
      const sse = (obj) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      // Keepalive: stuur elke 5s een comment zodat Vercel de stream open houdt
      const keepalive = setInterval(() => {
        try { controller.enqueue(enc.encode(': keepalive\n\n')); } catch {}
      }, 5000);

      try {
        // Supabase client — persistSession: false voorkomt gebruik van localStorage
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );

        const HOOFD_TYPES    = new Set(['convenant', 'ouderschapsplan']);
        const hoofdDocs      = documenten.filter(d => HOOFD_TYPES.has(d.type));
        const contextDocs    = documenten.filter(d => !HOOFD_TYPES.has(d.type));
        const effectiefHoofd = hoofdDocs.length ? hoofdDocs : documenten;

        const contextTekst = contextDocs
          .map(d => `=== ${d.type?.toUpperCase()}: ${d.bestandsnaam} ===\n${d.tekst}`)
          .join('\n\n');

        const situatieKenmerken = classificatie.situatie_kenmerken ?? [];
        const heeftHV = documenten.some(d => d.type === 'huwelijkse_voorwaarden');

        // ── Supabase-queries ──────────────────────────────────────────────
        const wetsQueryTags = [...new Set([
          ...situatieKenmerken,
          ...effectiefHoofd.map(d => d.type),
          ...(heeftHV ? ['huwelijkse_voorwaarden', 'verrekenbeding', 'koude_uitsluiting', 'uitsluitingsclausule'] : []),
        ])];

        const [{ data: wetteksten }, { data: standaardClausules },
              { data: tmplConvenant }, { data: tmplOuderschapsplan }] = await Promise.all([
          supabase.from('legal_chunks').select('citation, content')
            .overlaps('topic_tags', wetsQueryTags).limit(25),
          supabase.from('legal_chunks').select('citation, content')
            .eq('source_id', '10000000-0000-0000-0000-000000000001')
            .eq('chunk_index', 28).limit(1),
          supabase.from('document_templates')
            .select('section_name, required, applies_when, instructions')
            .eq('doc_type', 'convenant').order('section_order'),
          supabase.from('document_templates')
            .select('section_name, required, applies_when, instructions')
            .eq('doc_type', 'ouderschapsplan').order('section_order'),
        ]);

        const _wttAll = [...(wetteksten ?? [])];
        const _stdCit = 'Gangbare correcte standaardclausules in Nederlandse echtscheidingsdocumenten';
        if (standaardClausules?.length && !_wttAll.some(w => w.citation === _stdCit)) {
          _wttAll.push(...standaardClausules);
        }
        const wetTekst = _wttAll.map(w => `[${w.citation}] ${w.content}`).join('\n\n');

        const templatesPer = { convenant: tmplConvenant ?? [], ouderschapsplan: tmplOuderschapsplan ?? [] };

        // ── Per document analyseren — 3 parallelle calls, elk een SSE-event ──
        const analyseDoc = async (doc) => {
          const docType     = doc.type === 'onbekend' ? 'convenant' : doc.type;
          const heeftMfn    = docType === 'convenant' || docType === 'ouderschapsplan';
          const mfnElemList = heeftMfn ? (MFN_ELEMENTEN[docType] || MFN_ELEMENTEN.convenant) : [];
          const docTypLabel = docType === 'ouderschapsplan' ? 'Ouderschapsplan' : 'Echtscheidingsconvenant';

          const tmplType    = docType === 'ouderschapsplan' ? 'ouderschapsplan' : 'convenant';
          const checklist   = (templatesPer[tmplType] || []).filter(
            t => !t.applies_when || t.applies_when.every(tag => situatieKenmerken.includes(tag))
          );
          const checklistTekst = checklist.map(c => `- ${c.section_name}: ${c.instructions ?? ''}`).join('\n');

          const juridischeChecks = docType === 'ouderschapsplan' ? `
Controleer specifiek op:
1. HOOFDVERBLIJFPLAATS — Wettelijk verplicht (art. 826 Rv).
2. ZORGREGELING — Omgangstijden specifiek (welke dagen, weekenden, vakanties, feestdagen)?
3. INFORMATIEPLICHT — Opgenomen (art. 1:377b BW)?
4. KINDERALIMENTATIE — Tremanormen of gemotiveerde afwijking (art. 1:404 BW)?
5. GEZAG — Gezamenlijk gezag bevestigd of afwijking gevraagd (art. 1:247 BW)?
6. GESCHILLENREGELING — Escalatiebepaling of mediationclausule (art. 1:253a BW)?
7. INDEXERING — Kinderalimentatie jaarlijks geïndexeerd?`
            : docType === 'convenant' ? `
Controleer specifiek op:
1. PARTNERALIMENTATIE — Bedrag of nihilbeding? Bij nihilbeding: bewust en geïnformeerd (art. 1:159 BW)? Termijn max 12 jaar (art. 1:157 BW)? Indexering?
2. KINDERALIMENTATIE — Tremanormen of gemotiveerde afwijking (art. 1:404 BW)?
3. PENSIOENVEREVENING — WVPS 50/50 of schriftelijke afwijking (WVPS art. 2 en 5)?
4. WONING — Leverings-/passeerdatum? Hypotheek overname of verkoop? Ontslag aansprakelijkheid?
5. BELASTING — Fiscaal partnerschap tot welke datum? Aanslagen/teruggaven verdeeld?
6. VERMOGEN — Huwelijksgemeenschap of verrekenbeding volledig afgewikkeld (art. 1:94 en 1:121 BW)?
7. SCHULDEN — Wie neemt welke schulden over?`
            : `\nControleer op juridische juistheid, volledigheid en consistentie.`;

          const hvChecks = heeftHV ? `

HUWELIJKSE VOORWAARDEN AANWEZIG — kruiscontroles uitvoeren:
HV-A. STELSEL — Benoem het vermogensrechtelijk stelsel (koude uitsluiting / beperkte gemeenschap / verrekenbeding).
  Bij KOUDE UITSLUITING: gezamenlijk eigendom? Ten onrechte "huwelijksgemeenschap"? WVPS geldt ook bij koude uitsluiting.
  Bij VERREKENBEDING: jaarlijks nagekomen? Finale verrekening of kwijtschelding opgenomen?
HV-B. UITSLUITINGSCLAUSULES — Erfenissen/schenkingen (art. 1:94 lid 3 BW) correct buiten verdeling?
HV-C. REFERENTIE — Verwijst convenant expliciet naar huwelijkse voorwaarden (datum en notaris)?` : '';

          const mfnInstructie = heeftMfn ? `

**mfn_score** — Beoordeel op MfN-vereisten. Score_aanwezig = aantal "aanwezig". Score_totaal = ${mfnElemList.length}.
MfN-VEREISTE ELEMENTEN (${docTypLabel}):
${mfnElemList.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '';

          const docBlok = `TE ANALYSEREN DOCUMENT:\n=== ${docType.toUpperCase()}: ${doc.bestandsnaam} ===\n${doc.tekst}` +
            (contextTekst ? `\n\nBIJLAGEN (ter context — niet apart analyseren):\n${contextTekst}` : '');

          const ernstCriteria =
`Ernst-criteria (verplicht toepassen — wees terughoudend met 'hoog'):
- hoog: reserveer dit uitsluitend voor evidente wettelijke overtreding of volstrekte onuitvoerbaarheid; het document kan zo NIET worden gepasseerd of vastgelegd (bijv. verplichte WVPS-afstand volledig afwezig zonder vervangende regeling, nihilbeding kinderalimentatie voor minderjarigen zonder draagkrachtberekening).
- midden: inhoudelijk punt dat aanpassing verdient maar de kern van de afspraak intact laat (bijv. indexering ontbreekt, datum niet ingevuld, partijnaam inconsistent, onduidelijke clausule). Dit is het standaardniveau voor de meeste echte issues.
- laag: aandachtspunt, verbetersuggestie of stijlkwestie zonder materieel rechtsgevolg (bijv. vage verwijzing, alternatieve formulering, spellingsfout). Gebruik dit ruimhartig voor nuttige maar niet-urgente opmerkingen.`;

          // Waarschuwing over pseudonimisering — voorkomt valse format-validatiefouten
          const pseudonimiseringNota =
`PSEUDONIMISERING — VERPLICHTE UITSLUITINGSREGEL:
Het document is vóór verzending automatisch pseudonimiseerd. Namen, IBAN-nummers, rekeningnummers en andere identificerende gegevens zijn vervangen door nep-maar-realistische placeholders.
GEVOLG: formaat-validatie op zulke velden levert valse positieven op.
- Maak GEEN issue aan als een IBAN-nummer, rekeningnummer of BSN niet het verwachte formaat heeft — dit is hoogstwaarschijnlijk een pseudoniem.
- Maak GEEN issue aan als persoonsnamen iets afwijken van eerdere vermeldingen — de pseudonimisering kan per vermelding licht variëren.
- Controleer WEL of een waarde ONTBREEKT of INCONSISTENT is op inhoudelijk niveau (bijv. twee verschillende IBAN-nummers voor dezelfde partij over het document), maar nooit omdat het getal zelf technisch ongeldig is.`;

          // Gedeelde verificatieregel — voorkomt valse "ontbreekt"-claims maar behoudt echte fouten
          const verificatieplicht =
`VERIFICATIEPLICHT BIJ AFWEZIGHEIDSCLAIMS:
Voordat je rapporteert dat iets "ontbreekt", "niet aanwezig is" of "niet zichtbaar is":
1. Doorzoek de VOLLEDIGE documenttekst actief op het beweerde ontbrekende element.
2. Bij interne verwijzingen (bijv. "de in artikel 4.1.1 vermelde ...", "zie artikel 3.2"):
   Zoek of het gerefereerde artikelnummer ELDERS in het document voorkomt — als sectietitel, koptekst, nummeringsprefix van een lid of sub-artikel (bijv. "4.1.1" of "4.1.1." aan het begin van een alinea of opsommingspunt), of andere onderdelen van de documentstructuur BUITEN de verwijzingstekst zelf.
   - Artikelnummer komt ERGENS ANDERS in het document voor → rapporteer GEEN issue.
   - Bij TWIJFEL of het artikel ergens gedefinieerd is → rapporteer GEEN issue.
   - Alleen bij ABSOLUTE ZEKERHEID dat het nummer nergens als definitie, sectie of genummerd lid voorkomt → rapporteer een issue.
   OPGELET: het feit dat "4.1.1" in de verwijzingstekst zelf staat ("de in artikel 4.1.1 vermelde...") telt NIET als bewijs dat het artikel bestaat. Zoek naar een APARTE definitieplek.
3. Rapporteer een afwezigheid uitsluitend als je na actief zoeken bevestigt dat het er absoluut niet in staat.`;

          const sysStructuur =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert.
DOCUMENTTYPE: ${docTypLabel}
${mfnInstructie}

**issues (volledigheid)** — Rapporteer ALLEEN secties die ontbreken of onvolledig zijn. Dimensies altijd ["volledigheid"].
- Bij twijfel: geen issue. Aanwezige secties NIET rapporteren.${heeftMfn ? `\n- mfn_score.elementen MOET EXACT ${mfnElemList.length} items bevatten.` : ''}
- Vul bij elk issue het veld 'passage' met een verbatim citaat van max 1-2 zinnen. Leeg laten als een sectie volledig ontbreekt.

${pseudonimiseringNota}

${verificatieplicht}

${ernstCriteria}`;

          const sysJuridisch =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op juridische correctheid.
DOCUMENTTYPE: ${docTypLabel}

**issues (juridisch)** — Dimensies altijd ["juridisch"].${juridischeChecks}${hvChecks}

- Gebruik uitsluitend wetsartikelen uit de WETSARTIKELEN-sectie.
- Standaardclausules uit WETSARTIKELEN nooit als fout aanmerken.
- Geef bij "aanbeveling" de exacte tekst die de mediator direct kan overnemen.
- Vul bij elk issue het veld 'passage' met een verbatim citaat van max 1-2 zinnen uit het document.
- Bij twijfel: geen issue. Speculeer niet.

${pseudonimiseringNota}

${verificatieplicht}

${ernstCriteria}`;

          const sysBalansGram =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op evenwichtigheid en taal.
DOCUMENTTYPE: ${docTypLabel}

**issues (balans)** — Dimensies ["balans"]: alimentatiebedragen, eenzijdige clausules, asymmetrische indexering.
**issues (grammatica)** — Dimensies ["grammatica"]: vage verwijzingen, inconsistente datums/bedragen, onduidelijke bewoording.
**issues (conflicten)** — Dimensies ["conflicten"]: tegenstrijdige bepalingen BINNEN het document (artikel X zegt iets anders dan artikel Y over hetzelfde onderwerp).
- Vul bij elk issue het veld 'passage' met een verbatim citaat van max 1-2 zinnen uit het document.
- Bij twijfel: geen issue. Speculeer niet.

${pseudonimiseringNota}

${verificatieplicht}

${ernstCriteria}`;

          const stabielBlokWet = `WETSARTIKELEN:\n${wetTekst || '(geen)'}`;

          // Helper: roep Claude aan en stuur SSE zodra het klaar is; vang max_tokens af
          const callMetSse = (clodeFn, type) =>
            clodeFn().then(
              result => { sse({ type, bestandsnaam: doc.bestandsnaam, result }); return result; },
              err => {
                if (err.isMaxTokens) {
                  console.warn(`[analyseer] max_tokens: ${doc.bestandsnaam}/${type}`);
                  sse({ type: 'max_tokens', bestandsnaam: doc.bestandsnaam, tool: type });
                  return { issues: [] }; // leeg resultaat — analyse gaat door
                }
                throw err;
              }
            );

          // 3 parallelle Sonnet-calls — elk gefocust op één dimensie
          const [structuurR, juridischR, balansR] = await Promise.all([
            callMetSse(() => askClaude(sysStructuur, [
              { text: `VERWACHTE SECTIES:\n${checklistTekst}`, cache: true },
              { text: docBlok },
            ], maakStructuurTool(heeftMfn), heeftMfn ? 6000 : 2000), 'structuur'),

            callMetSse(() => askClaude(sysJuridisch, [
              { text: stabielBlokWet, cache: true },
              { text: docBlok },
            ], juridischTool, 5500), 'juridisch'),

            callMetSse(() => askClaude(sysBalansGram,
              docBlok,
              balansGramTool, 5000), 'balans'),
          ]);

          // ── Stap 4: Haiku-consolidatie — samenvoegen semantisch verwante issues ──
          // Na de 3 parallelle calls combineert Haiku issues die over hetzelfde
          // onderwerp gaan maar anders geformuleerd zijn (cross-call dedup).
          const _alleIssuesRaw = [
            ...(Array.isArray(structuurR?.issues) ? structuurR.issues : []),
            ...(Array.isArray(juridischR?.issues) ? juridischR.issues : []),
            ...(Array.isArray(balansR?.issues)    ? balansR.issues    : []),
          ];

          // Stap 4a: algoritmische prefix-dedup (snel, geen AI benodigd)
          const _preGroepeerd = preGroepeerOpPrefix(_alleIssuesRaw);
          console.log(`[analyseer] ${doc.bestandsnaam}: ${_alleIssuesRaw.length} → ${_preGroepeerd.length} issues na prefix-dedup`);

          if (_preGroepeerd.length > 1) {
            try {
              // Haiku geeft alleen INDICES terug (welke issues bij elkaar horen).
              // De server doet de merge zelf — output is ~50-100 tokens i.p.v. 3000+.
              const n = _preGroepeerd.length;
              const groeperenTool = {
                name: 'groepeer_issues',
                description: 'Geeft per groep samenhangende issues de indices terug.',
                input_schema: {
                  type: 'object',
                  properties: {
                    groepen: {
                      type: 'array',
                      description: `Elke subarray bevat 0-based indices van issues die samengevoegd moeten worden. Elke index 0–${n - 1} staat in precies één groep.`,
                      items: { type: 'array', items: { type: 'integer', minimum: 0, maximum: n - 1 } },
                    },
                  },
                  required: ['groepen'],
                },
              };

              const consolidatieSys =
`Je ontvangt ${n} juridische issues van een ${docTypLabel}. Groepeer issues die over hetzelfde juridische onderwerp gaan.

SAMENVOEGEN als: issues hetzelfde probleem beschrijven, ook al verschilt de formulering.
NIET SAMENVOEGEN als: de onderwerpen duidelijk verschillend zijn.

Geef voor elke groep de indices terug (0-based). Elk getal 0–${n - 1} staat in precies één groep.`;

              const groeperenRes = await askClaude(
                consolidatieSys,
                JSON.stringify(_preGroepeerd.map((iss, idx) => ({
                  idx,
                  onderwerp: iss.onderwerp,
                  dim:       iss.dimensies,
                  fragment:  (iss.bevinding || '').slice(0, 150),
                }))),
                groeperenTool,
                400, // puur indices — tientallen tokens
                'claude-haiku-4-5-20251001'
              );

              const groepen = Array.isArray(groeperenRes?.groepen) ? groeperenRes.groepen : null;
              if (groepen) {
                const ERNST_C = { hoog: 0, midden: 1, laag: 2 };
                const geconsolideerd = [];
                const _verwerkt = new Set();

                for (const groep of groepen) {
                  const geldige = groep.filter(i => Number.isInteger(i) && i >= 0 && i < n && !_verwerkt.has(i));
                  if (!geldige.length) continue;
                  geldige.forEach(i => _verwerkt.add(i));
                  const issuesInGroep = geldige.map(i => _preGroepeerd[i]);
                  if (issuesInGroep.length === 1) { geconsolideerd.push(issuesInGroep[0]); continue; }
                  // Merge: zwaarste ernst, gecombineerde dimensies, langste teksten
                  const merged = { ...issuesInGroep[0] };
                  for (let k = 1; k < issuesInGroep.length; k++) {
                    const o = issuesInGroep[k];
                    if ((ERNST_C[o.ernst] ?? 1) < (ERNST_C[merged.ernst] ?? 1)) merged.ernst = o.ernst;
                    merged.dimensies  = [...new Set([...(merged.dimensies || []), ...(o.dimensies || [])])];
                    if ((o.bevinding   || '').length > (merged.bevinding   || '').length) merged.bevinding   = o.bevinding;
                    if ((o.aanbeveling || '').length > (merged.aanbeveling || '').length) merged.aanbeveling = o.aanbeveling;
                    if (!merged.passage && o.passage) merged.passage = o.passage;
                    console.log(`[consolidatie] Haiku merge: "${merged.onderwerp}" ↔ "${o.onderwerp}"`);
                  }
                  geconsolideerd.push(merged);
                }
                // Veiligheidsnet: voeg niet-verwerkte issues toe
                for (let i = 0; i < n; i++) {
                  if (!_verwerkt.has(i)) geconsolideerd.push(_preGroepeerd[i]);
                }
                if (geconsolideerd.length) {
                  sse({ type: 'consolidatie', bestandsnaam: doc.bestandsnaam, result: { issues: geconsolideerd } });
                }
              }
            } catch (err) {
              console.warn(`[analyseer] consolidatie mislukt voor ${doc.bestandsnaam}:`, err.message);
              // Fallback: prefix-dedup resultaat als gedeeltelijke consolidatie sturen
              if (_preGroepeerd.length < _alleIssuesRaw.length) {
                sse({ type: 'consolidatie', bestandsnaam: doc.bestandsnaam, result: { issues: _preGroepeerd } });
              }
            }
          }

          console.log(`[analyseer] ${doc.bestandsnaam}: klaar`);
        };

        // Verwerk max 2 documenten tegelijk (rate-limit bescherming)
        const CONCURRENT = 2;
        for (let i = 0; i < effectiefHoofd.length; i += CONCURRENT) {
          const golf = effectiefHoofd.slice(i, i + CONCURRENT);
          const resultaten = await Promise.allSettled(golf.map(analyseDoc));
          for (const r of resultaten) {
            if (r.status === 'rejected') throw r.reason; // echte fout
          }
        }

        sse({ type: 'klaar' });

      } catch (err) {
        console.error('[analyseer SSE]', err);
        sse({ type: 'fout', error: err.message });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
