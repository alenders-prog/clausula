/**
 * api/screen.js
 *
 * POST { filename, content_base64 } → screeningsrapport.
 *
 * Drie parallelle Claude-aanroepen (gelijk aan de frontend-pipeline):
 *   1. structuurTool   — samenvatting + volledigheid-issues
 *   2. juridischTool   — juridische issues
 *   3. balansGramTool  — balans- en grammatica-issues
 *
 * Rapport-schema v2: issues[] — elk uniek probleem één keer, met dimensie-tags.
 *
 * Retry-logica: tot 2× herpoging bij netwerk/5xx-fouten (5s, 10s wachttijd).
 */

import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Claude API helper met retry ───────────────────────────────────────────────
async function askClaudeForJson(systemPrompt, userPrompt, tool, maxTokens = 4096) {
  const body = {
    model:       'claude-fable-5',
    max_tokens:  maxTokens,
    system:      systemPrompt,
    messages:    [{ role: 'user', content: userPrompt }],
    tools:       [tool],
    tool_choice: { type: 'tool', name: tool.name },
  };

  let lastErr;
  for (let poging = 0; poging <= 2; poging++) {
    if (poging > 0) {
      console.warn(`[Claude/${tool.name}] Herpoging ${poging}/2, wacht ${poging * 5}s…`);
      await new Promise(r => setTimeout(r, poging * 5000));
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json    = await res.json();
        const toolUse = json.content?.find((b) => b.type === 'tool_use');
        if (!toolUse) throw new Error('Claude gaf geen tool-aanroep terug.');
        return toolUse.input;
      }

      // 400/401 = echte inputfout, niet retryable
      if (res.status === 400 || res.status === 401) {
        const txt = await res.text();
        throw new Error(`Claude API fout (${res.status}): ${txt}`);
      }

      const txt = await res.text();
      lastErr = new Error(`Claude API fout (${res.status}): ${txt}`);
      console.warn(`[Claude/${tool.name}] HTTP ${res.status} — herpoging…`);
    } catch (err) {
      if (err.message.startsWith('Claude API fout') || poging === 2) throw err;
      lastErr = err;
      console.warn(`[Claude/${tool.name}] Fout — herpoging: ${err.message}`);
    }
  }
  throw lastErr;
}

// ── Stap 1: classificatie ─────────────────────────────────────────────────────
const classificatieTool = {
  name: 'classificeer_document',
  description: 'Registreert de classificatie van een echtscheidingsdocument.',
  input_schema: {
    type: 'object',
    properties: {
      doc_type:           { type: 'string', enum: ['convenant', 'ouderschapsplan', 'onbekend'] },
      situatie_kenmerken: { type: 'array', items: { type: 'string' } },
      partij_a_naam:      { type: 'string' },
      partij_b_naam:      { type: 'string' },
      samenvatting:       { type: 'string' },
    },
    required: ['doc_type', 'situatie_kenmerken', 'partij_a_naam', 'partij_b_naam', 'samenvatting'],
  },
};

// ── Gedeeld issue-item schema ─────────────────────────────────────────────────
const issueItem = {
  type: 'object',
  properties: {
    onderwerp:   { type: 'string' },
    ernst:       { type: 'string', enum: ['laag', 'midden', 'hoog'] },
    dimensies:   { type: 'array', items: { type: 'string' } },
    bevinding:   { type: 'string' },
    aanbeveling: { type: 'string' },
    passage:     { type: 'string', description: 'Verbatim citaat van maximaal 80 tekens uit het document dat het probleem aantoont. Kopieer de exacte tekst, inclusief leestekens.' },
  },
  required: ['onderwerp', 'ernst', 'dimensies', 'bevinding', 'aanbeveling', 'passage'],
};

// ── Stap 2a: structuur-tool ───────────────────────────────────────────────────
const structuurTool = {
  name: 'registreer_structuur',
  description: 'Registreert samenvatting en volledigheid-issues.',
  input_schema: {
    type: 'object',
    properties: {
      samenvatting: { type: 'string' },
      issues: {
        type: 'array',
        description: 'Volledigheid-issues — alleen ontbrekende of onvolledige secties. Dimensies altijd ["volledigheid"].',
        items: issueItem,
      },
    },
    required: ['samenvatting', 'issues'],
  },
};

// ── Stap 2b: juridisch-tool ───────────────────────────────────────────────────
const juridischTool = {
  name: 'registreer_juridisch',
  description: 'Registreert juridische bevindingen.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        description: 'Juridische issues — dimensies altijd ["juridisch"].',
        items: issueItem,
      },
    },
    required: ['issues'],
  },
};

// ── Stap 2c: balans+grammatica-tool ──────────────────────────────────────────
const balansGramTool = {
  name: 'registreer_balans_grammatica',
  description: 'Registreert balans- en grammatica-issues.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        description: 'Balans/grammatica-issues — dimensies ["balans"] of ["grammatica"] per issue.',
        items: issueItem,
      },
    },
    required: ['issues'],
  },
};

// ── Tekst extractie ──────────────────────────────────────────────────────────
async function extractText(filename, buffer) {
  if (filename.toLowerCase().endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (filename.toLowerCase().endsWith('.pdf')) {
    const data = await pdf(buffer);
    return data.text;
  }
  throw new Error('Alleen .docx en .pdf worden ondersteund.');
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  try {
    const { filename, content_base64 } = req.body;
    if (!filename || !content_base64) {
      return res.status(400).json({ error: 'filename en content_base64 zijn verplicht' });
    }

    const buffer        = Buffer.from(content_base64, 'base64');
    const documentTekst = await extractText(filename, buffer);

    if (documentTekst.trim().length < 200) {
      return res.status(400).json({ error: 'Kon weinig tot geen tekst uit het bestand halen. Is het leesbaar?' });
    }

    // ── 1. Classificatie (Haiku — snel en goedkoop) ────────────────────────
    const { data: kenmerken } = await supabase
      .from('situatie_kenmerken').select('key, label, categorie');
    const kenmerkenLijst = (kenmerken ?? []).map((k) => `${k.key} (${k.label})`).join(', ');

    const classificatie = await askClaudeForJson(
      `Je classificeert een Nederlands echtscheidingsdocument en haalt de namen van beide partijen eruit.
Gebruik voor situatie_kenmerken UITSLUITEND keys uit deze lijst: ${kenmerkenLijst}`,
      documentTekst.slice(0, 6000),
      classificatieTool,
      1024
    );

    // ── 2. Kennisbank ophalen ──────────────────────────────────────────────
    const situatieKenmerken = classificatie.situatie_kenmerken ?? [];
    const docType = classificatie.doc_type === 'onbekend' ? 'convenant' : classificatie.doc_type;
    const wetsQueryTags = [...new Set([...situatieKenmerken, docType])];

    const [{ data: wetteksten }, { data: standaardClausules }, { data: templates }] = await Promise.all([
      supabase.from('legal_chunks').select('citation, content')
        .overlaps('topic_tags', wetsQueryTags).limit(40),
      // Standaardclausules altijd meeladen — voorkomt valse positieven
      supabase.from('legal_chunks').select('citation, content')
        .eq('source_id', '10000000-0000-0000-0000-000000000001')
        .eq('chunk_index', 28).limit(1),
      supabase.from('document_templates')
        .select('section_name, required, applies_when, instructions')
        .eq('doc_type', docType).order('section_order'),
    ]);

    const _wettekstenAll = [...(wetteksten ?? [])];
    const _stdCit = 'Gangbare correcte standaardclausules in Nederlandse echtscheidingsdocumenten';
    if (standaardClausules?.length && !_wettekstenAll.some(w => w.citation === _stdCit)) {
      _wettekstenAll.push(...standaardClausules);
    }

    const checklist = (templates ?? []).filter(
      (t) => !t.applies_when || t.applies_when.every((tag) => situatieKenmerken.includes(tag))
    );
    const checklistTekst = checklist.map((c) => `- ${c.section_name}: ${c.instructions ?? ''}`).join('\n');
    const wetTekst = _wettekstenAll.map((w) => `[${w.citation}] ${w.content}`).join('\n\n');

    const docTypLabel = docType === 'ouderschapsplan' ? 'Ouderschapsplan' : 'Echtscheidingsconvenant';
    const docTekstBlok = `DOCUMENTTEKST:\n${documentTekst}`;

    // ── 3. Drie parallelle analyse-calls ───────────────────────────────────
    const sysStructuur =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert.

**issues (volledigheid)** — Rapporteer ALLEEN secties die ontbreken of onvolledig zijn.
Per issue: dimensies altijd ["volledigheid"]. Ernst (wees terughoudend met 'hoog'): hoog = verplichte sectie volledig afwezig én direct onuitvoerbaar daardoor, midden = ontbreekt of onvolledig maar herstelbaar (standaard voor de meeste issues), laag = aandachtspunt of kleine onvolledigheid.

STRIKTE REGELS:
- Geef alleen bevindingen die daadwerkelijk uit het document blijken. Speculeer niet.
- Bij twijfel of een sectie ontbreekt of onvolledig is: geef GEEN issue.
- Aanwezige en correcte secties worden NIET gerapporteerd.
- Vul passage altijd in met een verbatim citaat (max 80 tekens) uit het document. Bij een ontbrekende sectie: geef de dichtstbijzijnde gerelateerde passage.`;

    const sysJuridisch =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op juridische correctheid.

**issues (juridisch)** — Controleer op: partneralimentatie (art. 1:157-160 BW), kinderalimentatie (art. 1:404 BW, Tremanormen), pensioenverevening (WVPS), woning (art. 3:170 BW), belasting, vermogen (art. 1:94 BW), schulden, gezag en zorgregeling.

Per issue: dimensies altijd ["juridisch"]. Ernst (wees terughoudend met 'hoog'): hoog = evidente wettelijke overtreding of volstrekte onuitvoerbaarheid (hoge drempel), midden = juridisch risico of onduidelijkheid die aanpassing verdient (standaard voor de meeste issues), laag = best practice of verbetersuggestie zonder urgent rechtsgevolg.

STRIKTE REGELS:
- Gebruik uitsluitend wetsartikelen uit de WETSARTIKELEN-sectie, of die je met absolute zekerheid kent.
- Geef bij "aanbeveling" de exacte tekst die de mediator direct kan overnemen.
- Geef alleen bevindingen die daadwerkelijk uit het document blijken. Speculeer niet.
- Bij twijfel of een formulering juridisch correct of gangbaar is: geef GEEN issue.
- Standaardclausules die in de WETSARTIKELEN-sectie als correct zijn gemarkeerd, nooit als fout aanmerken.
- Vul passage altijd in met een verbatim citaat (max 80 tekens) uit het document dat het juridische probleem aantoont.`;

    const sysBalansGram =
`Je bent een ervaren familierechtjurist die een Nederlands ${docTypLabel} controleert op evenwichtigheid en taal.

**issues (balans)** — Onevenwichtigheden: alimentatiebedragen, eenzijdige clausules, asymmetrische indexering.
**issues (grammatica)** — Taalfouten die juridische betekenis raken: tegenstrijdige zinnen, vage verwijzingen, inconsistente bedragen/datums.

Per issue: dimensies ["balans"] of ["grammatica"].

STRIKTE REGELS:
- Geef alleen bevindingen die daadwerkelijk uit het document blijken. Speculeer niet.
- Bij twijfel of iets onevenwichtig of fout is: geef GEEN issue.
- Vul passage altijd in met een verbatim citaat (max 80 tekens) uit het document dat het probleem illustreert.`;

    const [structuurR, juridischR, balansGramR] = await Promise.all([
      askClaudeForJson(sysStructuur,
        `VERWACHTE SECTIES:\n${checklistTekst}\n\nWETSARTIKELEN:\n${wetTekst || '(geen)'}\n\n${docTekstBlok}`,
        structuurTool, 6000),
      askClaudeForJson(sysJuridisch,
        `WETSARTIKELEN:\n${wetTekst || '(geen)'}\n\n${docTekstBlok}`,
        juridischTool, 6000),
      askClaudeForJson(sysBalansGram,
        `WETSARTIKELEN:\n${wetTekst || '(geen)'}\n\n${docTekstBlok}`,
        balansGramTool, 6000),
    ]);

    // ── 4. Dedup: gelijke onderwerpen samenvoegen ──────────────────────────
    const ERNST_ORD = { hoog: 0, midden: 1, laag: 2 };
    const _sIss = Array.isArray(structuurR?.issues)   ? structuurR.issues   : [];
    const _jIss = Array.isArray(juridischR?.issues)   ? juridischR.issues   : [];
    const _bIss = Array.isArray(balansGramR?.issues)  ? balansGramR.issues  : [];
    const kaart = new Map();

    for (const iss of [..._sIss, ..._jIss, ..._bIss]) {
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

    const alleIssues = [...kaart.values()]
      .sort((a, b) => (ERNST_ORD[a.ernst] ?? 1) - (ERNST_ORD[b.ernst] ?? 1))
      .map(i => ({ ...i, afgehandeld: false, opmerking: '' }));

    const rapport = {
      samenvatting: structuurR?.samenvatting || '',
      issues:       alleIssues,
    };

    return res.status(200).json({ classificatie, rapport });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
