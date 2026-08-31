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
import { meetAanroep, wachtOpVerbruik } from './_verbruik.js';
import { filterIssuesOpIban } from './_iban.js';
import { bouwConsolidatieLijst } from './_dedup-passage.js';
import { hoortBijDocument } from './_cross-doc-toewijzing.js';
import { gebruikerContext } from './_auth.js';
import {
  consistentieTool, sysConsistentie, bouwConsistentieLijst, pasCorrectiesToe,
} from './_consistentie.js';
// De prompts staan apart in api/_prompts/. Wijzigingen daar raken de screening-
// kwaliteit en horen gevolgd te worden door `npm run test:eval`.
//
// Het liggende streepje is geen stijlkeuze: Vercel maakt van élk bestand in api/
// een serverless functie, en op het Hobby-plan mogen dat er hoogstens twaalf zijn.
// Met negen endpoints erbij liep de map prompts/ de deploy stuk op vijftien.
// Bestanden met _ ervoor worden niet als endpoint geteld — vandaar ook _iban.js,
// _auth.js en de rest.
import { bouwStabielGedeeld, bouwStabielCrossDoc } from './_prompts/gedeeld.js';
import { bouwSysStructuur }   from './_prompts/structuur.js';
import { bouwSysBevindingen } from './_prompts/bevindingen.js';
import { bouwSysCrossDoc }    from './_prompts/cross-doc.js';
import { SYS_CONSOLIDATIE }   from './_prompts/consolidatie.js';
import {
  bouwAnderDocsNota, bouwRoepnamenNota, bouwJuridischeChecks,
  bouwHvChecks, bouwIprChecks, bouwMfnInstructie,
} from './_prompts/fragmenten.js';
import { afgeleideKenmerken } from '../src/rapport/internationaal.js';
import { tijdsbudget } from '../src/tijdsbudget.js';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

// Maximale output die we ooit nodig zullen hebben. max_tokens is een plafond,
// geen verbruiksmeter — je betaalt alleen voor tokens die Claude daadwerkelijk genereert.
const MAX_OUTPUT_TOKENS = 32000;

// De fase voor api_verbruik, afgeleid uit de toolnaam. Zo hoeft geen enkele
// aanroepplek te veranderen — en kan de fase ook niet per ongeluk vrije tekst worden.
const FASE_PER_TOOL = {
  registreer_structuur:            'structuur',
  registreer_bevindingen:          'bevindingen',
  registreer_cross_doc_bevindingen: 'cross_doc',
  consolideer_issues:              'consolidatie',
};

// Wie de analyse draait, en welke analyse het is.
//
// Dit stond eerst in een gewone modulevariabele. Bij twee analyses die tegelijk in
// hetzelfde proces landen overschrijft de één de context van de ander, en dan staan de
// kosten van kantoor A onder kantoor B. Met screening_id erbij wordt dat erger: dan
// klopt "wat kostte déze analyse" niet meer.
//
// AsyncLocalStorage houdt de context vast aan de aanroepketen van één verzoek. Met
// enterWith is dat één regel in de handler, zonder de hele functie in een callback te
// hoeven wikkelen.
import { AsyncLocalStorage } from 'node:async_hooks';
const _meetOpslag = new AsyncLocalStorage();
const meetContext = () => _meetOpslag.getStore() || { organisatieId: null, gebruikerId: null };

// ── Tijdsbudget van de analyse ───────────────────────────────────────────────
//
// Op 31 augustus 2026 werd een analyse van twee documenten na 120 seconden door Vercel
// doodgeschoten. Eén van de twee bevindingen-aanroepen was nog bezig; die kwam er nooit,
// de consolidatie draaide niet, en de browser toonde een rapport dat compleet leek.
//
// Twee dingen waren daaraan fout. De maxDuration stond op 120 terwijl het plan er 300
// toestaat — een grens die we onszelf hadden opgelegd. En géén enkele aanroep hier had
// een tijdslimiet, dus één trage aanroep kon de hele functieduur opeten en de rest
// meenemen. Dat tweede wordt met een ruimere maxDuration juist erger, niet beter.
//
// Vandaar dezelfde regel als bij de PDF-conversie: een wandklokgrens die alles meetelt,
// en een aanroep die nooit langer mag duren dan wat er van het geheel over is.
const ANALYSE_MAX_MS   = 280_000;  // marge onder de maxDuration van 300s
const PER_AANROEP_MAX  = 150_000;  // een enkele aanroep duurde gemeten tot 99s

/** Wat er nog van het budget over is, geteld vanaf het begin van dit verzoek. */
const analyseBudget = () => tijdsbudget({
  gestartOp:    meetContext().begonOp ?? Date.now(),
  nu:           Date.now(),
  maxMs:        ANALYSE_MAX_MS,
  perAanroepMs: PER_AANROEP_MAX,
});

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

  // Eén meting per POGING, niet per aanroep van askClaude: een herpoging kost
  // opnieuw tokens en opnieuw tijd. Samenvoegen tot één regel zou de kosten van een
  // mislukte poging onzichtbaar maken, en juist die wil je kunnen optellen.
  let lastErr;
  for (let poging = 0; poging <= 2; poging++) {
    const meter = meetAanroep({
      endpoint: 'analyseer', fase: FASE_PER_TOOL[tool?.name] || 'onbekend', model,
      ...meetContext(),
    });
    if (poging > 0) {
      console.warn(`[analyseer/${tool.name}] Herpoging ${poging}/2, wacht ${poging * 5}s…`);
      await new Promise(r => setTimeout(r, poging * 5000));
    }
    try {
      // Nooit langer dan wat er van de hele analyse over is. Zonder deze grens eet één
      // blijvende aanroep de functieduur op en gaat álles mee — inclusief de aanroepen
      // die al klaar waren maar nog niet verwerkt.
      const budget = analyseBudget();
      if (budget.verlopen) {
        // De catch hieronder schrijft de meting weg en gooit meteen door: opnieuw
        // proberen heeft geen zin als er geen tijd meer is.
        const op = new Error(`Tijd op vóór ${tool.name} (${Math.round(budget.verstreken / 1000)}s verstreken)`);
        op.isTijdOp = true;
        throw op;
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'prompt-caching-2024-07-31',
        },
        body:   JSON.stringify(body),
        signal: AbortSignal.timeout(budget.aanroepMs),
      });
      if (res.ok) {
        const json = await res.json();
        meter.usage(json.usage);
        meter.klaar();
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
      if (res.status === 400 || res.status === 401) {
        const e = new Error(`Claude fout (${res.status}): ${await res.text()}`);
        meter.mislukt(e); throw e;
      }
      lastErr = new Error(`Claude fout (${res.status})`);
      meter.mislukt(lastErr);
      console.warn(`[analyseer/${tool.name}] HTTP ${res.status} — herpoging…`);
    } catch (err) {
      // Bij een fout ná res.ok (bijv. tokenbudget) is de meting al weggeschreven;
      // schrijfVerbruik is niet idempotent, dus alleen meten wat hier voor het eerst
      // langskomt — een netwerkfout of een afgebroken verbinding.
      if (!/Claude fout \(/.test(err.message) && !err.isMaxTokens) meter.mislukt(err);
      // Gooi direct bij max_tokens, auth-fout of een afgelopen budget — in geen van
      // die gevallen heeft opnieuw proberen zin.
      if (err.isMaxTokens || err.isTijdOp || err.message.startsWith('Claude fout (4') || poging === 2) throw err;
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

// De kop was lang het enige veld zonder specificatie. Zonder sturing schrijft het
// model een pakkende kop, en pakkende koppen drijven af naar alarmerend: een issue
// kwam terug als "Zorgkorting-percentages optellen tot meer dan 100%" terwijl de
// eigen bevinding eronder "30% + 39% = 69%" berekende. De kop moet volgen uit wat
// eronder staat, niet andersom.
const onderwerpBeschrijving =
  'Korte, feitelijke titel van het probleem. HARDE EIS: alles wat de titel beweert moet ' +
  'in "bevinding" worden aangetoond. Beweer in de titel nooit een schending, overschrijding ' +
  'of tegenstrijdigheid die de bevinding niet onderbouwt — noem dan wat je wél vaststelt ' +
  '(bijv. "Zorgkortingspercentages wijken af van de Tremanormen en zijn niet gemotiveerd", ' +
  'niet "Percentages tellen op tot meer dan 100%"). Reken elke optelling of vergelijking in ' +
  'de titel na tegen de getallen in de bevinding; klopt die niet, herformuleer de titel.';

// Eén Haiku-aanroep over de hele issuelijst van een document, in dezelfde vorm als
// de consolidatiestap: lijst erin, alleen de correcties eruit. Niet-fataal — mislukt
// de aanroep, dan gaat de oorspronkelijke lijst door. Een ontbrekende controle mag
// geen analyse kosten. Schema, prompt en toepassingslogica staan in api/_consistentie.js.
async function pasConsistentieToe(issues, label) {
  if (!Array.isArray(issues) || issues.length === 0) return issues;
  try {
    const res = await askClaude(
      sysConsistentie,
      bouwConsistentieLijst(issues),
      consistentieTool,
      1500,
      'claude-haiku-4-5-20251001',
    );
    const { issues: aangepast, toegepast } = pasCorrectiesToe(issues, res?.correcties);
    for (const t of toegepast) {
      console.log(`[consistentie] ${label} [${t.index}] "${t.oud}" → "${t.nieuw}" (${t.reden || 'geen reden'})`);
    }
    if (toegepast.length) console.log(`[consistentie] ${label}: ${toegepast.length} titel(s) bijgesteld`);
    return aangepast;
  } catch (err) {
    console.warn(`[consistentie] overgeslagen voor ${label}:`, err.message);
    return issues;
  }
}

const issueItem = {
  type: 'object',
  properties: {
    onderwerp:   { type: 'string', description: onderwerpBeschrijving },
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
        samenvatting: {
          type: 'string',
          description: 'Feitelijke samenvatting van de situatie van partijen op basis van het document. Vermeld expliciet voor elk van de volgende thema\'s of het aanwezig of afwezig is: gezamenlijke woning / eigen woning, kinderen (aantal, namen, leeftijden), onderneming of ZZP, huwelijksvermogensregime (gemeenschap of huwelijkse voorwaarden, jaar), alimentatie-afspraken (kinder- en/of partneralimentatie), en overige bijzondere vermogensbestanddelen. Schrijf dit ook als er geen issues over zijn — de samenvatting dient als feitenbasis voor vervolgvragen.'
        },
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
            onderwerp:          { type: 'string', description: onderwerpBeschrijving },
            ernst:              { type: 'string', enum: ['laag', 'midden', 'hoog'] },
            dimensies:          { type: 'array', items: { type: 'string' } },
            bevinding:          { type: 'string' },
            aanbeveling:        { type: 'string' },
            artikel:            { type: 'string', description: 'Sectienummer of kopje waaronder dit issue valt (bijv. "3.2.1", "Artikel 5"). Laat leeg als het document geen duidelijke sectienummering heeft.' },
            passage:            { type: 'string', description: 'Verbatim citaat van DE ZIN die het specifieke afwijkende getal, de afwijkende datum of de tegenstrijdige afspraak ZELF bevat — NOOIT de zin die een persoon, kind of sectie-onderwerp introduceert. Bij een peildatum-conflict: citeer de zin mét de afwijkende datum (bijv. "15-03-2026"), niet de naamslijn van de betrokkene. Bij een bedrag-conflict: citeer de zin met het afwijkende bedrag. Als de hele sectie ontbreekt: laat leeg.' },
            passage_document:   { type: 'string', enum: ['ouderschapsplan', 'convenant'], description: 'Het documenttype waaruit de passage geciteerd is. Altijd gelijk aan betreft_documenten[0] — het document dat aangepast moet worden.' },
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

// ── PII-auto-vervanging (veiligheidsnet) ──────────────────────────────────────
// De browser pseudonimiseert namen vóór verzending. IBANs die de browser mist
// worden hier server-side vervangen met genummerde placeholders vóór elke Claude-call.
// Consistent: hetzelfde IBAN krijgt altijd hetzelfde nummer binnen één request.
function maakPiiVervanger() {
  const ibanMap = new Map();
  return function vervangPii(tekst) {
    if (!tekst) return tekst;
    return tekst.replace(/\bNL\d{2}\s*[A-Z]{4}\s*\d{10}\b/g, (match) => {
      const key = match.replace(/\s/g, '');
      if (!ibanMap.has(key)) ibanMap.set(key, `[IBAN-${ibanMap.size + 1}]`);
      return ibanMap.get(key);
    });
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  // gebruikerContext doet dezelfde verificatie als verifieerJWT, maar houdt vast wie
  // het is — nodig om het verbruik per gebruiker en per kantoor te kunnen tellen.
  const _ctx = await gebruikerContext(token);
  if (!_ctx) return res.status(401).json({ error: 'Niet geautoriseerd' });
  // ── Body parsen ───────────────────────────────────────────────────────────
  const { classificatie, documenten, roepnamen, runId } = req.body || {};

  // runId is de sleutel waaronder de screening straks wordt opgeslagen. De browser
  // maakt hem vooraf, want de analyse begint vóórdat de screening bestaat — zonder dat
  // valt achteraf niet te zeggen welke aanroepen bij welke analyse hoorden. Wat er
  // binnenkomt wordt in src/api/kosten.js op uuid-vorm gecontroleerd.
  _meetOpslag.enterWith({
    organisatieId: _ctx.organisatieId,
    gebruikerId:   _ctx.gebruikerId,
    screeningId:   runId,
    begonOp:       Date.now(),   // beginpunt van het tijdsbudget hierboven
  });

  const vervangPii = maakPiiVervanger();
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
      .map(d => `=== ${d.type?.toUpperCase()}: ${d.bestandsnaam} ===\n${vervangPii(d.tekst)}`)
      .join('\n\n');

    const situatieKenmerken = classificatie.situatie_kenmerken ?? [];

    // Huidige datum voor temporele beoordeling (bijv. of een peildatum in het verleden
    // ligt). Stond binnen analyseDoc, waardoor de cross-document-call — die daarbuiten
    // staat — er niet bij kon zodra hij de gedeelde regels meekreeg. Eén declaratie per
    // verzoek is bovendien juister: alle calls horen dezelfde datum te zien.
    const vandaag = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const heeftHV = documenten.some(d => d.type === 'huwelijkse_voorwaarden');

    // ── Supabase-queries ──────────────────────────────────────────────
    // Afgeleide kenmerken erbij: het model benoemt `internationaal` niet, maar de
    // nationaliteiten staan wél in de classificatie. Zonder deze regel bleven vijf
    // IPR-chunks bij élke analyse liggen — zie src/rapport/internationaal.js.
    const wetsQueryTags = [...new Set([
      ...situatieKenmerken,
      ...afgeleideKenmerken(classificatie),
      ...effectiefHoofd.map(d => d.type),
      ...(heeftHV ? ['huwelijkse_voorwaarden', 'verrekenbeding', 'koude_uitsluiting', 'uitsluitingsclausule'] : []),
    ])];

    const [{ data: wetteksten }, { data: standaardClausules },
          { data: tmplConvenant }, { data: tmplOuderschapsplan }] = await Promise.all([
      // Zonder limiet ophalen: het zijn er hooguit honderd en de selectie gebeurt
      // hieronder op relevantie. Een .limit() hier gaf een willekeurige greep,
      // omdat er geen sortering op staat.
      supabase.from('legal_chunks').select('citation, content, topic_tags')
        .overlaps('topic_tags', wetsQueryTags),
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

    // Rangschikken op relevantie: hoe meer tags van dit dossier een chunk raakt,
    // hoe eerder hij meegaat. De citation is tiebreak — niet cosmetisch, maar nodig
    // voor een deterministische volgorde: het wettekstblok gaat als gecached blok
    // naar Claude, en prompt-caching werkt op een byte-voor-byte prefixmatch. Een
    // wisselende volgorde betekent elke keer opnieuw de volle prijs betalen.
    const _tagScore = (chunk) =>
      (chunk.topic_tags ?? []).filter(t => wetsQueryTags.includes(t)).length;

    const _gevonden = [...(wetteksten ?? [])].sort((a, b) =>
      _tagScore(b) - _tagScore(a) || a.citation.localeCompare(b.citation, 'nl'));

    // Ruim bemeten: in de praktijk gaat alles mee wat op tags matcht (bij een
    // doorsnee dossier zo'n 67 chunks, ~20k tokens in één gecached blok — enkele
    // centen per analyse). De limiet is een vangnet tegen een uitdijende
    // kennisbank, geen selectiemiddel.
    //
    // Bewust NIET filteren op ogenschijnlijk tegenstrijdige tags (voor-2018 vs
    // vanaf-2018, pensioenverevening vs _uitgesloten): dat zijn onderwerpslabels,
    // geen toepasselijkheidsvlaggen. 'WVPS art. 5 — afwijking pensioenverevening'
    // draagt beide pensioen-tags, en de overzichtschunk over stelsels en tijdvakken
    // is getagd op één periode terwijl hij ze allemaal beschrijft. Zo'n filter
    // verwijdert juist de chunks die het onderscheid uitleggen. Welk regime geldt,
    // staat in het feitenblok; valideerConsistentie ruimt tegenstrijdige signalen op.
    const MAX_WETTEKSTEN = 80;
    const _wttAll = _gevonden.slice(0, MAX_WETTEKSTEN);
    const _gemist = _gevonden.length - _wttAll.length;

    const _stdCit = 'Gangbare correcte standaardclausules in Nederlandse echtscheidingsdocumenten';
    if (standaardClausules?.length && !_wttAll.some(w => w.citation === _stdCit)) {
      _wttAll.push(...standaardClausules);
    }
    const wetTekst = _wttAll.map(w => `[${w.citation}] ${w.content}`).join('\n\n');

    // Diagnostisch: zonder deze regel is van buitenaf niet te zien of de kennisbank
    // daadwerkelijk is meegestuurd. Nul wetteksten ziet er in de uitvoer hetzelfde uit
    // als veertig — Claude citeert dan gewoon uit eigen kennis, en juist die citaten
    // zijn niet te vertrouwen.
    console.log(`[analyseer] kennisbank: tags [${wetsQueryTags.join(', ')}] → ${_gevonden.length} match(es), ${_wttAll.length} meegestuurd`);
    if (_gemist > 0) {
      console.warn(`[analyseer] ${_gemist} wettekst(en) niet meegestuurd (limiet ${MAX_WETTEKSTEN}) — laagst scorend: ${_gevonden.slice(MAX_WETTEKSTEN).map(w => w.citation).join(' | ')}`);
    }
    if (!_wttAll.length) {
      console.warn('[analyseer] LET OP: geen enkele wettekst gevonden — analyse draait ongefundeerd');
    }

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
      const anderDocsNota = bouwAnderDocsNota(andereDocs);

      // Roepnamen die in de bestandsnaam/dossiernaam gevonden zijn maar afwijken van de formele naam
      const roepnamenNota = bouwRoepnamenNota(roepnamen);

      const tmplType    = docType === 'ouderschapsplan' ? 'ouderschapsplan' : 'convenant';
      const checklist   = (templatesPer[tmplType] || []).filter(
        t => !t.applies_when || t.applies_when.every(tag => situatieKenmerken.includes(tag))
      );
      const checklistTekst = checklist.map(c => `- ${c.section_name}: ${c.instructions ?? ''}`).join('\n');

      const juridischeChecks = bouwJuridischeChecks(docType);

      const hvChecks = bouwHvChecks(heeftHV);

      // IPR-checks — alleen bij convenant; detectie op basis van documentinhoud
      const iprChecks = bouwIprChecks(docType);

      const mfnInstructie = bouwMfnInstructie({ heeftMfn, docTypLabel, mfnElemList });

      // ── Documenten opsplitsen: hoofdtekst vs. bijlagen + andere hoofddocs (context) ──
      // contextBlok en stabielGedeeld zijn identiek voor alle 3 calls van hetzelfde document
      // én voor heranalyse → maximale cache-efficiency (cache-hit binnen 5-minuten-window).
      // Anthropic-caching: max 4 breakpoints per request.
      //   sys(1) + contextBlok(2) + stabielGedeeld(3) + call-specifiek(4) = precies 4.
      const documentBlok = `TE ANALYSEREN DOCUMENT:\n=== ${docType.toUpperCase()}: ${doc.bestandsnaam} ===\n${vervangPii(doc.tekst)}`;

      // Context: alleen bijlagen (HV etc.). Andere hoofddocumenten worden NIET meegegeven —
      // dat bleek de primaire bron van cross-document-besmetting (issues van OP in Convenant
      // en vice versa). Cross-doc verificatie kan later als gerichte micro-call worden toegevoegd.
      const contextBlokDelen = [];
      if (contextTekst) contextBlokDelen.push(`BIJLAGEN (ter context — niet apart analyseren):\n${contextTekst}`);
      const contextBlok = contextBlokDelen.length ? contextBlokDelen.join('\n\n') : null;


      // Eén gedeeld regelsblok voor alle 3 calls én een heranalyse → één cache-entry
      // in plaats van een aparte per call-type. Inhoud staat in api/_prompts/gedeeld.js:
      // vaststaande feiten, pseudonimiseringsnota, verificatieplicht en ernst-criteria.
      // De kenmerken uit de intake gaan als vaststaande feiten mee. Zonder die moest
      // het model de relatievorm uit de tekst afleiden — en een ouderschapsplan noemt
      // die vaak niet, waarna een zin over een mogelijk toekomstig huwelijk van een
      // ouder werd gelezen als bewijs dat partijen gehuwd zijn.
      const stabielGedeeld = bouwStabielGedeeld(vandaag, situatieKenmerken);

      // System prompts: alleen call-specifieke instructies (gedeelde regels in stabielGedeeld)
      const sysStructuur = bouwSysStructuur({ docTypLabel, anderDocsNota, roepnamenNota, mfnInstructie, heeftMfn, mfnElemList });;

      // Gecombineerde prompt voor alle niet-structuur dimensies — één call ipv twee.
      // Voordeel: Claude ziet het volledige document in één context → minder kans op overlap
      // of tegenspraak tussen juridisch/balans-call en grammatica/conflicten-call.
      const sysBevindingen = bouwSysBevindingen({ docTypLabel, anderDocsNota, roepnamenNota, juridischeChecks, hvChecks, iprChecks });;

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
        .map(d => `=== ${d.type.toUpperCase()}: ${d.bestandsnaam} ===\n${vervangPii(d.tekst)}`)
        .join('\n\n---\n\n');

      const docTypenLabel = effectiefHoofd.map(d => d.type).join(' en ');

      const sysCrossDoc = bouwSysCrossDoc({ docTypenLabel, wetTekst });

      sse({ type: 'cross_doc_start', documenten: effectiefHoofd.map(d => d.type) });
      // De gedeelde regels gaan nu ook hierheen. Tot 24 augustus 2026 kreeg deze
      // call alléén zijn eigen prompt en de documentteksten — geen verwijzingsregel,
      // geen samenhangregels, geen pseudonimiseringsnota. Dat leverde bevindingen op
      // als "convenant vermeldt één woonadres voor alle kinderen" terwijl datzelfde
      // convenant in de aanhef naar het ouderschapsplan verwijst voor alle
      // kinderafspraken. De regel die dat had moeten tegenhouden bestond, gebruikte
      // die zin zelfs als voorbeeld, en bereikte deze call niet.
      //
      // Gecachet als apart blok, net als bij de per-documentcalls: hij is identiek
      // voor elke analyse binnen hetzelfde dossier.
      crossDocPromise = askClaude(sysCrossDoc, [
        { text: bouwStabielCrossDoc(vandaag, situatieKenmerken), cache: true },
        { text: docBlokken },
      ], crossDocTool, 6000);
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
            // Eén tabblad per issue: dat van de passage. Ging het issue naar béíde
            // documenten, dan stond het ook op het tabblad waar de geciteerde zin
            // niet staat — en sprong de viewer bij aanklikken naar het andere
            // document. Zie api/_cross-doc-toewijzing.js.
            const relevantIssues = issuesMetId.filter(iss => hoortBijDocument(iss, d.type));
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
      const sysConsolidatie = SYS_CONSOLIDATIE;;

      for (const doc of effectiefHoofd) {
        const pdRes = perDocResultaten.get(doc.bestandsnaam);
        const rawIssues = [
          ...(pdRes?.structuurR?.issues  ?? []),
          ...(pdRes?.bevindingenR?.issues ?? []),
          ...(crossIssuesPerDoc.get(doc.bestandsnaam) ?? []),
        ];
        // IBAN-validatie: verwijder issues met niet-bestaande IBANs en tegenstrijdige IBAN-conclusies
        const allIssues = filterIssuesOpIban(rawIssues, vervangPii(doc.tekst ?? ''));
        if (allIssues.length < rawIssues.length)
          console.log(`[iban] ${doc.bestandsnaam}: ${rawIssues.length - allIssues.length} issue(s) verwijderd door IBAN-validatie`);
        if (allIssues.length < 2) {
          sse({ type: 'consolidatie', bestandsnaam: doc.bestandsnaam, result: { issues: allIssues } });
          continue;
        }
        try {
          // Inclusief de passage en een markering welke issues dezelfde zin aanwijzen.
          // Zonder die twee was het eerste samenvoegcriterium in de prompt onbruikbaar:
          // het verwees naar een passage die niet in de invoer stond.
          const genummerd = bouwConsolidatieLijst(allIssues);
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

          const definitief = await pasConsistentieToe(geconsolideerd, doc.bestandsnaam);
          sse({ type: 'consolidatie', bestandsnaam: doc.bestandsnaam, result: { issues: definitief } });
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
    // Eerst de metingen weg, dán pas afsluiten. Een serverless functie mag bevriezen
    // zodra het antwoord eruit is; wat er dan nog openstaat verdampt. Zo verdween er
    // een regel van een analyse met twee documenten.
    await wachtOpVerbruik();
    if (!res.writableEnded) res.end();
  }
}
