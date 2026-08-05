// api/ai-assistent.js
// POST — Clausula-assistent: intent-detectie, zoekloop, gestructureerde tool-output
// Body: { vraag, conversatie?, dossierContext?, resolvedFields?, stijl? }
// Response: { intent, antwoord, bronnen, aannames, signalen, onbekenden,
//             verduidelijkingsvraag, vervolgacties, opties, mailconcept, clausule,
//             vragen, clausuleRelevant }  ← laatste twee backward-compat

import { createClient } from '@supabase/supabase-js';
import { verifieerJWT } from './_auth.js';

// ── Systeem-prompt ────────────────────────────────────────────────────────────
const SYSTEEM =
`Je bent de assistent van Clausula en ondersteunt MfN-registermediators in familiezaken
naar Nederlands recht. Je richt je uitsluitend tot de mediator, neutraal-zakelijk, zonder
u-vorm. Je formuleert nooit juridisch advies aan partijen; risico's en afwijkingen zijn
altijd "aandachtspunt voor de mediator".

KERNREGEL — Antwoord altijd eerst inhoudelijk, ook bij ontbrekende informatie:
Maak expliciete aannames en benoem per ontbrekend gegeven wat er verandert als het anders
ligt. Stel maximaal één verduidelijkingsvraag per beurt, alleen als een onbekende het antwoord
fundamenteel omdraait én niet uit het dossier of de sessie blijkt. Stel nooit een vraag die
eerder al beantwoord is (zie [BEKENDE GEGEVENS]). Signaleer proactief juridische, financiële,
fiscale en balansaspecten: compact, één zin per signaal, ernst hoog/midden/laag conform de
screeningdefinities.

INTENTDETECTIE — classificeer elke vraag strikt als één van vier intents:
- kennisvraag: algemene rechtsvraag zonder casusfeiten ("wat geldt bij…", "hoe werkt…")
- casus: vraag over een concrete situatie — ook als het gaat om gevolgen, risico's,
  consequenties of juridische beoordeling ("wat zijn de gevolgen?", "mag hij dit?",
  "wat zijn de mogelijke gevolgen?", "wat zijn de risico's?"). Gevolgen ≠ opties.
- opties: uitsluitend als de mediator om concrete handelingskeuzes vraagt ("welke
  opties hebben de partijen?", "hoe kunnen ze dit regelen?", "geef opties voor de
  klanten"). Nooit als de vraag over gevolgen of consequenties gaat.
- clausule: verzoek om tekst voor OP of convenant, of activatie via chip
HARDE REGEL: als [DOSSIERCONTEXT] aanwezig is en de vraag past bij de dossierfeiten
(namen, situatie, documenten) — classificeer dan altijd als casus, nooit als kennisvraag.

KENNISBANK — Zoek via zoek_juridisch vóór het antwoord. Gebruik zoek_web voor recente
jurisprudentie of actuele richtlijnen die niet in de kennisbank staan.

WETSCITATEN — Parafraseer nooit een wetsartikel als letterlijk citaat. Dit zijn de regels:
1. Als een artikel in de [JURIDISCHE KENNISBANK] staat: je mag de aangehaalde tekst letterlijk
   citeren. Gebruik dan: "Art. X:Y BW bepaalt: '[letterlijke tekst uit kennisbank]'."
2. Als een artikel niet in de kennisbank staat maar je het wel noemt: beschrijf de strekking
   zonder letterlijk te citeren. Gebruik "de strekking van art. X:Y BW is…" of "art. X:Y BW
   regelt (in de kern)…". Voeg achter de verwijzing toe: "(trainingskennis — verifieer bij
   twijfel)" als de precieze formulering juridisch doorslaggevend is.
3. Noem nooit een zinsnede als letterlijk citaat als je die niet met zekerheid uit de kennisbank
   of een zoekresultaat hebt. Fabricage van wettekst is een ernstige fout: de mediator kan op
   basis van een nep-citaat onjuist adviseren.
4. Bij twijfel over de exacte wettekst: benoem de onzekerheid expliciet in het antwoord.

TITEL — begin elk antwoord (bij alle intents) met een vetgedrukte korte titel van max 6 woorden
die het onderwerp scherp samenvat. Formaat: "**Titel**\n[antwoord]". Geen leesteken na de titel.

KENNISVRAAG — antwoord max ~60 woorden, feitelijk. Altijd minimaal één bron; peildatum
vermelden als de regel per datum verschilt. Geen aannames, geen verduidelijkingsvraag.
Vervolgacties: kies uit toepassen_op_casus, klanttekst, clausule_opstellen.

CASUS — antwoord max ~60 woorden, toegespitst op de feiten. Elke dragende aanname expliciet
in aannames. Blokkerende onbekenden zijn zeldzaam; typisch: huwelijksdatum (rond 1-1-2018),
onderneming. Overige onbekenden: aanname + doorgaan.
HARDE REGEL: elk veld dat in [BEKENDE GEGEVENS] staat is BEKEND — nooit in het onbekenden-array
opnemen. Vul onbekenden alleen uit gevallen die NIET in [BEKENDE GEGEVENS] of [DOSSIERCONTEXT] staan.
HARDE REGEL onbekenden vs. signalen: onbekenden bevat uitsluitend ontbrekende feitelijke gegevens
(datum, bedrag, naam, eigendomsvorm). Juridische risico's, edge cases, randgevallen en ambigue
kwalificaties horen in signalen — NOOIT in onbekenden. veld='overig' is alleen voor een feitelijk
onbekend gegeven dat in geen andere enum past; gebruik het NIET voor juridische interpretaties.
Als [BEKENDE GEGEVENS] "Eigen woning: niet in dossier" vermeldt maar de vraag beschrijft WEL een
woning — verwerk de woning uit de vraag, en baseer aannames over eigendomsregime op het hv_stelsel
uit [BEKENDE GEGEVENS] (bijv. koude uitsluiting → woning niet vanzelf gemeenschappelijk, tenzij
partijen die expliciet gezamenlijk op naam hebben staan).
Als [BEKENDE GEGEVENS] "Eigen woning: niet in dossier" vermeldt en de vraag beschrijft GEEN woning —
er is géén eigen woning in scope; beantwoord conditioneel of stel een gerichte vraag.
Als [BEKENDE GEGEVENS] een HV-stelsel (koude uitsluiting, verrekenbeding) of
"Huwelijkse voorwaarden: ja" vermeldt — partijen zijn gehuwd of geregistreerd partners;
verwerk dit als vaststaand feit, stel hier nooit opnieuw een vraag over.
Vervolgacties: kies uit opties_voor_klanten, clausule_opstellen, fiscale_check, toets_aan_dossier.

OPTIES — maximaal 3 opties in het opties-veld. Meerpartijdigheid is hard: elke optie neutraal,
afwegingen symmetrisch voor beide partijen. Een optie die structureel één partij bevoordeelt
krijgt een balans-signaal. Mailconcept alleen genereren als de mediator erom vraagt.
Vervolgacties: kies uit klanttekst, clausule_opstellen.

CLAUSULE — stijl staat in [CLAUSULE-STIJL], nooit aan de mediator vragen. Ontbrekende
specifieke waarden: placeholder [BEDRAG], [DATUM], [NAAM] — zelden blokkerend.
Afwijking van dwingend recht: niet in de clausule opnemen maar als juridisch-signaal ernst hoog.
Stijldefinities:
  strikt: alleen de afspraak, imperatief, geen toelichting.
  juridisch_volledig: met wetsverwijzingen, definities, bewustverklaring bij afwijking.
  begrijpelijke_taal: B1-niveau, geen wetsartikelen, juridisch dekkend maar leesbaar.
Vervolgacties: kies uit klanttekst, andere_stijl.

DOMEINKENNIS:
- Beleggingsleer (art. 1:87 BW): geldt uitsluitend bij gehuwden/geregistreerd partnerschap,
  niet bij samenwoners. Samenwoners: art. 6:212 BW (ongerechtvaardigde verrijking).
- Vermogensrecht huwelijk: vóór 1-1-2018 = algehele gemeenschap (art. 1:94 oud BW);
  ná 1-1-2018 = beperkte gemeenschap van goederen.
- Partneralimentatie (art. 1:157 BW): alleen gehuwden/geregistreerd partnerschap.
- Pensioenverevening (WVPS): alleen gehuwden/geregistreerd partnerschap.
- Kinderalimentatie: niet contractueel uit te sluiten (art. 1:400 lid 2 BW — dwingend recht).
- Co-ouderschap (50/50): bijzondere regels voor kinderbijslag, IACK, WKB-splitsing; richtlijn
  hoofdverblijf bij één ouder voor BRP conform ECLI:NL:HR:2021:1513.
- Art. 1:88 BW (toestemming echtgenoot woning — lid 1 sub a): de wettekst gebruikt uitsluitend
  "bewoonde woning" (tegenwoordige tijd). Er bestaat GEEN wettelijke "kortgeleden heeft bewoond"-
  termijn; die formulering is een parafrase/fabricatie. Of bewoning is beëindigd is een feitelijke
  vraag. De rechtspraak legt het begrip ruim en beschermingsgericht uit: een vertrek van de andere
  echtgenoot in het kader van een scheiding wordt niet snel als definitieve beëindiging aangemerkt,
  ook niet bij inschrijving op een tijdelijk adres. Grijs gebied: beide standpunten zijn verdedigbaar
  voor een echtgenoot die feitelijk is vertrokken maar nog geen definitieve woonruimte heeft.
  Veiligste praktijkadvies: eis schriftelijke instemming van beide echtgenoten tot inschrijving van
  de echtscheidingsbeschikking, ongeacht wie er feitelijk woont.
  Art. 1:88 BW geldt alleen zolang het huwelijk voortduurt — ná inschrijving echtscheidingsbeschikking
  vervalt het. Voor de periode ná ontbinding maar vóór juridische levering: uitsluitend als
  contractuele grondslag formuleren ("Partijen komen overeen dat…"), NIET als art. 1:88 BW.
  SIGNAALPLICHT bij temporele beperking art. 1:88: Als art. 1:88 BW in het antwoord relevant
  is, genereer dan ALTIJD als EERSTE signaal (vóór alle andere signalen) een juridisch-signaal
  dat direct antwoord geeft op de vraag "hoort deze bepaling in het document?". Formuleer dit
  signaal als één concrete zin in deze structuur: "[Bepaling X] is NIET nodig voor fase 1
  (tekenen → beschikking; art. 1:88 biedt al bescherming én die periode is kort), maar WEL
  noodzakelijk voor fase 2 (inschrijving beschikking → juridische levering; kan maanden duren,
  art. 1:88 vervalt) — neem een contractueel boetebeding op dat ook na inschrijving doorloopt."
  Ernst: hoog als de woning nog niet geleverd is; midden als levering al gepland is.
- Art. 3:264 BW (hypotheekbeding): staat los van art. 1:88. Vrijwel elke hypotheekakte verbiedt
  verhuur én ingebruikgeving zonder schriftelijke toestemming van de bank. Controleer dit altijd
  bij ingebruikgeving woning aan derden; ontbreken van banktoestemming is wanprestatie en kan leiden
  tot opeising van de lening.
- Ingebruikgeving woning aan derde: bruikleen (om niet) versus huur (tegenprestatie) bepaalt of
  huurbescherming ontstaat. Een bijdrage in natura (klusjes, boodschappen) kan al als huur kwalificeren.
  Zeker bij verkoop in zicht: zorg voor een bruikleenovereenkomst voor bepaalde tijd, opzegbaar,
  met einddatum vóór levering en expliciete verklaring dat geen huur wordt beoogd.
- Tijdelijke clausules in convenant (geldig tot echtscheidingsbeschikking): het convenant wordt
  bekrachtigd door de rechtbank, waarna de beschikking snel volgt. De periode waarop een tijdelijke
  clausule van toepassing is, is dus doorgaans kort. Weeg altijd af of opname zinvol is:
  Ja, als het risico gevolgen heeft die de scheiding overleven (bijv. huurbescherming na
  ingebruikgeving, fiscale schade, aansprakelijkheid). Nee of twijfelachtig, als het risico
  zich enkel voordoet in de korte wachttermijn en geen blijvende gevolgen heeft. Benoem
  altijd expliciet: waarom de clausule desondanks noodzakelijk is, of juist niet.

AVG — dossiercontext en vragen zijn geanonimiseerd: echte namen zijn vervangen door
pseudoniemen. Werk uitsluitend met pseudoniemen. Als de context "(informeel: [naam])" vermeldt, gebruik die voornaam consequent
in alle antwoorden — adviezen, analyses, clausules en mailconcepten. Gebruik nooit
"de man"/"de vrouw" als er roepnamen beschikbaar zijn, tenzij de mediator dat
expliciet vraagt.`;

// ── Schema: assistent_antwoord tool ──────────────────────────────────────────
const ASSISTENT_TOOL = {
  name: 'assistent_antwoord',
  description: 'Geef het gestructureerde antwoord aan de mediator conform de Clausula-specificatie.',
  input_schema: {
    type: 'object',
    required: ['intent', 'antwoord', 'vervolgacties'],
    properties: {

      intent: {
        type: 'string',
        enum: ['kennisvraag', 'casus', 'opties', 'clausule'],
      },

      antwoord: {
        type: 'string',
        description: 'Kernantwoord. Max ~60 woorden bij kennisvraag/casus; max 2 zinnen intro bij opties (opties zelf in het opties-veld) en clausule (tekst in clausule.tekst).',
      },

      bronnen: {
        type: 'array',
        items: {
          type: 'object',
          required: ['verwijzing'],
          properties: {
            citation:   { type: 'string', description: 'Wetsartikel of norm, bijv. "art. 1:400 lid 2 BW"' },
            peildatum:  { type: 'string', description: 'Alleen indien de regel per datum verschilt' },
          },
        },
      },

      aannames: {
        type: 'array',
        items: { type: 'string' },
        description: "Expliciete aannames waarop het antwoord rust. Formaat: 'Uitgaande van …'. Alleen aannames die het antwoord daadwerkelijk dragen.",
      },

      signalen: {
        type: 'array',
        items: {
          type: 'object',
          required: ['perspectief', 'ernst', 'tekst'],
          properties: {
            perspectief: { type: 'string', enum: ['juridisch', 'financieel', 'fiscaal', 'balans'] },
            ernst:       { type: 'string', enum: ['hoog', 'midden', 'laag'] },
            tekst:       { type: 'string', description: 'Eén zin, compact. Bijv. "Bij keuze B mogelijk schenkbelasting boven de vrijstelling; laten toetsen door belastingadviseur."' },
          },
        },
      },

      onbekenden: {
        type: 'array',
        description: 'ALLEEN velden die NIET in [BEKENDE GEGEVENS] of [DOSSIERCONTEXT] staan én die het antwoord beïnvloeden. Nooit een veld opnemen dat al bekend is uit de context.',
        items: {
          type: 'object',
          required: ['veld', 'blokkerend', 'effect'],
          properties: {
            veld: {
              type: 'string',
              enum: [
                'relatievorm', 'huwelijksdatum', 'huwelijkse_voorwaarden',
                'hv_stelsel', 'peildatum_vermogen',
                'kinderen_minderjarig', 'co_ouderschap',
                'eigen_woning', 'woning_bestemming',
                'ondernemer', 'pensioen', 'pensioen_verevening',
                'lijfrente', 'uitsluitingsclausule',
                'partneralimentatie', 'internationaal_element',
                'overig',
              ],
              description: 'Veld dat mapt op een dossiergegeven. NOOIT opnemen als dit veld al in [BEKENDE GEGEVENS] staat. Gebruik overig alleen als geen enum past.',
            },
            blokkerend: {
              type: 'boolean',
              description: 'true alleen als het antwoord fundamenteel omdraait zonder dit gegeven.',
            },
            effect: {
              type: 'string',
              description: 'Eén zin: wat verandert er aan het antwoord als dit gegeven anders is dan aangenomen.',
            },
          },
        },
      },

      verduidelijkingsvraag: {
        type: 'object',
        required: ['vraag', 'veld'],
        properties: {
          vraag:         { type: 'string' },
          veld:          { type: 'string', description: 'Het onbekenden.veld dat deze vraag oplost.' },
          antwoordopties: {
            type: 'array',
            items: { type: 'string' },
            description: '2–4 korte opties die de UI als knoppen rendert. Weglaten als het antwoord niet in vaste opties te vangen is (bijv. een bedrag of datum).',
          },
        },
        description: 'Maximaal één per beurt. Alleen aanwezig als er een onbekende met blokkerend=true is die niet uit dossier/sessie blijkt. Het antwoord-veld bevat óók dan een antwoord onder aannames.',
      },

      vervolgacties: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'toepassen_op_casus', 'opties_voor_klanten', 'clausule_opstellen',
            'klanttekst', 'fiscale_check', 'andere_stijl', 'toets_aan_dossier',
          ],
        },
        description: '1–3 acties die logisch volgen op dit antwoord. Het model selecteert; de UI bepaalt labels en iconen.',
      },

      opties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['titel', 'kern', 'afwegingen'],
          properties: {
            titel:      { type: 'string', description: 'Max ~8 woorden, neutraal' },
            kern:       { type: 'string', description: '2–3 zinnen wat de optie inhoudt' },
            afwegingen: { type: 'string', description: '2–4 zinnen trade-offs, symmetrisch voor beide partijen' },
          },
        },
        description: 'Alleen bij intent=opties. Maximaal 3.',
      },

      mailconcept: {
        type: 'string',
        description: 'Alleen bij intent=opties én als de mediator om een mail/klanttekst vraagt. In de stem van de mediator, opties neutraal voorleggend, eindigend met uitnodiging om te bespreken. Geen wetsartikelen.',
      },

      clausule: {
        type: 'object',
        required: ['stijl', 'tekst'],
        properties: {
          stijl:       { type: 'string', enum: ['strikt', 'juridisch_volledig', 'begrijpelijke_taal'] },
          tekst:       { type: 'string' },
          toelichting: { type: 'string', description: 'Max 3 zinnen aan de mediator: formuleringskeuzes en afwijking van wettelijk uitgangspunt.' },
        },
        description: 'Alleen bij intent=clausule.',
      },

    },
  },
};

// ── Zoektools ─────────────────────────────────────────────────────────────────
const ZOEK_TOOLS = [
  {
    name: 'zoek_juridisch',
    description: 'Zoek in de Clausula juridische kennisbank: wetsartikelen, MfN-richtlijnen en bepalingen over Nederlands familierecht (alimentatie, verdeling, pensioenverevening, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        zoektermen: { type: 'string', description: 'Bijv. "kinderalimentatie berekeningswijze Trema"' },
        tags:       { type: 'array', items: { type: 'string' }, description: 'Optionele topic-tags, bijv. ["alimentatie", "kinderen"]' },
      },
      required: ['zoektermen'],
    },
  },
  {
    name: 'zoek_web',
    description: 'Zoek op rechtspraak.nl, wetten.overheid.nl, mfn.nl voor recente jurisprudentie of actuele richtlijnen die niet in de kennisbank staan.',
    input_schema: {
      type: 'object',
      properties: { zoekvraag: { type: 'string' } },
      required: ['zoekvraag'],
    },
  },
];

// ── Veldnamen voor leesbare injectie ─────────────────────────────────────────
const VELD_LABEL = {
  relatievorm:           'Relatievorm',
  huwelijksdatum:        'Huwelijksdatum',
  huwelijkse_voorwaarden:'Huwelijkse voorwaarden',
  hv_stelsel:            'HV-stelsel',
  peildatum_vermogen:    'Peildatum vermogen',
  kinderen_minderjarig:  'Minderjarige kinderen',
  co_ouderschap:         'Co-ouderschap (50/50)',
  eigen_woning:          'Eigen woning',
  woning_bestemming:     'Bestemming woning',
  ondernemer:            'Ondernemer',
  pensioen:              'Pensioen aanwezig',
  pensioen_verevening:   'Pensioenverevening',
  lijfrente:             'Lijfrente',
  uitsluitingsclausule:  'Uitsluitingsclausule',
  partneralimentatie:    'Partneralimentatie',
  internationaal_element:'Internationaal element',
};

// ── Gecachede systeem-prompt (bespaart ~35% tokens per advies-call) ──────────
const SYSTEEM_CACHED = [
  { type: 'text', text: SYSTEEM, cache_control: { type: 'ephemeral' } },
];

// ── Helper: Claude aanroepen ──────────────────────────────────────────────────
async function callClaude(apiKey, body, retries = 2) {
  const payload = JSON.stringify({ model: 'claude-sonnet-4-6', ...body });
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body: payload,
    });
    if (res.ok) return res.json();
    const isRetryable = res.status === 429 || res.status === 529;
    if (isRetryable && attempt < retries) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // 2s, 4s
      continue;
    }
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ── Helper: tools uitvoeren ───────────────────────────────────────────────────
async function voerToolsUit(content, supabase, braveKey, bronnenAcc) {
  const results = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    let tekst = '';

    if (block.name === 'zoek_juridisch') {
      const { zoektermen, tags } = block.input;
      const woorden = zoektermen.trim().split(/\s+/).filter(Boolean);
      let q = supabase.from('legal_chunks').select('citation, content, topic_tags').limit(5);
      if (woorden.length) q = q.ilike('content', `%${woorden[0]}%`);
      if (tags?.length)   q = q.overlaps('topic_tags', tags);
      const { data: chunks, error } = await q;
      if (error) {
        tekst = `Database-fout: ${error.message}`;
      } else if (chunks?.length) {
        tekst = chunks.map(c => `**${c.citation}**\n${c.content}`).join('\n\n---\n\n');
        bronnenAcc.push(...chunks.map(c => ({ citation: c.citation })));
      } else {
        tekst = 'Geen resultaten in de kennisbank.';
      }

    } else if (block.name === 'zoek_web') {
      if (!braveKey) {
        tekst = 'Websearch niet beschikbaar (BRAVE_SEARCH_API_KEY ontbreekt).';
      } else {
        const q = encodeURIComponent(block.input.zoekvraag);
        const r = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${q}&count=5&country=NL&search_lang=nl`,
          { headers: { 'X-Subscription-Token': braveKey, 'Accept': 'application/json', 'Accept-Encoding': 'gzip' } },
        );
        if (r.ok) {
          const bd = await r.json();
          const hits = bd.web?.results || [];
          if (hits.length) {
            tekst = hits.map(h => `**${h.title}**\nURL: ${h.url}\n${h.description || ''}`).join('\n\n---\n\n');
            bronnenAcc.push(...hits.map(h => ({ citation: h.title, url: h.url })));
          } else {
            tekst = 'Geen webresultaten.';
          }
        } else {
          tekst = `Websearch mislukt (HTTP ${r.status}).`;
        }
      }
    }

    results.push({ type: 'tool_result', tool_use_id: block.id, content: tekst || 'Geen resultaat.' });
  }
  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const {
    vraag,
    conversatie     = [],
    dossierContext  = null,
    resolvedFields  = {},
    stijl           = 'juridisch_volledig',
    rawModus        = false, // true = lange vrije tekst (klanttekst/mail), geen tool-schema
  } = req.body || {};

  if (!vraag?.trim()) return res.status(400).json({ error: 'Vraag ontbreekt' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const braveKey     = process.env.BRAVE_SEARCH_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY ontbreekt' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // ── rawModus: directe Claude-call zonder tool-schema (klanttekst, mail) ──────
  if (rawModus) {
    // Fix 4: bouw contextblokken zodat dossier + bekende gegevens altijd aanwezig zijn
    const rawPrefix = [];
    if (dossierContext) {
      rawPrefix.push(`[DOSSIERCONTEXT]\n${dossierContext}\n[/DOSSIERCONTEXT]`);
    }
    const rawBekend = Object.entries(resolvedFields)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `- ${VELD_LABEL[k] || k}: ${v}`);
    if (rawBekend.length) {
      rawPrefix.push(
        `[BEKENDE GEGEVENS — stel hier nooit opnieuw vragen over]\n${rawBekend.join('\n')}\n[/BEKENDE GEGEVENS]`,
      );
    }
    // ── Kennisbank-lookup voor clausule / klanttekst ─────────────────────────
    let kbInjectie = '';
    try {
      const stopw = new Set([
        'stel','schrijf','maak','formuleer','voor','een','het','de','dat','van',
        'bij','over','met','aan','naar','toe','als','clausule','artikel','partijen',
        'partij','mediator','convenant','stijl','strikt','juridisch','volledig',
        'begrijpelijk','taal','varianten','enkelvoudig','meerdere','genereer',
      ]);
      const trefwoord = vraag.trim().toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .find(w => w.length >= 5 && !stopw.has(w)) || '';
      if (trefwoord) {
        const { data: chunks } = await supabase
          .from('legal_chunks')
          .select('citation,content')
          .ilike('content', `%${trefwoord}%`)
          .limit(5);
        if (chunks?.length) {
          kbInjectie = '\n\n[JURIDISCHE KENNISBANK — gebruik als primaire bron voor wetsverwijzingen; noem alleen artikelen die hier daadwerkelijk in staan]\n' +
            chunks.map(c => `**${c.citation}**\n${c.content}`).join('\n\n---\n\n') +
            '\n[/JURIDISCHE KENNISBANK]';
        }
      }
    } catch (_) { /* kennisbank niet beschikbaar, ga door zonder */ }
    // ─────────────────────────────────────────────────────────────────────────

    const rawVraag = rawPrefix.length
      ? `${rawPrefix.join('\n\n')}\n\n${vraag.trim()}${kbInjectie}`
      : `${vraag.trim()}${kbInjectie}`;

    const msgs = [];
    for (const b of conversatie) msgs.push({ role: b.role, content: b.content });
    msgs.push({ role: 'user', content: rawVraag });
    try {
      const rawData = await callClaude(anthropicKey, {
        max_tokens:  4000,
        temperature: 0.5,
        system:      SYSTEEM_CACHED, // Fix 3: volledig SYSTEEM-prompt ipv minimale string
        messages:    msgs,
      });
      const tekst = rawData.content.find(b => b.type === 'text')?.text || '';
      return res.status(200).json({
        intent: 'klanttekst', antwoord: tekst, bronnen: [],
        aannames: [], signalen: [], onbekenden: [], vervolgacties: [],
        vragen: [], clausuleRelevant: 'geen',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Context opbouwen ────────────────────────────────────────────
  const prefixBlokken = [];

  if (dossierContext) {
    prefixBlokken.push(`[DOSSIERCONTEXT]\n${dossierContext}\n[/DOSSIERCONTEXT]`);
  }

  const bekendRijen = Object.entries(resolvedFields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${VELD_LABEL[k] || k}: ${v}`);
  if (bekendRijen.length) {
    prefixBlokken.push(
      `[BEKENDE GEGEVENS — stel hier nooit opnieuw vragen over]\n${bekendRijen.join('\n')}\n[/BEKENDE GEGEVENS]`,
    );
  }

  prefixBlokken.push(`[CLAUSULE-STIJL: ${stijl}]`);

  const huidigBericht = prefixBlokken.length
    ? `${prefixBlokken.join('\n\n')}\n\n${vraag.trim()}`
    : vraag.trim();

  // ── Berichten opbouwen ──────────────────────────────────────────
  const baseMessages = [];
  for (const b of conversatie) baseMessages.push({ role: b.role, content: b.content });
  baseMessages.push({ role: 'user', content: huidigBericht });

  // ── Fase 1: Zoekloop ─────────────────────────────────────────────
  const bronnenZoek = [];
  const zoekMessages = [...baseMessages];
  const MAX_ZOEK = 5;

  try {
    for (let i = 0; i < MAX_ZOEK; i++) {
      const data = await callClaude(anthropicKey, {
        max_tokens:  1500,
        temperature: 0.3,
        system:      SYSTEEM_CACHED,
        tools:       ZOEK_TOOLS,
        messages:    zoekMessages,
      });

      if (data.stop_reason !== 'tool_use') break; // Geen zoekactie meer nodig

      zoekMessages.push({ role: 'assistant', content: data.content });
      const toolResults = await voerToolsUit(data.content, supabase, braveKey, bronnenZoek);
      zoekMessages.push({ role: 'user', content: toolResults });
    }

    // ── Fase 2: Gestructureerde output ───────────────────────────
    const structData = await callClaude(anthropicKey, {
      max_tokens:  4000,
      temperature: 0.3,
      system:      SYSTEEM_CACHED,
      tools:       [ASSISTENT_TOOL],
      tool_choice: { type: 'tool', name: 'assistent_antwoord' },
      messages:    zoekMessages,
    });

    const toolBlock = structData.content.find(
      b => b.type === 'tool_use' && b.name === 'assistent_antwoord',
    );
    if (!toolBlock) throw new Error('assistent_antwoord niet aangeroepen door het model');

    const output = toolBlock.input;

    // ── Server-side validatie (spec §3) ──────────────────────────
    // Verduidelijkingsvraag alleen als er daadwerkelijk een blokkerend onbekende is
    if (output.verduidelijkingsvraag && !output.onbekenden?.some(o => o.blokkerend)) {
      delete output.verduidelijkingsvraag;
    }
    // Cap op 3
    if (output.vervolgacties?.length > 3) output.vervolgacties = output.vervolgacties.slice(0, 3);
    if (output.opties?.length > 3)        output.opties        = output.opties.slice(0, 3);

    // ── Bronnen samenvoegen ───────────────────────────────────────
    // Tool-output bronnen (door model geciteerd) + zoekresultaten (voor bronnenlijst UI)
    const citKey = b => b.citation || b.url || '';
    const geciteerdSet = new Set((output.bronnen || []).map(citKey));
    const extraBronnen = bronnenZoek.filter(b => !geciteerdSet.has(citKey(b)));
    const alleBronnen  = [...(output.bronnen || []), ...extraBronnen].slice(0, 8);

    // Formaat voor bestaande UI — type='wet' voor citaten, type='web' voor links
    const bronnenUI = alleBronnen.map(b =>
      b.url
        ? { type: 'web', titel: b.citation || '', url: b.url }
        : { type: 'wet', citation: b.citation || '', peildatum: b.peildatum },
    );

    // ── Backward-compat: vragen + clausuleRelevant ────────────────
    const vragen = output.verduidelijkingsvraag
      ? [{
          label:  output.verduidelijkingsvraag.vraag,
          keuzes: output.verduidelijkingsvraag.antwoordopties || [],
          veld:   output.verduidelijkingsvraag.veld || '',
        }]
      : [];

    const clausuleRelevant = output.intent === 'clausule' || output.clausule
      ? 'convenant'
      : output.vervolgacties?.includes('clausule_opstellen') ? 'convenant' : 'geen';

    return res.status(200).json({
      // Nieuw schema
      intent:                output.intent                || 'kennisvraag',
      antwoord:              output.antwoord              || '',
      bronnen:               bronnenUI,
      aannames:              output.aannames              || [],
      signalen:              output.signalen              || [],
      onbekenden:            output.onbekenden            || [],
      verduidelijkingsvraag: output.verduidelijkingsvraag || null,
      vervolgacties:         output.vervolgacties         || [],
      opties:                output.opties                || [],
      mailconcept:           output.mailconcept           || null,
      clausule:              output.clausule              || null,
      // Backward-compat (UI stap 2 vervangt dit)
      vragen,
      clausuleRelevant,
    });

  } catch (err) {
    console.error('[ai-assistent]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
