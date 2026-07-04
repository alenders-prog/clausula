/**
 * api/analyseer.js
 *
 * POST /api/analyseer
 *
 * AVG-conforme architectuur:
 *   - De BROWSER pseudonimiseert de documenttekst (namen → [PERSOON_A], IBAN → [IBAN], etc.)
 *     VOORDAT de tekst naar deze server gestuurd wordt.
 *   - De SERVER ontvangt alleen pseudoniemen — nooit echte namen of BSN-nummers.
 *   - De server retourneert pseudonieme resultaten; de browser de-pseudonimiseert lokaal.
 *
 * Input:  { classificatie, documenten: [{ bestandsnaam, type, tekst }] }
 *         (tekst is al pseudoniem — gepseudonimiseerd door de browser)
 * Output: { classificatie, documenten: [{ doc_type, bestandsnaam, samenvatting, issues[], mfn_score? }] }
 *         (output bevat ook alleen pseudoniemen)
 *
 * Auth:   vereist Supabase JWT via Authorization: Bearer <token>
 * Retry:  tot 2× herpoging bij netwerk/5xx-fouten
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Claude helper (non-streaming, prompt-caching) met retry ──────────────────
async function askClaude(systemPrompt, userContent, tool, maxTokens = 6000, model = 'claude-fable-5') {
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
        const json    = await res.json();
        // Detecteer max_tokens: gooi een herkenbare fout zodat de handler dit kan doorgeven
        if (json.stop_reason === 'max_tokens') {
          const err = new Error(`Tokenbudget bereikt voor ${tool.name} — analyse mogelijk onvolledig`);
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
      if (err.message.startsWith('Claude fout') || poging === 2) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
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

// ── Deduplicatie ──────────────────────────────────────────────────────────────
function dedupIssues(arrays) {
  const ERNST_ORD = { hoog: 0, midden: 1, laag: 2 };
  const kaart = new Map();
  for (const iss of arrays.flat()) {
    if (!iss || typeof iss !== 'object' || Array.isArray(iss)) continue;
    const k = (iss.onderwerp || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!k) continue;
    if (kaart.has(k)) {
      const b = kaart.get(k);
      if ((ERNST_ORD[iss.ernst] ?? 1) < (ERNST_ORD[b.ernst] ?? 1)) b.ernst = iss.ernst;
      b.dimensies = [...new Set([...(b.dimensies || []), ...(iss.dimensies || [])])];
      if (iss.bevinding && !b.bevinding?.includes(iss.bevinding))
        b.bevinding = b.bevinding ? b.bevinding + ' ' + iss.bevinding : iss.bevinding;
      if (!b.aanbeveling && iss.aanbeveling) b.aanbeveling = iss.aanbeveling;
    } else {
      kaart.set(k, { ...iss });
    }
  }
  return [...kaart.values()]
    .sort((a, b) => (ERNST_ORD[a.ernst] ?? 1) - (ERNST_ORD[b.ernst] ?? 1))
    .map(i => ({ ...i, afgehandeld: false, opmerking: '' }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  // ── Auth: Supabase JWT valideren ──────────────────────────────────────────
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const authCheck = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!authCheck.ok) return res.status(401).json({ error: 'Sessie verlopen — log opnieuw in' });

  try {
    // classificatie: van de browser (bevat situatie_kenmerken, doc_type, namen als placeholders)
    // documenten:    al gepseudonimiseerd door de browser
    const { classificatie, documenten } = req.body;
    if (!classificatie || !Array.isArray(documenten) || !documenten.length) {
      return res.status(400).json({ error: 'classificatie en documenten[] zijn verplicht' });
    }

    const HOOFD_TYPES    = new Set(['convenant', 'ouderschapsplan']);
    const hoofdDocs      = documenten.filter(d => HOOFD_TYPES.has(d.type));
    const contextDocs    = documenten.filter(d => !HOOFD_TYPES.has(d.type));
    const effectiefHoofd = hoofdDocs.length ? hoofdDocs : documenten;

    const contextTekst = contextDocs
      .map(d => `=== ${d.type?.toUpperCase()}: ${d.bestandsnaam} ===\n${d.tekst}`)
      .join('\n\n');

    const situatieKenmerken = classificatie.situatie_kenmerken ?? [];
    const heeftHV = documenten.some(d => d.type === 'huwelijkse_voorwaarden');

    // ── Supabase-queries ──────────────────────────────────────────────────
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

    // ── Per hoofddocument analyseren (max 2 tegelijk) ────────────────────
    // Meer dan 2 parallelle documenten (elk 3 Claude-calls) raakt de rate-limit.
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

      const sysStructuur =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert.
DOCUMENTTYPE: ${docTypLabel}
${mfnInstructie}

**issues (volledigheid)** — Rapporteer ALLEEN secties die ontbreken of onvolledig zijn. Dimensies altijd ["volledigheid"].
- Bij twijfel: geen issue. Aanwezige secties NIET rapporteren.${heeftMfn ? `\n- mfn_score.elementen MOET EXACT ${mfnElemList.length} items bevatten.` : ''}`;

      const sysJuridisch =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op juridische correctheid.
DOCUMENTTYPE: ${docTypLabel}

**issues (juridisch)** — Dimensies altijd ["juridisch"].${juridischeChecks}${hvChecks}

- Gebruik uitsluitend wetsartikelen uit de WETSARTIKELEN-sectie.
- Standaardclausules uit WETSARTIKELEN nooit als fout aanmerken.
- Geef bij "aanbeveling" de exacte tekst die de mediator direct kan overnemen.
- Bij twijfel: geen issue. Speculeer niet.`;

      const sysBalansGram =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op evenwichtigheid en taal.
DOCUMENTTYPE: ${docTypLabel}

**issues (balans)** — Dimensies ["balans"]: alimentatiebedragen, eenzijdige clausules, asymmetrische indexering.
**issues (grammatica)** — Dimensies ["grammatica"]: tegenstrijdige zinnen, vage verwijzingen, inconsistente datums/bedragen.
- Bij twijfel: geen issue. Speculeer niet.`;

      const stabielBlokWet = `WETSARTIKELEN:\n${wetTekst || '(geen)'}`;

      // 3 parallelle Sonnet-calls — elk gefocust op één dimensie.
      // Structuur met MfN heeft meer budget nodig: 15 elementen × ~150 tok = ~2250 tok voor MfN alleen.
      const [structuurR, juridischR, balansGramR] = await Promise.all([
        askClaude(sysStructuur, [
          { text: `VERWACHTE SECTIES:\n${checklistTekst}`, cache: true },
          { text: docBlok },
        ], maakStructuurTool(heeftMfn), heeftMfn ? 6000 : 2000, 'claude-sonnet-4-6'),

        askClaude(sysJuridisch, [
          { text: stabielBlokWet, cache: true },
          { text: docBlok },
        ], juridischTool, 4000, 'claude-sonnet-4-6'),

        askClaude(sysBalansGram,
          docBlok,
          balansGramTool, 2500, 'claude-sonnet-4-6'),
      ]);

      const alleIssues = dedupIssues([
        Array.isArray(structuurR?.issues)  ? structuurR.issues  : [],
        Array.isArray(juridischR?.issues)  ? juridischR.issues  : [],
        Array.isArray(balansGramR?.issues) ? balansGramR.issues : [],
      ]);

      console.log(`[analyseer] ${doc.bestandsnaam}: ${alleIssues.length} issues na dedup`);

      return {
        doc_type:     docType,
        bestandsnaam: doc.bestandsnaam,
        samenvatting: structuurR?.samenvatting || '',
        mfn_score:    structuurR?.mfn_score    || null,
        issues:       alleIssues,
      };
    };

    // Beide hoofddocumenten parallel (elk 3 Sonnet-calls → max 6 parallelle requests)
    const CONCURRENT = 2;
    const docResultaten = [];
    let maxTokensWaarschuwing = false;

    for (let i = 0; i < effectiefHoofd.length; i += CONCURRENT) {
      const golf = effectiefHoofd.slice(i, i + CONCURRENT);
      const resultaten = await Promise.allSettled(golf.map(analyseDoc));
      for (const r of resultaten) {
        if (r.status === 'fulfilled') {
          docResultaten.push(r.value);
        } else {
          // max_tokens: gedeeltelijk resultaat teruggeven met waarschuwing
          if (r.reason?.isMaxTokens) {
            maxTokensWaarschuwing = true;
            console.warn('[analyseer] max_tokens bereikt:', r.reason.message);
            // Voeg een leeg resultaat toe zodat de frontend niet crasht
            docResultaten.push({
              doc_type: 'onbekend', bestandsnaam: '?',
              samenvatting: '', mfn_score: null, issues: [],
            });
          } else {
            throw r.reason; // echte fout: gooi door
          }
        }
      }
    }

    return res.status(200).json({
      classificatie,
      documenten: docResultaten,
      ...(maxTokensWaarschuwing ? { waarschuwing: 'max_tokens' } : {}),
    });

  } catch (err) {
    console.error('[analyseer]', err);
    return res.status(500).json({ error: err.message });
  }
}
