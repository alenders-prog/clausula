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
import { filterIssuesOpIban } from './_iban.js';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

// Maximale output die we ooit nodig zullen hebben. max_tokens is een plafond,
// geen verbruiksmeter — je betaalt alleen voor tokens die Claude daadwerkelijk genereert.
const MAX_OUTPUT_TOKENS = 32000;

// ── Claude helper (non-streaming, prompt-caching) met retry ──────────────────
// _herpoging: intern vlag om bij max_tokens eenmalig met verdubbeld budget opnieuw te proberen
async function askClaude(systemPrompt, userContent, tool, maxTokens = 6000, model = 'claude-sonnet-4-6', _herpoging = false) {
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
          // Optie 4: automatisch herpoging met verdubbeld budget (eenmalig, tot MAX_OUTPUT_TOKENS)
          const verhoogd = Math.min(maxTokens * 2, MAX_OUTPUT_TOKENS);
          if (!_herpoging && verhoogd > maxTokens) {
            console.warn(`[analyseer/${tool.name}] max_tokens bij ${maxTokens} → herpoging met ${verhoogd}`);
            return askClaude(systemPrompt, userContent, tool, verhoogd, model, true);
          }
          // Al op maximum of tweede poging ook vol → echte fout
          const err = new Error(`Tokenbudget bereikt voor ${tool.name} (${maxTokens} tokens)`);
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
    // Sectiereferentie: helpt de viewer sortering en navigatie op sectieniveau.
    artikel: {
      type: 'string',
      description: 'Sectienummer of kopje van het document waaronder dit issue valt (bijv. "3.2.1", "Artikel 5", "Bankrekeningen"). Laat leeg als het document geen duidelijke sectienummering heeft voor deze plek.',
    },
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
            artikel:            { type: 'string', description: 'Sectienummer of kopje waaronder dit issue valt (bijv. "3.2.1", "Artikel 5"). Laat leeg als het document geen duidelijke sectienummering heeft.' },
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
  const { classificatie, documenten, roepnamen } = req.body || {};
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

      // Andere hoofddocumenten die parallel worden geanalyseerd — voor de promptnota
      const andereDocs = effectiefHoofd
        .filter(d => d.bestandsnaam !== doc.bestandsnaam)
        .map(d => d.type === 'ouderschapsplan' ? 'Ouderschapsplan' : 'Echtscheidingsconvenant');
      const anderDocsNota = andereDocs.length
        ? `\nMEEGELEVERDE ANDERE DOCUMENTEN: ${andereDocs.join(', ')} ${andereDocs.length > 1 ? 'zijn' : 'is'} ook aangeleverd en word${andereDocs.length > 1 ? 'en' : 't'} parallel apart geanalyseerd. Rapporteer NOOIT dat een van deze documenten "niet meegeleverd is" of "als bijlage ontbreekt".`
        : '';

      // Roepnamen die in de bestandsnaam/dossiernaam gevonden zijn maar afwijken van de formele naam
      const roepnamenNota = Array.isArray(roepnamen) && roepnamen.length
        ? `\nROEPNAMEN: De volgende partijen worden mogelijk aangeduid met een roepnaam die afwijkt van hun formele naam:${roepnamen.map(r => `\n- "${r.nepVoornaam}" als roepnaam van "${r.nepVolledig}"`).join('')}\nControleer voor elk of het document de roepnaam formeel introduceert (bijv. "verder te noemen als X" of vergelijkbaar). Indien de roepnaam NERGENS formeel omschreven is maar WEL elders in het documentlichaam (buiten de introductiezin) gebruikt wordt: meld dit als LAAG-issue. Indien de roepnaam NERGENS in het document voorkomt (ook niet in het lichaam), is er geen issue. Meld NOOIT een roepnaam-issue op basis van het bestaan van de roepnaam buiten het document.`
        : '';

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

      // Huidige datum voor temporele beoordeling (bijv. of een peildatum in het verleden ligt)
      const vandaag = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
Gebruik in jouw aanbevelingen NOOIT letterlijke woonplaatsen of straatnamen — schrijf altijd [WOONPLAATS] resp. [ADRES].

HUIDIGE DATUM: ${vandaag}. Gebruik deze datum bij alle temporele beoordelingen — bijv. of een peildatum, ondertekeningsdatum of ingangsdatum in het verleden of de toekomst ligt. Rapporteer een datum NOOIT als "in de toekomst" als die datum eerder is dan de huidige datum.`;

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
DOCUMENTTYPE: ${docTypLabel}${anderDocsNota}${roepnamenNota}
${mfnInstructie}

**issues (volledigheid)** — Rapporteer secties die ontbreken OF aanwezig zijn maar inhoudelijk onvolledig. Dimensies altijd ["volledigheid"].
- ONTBREKEND: een verplichte of gebruikelijke sectie staat geheel niet in het document.
- ONVOLLEDIG: een sectie is aanwezig maar mist essentiële details die nodig zijn voor uitvoerbaarheid.
  Voorbeelden: vakantieregelingen zonder concrete wisseltijden per feestdag; zorgregeling zonder specificatie van welke weekenden; alimentatie zonder ingangsdatum of indexering.
- NIET INGEVULD (ALTIJD volledigheid, NOOIT juridisch of balans): een bedrag, datum, naam of andere waarde is leeggelaten of bevat een sjabloonplaatshouder. Herkenbaar aan: "€ ,–"; "€ __"; "____"; "*OF"; "te noemen __"; streepjes of puntjes als invulruimte. Dit is ALTIJD volledigheid — ook als het om een juridisch verplicht bedrag gaat (bijv. alimentatie, afkoopsom). De reden: het is een invulfout, geen juridische fout in de inhoud.
  Uitgebreide plaatshouder-patronen (ook altijd volledigheid):
  - Onlogisch rekeningnummer: een accountnummer met duidelijk aaneensluitende of herhalende cijfers (bijv. 010203040, 0102030405, 123456789, 0000000000) is een testgetal — geen echt banknummer. Rapporteer als niet-ingevuld rekeningnummer.
  - Onlogische datum: een datum met jaar vóór 1900 of na 2099, of een duidelijk onmogelijke datum (bijv. 01-01-0001, 00-00-0000) is een plaatshouder. Rapporteer als niet-ingevulde datum.
- ONVOLLEDIGE ZIN (ALTIJD volledigheid, NOOIT juridisch): een zin die wél aanwezig is maar geen concrete afspraak, verplichting of bepaling bevat. Herkenbaar aan: de zin beschrijft een onderwerp of noemt een thema, maar zegt niet wat de partijen zijn overeengekomen. Voorbeeld: "Afspraken over een betaling of een splitsing van het rentecontract." — er staat geen afspraak, alleen een aankondiging. Dit is ALTIJD volledigheid: de inhoud ontbreekt. NOOIT juridisch, ook niet als het onderwerp juridisch relevant is.
- HANDTEKENINGEN — drie strikte regels:
  1. De sectie "Ondergetekenden" of "Partijen" bovenaan het document is de partij-INTRODUCTIE (naam, geboortedatum, adres, "hierna te noemen"). Dit is NOOIT een handtekeningenblok. Verwar deze sectie nooit met een ondertekeningsruimte.
  2. Een handtekening-issue mag alleen worden gerapporteerd als de ondertekeningsruimte onderaan het document (herkenbaar aan tekst als "Aldus overeengekomen", "Handtekening:", lege signeerregels, of de namen van partijen als slotblok) ontbreekt of geen handtekeningen bevat. De 'passage' moet altijd uit dit slotblok komen — nooit uit de partij-introductie.
  3. Als het document een CONCEPT-watermerk bevat of anderszins als concept is aangeduid: ontbrekende handtekeningen zijn LAAG (concepten worden pas bij de definitieve versie ondertekend). Rapporteer dit NOOIT als midden of hoog.
- Bij twijfel: geen issue. Secties die aanwezig én voldoende uitgewerkt zijn NIET rapporteren.${heeftMfn ? `\n- mfn_score.elementen MOET EXACT ${mfnElemList.length} items bevatten.` : ''}
- Vul bij elk issue het veld 'passage' met een verbatim citaat van de ZIN OF BULLET DIE DE FOUT BEVAT (niet de voorafgaande zin als context). NOOIT een persoonsomschrijving of naamsdefinitie als passage gebruiken als de fout elders in het document staat. Leeg laten als een sectie volledig ontbreekt.`;

      // Gecombineerde prompt voor alle niet-structuur dimensies — één call ipv twee.
      // Voordeel: Claude ziet het volledige document in één context → minder kans op overlap
      // of tegenspraak tussen juridisch/balans-call en grammatica/conflicten-call.
      const sysBevindingen =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op juridische correctheid, evenwichtigheid en taal.
DOCUMENTTYPE: ${docTypLabel}${anderDocsNota}${roepnamenNota}

NAAMGEBRUIK: Zodra een partij formeel geïntroduceerd is (bijv. "Peter Adriaan Dikkeschei, verder te noemen: 'de vader'"), zijn alle drie de volgende aanduidingen door het hele document rechtsgeldig: de volledige naam, de voornaam alleen ("Peter"), en de rol-aanduiding ("de vader"). Gebruik van de officiële voornaam is NOOIT een roepnaam-probleem, naamsfout of inconsistente aanduiding — ook niet als het document elders uitsluitend de rol-aanduiding gebruikt. Rapporteer NOOIT dat een voornaam "niet formeel is geïntroduceerd" als die voornaam het eerste naamsdeel is van de geïntroduceerde partij.

ROL-AANDUIDINGEN ZIJN NOOIT ROEPNAMEN: "de man", "de vrouw", "de moeder", "de vader", "partijen", "de schuldenaar", "de schuldeiser" en vergelijkbare functie- of rolbenamingen zijn partij-aanduidingen, GEEN roepnamen. Rapporteer NOOIT dat "de vrouw" of "de man" als roepnaam ontbreekt of niet formeel geïntroduceerd is. Een partij die "hierna te noemen 'de vrouw'" wordt geïntroduceerd, heeft haar aanduidingsvorm volledig geregeld — dit vereist geen aanvullende roepnaam.

ROEPNAMEN: Als een partij formeel is geïntroduceerd onder haar geboortenaam maar verderop in het document aangeduid wordt met een naam die NIET afleidbaar is uit de officiële voornamen (bijv. geïntroduceerd als "Gerbrand Dirk Johan Lebbink" maar elders aangeduid als "Gerjon"; of geïntroduceerd als "Herma Eugenie ten Brink" maar aangeduid als "Manon"), is dit een volledigheid-issue. Nooit juridisch.

Drie verplichte regels voor roepnaam-issues:
1. ONDERSCHEID officieel vs. roepnaam: de officiële naam staat in de introductiezin ("Gerbrand Dirk Johan Lebbink, geboren te..."). De roepnaam is de afwijkende aanduiding elders in het document ("Gerjon"). NOOIT verwarren. De bevinding formuleert altijd: "officiële naam is [X], elders gebruikt als [Y] — [Y] is niet afleidbaar van [X] en moet formeel worden geïntroduceerd."
2. PASSAGE: citeer de zin ELDERS in het document waar de roepnaam wordt gebruikt (bijv. "Gerjon betaalt maandelijks..."), NIET de introductiezin. De introductiezin is correct — de fout zit in het ontbreken van de roepnaam daarin.
3. AANBEVELING: altijd in de vorm "Voeg 'ook te noemen [roepnaam]' toe aan de introductiezin: '[volledige officiële naam], ook te noemen '[roepnaam]', geboren te [...]'." NOOIT de introductiezin herschrijven zodat de roepnaam de hoofdnaam wordt.

**issues (juridisch)** — Primaire dimensie: "juridisch". Voeg extra dimensies toe als het issue ook een ander aspect raakt (bijv. ["juridisch","conflicten"] als de clausule zowel wettelijk onjuist als intern tegenstrijdig is).${juridischeChecks}${hvChecks}

- Gebruik uitsluitend wetsartikelen uit de WETSARTIKELEN-sectie.
- Standaardclausules uit WETSARTIKELEN nooit als fout aanmerken.
- Geef bij "aanbeveling" de exacte tekst die de mediator direct kan overnemen.
- Vul bij elk issue het veld 'passage' met een verbatim citaat van de ZIN OF BULLET DIE DE FOUT BEVAT (niet de omringende context of de vorige zin). NOOIT een persoonsomschrijving of naamsdefinitie als passage — als de fout in een specifiek bedrag, datum of clausule zit, citeer dan die zin.
- NOOIT juridisch als het veld NIET INGEVULD is: lege bedragen ("€ ,–"), blanco data, sjabloonplaatshouders ("___", "*OF") en andere invulresten zijn ALTIJD volledigheid. Een leeg veld is geen juridische fout — het is een ontbrekend gegeven.
- NOOIT juridisch als een zin inhoudelijk onvolledig is: een zin die wel aanwezig is maar geen concrete afspraak bevat (bijv. "Afspraken over X." zonder verder iets), is ALTIJD volledigheid — zelfs als het onderwerp juridisch relevant is.
- Bij twijfel: geen issue. Speculeer niet.
- ALLEEN echte problemen rapporteren. Leg NOOIT een issue vast als het document aan de eis voldoet. Positieve bevestigingen ("Geen issue", "Voldoet aan...", "Geen actie vereist", "Correct geregeld") horen NIET in de issues-lijst — die lijst bevat uitsluitend punten die de mediator moet aanpassen of controleren.

**issues (balans)** — Primaire dimensie: "balans". Voeg extra dimensies toe waar van toepassing (bijv. ["balans","juridisch"] bij een alimentatiebedrag dat zowel eenzijdig is als wettelijk onjuist berekend). Onderwerpen: alimentatiebedragen, eenzijdige clausules, asymmetrische indexering, ongemotiveerde afwijking van wettelijke maatstaven.
- ZORGVERDELING-TABELLEN: beoordeel altijd de volledige cyclus (oneven + even week samen). Als de even week het spiegelbeeld is van de oneven week → het schema is per definitie symmetrisch. Het patroon waarbij één ouder de maandagochtend heeft en de andere ouder de rest t/m de volgende maandagochtend ("weekwissel op maandag") is een standaard Nederlands co-ouderschapspatroon — dit is geen asymmetrie en geen fout.

**issues (grammatica)** — Dimensies ["grammatica"]. Scan het VOLLEDIGE document op:
- Spelling- en tikfouten (bijv. 'invullen' waar 'invulling' bedoeld is, dubbele spaties, hoofdletterfouten)
- Interpunctiefouten: ontbrekende punt, komma, puntkomma of alineascheiding die de leesbaarheid verslechtert. Dit is ALTIJD een grammatica-issue — NOOIT juridisch, ook niet als de bepaling daardoor minder duidelijk wordt.
- Dubbele woorden (bijv. "Land Rover Land Rover", "de de kinderen")
- Foutieve of onvolledige zinsconstructies (bijv. ontbrekend hoofdwerkwoord: 'Moeder die ze naar school brengt' — dit is geen volledige zin)
- Inconsistente aanduidingen: zelfde persoon/datum/bedrag op verschillende plekken anders gespeld of benoemd (inclusief hoofdlettergebruik van bedrijfs- of instellingsnamen, bijv. 'peaks' vs. 'Peaks')
- BEDRAGOPMAAK — verplichte precisie: onderscheid altijd tussen (a) ontbrekend €-teken: het getal heeft géén valutateken → echt probleem; en (b) ontbrekende ',-' suffix: bedrag heeft wél €-teken maar mist de standaard afsluiting (bijv. "€ 5.569" vs. "€ 5.569,-") → opmaakinconsistentie. NOOIT beweren dat een €-teken ontbreekt als het er wél staat. Controleer elk bedrag in de relevante passage afzonderlijk.
- REKENINGNUMMERS EN KENMERKEN: citeer altijd het exacte kenmerk/rekeningnummer uit het document en koppel het aan het juiste bedrag. Nooit hetzelfde kenmerk twee keer noemen voor verschillende bedragen — dat is een fout in de bevinding zelf.
- Niet-uitvoerbare afspraken door vage bewoording ('eventueel', 'zo mogelijk', 'nader te bepalen' zonder concrete uitwerking)
- Voornaamwoord-inconsistenties (hij/zij/zijn/haar/hem) NOOIT rapporteren. Dit geldt zonder uitzondering.
- Roepnamen (voornamen) van eerder geïntroduceerde partijen zijn GELDIGE verwijzingen. Als een partij is geïntroduceerd met volledige naam, is het gebruik van alleen de voornaam of de bezitsvorm (bijv. 'Peters' als verwijzing naar iemand genaamd 'Peter') een geldige verkorte aanduiding. Rapporteer dit NOOIT als naamsfout of als verwijzing naar een onbekende persoon.
- Tweede voornamen (middelste namen) weglaten is NORMALE schrijfpraktijk in Nederlandse juridische documenten. Als een partij is geïntroduceerd als 'Willem David ter Kulve', is 'Willem ter Kulve' of 'W. ter Kulve' een geldige verkorte aanduiding — ook bij bankrekening-vermeldingen of kopregels. Rapporteer dit NOOIT als inconsistentie in de naamsvermelding.
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
- PASSAGE-DEDUPLICATIE: NOOIT twee issues met EXACT DEZELFDE passage. Als één passage meerdere problemen heeft (bijv. zowel grammaticaal onhelder als inhoudelijk onvolledig), rapporteer uitsluitend het zwaarste conform de dimensie-voorrangsvolgorde: juridisch > conflicten > volledigheid > balans > grammatica. LET OP: deze voorrangsvolgorde geldt UITSLUITEND voor deduplicatie bij exact dezelfde passage — gebruik hem NIET als algemene classificatieregel. Een grammaticafout (tikfout, ontbrekend leesteken, dubbel woord) is en blijft grammatica, ook als hij in een juridisch artikel staat.
- Bij twijfel: geen issue. Speculeer niet.

ZELFCONTROLE (verplicht vóór afsluiting): Controleer de volledige issues-lijst op de volgende patronen:
1. ZELFDE PASSAGE: twee issues met exact hetzelfde verbatim citaat → bewaar alleen het zwaarste.
2. ZELFDE BEDRAG/DATUM-CONFLICT: twee issues die hetzelfde getalpaar of datumpaar benoemen als inconsistentie (bijv. "€ 462" vs "€ 463" in twee afzonderlijke issues) → verwijder het minder ernstige en verwerk de extra context in het bewaarde issue.
3. ZELFDE KERN-ONDERWERP: twee issues die hetzelfde fundamentele probleem beschrijven maar anders geformuleerd (bijv. "Fiscaal partnerschap: einddatum niet concreet" en "Fiscaal partnerschap: einddatum niet expliciet vastgelegd") → fuseer tot één issue met de meest volledige bevinding en aanbeveling. Let speciaal op: als twee issues HETZELFDE SPECIFIEKE BEDRAG noemen in hun titel (bijv. beide "€ 116.600 overbedeling"), beschrijven ze altijd hetzelfde probleem — fuseer altijd, ook als de invalshoek verschilt (bijv. "ontbreekt in hoofdtekst" en "tegenstrijdig met tekst").
4. PERSOONSGEBONDEN PATROON: meerdere issues die variaties zijn van DEZELFDE fout voor DEZELFDE persoon (bijv. drie genderfouten voor Kind X op verschillende plekken, of twee naamsspellingsfouten voor dezelfde partij) → combineer ALTIJD tot EEN issue. Noem in de bevinding alle plekken waar de fout voorkomt, en geef één allesomvattende aanbeveling.
5. REKENKUNDIGE VERIFICATIE: Zoek ALLE vermelde rekensommen in het document: optellingen van bedragen, verschilberekeningen (A − B), procenten van een totaal, resterende budgetten. Reken ELKE som zelf na. Als de berekende uitkomst afwijkt van de vermelde uitkomst → voeg een issue toe (dimensie ["conflicten"], ernst "hoog") met: (a) de correcte berekening en uitkomst, (b) de vermelde (incorrecte) uitkomst, en (c) als passage een verbatim citaat van de zin met het onjuiste getal. Voorbeeld: document vermeldt "€ 834 + € 861 + € 238 = € 1.695" maar 834 + 861 + 238 = 1.933 → dit is een rekenkundige fout, rapporteer het.
Pas de lijst aan vóór je de tool aanroept.

DIMENSIE-VERBOD: De dimensie "cross_doc" mag NOOIT worden gebruikt in deze call. Toegestane dimensies: "juridisch", "volledigheid", "balans", "grammatica", "conflicten". Cross-document vergelijkingen worden verwerkt in een aparte, dedicated analyse.`;

      const stabielBlokWet = `WETSARTIKELEN:\n${wetTekst || '(geen)'}`;

      // Helper om gecachede contextblok als array te leveren (leeg als geen bijlagen)
      const mkCtx = () => contextBlok ? [{ text: contextBlok, cache: true }] : [];

      // Filter gender/voornaamwoord-issues — onbetrouwbaar bij gezinnen met meerdere kinderen.
      const filterGenderIssues = (result) => {
        if (!Array.isArray(result?.issues)) return result;
        const GENDER_RE = /voornaamwoord|geslacht|genderfout|gender/i;
        const filtered = result.issues.filter(iss => {
          const tekst = (iss.onderwerp || '') + ' ' + (iss.bevinding || '');
          return !GENDER_RE.test(tekst);
        });
        return { ...result, issues: filtered };
      };

      const callMetSse = (clodeFn, type) =>
        clodeFn().then(
          result => {
            const gefilterd = filterGenderIssues(result);
            sse({ type, bestandsnaam: doc.bestandsnaam, result: gefilterd });
            return gefilterd;
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
      // Na alle analyses volgt een server-side Haiku-consolidatiestap (semantische dedup over
      // structuurR + bevindingenR + cross_doc issues gecombineerd). Die stap vervangt de
      // complexe client-side dedupIssues() Passes 1–4 wanneer de consolidatie slaagt.
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
        ], bevindingentool, MAX_OUTPUT_TOKENS), 'juridisch'),
      ]);

      // Signaleer 'balans'-call als afgerond zodat de frontend loading-state correct afsluit.
      // (Frontend wacht op structuur + juridisch + balans; balans is nu samengevoegd met juridisch.)
      sse({ type: 'balans', bestandsnaam: doc.bestandsnaam, result: { issues: [] } });

      console.log(`[analyseer] ${doc.bestandsnaam}: klaar (${(Array.isArray(structuurR?.issues) ? structuurR.issues.length : 0) + (Array.isArray(bevindingenR?.issues) ? bevindingenR.issues.length : 0)} issues totaal)`);
      return { bestandsnaam: doc.bestandsnaam, structuurR, bevindingenR };
    };

    // ── Cross-document verificatie: start parallel met per-doc loop ──────────
    // docBlokken en sysCrossDoc zijn opgebouwd uit documentteksten die al beschikbaar
    // zijn vóór de eerste Claude-call — geen reden om op per-doc resultaten te wachten.
    let crossDocPromise = null;
    if (effectiefHoofd.length >= 2) {
      const docBlokken = effectiefHoofd
        .map(d => `=== ${d.type.toUpperCase()}: ${d.bestandsnaam} ===\n${d.tekst}`)
        .join('\n\n---\n\n');

      const docTypenLabel = effectiefHoofd.map(d => d.type).join(' en ');

      const sysCrossDoc =
`Je bent een ervaren familierechtjurist. Je legt twee documenten naast elkaar: ${docTypenLabel}.

TAAK: Vind uitsluitend inconsistenties die ALLEEN ZICHTBAAR zijn door BEIDE documenten samen te lezen.
Rapporteer NIET wat al in één document afzonderlijk een fout is — alleen wat TUSSEN de documenten botst of ontbreekt.
Als een issue slechts in één document zichtbaar is (interne fout van dat document), laat het dan VOLLEDIG weg — het is al gevonden door de per-document analyse.

ABSOLUUT VERBOD — GESLACHT/VOORNAAMWOORDEN: Rapporteer NOOIT een gender- of voornaamwoord-inconsistentie, noch binnen één document noch tussen documenten. Voornaamwoorden ('hij', 'zij', 'zijn', 'haar') wisselen vanzelf per persoon of per kind — dit is GEEN cross-document issue.

Zoek op ALLE dimensies (gebruik uitsluitend deze drie — NOOIT "conflicten" of "grammatica"):
- VOLLEDIGHEID ["volledigheid"]: document A verwijst voor een onderwerp naar document B, maar dat onderwerp ontbreekt in document B
- JURIDISCH ["juridisch"]: een bepaling in A die een bepaling in B inconsistent maakt of wettelijk onderuit haalt, of een afwijkende datum/bedrag met juridische gevolgen
- BALANS ["balans"]: een clausule die in A en B anders uitpakt of eenzijdig is over de documenten heen

Gebruik NOOIT "conflicten" als dimensie: cross-document tegenstrijdigheden zijn al geïdentificeerd als cross-doc en hoeven geen extra conflicten-tag.
Gebruik NOOIT "grammatica" als dimensie: spellingsverschillen of notatiestijl-verschillen tussen documenten horen niet in de cross-doc analyse thuis.

CLASSIFICATIEREGEL REKENINGNUMMERS/IBAN: Als een IBAN of rekeningnummer in A en B verschilt, of als naam/saldo bij dezelfde rekening afwijkt → gebruik ALTIJD "volledigheid". Een rekening heeft één feitelijk juiste IBAN — de afwijking betekent dat één document onjuist is ingevuld, geen juridisch eigendomsconflict. Dit is dus NOOIT "juridisch" en NOOIT "balans".
Voor betreft_documenten bij IBAN-issues: de fix zit in het document dat de tenaamstelling of het rekeningnummer onjuist/onvolledig vermeldt (doorgaans het convenant). Gebruik als passage de zin uit het ANDERE document (bijv. het ouderschapsplan) die toont hoe de rekening daar correct wordt beschreven — dit geeft de gebruiker de context om te begrijpen wat er moet kloppen.

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
Vul 'passage' ALTIJD in met een verbatim citaat dat het issue illustreert.

Bij issues die slechts ÉÉN document betreffen (betreft_documenten bevat één type):
1. Citeer de zin in dát document die het conflict of de afwijking ZELF bevat.
2. Als die ontbreekt (sectie geheel afwezig): citeer de zin uit het ANDERE document die aantoont wat er mist.

Bij issues die BEIDE documenten betreffen (betreft_documenten: beide):
- Citeer altijd de zin uit het EERSTE document van betreft_documenten[0].
  Voorbeeld: betreft_documenten = ["ouderschapsplan","convenant"] → gebruik een zin uit het OUDERSCHAPSPLAN.
- Dit is verplicht omdat de passage in het tabblad van betreft_documenten[0] getoond wordt en zichtbaar moet zijn in dat document.
- Alleen als betreft_documenten[0] GEEN relevante zin heeft, gebruik dan een zin uit het tweede document.

Laat 'passage' ALLEEN leeg als GEEN VAN BEIDE documenten een citeerbare zin bevat.

VERBODEN als passage (dit zijn NOOIT goede passages):
- Een zin die enkel een persoon introduceert: "Jan de Vries, geboren te Amsterdam op 12-03-1980" → FOUT
- Een zin die enkel een kind noemt zonder concrete afspraak: "Maartje Wilma Antonia Schreven geboren te Deventer op 29-01-2015" → FOUT
- Een sectietitel of kopje zonder het conflicterende getal/datum zelf → FOUT

CORRECT voorbeeld bij een peildatum-conflict:
- "De peildatum voor de spaarrekeningen van de kinderen is vastgesteld op 15-03-2026." → GOED
- "Het saldo op rekening NL91INGB... per 15-03-2026 bedraagt € 4.200,-." → GOED

WETSARTIKELEN:\n${wetTekst || '(geen)'}`;

      sse({ type: 'cross_doc_start', documenten: effectiefHoofd.map(d => d.type) });
      crossDocPromise = askClaude(sysCrossDoc, docBlokken, crossDocTool, 6000);
    }

    // Verwerk max 2 documenten tegelijk (rate-limit bescherming)
    const CONCURRENT = 2;
    const perDocResultaten = new Map(); // bestandsnaam → { structuurR, bevindingenR }
    for (let i = 0; i < effectiefHoofd.length; i += CONCURRENT) {
      const golf = effectiefHoofd.slice(i, i + CONCURRENT);
      const resultaten = await Promise.allSettled(golf.map(analyseDoc));
      for (const r of resultaten) {
        if (r.status === 'rejected') throw r.reason;
        if (r.value?.bestandsnaam) perDocResultaten.set(r.value.bestandsnaam, r.value);
      }
    }

    // ── Cross-document resultaat verwerken (call liep parallel mee) ───────────
    const crossIssuesPerDoc = new Map(); // bestandsnaam → issues[] (voor consolidatie)
    if (crossDocPromise) {
      try {
        const _crossRaw = await crossDocPromise;
        // Zelfde gender-filter als per-document calls — cross-doc omzeilt callMetSse.
        const GENDER_RE_CD = /voornaamwoord|geslacht|genderfout|gender/i;
        const crossResult = Array.isArray(_crossRaw?.issues)
          ? { ..._crossRaw, issues: _crossRaw.issues.filter(iss =>
              !GENDER_RE_CD.test((iss.onderwerp || '') + ' ' + (iss.bevinding || ''))) }
          : _crossRaw;
        if (Array.isArray(crossResult?.issues) && crossResult.issues.length > 0) {
          // Ken elk cross-doc issue een stabiele gedeelde ID toe zodat state-sync mogelijk is
          const { randomUUID } = await import('crypto');
          const issuesMetId = crossResult.issues.map(iss => ({
            ...iss,
            cross_doc_id: randomUUID(),
            dimensies: [...new Set([
              ...(Array.isArray(iss.dimensies) ? iss.dimensies.filter(d => d !== 'conflicten' && d !== 'grammatica') : []),
              'cross_doc',
            ])],
          }));
          for (const d of effectiefHoofd) {
            // Stuur issues die dit document-type betreffen (beide documenten ontvangen gedeelde cross-doc issues)
            const relevantIssues = issuesMetId.filter(iss => {
              const bd = iss.betreft_documenten;
              if (!Array.isArray(bd) || bd.length === 0) return true; // ontbrekend veld: naar alle docs
              return bd.includes(d.type);
            });
            crossIssuesPerDoc.set(d.bestandsnaam, relevantIssues);
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

    // ── Server-side semantische deduplicatie via Haiku ────────────────────────
    // Stuurt een 'consolidatie'-event per document dat de frontend gebruikt als
    // definitieve issue-lijst (vervangt client-side dedupIssues indien aanwezig).
    if (perDocResultaten.size > 0) {
      const consolidatieTool = {
        name: 'consolideer_issues',
        description: 'Verwijder semantisch identieke of sterk overlappende issues. Houd van elke groep het meest informatieve exemplaar.',
        input_schema: {
          type: 'object',
          properties: {
            te_bewaren: {
              type: 'array',
              items: { type: 'integer' },
              description: 'Indices (0-gebaseerd) van de issues die behouden moeten worden, in oplopende volgorde. Geef ALTIJD minimaal de indices terug van alle unieke issues.',
            },
          },
          required: ['te_bewaren'],
        },
      };
      const sysConsolidatie =
`Je analyseert een genummerde lijst van juridische issues uit een echtscheidingsdocument.
De lijst bevat issues uit meerdere analyse-calls (structuur, bevindingen, cross-document) die hetzelfde probleem soms dubbel rapporteren.

Taak: verwijder semantisch identieke of sterk overlappende issues.
Merge-criteria (verwijder het issue met de lagere ernst of lagere juridische prioriteit):
- Zelfde passage + zelfde kernprobleem, ook al verschillen de woorden van de titel.
- Per-document issue en cross-document issue over hetzelfde concrete feit (bijv. zelfde IBAN, zelfde tegenstrijdigheid, zelfde ontbrekend veld).
- Twee dimensie-varianten van hetzelfde probleem (bijv. "onvolledig" én "onvolledige zin" over exact dezelfde passage).

Bewaar issues die écht een ander probleem beschrijven of die samen meer informatie geven dan elk apart.
Bij twijfel: bewaar het issue.
Geef ALTIJD minimaal één index terug.`;

      for (const doc of effectiefHoofd) {
        const pdRes = perDocResultaten.get(doc.bestandsnaam);
        const rawIssues = [
          ...(pdRes?.structuurR?.issues  ?? []),
          ...(pdRes?.bevindingenR?.issues ?? []),
          ...(crossIssuesPerDoc.get(doc.bestandsnaam) ?? []),
        ];
        // IBAN-validatie: verwijder issues met niet-bestaande IBANs en tegenstrijdige IBAN-conclusies
        const allIssues = filterIssuesOpIban(rawIssues, doc.tekst ?? '');
        if (allIssues.length < rawIssues.length)
          console.log(`[iban] ${doc.bestandsnaam}: ${rawIssues.length - allIssues.length} issue(s) verwijderd door IBAN-validatie`);
        if (allIssues.length < 2) {
          sse({ type: 'consolidatie', bestandsnaam: doc.bestandsnaam, result: { issues: allIssues } });
          continue;
        }
        try {
          const genummerd = allIssues
            .map((iss, i) => `[${i}] (${iss.ernst}) ${iss.onderwerp}: ${(iss.bevinding || '').slice(0, 150)}`)
            .join('\n');
          const consolidatieRes = await askClaude(
            sysConsolidatie,
            genummerd,
            consolidatieTool,
            800,
            'claude-haiku-4-5-20251001',
          );
          const geldigeIndices = (Array.isArray(consolidatieRes?.te_bewaren) ? consolidatieRes.te_bewaren : [])
            .filter(i => typeof i === 'number' && i >= 0 && i < allIssues.length);
          const teBewarenSet = new Set(geldigeIndices);
          const geconsolideerd = teBewarenSet.size > 0
            ? allIssues.filter((_, i) => teBewarenSet.has(i))
            : allIssues; // veiligheidsfallback: bewaar alles
          const verwijderd = allIssues.length - geconsolideerd.length;
          if (verwijderd > 0) console.log(`[analyseer] consolidatie ${doc.bestandsnaam}: ${verwijderd} duplicaat(en) verwijderd`);
          sse({ type: 'consolidatie', bestandsnaam: doc.bestandsnaam, result: { issues: geconsolideerd } });
        } catch (err) {
          console.warn(`[analyseer] consolidatie mislukt voor ${doc.bestandsnaam}:`, err.message);
          // Niet-fataal: frontend valt terug op client-side dedupIssues
        }
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
