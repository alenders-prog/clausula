/**
 * api/analyseer.js — Serverless analyse via Server-Sent Events (SSE)
 *
 * Omgezet van Edge Runtime naar serverless (Node.js) zodat:
 * - maxDuration:120 in vercel.json effectief werkt
 * - vercel dev op Windows niet crasht (Edge worker-cleanup probleem)
 * - Patroon identiek aan claude-edge.js (bewust dezelfde aanpak)
 *
 * AVG-conforme architectuur:
 *   - De BROWSER pseudonimiseert de documenttekst (namen → nep-namen, IBAN, etc.)
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

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

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
    temperature: 0.3,
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
    // Verbatim citaat: navigatieanker waarmee de viewer de juiste plek in het document markeert.
    passage: {
      type: 'string',
      description: 'Verbatim citaat van DE ZIN MET DE FOUT — niet een omringende zin, niet een ander onderwerp. Bij grammatica: de zin met het tikfout-woord of het dubbele woord. Moet letterlijk overeenkomen met de fout in "onderwerp" en "bevinding". Als iets ONTBREEKT en er is geen directe foutzin: citeer de naburige bestaande zin of bullet die de plek markeert waar het ontbrekende element hoort te staan (bijv. de aangrenzende bullet, de sectiekop, of de zin die het onderwerp aansnijdt). Laat ALLEEN leeg als er helemaal geen gerelateerde context in het document staat.',
    },
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

// Gecombineerd tool voor alle niet-structuur dimensies (juridisch + balans + grammatica + conflicten).
// Één call ipv twee parallelle calls → geen cross-call deduplicatie nodig.
const bevindingentool = {
  name: 'registreer_bevindingen',
  description: 'Registreert juridische, balans-, grammatica- en conflictbevindingen.',
  input_schema: {
    type: 'object',
    properties: { issues: { type: 'array', items: issueItem } },
    required: ['issues'],
  },
};

// Cross-document tool: zelfde schema als bevindingentool + verplicht veld betreft_documenten.
// Hiermee stuurt de server alleen de relevante issues naar elk document.
const crossDocTool = {
  name: 'registreer_cross_doc_bevindingen',
  description: 'Registreert inconsistenties die zichtbaar zijn door twee documenten samen te lezen.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            onderwerp:          { type: 'string' },
            ernst:              { type: 'string', enum: ['laag', 'midden', 'hoog'] },
            dimensies:          { type: 'array', items: { type: 'string' } },
            bevinding:          { type: 'string' },
            aanbeveling:        { type: 'string' },
            passage:            { type: 'string', description: 'Verbatim citaat van DE ZIN die het specifieke afwijkende getal, de afwijkende datum of de tegenstrijdige afspraak ZELF bevat — NOOIT de zin die een persoon, kind of sectie-onderwerp introduceert. Bij een peildatum-conflict: citeer de zin mét de afwijkende datum (bijv. "15-03-2026"), niet de naamslijn van de betrokkene. Bij een bedrag-conflict: citeer de zin met het afwijkende bedrag. Als de hele sectie ontbreekt: laat leeg.' },
            betreft_documenten: {
              type: 'array',
              items: { type: 'string' },
              description: 'Welke doc-type(s) dit issue betreft: ["convenant"], ["ouderschapsplan"], of ["convenant","ouderschapsplan"] als beide betrokken zijn.',
            },
          },
          required: ['onderwerp', 'ernst', 'dimensies', 'bevinding', 'aanbeveling', 'betreft_documenten'],
        },
      },
    },
    required: ['issues'],
  },
};

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  // ── Auth: Supabase JWT valideren ──────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const authCheck = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!authCheck.ok) return res.status(401).json({ error: 'Sessie verlopen — log opnieuw in' });

  // ── Body parsen ───────────────────────────────────────────────────────────
  const { classificatie, documenten } = req.body || {};
  if (!classificatie || !Array.isArray(documenten) || !documenten.length) {
    return res.status(400).json({ error: 'classificatie en documenten[] zijn verplicht' });
  }

  // ── SSE headers ───────────────────────────────────────────────────────────
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  // Vlag om dubbele writes/end te voorkomen (libuv UV_HANDLE_CLOSING op Windows)
  let sseGesloten = false;

  // Emit één SSE-event
  const sse = (obj) => {
    if (sseGesloten || res.writableEnded) return;
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { sseGesloten = true; }
  };

  // Keepalive: stuur elke 5s een comment zodat Vercel de stream open houdt
  const keepalive = setInterval(() => {
    if (sseGesloten || res.writableEnded) { clearInterval(keepalive); return; }
    try { res.write(': keepalive\n\n'); } catch { sseGesloten = true; clearInterval(keepalive); }
  }, 5000);

  // Client sluit de verbinding vroegtijdig → interval meteen opruimen
  req.on('close', () => { sseGesloten = true; clearInterval(keepalive); });

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

    // ── Per document analyseren — 2 parallelle calls, elk een SSE-event ──
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
2. KINDERALIMENTATIE — Tremanormen of gemotiveerde afwijking (art. 1:404 BW)? LET OP: als het convenant expliciet verwijst naar een bijgevoegd of apart opgemaakt ouderschapsplan voor alle kinderafspraken, is dat een correcte en gangbare opzet — flag dit DAN NIET als ontbrekend. De kinderalimentatie hoeft in dat geval niet ook nog in het convenant herhaald te worden.
3. PENSIOENVEREVENING — WVPS 50/50 of schriftelijke afwijking (WVPS art. 2 en 5)?
4. WONING — Leverings-/passeerdatum? Hypotheek overname of verkoop? Ontslag aansprakelijkheid?
5. BELASTING — Fiscaal partnerschap tot welke datum? Aanslagen/teruggaven verdeeld?
6. VERMOGEN — Huwelijksgemeenschap of verrekenbeding volledig afgewikkeld (art. 1:94 en 1:121 BW)?
7. SCHULDEN — Wie neemt welke schulden over?
NOOIT als inconsistentie of conflict aanmerken: het hanteren van een gemaximeerd netto gezinsinkomen (bijv. € 7.500,-/maand per de Alimentatienormen/Trema) als grondslag voor kinderalimentatieberekeningen, terwijl het werkelijke (hogere) netto gezinsinkomen geldt als grondslag voor partneralimentatie. Dit is de standaard Trema-methode en is juridisch correct — ook als beide grondslagen in hetzelfde document naast elkaar staan.`
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

      // ── Documenten opsplitsen: hoofdtekst vs. bijlagen + andere hoofddocs (context) ──
      // contextBlok en stabielGedeeld zijn identiek voor alle 3 calls van hetzelfde document
      // én voor heranalyse → maximale cache-efficiency (cache-hit binnen 5-minuten-window).
      // Anthropic-caching: max 4 breakpoints per request.
      //   sys(1) + contextBlok(2) + stabielGedeeld(3) + call-specifiek(4) = precies 4.
      const documentBlok = `TE ANALYSEREN DOCUMENT:\n=== ${docType.toUpperCase()}: ${doc.bestandsnaam} ===\n${doc.tekst}`;

      // Context: alleen bijlagen (HV etc.). Andere hoofddocumenten worden NIET meegegeven —
      // dat bleek de primaire bron van cross-document-besmetting (issues van OP in Convenant
      // en vice versa). Cross-doc verificatie kan later als gerichte micro-call worden toegevoegd.
      const contextBlokDelen = [];
      if (contextTekst) contextBlokDelen.push(`BIJLAGEN (ter context — niet apart analyseren):\n${contextTekst}`);
      const contextBlok = contextBlokDelen.length ? contextBlokDelen.join('\n\n') : null;

      // Gedeeld regelsblok — identiek voor alle 3 calls + heranalyse → gecached in user-content
      // (voorheen in elke system prompt herhaald → aparte cache-entries per call-type)
      const ernstCriteria =
`Ernst-criteria (verplicht toepassen — wees terughoudend met 'hoog'):
- hoog: reserveer dit uitsluitend voor evidente wettelijke overtreding of volstrekte onuitvoerbaarheid; het document kan zo NIET worden gepasseerd of vastgelegd (bijv. verplichte WVPS-afstand volledig afwezig zonder vervangende regeling, nihilbeding kinderalimentatie voor minderjarigen zonder draagkrachtberekening).
- midden: inhoudelijk punt dat aanpassing verdient maar de kern van de afspraak intact laat (bijv. indexering ontbreekt, datum niet ingevuld, partijnaam inconsistent, onduidelijke clausule). Dit is het standaardniveau voor de meeste echte issues.
- laag: aandachtspunt, verbetersuggestie of stijlkwestie zonder materieel rechtsgevolg (bijv. vage verwijzing, alternatieve formulering, spellingsfout). Gebruik dit ruimhartig voor nuttige maar niet-urgente opmerkingen.`;

      // Waarschuwing over pseudonimisering — voorkomt valse format-validatiefouten.
      // Persoonsnamen worden als nep-namen verstuurd (bijv. "Thomas Bergman") — niet als
      // [PERSOON_A]-placeholders — zodat Claude ze als gewone tekst behandelt en geen valse
      // dubbele-naam-alerts genereert door placeholder-herhaling in zijn eigen output.
      const pseudonimiseringNota =
`PSEUDONIMISERING — VERPLICHTE UITSLUITINGSREGEL:
Het document is vóór verzending automatisch pseudonimiseerd. Adressen, postcodes, woonplaatsen en andere PII zijn vervangen door placeholders:
  [ADRES]      → straatadres incl. huisnummer (bijv. "Grotestraat 140")
  [WOONPLAATS] → woonplaatsnaam (bijv. "Almelo")
  [POSTCODE]   → Nederlandse postcode
  [BSN] / [TEL] / [EMAIL] → overige persoonsgegevens
GEVOLG: formaat-validatie op zulke velden levert valse positieven op.
- Maak GEEN issue aan als een BSN, telefoonnummer of e-mailadres niet het verwachte formaat heeft.
- Maak GEEN issue over een ontbrekende of generieke woonplaats of adres — het [ADRES]/[WOONPLAATS] staat WEL in het originele document.
- Controleer WEL of een waarde ONTBREEKT of INCONSISTENT is op inhoudelijk niveau.
Gebruik in jouw aanbevelingen NOOIT letterlijke woonplaatsen of straatnamen — schrijf altijd [WOONPLAATS] resp. [ADRES].`;

      // Gedeelde verificatieregel — voorkomt valse "ontbreekt"-claims maar behoudt echte fouten
      const verificatieplicht =
`VERIFICATIEPLICHT BIJ AFWEZIGHEIDSCLAIMS:
Voordat je rapporteert dat iets "ontbreekt", "niet aanwezig is" of "niet zichtbaar is":
1. Doorzoek de VOLLEDIGE documenttekst actief op het beweerde ontbrekende element.
2. Bij INTERNE verwijzingen (bijv. "de in artikel 4.1.1 vermelde ...", "zie punt 21", "zie artikel 3.2"):
   Zoek of het gerefereerde nummer ELDERS in het document voorkomt — als sectietitel, koptekst, nummeringsprefix van een lid of sub-artikel (bijv. "4.1.1" of "4.1.1." aan het begin van een alinea of opsommingspunt), of andere onderdelen van de documentstructuur BUITEN de verwijzingstekst zelf.
   - Artikelnummer komt ERGENS ANDERS in het document voor → rapporteer GEEN issue.
   - Bij TWIJFEL of het artikel ergens gedefinieerd is → rapporteer GEEN issue.
   - Alleen bij ABSOLUTE ZEKERHEID dat het nummer nergens als definitie, sectie of genummerd lid voorkomt → rapporteer een issue.
2b. Bij EXTERNE verwijzingen naar een ander document (bijv. "zie het ouderschapsplan", "conform het convenant"):
    Dat andere document wordt apart geanalyseerd. Maak GEEN issue over ontbrekende inhoud daarin —
    rapporteer hooguit als 'laag' dat het referentiedocument als bijlage ontbreekt.
   OPGELET: het feit dat "4.1.1" in de verwijzingstekst zelf staat ("de in artikel 4.1.1 vermelde...") telt NIET als bewijs dat het artikel bestaat. Zoek naar een APARTE definitieplek.
3. SECTIENUMMERING — ABSOLUTE REGEL: Als het document aantoonbaar doorlopend genummerde secties heeft
   (bv. "1. Ouderlijk gezag", "2. Woon- en verblijfplaats", "3. Identiteitsbewijzen"…):
   a. Ga er dan ALTIJD vanuit dat hogere sectienummers (bv. "punt 21", "artikel 15") eveneens bestaan.
   b. Maak NOOIT een issue over een "ontbrekend" of "niet-aantoonbaar" puntgetal.
   c. Maak NOOIT een issue over een "onduidelijke verwijzing" naar een sectienummer — als het document
      genummerd is, zijn verwijzingen als "punt 21 Financiële afspraken" per definitie correct.
   d. Maak NOOIT een issue dat de nummering "niet zichtbaar" is of dat een sectienummer "niet als
      koptekst is opgenomen" — tekst-extractie kan sectienummers losmaken van hun koptekst. Dat is
      een extractie-artefact, GEEN documentfout.
   e. Enige uitzondering: als NERGENS in het document ook maar één sectienummer zichtbaar is (dus ook
      punt 1, 2, 3 ontbreken volledig), dan mag je de nummering in twijfel trekken.
4. Rapporteer een afwezigheid uitsluitend als je na actief zoeken bevestigt dat het er absoluut niet in staat.`;

      // Gecombineerd: één blok → één cache-entry voor alle 3 calls + heranalyse
      const stabielGedeeld = `${pseudonimiseringNota}\n\n${verificatieplicht}\n\n${ernstCriteria}`;

      // System prompts: alleen call-specifieke instructies (gedeelde regels in stabielGedeeld)
      const sysStructuur =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert.
DOCUMENTTYPE: ${docTypLabel}
${mfnInstructie}

**issues (volledigheid)** — Rapporteer secties die ontbreken OF aanwezig zijn maar inhoudelijk onvolledig. Dimensies altijd ["volledigheid"].
- ONTBREKEND: een verplichte of gebruikelijke sectie staat geheel niet in het document.
- ONVOLLEDIG: een sectie is aanwezig maar mist essentiële details die nodig zijn voor uitvoerbaarheid.
  Voorbeelden: vakantieregelingen zonder concrete wisseltijden per feestdag; zorgregeling zonder specificatie van welke weekenden; alimentatie zonder ingangsdatum of indexering.
- Bij twijfel: geen issue. Secties die aanwezig én voldoende uitgewerkt zijn NIET rapporteren.${heeftMfn ? `\n- mfn_score.elementen MOET EXACT ${mfnElemList.length} items bevatten.` : ''}
- Vul bij elk issue het veld 'passage' met een verbatim citaat van de ZIN OF BULLET DIE DE FOUT BEVAT (niet de voorafgaande zin als context). NOOIT een persoonsomschrijving of naamsdefinitie als passage gebruiken als de fout elders in het document staat. Leeg laten als een sectie volledig ontbreekt.`;

      // Gecombineerde prompt voor alle niet-structuur dimensies — één call ipv twee.
      // Voordeel: Claude ziet het volledige document in één context → minder kans op overlap
      // of tegenspraak tussen juridisch/balans-call en grammatica/conflicten-call.
      const sysBevindingen =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op juridische correctheid, evenwichtigheid en taal.
DOCUMENTTYPE: ${docTypLabel}

**issues (juridisch)** — Primaire dimensie: "juridisch". Voeg extra dimensies toe als het issue ook een ander aspect raakt (bijv. ["juridisch","conflicten"] als de clausule zowel wettelijk onjuist als intern tegenstrijdig is).${juridischeChecks}${hvChecks}

- Gebruik uitsluitend wetsartikelen uit de WETSARTIKELEN-sectie.
- Standaardclausules uit WETSARTIKELEN nooit als fout aanmerken.
- Geef bij "aanbeveling" de exacte tekst die de mediator direct kan overnemen.
- Vul bij elk issue het veld 'passage' met een verbatim citaat van de ZIN OF BULLET DIE DE FOUT BEVAT (niet de omringende context of de vorige zin). NOOIT een persoonsomschrijving of naamsdefinitie als passage — als de fout in een specifiek bedrag, datum of clausule zit, citeer dan die zin.
- Bij twijfel: geen issue. Speculeer niet.
- ALLEEN echte problemen rapporteren. Leg NOOIT een issue vast als het document aan de eis voldoet. Positieve bevestigingen ("Geen issue", "Voldoet aan...", "Geen actie vereist", "Correct geregeld") horen NIET in de issues-lijst — die lijst bevat uitsluitend punten die de mediator moet aanpassen of controleren.

**issues (balans)** — Primaire dimensie: "balans". Voeg extra dimensies toe waar van toepassing (bijv. ["balans","juridisch"] bij een alimentatiebedrag dat zowel eenzijdig is als wettelijk onjuist berekend). Onderwerpen: alimentatiebedragen, eenzijdige clausules, asymmetrische indexering, ongemotiveerde afwijking van wettelijke maatstaven.
- ZORGVERDELING-TABELLEN: beoordeel altijd de volledige cyclus (oneven + even week samen). Als de even week het spiegelbeeld is van de oneven week → het schema is per definitie symmetrisch. Het patroon waarbij één ouder de maandagochtend heeft en de andere ouder de rest t/m de volgende maandagochtend ("weekwissel op maandag") is een standaard Nederlands co-ouderschapspatroon — dit is geen asymmetrie en geen fout.

**issues (grammatica)** — Dimensies ["grammatica"]. Scan het VOLLEDIGE document op:
- Spelling- en tikfouten (bijv. 'invullen' waar 'invulling' bedoeld is, dubbele spaties, hoofdletterfouten)
- Dubbele woorden (bijv. "Land Rover Land Rover", "de de kinderen")
- Foutieve of onvolledige zinsconstructies (bijv. ontbrekend hoofdwerkwoord: 'Moeder die ze naar school brengt' — dit is geen volledige zin)
- Inconsistente aanduidingen: zelfde persoon/datum/bedrag op verschillende plekken anders gespeld of benoemd
- Niet-uitvoerbare afspraken door vage bewoording ('eventueel', 'zo mogelijk', 'nader te bepalen' zonder concrete uitwerking)
- GENDERREGEL (strikt): rapporteer een genderkwestie UITSLUITEND als hetzelfde benoemde individu in hetzelfde document op de ene plek als 'hij/hem/zijn' en op een andere plek als 'zij/haar' wordt aangeduid. Een algemene paragraaf die niet expliciet aan een kind bij naam is gekoppeld levert NOOIT een genderissue op — zeker niet als het gezin zowel een zoon als een dochter heeft, want de paragraaf kan over het andere kind gaan. Flagg alleen directe per-persoon-inconsistenties.
- Rapporteer ELKE tikfout of grammaticakwestie als een APART issue — NOOIT bundelen.
  Zo kan de mediator per correctie accepteren of afwijzen.

KRITISCH voor grammatica-issues — ALLE drie velden moeten over DEZELFDE fout gaan:
- 'passage': citeer LETTERLIJK de zin die DE FOUT ZELF bevat (de zin met het tikfout-woord, het dubbele woord, de vage term)
- 'onderwerp': benoem de exacte fout die IN de passage staat (bijv. 'Dubbel woord "Land Rover" in artikel 5')
- 'bevinding': beschrijf waarom DE PASSAGE een probleem is — NIET een andere passage of een ander onderwerp

NOOIT: onderwerp over fout X, maar bevinding/passage over een totaal ander onderwerp Y.

**issues (conflicten)** — Primaire dimensie: "conflicten". Voeg extra dimensies toe waar van toepassing (bijv. ["conflicten","juridisch"]). Zoek tegenstrijdigheden BINNEN het document op ALLE niveaus:
- Inter-artikel: artikel X en artikel Y spreken elkaar tegen over hetzelfde onderwerp
- Intra-sectie: twee opeenvolgende zinnen of bullets binnen hetzelfde onderdeel die het tegenovergestelde beweren (bijv. 'uitsluitend mondeling' gevolgd door 'schriftelijk vastgelegd', of een vakantieregeling die intern inconsistente aantallen weken of wisseldata noemt)
- Bedrag/datum: hetzelfde bedrag of dezelfde datum wordt op twee plaatsen anders vermeld
- DEDUPLICATIE: als meerdere inconsistenties voortkomen uit DEZELFDE onderliggende oorzaak (bijv. één fout bedrag dat op meerdere plekken terugkomt), maak dan EEN bevinding die de kernfout beschrijft en de gevolgen noemt — GEEN afzonderlijk issue per plek.

- Vul bij elk issue het veld 'passage' met een verbatim citaat van de ZIN OF BULLET DIE HET SPECIFIEKE GETAL, DE DATUM OF DE TEGENSTRIJDIGHEID BEVAT (niet de persoonsomschrijving of definitiebepaling van de betrokkene, ook niet de omringende context). Bij een bedrag/datum-conflict: citeer de zin mét het afwijkende getal/datum, niet de zin die de persoon of het onderwerp introduceert.
- PASSAGE-DEDUPLICATIE: NOOIT twee issues met EXACT DEZELFDE passage. Als één passage meerdere problemen heeft (bijv. zowel grammaticaal onhelder als inhoudelijk onvolledig), rapporteer uitsluitend het zwaarste conform de dimensie-voorrangsvolgorde: juridisch > conflicten > volledigheid > balans > grammatica.
- Bij twijfel: geen issue. Speculeer niet.

ZELFCONTROLE (verplicht vóór afsluiting): Controleer de volledige issues-lijst op de volgende patronen:
1. ZELFDE PASSAGE: twee issues met exact hetzelfde verbatim citaat → bewaar alleen het zwaarste.
2. ZELFDE BEDRAG/DATUM-CONFLICT: twee issues die hetzelfde getalpaar of datumpaar benoemen als inconsistentie (bijv. "€ 462" vs "€ 463" in twee afzonderlijke issues) → verwijder het minder ernstige en verwerk de extra context in het bewaarde issue.
3. ZELFDE KERN-ONDERWERP: twee issues die hetzelfde fundamentele probleem beschrijven maar anders geformuleerd (bijv. "Fiscaal partnerschap: einddatum niet concreet" en "Fiscaal partnerschap: einddatum niet expliciet vastgelegd") → fuseer tot één issue met de meest volledige bevinding en aanbeveling.
4. PERSOONSGEBONDEN PATROON: meerdere issues die variaties zijn van DEZELFDE fout voor DEZELFDE persoon (bijv. drie genderfouten voor Kind X op verschillende plekken, of twee naamsspellingsfouten voor dezelfde partij) → combineer ALTIJD tot EEN issue. Noem in de bevinding alle plekken waar de fout voorkomt, en geef één allesomvattende aanbeveling.
Pas de lijst aan vóór je de tool aanroept.`;

      const stabielBlokWet = `WETSARTIKELEN:\n${wetTekst || '(geen)'}`;

      // Helper om gecachede contextblok als array te leveren (leeg als geen bijlagen)
      const mkCtx = () => contextBlok ? [{ text: contextBlok, cache: true }] : [];

      const callMetSse = (clodeFn, type) =>
        clodeFn().then(
          result => {
            sse({ type, bestandsnaam: doc.bestandsnaam, result });
            return result;
          },
          err => {
            if (err.isMaxTokens) {
              console.warn(`[analyseer] max_tokens: ${doc.bestandsnaam}/${type}`);
              sse({ type: 'max_tokens', bestandsnaam: doc.bestandsnaam, tool: type });
              return { issues: [] };
            }
            throw err;
          }
        );

      // 2 parallelle Sonnet-calls — Structuur/Volledigheid + Juridisch/Balans/Grammatica/Conflicten.
      // Voorheen 3 calls met Haiku-consolidatiestap; nu 2 calls zonder deduplicatie:
      //  - Minder kans op cross-call overlap → consolidatie niet meer nodig
      //  - Iedere call focust op zijn eigen dimensies zonder dubbele context
      // Cache-volgorde per call (max 4 breakpoints incl. system):
      //   sys(1) + contextBlok(2) + stabielGedeeld(3) + call-specifiek blok(4)
      const [structuurR, bevindingenR] = await Promise.all([
        callMetSse(() => askClaude(sysStructuur, [
          ...mkCtx(),
          { text: stabielGedeeld, cache: true },
          { text: `VERWACHTE SECTIES:\n${checklistTekst}`, cache: true },
          { text: documentBlok },
        ], maakStructuurTool(heeftMfn), heeftMfn ? 6000 : 2000), 'structuur'),

        // Gecombineerde call: juridisch + balans + grammatica + conflicten in één context
        callMetSse(() => askClaude(sysBevindingen, [
          ...mkCtx(),
          { text: stabielGedeeld, cache: true },
          { text: stabielBlokWet, cache: true },
          { text: documentBlok },
        ], bevindingentool, 9000), 'juridisch'),
      ]);

      // Signaleer 'balans'-call als afgerond zodat de frontend loading-state correct afsluit.
      // (Frontend wacht op structuur + juridisch + balans; balans is nu samengevoegd met juridisch.)
      sse({ type: 'balans', bestandsnaam: doc.bestandsnaam, result: { issues: [] } });

      console.log(`[analyseer] ${doc.bestandsnaam}: klaar (${(Array.isArray(structuurR?.issues) ? structuurR.issues.length : 0) + (Array.isArray(bevindingenR?.issues) ? bevindingenR.issues.length : 0)} issues totaal)`);
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

    // ── Cross-document verificatie (alleen bij 2+ hoofddocumenten) ──────────
    if (effectiefHoofd.length >= 2) {
      sse({ type: 'cross_doc_start', documenten: effectiefHoofd.map(d => d.type) });
      const docBlokken = effectiefHoofd
        .map(d => `=== ${d.type.toUpperCase()}: ${d.bestandsnaam} ===\n${d.tekst}`)
        .join('\n\n---\n\n');

      const docTypenLabel = effectiefHoofd.map(d => d.type).join(' en ');

      const sysCrossDoc =
`Je bent een ervaren familierechtjurist. Je legt twee documenten naast elkaar: ${docTypenLabel}.

TAAK: Vind uitsluitend inconsistenties die ALLEEN ZICHTBAAR zijn door BEIDE documenten samen te lezen.
Rapporteer NIET wat al in één document afzonderlijk een fout is — alleen wat TUSSEN de documenten botst of ontbreekt.
Als een issue slechts in één document zichtbaar is (interne fout van dat document), laat het dan VOLLEDIG weg — het is al gevonden door de per-document analyse.

Zoek op ALLE dimensies:
- CONFLICTEN ["conflicten"]: datums, bedragen, namen of afspraken die in document A anders luiden dan in document B (bijv. alimentatiebedrag anders in convenant dan in OP; geboortedatum kind anders gespeld)
- VOLLEDIGHEID ["volledigheid"]: document A verwijst voor een onderwerp naar document B, maar dat onderwerp ontbreekt in document B
- JURIDISCH ["juridisch"]: een bepaling in A die een bepaling in B inconsistent maakt of wettelijk onderuit haalt
- BALANS ["balans"]: een clausule die in A en B anders uitpakt of eenzijdig is over de documenten heen
- GRAMMATICA ["grammatica"]: namen, datums of bedragen die in de twee documenten anders gespeld of genoteerd zijn

Ernst-criteria:
- hoog: evidente tegenstrijdigheid die tot onuitvoerbaarheid leidt of een wettelijke eis raakt
- midden: afwijking die aanpassing verdient maar de kern van de afspraken intact laat
- laag: kleine inconsistentie of spellingsverschil

VERPLICHT voor elk issue: vul betreft_documenten in met de doc-type(s) waar de aanpassing moet plaatsvinden:
- ["convenant"] — de fix zit alleen in het convenant
- ["ouderschapsplan"] — de fix zit alleen in het ouderschapsplan
- ["convenant","ouderschapsplan"] — beide documenten moeten worden aangepast (tegenstrijdigheid tussen de twee)

Bij twijfel: geen issue. Speculeer niet.
ALLEEN echte cross-document problemen — geen positieve bevestigingen ("Geen issue", "Voldoet aan...").

PASSAGE-INSTRUCTIE (verplicht):
Vul 'passage' met een verbatim citaat van de CONCRETE ZIN die het specifieke afwijkende getal, de afwijkende datum of de tegenstrijdige afspraak ZELF bevat.

VERBODEN als passage (dit zijn NOOIT goede passages):
- Een zin die een persoon introduceert: "Jan de Vries, geboren te Amsterdam op 12-03-1980" → FOUT
- Een zin die een kind noemt: "Maartje Wilma Antonia Schreven geboren te Deventer op 29-01-2015" → FOUT
- Een sectietitel of kopje zonder het conflicterende getal/datum zelf → FOUT

CORRECT voorbeeld bij een peildatum-conflict:
- "De peildatum voor de spaarrekeningen van de kinderen is vastgesteld op 15-03-2026." → GOED
- "Het saldo op rekening NL91INGB... per 15-03-2026 bedraagt € 4.200,-." → GOED

Citeer de zin UIT HET DOCUMENT waar de aanpassing moet plaatsvinden (betreft_documenten). Laat 'passage' leeg als de hele sectie ontbreekt.

WETSARTIKELEN:\n${wetTekst || '(geen)'}`;

      try {
        const crossResult = await askClaude(sysCrossDoc, docBlokken, crossDocTool, 4000);
        if (Array.isArray(crossResult?.issues) && crossResult.issues.length > 0) {
          for (const d of effectiefHoofd) {
            // Stuur alleen issues die dit document-type betreffen
            const relevantIssues = crossResult.issues.filter(iss => {
              const bd = iss.betreft_documenten;
              if (!Array.isArray(bd) || bd.length === 0) return true; // ontbrekend veld: naar alle docs
              return bd.includes(d.type);
            });
            if (relevantIssues.length > 0) {
              sse({ type: 'cross_doc', bestandsnaam: d.bestandsnaam, result: { issues: relevantIssues } });
            }
          }
          console.log(`[analyseer] cross-doc: ${crossResult.issues.length} issues`);
        }
      } catch (err) {
        if (err.isMaxTokens) console.warn('[analyseer] cross-doc: max_tokens');
        else console.warn('[analyseer] cross-doc mislukt:', err.message);
        // niet-fataal — per-document analyses zijn al verstuurd
      }
    }

    sse({ type: 'klaar' });

  } catch (err) {
    console.error('[analyseer SSE]', err);
    sse({ type: 'fout', error: err.message });
  } finally {
    sseGesloten = true;
    clearInterval(keepalive);
    if (!res.writableEnded) res.end();
  }
}
