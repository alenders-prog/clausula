// api/ai-assistent.js
// POST — Clausula-assistent: intent-detectie, zoekloop, gestructureerde tool-output
// Body: { vraag, conversatie?, dossierContext?, resolvedFields?, stijl? }
// Response: { intent, antwoord, bronnen, aannames, signalen, onbekenden,
//             verduidelijkingsvraag, vervolgacties, opties, mailconcept, clausule,
//             vragen, clausuleRelevant }  ← laatste twee backward-compat

import { createClient } from '@supabase/supabase-js';
import { gebruikerContext } from './_auth.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { meetAanroep, usageUitSse, wachtOpVerbruik } from './_verbruik.js';
import { verrijkResolvedFields, bouwFeitenBlok, valideerConsistentie, kenmerkNaarFields,
         maandJaarUitDatum, leeftijdUitDatum } from './_feiten.js';
import { maakVeldVolger } from '../src/assistent/deelbare-json.js';
import { maakSectieVolger } from '../src/assistent/gedeeltelijk-json.js';
import { zoekChunks } from '../src/kennisbank/zoek.js';
import { beoordeelClausuleBelofte, vulClausuleBelofteAan } from '../src/assistent/clausule-belofte.js';

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

FEITENCHECK BIJ GEKOPPELD DOSSIER — Als [DOSSIERCONTEXT] aanwezig is én de vraag vermeldt
specifieke feiten (leeftijden, namen, datums, bedragen) die NIET overeenkomen met het dossier:
1. Beantwoord de vraag als kennisvraag (de juridische regel in het algemeen).
2. Stel een verduidelijkingsvraag met veld "vraag_context":
   vraag: "De vraag noemt [X], maar het dossier vermeldt [Y]. Gaat het om een losstaande
   juridische vraag of wilt u de analyse toepassen op het werkelijke dossier?"
   antwoordopties: ["Losstaande vraag", "Toepassen op dossier"]
Sla de feitencheck OVER als de vraag expliciet hypothetisch is ("stel dat…", "wat als…").

KENNISVRAAG — antwoord max ~60 woorden, feitelijk. Altijd minimaal één bron; peildatum
vermelden als de regel per datum verschilt. Geen aannames, geen verduidelijkingsvraag
(uitzondering: verduidelijkingsvraag wél toegestaan bij FEITENCHECK-mismatch, zie boven).
Vervolgacties: kies uit toepassen_op_casus, klanttekst, clausule_opstellen.

CASUS — antwoord max ~60 woorden, toegespitst op de feiten. Elke dragende aanname expliciet
in aannames. Blokkerende onbekenden zijn zeldzaam; typisch: huwelijksdatum (rond 1-1-2018),
onderneming. Overige onbekenden: aanname + doorgaan.
PROACTIEVE CONVENANT-AFWEGING — verplicht bij elke casus, ongeacht het onderwerp:
Beantwoord ALTIJD en BOVENAAN de impliciete vraag "hoort dit in het convenant of OP?",
ook als de mediator die vraag niet stelt.
Als [BELANG-ANALYSE] aanwezig is: volg de CONVENANT-CONCLUSIE daarin als eerste stap.
Gebruik daarna dit beslisschema:
1. Speelt de situatie zich UITSLUITEND af vóór de ontbinding van de relatie (fase 1)?
   Dan: "Dit hoort niet in het convenant: de situatie eindigt bij de beschikking en de wet
   biedt al bescherming in die periode." Voeg toe: hoe te handelen als de mediator toch
   iets wil vastleggen.
2. Strekt de situatie zich mede uit ná de ontbinding (fase 2)?
   Dan: "Dit IS noodzakelijk in het convenant — niet vanwege fase 1, maar voor fase 2
   (na beschikking tot [levering / definitieve regeling]): [grondslag en wat vastleggen]."
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
Vervolgacties: kies uit opties_voor_klanten, clausule_opstellen, toets_aan_dossier.

OPTIES — maximaal 3 opties in het opties-veld. Meerpartijdigheid is hard: elke optie neutraal,
afwegingen symmetrisch voor beide partijen. Een optie die structureel één partij bevoordeelt
krijgt een balans-signaal. Mailconcept alleen genereren als de mediator erom vraagt.
Vervolgacties: kies uit klanttekst, clausule_opstellen.

CLAUSULE — de clausuletekst staat VOLUIT in het antwoord-veld, onder je inleidende zin.
Er is geen apart clausuleveld. Kondig nooit een clausule aan die je niet meelevert: schrijf
je "hieronder volgt", dan staat de tekst er ook. Kun of wil je de clausule niet geven —
bijvoorbeeld omdat een gegeven ontbreekt — zeg dan wát je nodig hebt en beloof niets.
Een blokkerende onbekende is geen reden om de clausule weg te laten: lever hem met een
placeholder of met beide varianten, en stel de vraag daarnaast.
Stijl staat in [CLAUSULE-STIJL], nooit aan de mediator vragen. Ontbrekende
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
  TEMPORELE PLAATSINGSREGEL (art. 1:88 BW en aanverwante bepalingen):
  Gebruik [BELANG-ANALYSE] om te bepalen of beide partijen een belang hebben; ga daarna de
  tijdshorizon beoordelen.
  GEVAL A — situatie speelt zich UITSLUITEND af vóór de echtscheidingsbeschikking (fase 1):
    Zet BOVENAAN het antwoord (niet in signalen): "Deze bepaling hoort niet in het [OP /
    convenant]: de situatie doet zich uitsluitend voor vóór de beschikking, en art. 1:88 BW
    biedt in die periode al de vereiste bescherming. Opname is overbodig."
    Voeg dan als EERSTE signaal toe: "Indien de mediator de bepaling toch wil opnemen:
    formuleer op contractuele grondslag met expliciete doorlooptijd en boetebeding dat
    onafhankelijk van art. 1:88 werkt."
  GEVAL B — situatie strekt zich mede uit tot ná de beschikking (fase 2: beschikking →
  juridische levering, kan maanden duren, art. 1:88 vervalt):
    Zet BOVENAAN het antwoord: "Deze bepaling IS noodzakelijk in het convenant — niet vanwege
    fase 1 (kort, art. 1:88 geldt nog), maar voor fase 2 (beschikking → levering): art. 1:88
    vervalt dan en uitsluitend een contractueel boetebeding biedt nog bescherming."
    Genereer vervolgens als EERSTE signaal de concrete formuleerrichtlijn (boetebeding,
    doorloopbepaling, einddatum gekoppeld aan juridische levering).
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
        // Stond tot 1 september 2026 op "clausule (tekst in clausule.tekst)". Dat veld
        // bestaat niet en heeft nooit bestaan — zie de properties hieronder. Het model
        // schreef daardoor keurig zijn twee zinnen intro ("Hieronder een juridisch
        // volledige clausule.") en had nergens om de clausule zelf te laten. Er was geen
        // foutmelding: een belofte zonder vervolg ziet er van buiten uit als een antwoord.
        description: 'Kernantwoord. Max ~60 woorden bij kennisvraag/casus; max 2 zinnen intro bij opties (opties zelf in het opties-veld). Bij intent=clausule hoort de VOLLEDIGE clausuletekst in dit veld, direct onder de inleidende zin — er is geen apart clausuleveld.',
      },

      bronnen: {
        type: 'array',
        items: {
          type: 'object',
          // Stond op ['verwijzing'] — een veld dat in properties niet bestaat. Het
          // model vulde bronnen desondanks, dus Anthropic dwingt dit niet af; maar
          // een strengere validator zou élke bron afkeuren.
          required: ['citation'],
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
            'klanttekst', 'andere_stijl', 'toets_aan_dossier',
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

      // Hier stonden `mailconcept` en `clausule`. Ze zijn verwijderd op 23 augustus 2026.
      //
      // Gemeten op de vraag "gezamenlijke koopwoning, heeft de vertrekkende partij nog
      // zeggenschap": het model schreef bij intent=casus een volledige clausule van 4.350
      // tekens mee — ruim 1.200 tokens, ongeveer 25 seconden. Geen enkele client las dat
      // veld ooit uit; nul verwijzingen in index.html, assistent-core.js en
      // assistent-mobiel.html. Hetzelfde gold voor mailconcept.
      //
      // Een echte clausule of mail komt langs een ander pad: rawModus=true, waar de tekst
      // als vrije tekst in `antwoord` terugkomt. Dat pad is niet geraakt.
      //
      // Let op bij herinvoeren: `clausuleRelevant` (regel ~742) keek naar output.clausule
      // als één van drie signalen. De andere twee — intent en vervolgacties — dragen het nu.

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
  relatievorm:            'Relatievorm',
  // Labels weerspiegelen de gegeneraliseerde waarde, niet de sleutelnaam (AVG).
  huwelijksdatum:         'Verbintenis (maand-jaar)',
  nationaliteit_a:        'Nationaliteit partij A',
  nationaliteit_b:        'Nationaliteit partij B',
  partij_a_geboortedatum: 'Leeftijd partij A',
  partij_b_geboortedatum: 'Leeftijd partij B',
  huwelijkse_voorwaarden: 'Huwelijkse voorwaarden',
  hv_stelsel:             'HV-stelsel',
  peildatum_vermogen:     'Peildatum vermogen',
  kinderen_minderjarig:   'Minderjarige kinderen',
  co_ouderschap:          'Co-ouderschap (50/50)',
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

// ── Systeem-prompt voor de zoekloop ──────────────────────────────────────────
// De zoekloop hoeft één ding te beslissen: moet er iets opgezocht worden? Kreeg hij
// de volledige SYSTEEM-prompt mee, dan las het model daar "antwoord altijd eerst
// inhoudelijk" en deed dat ook — een compleet antwoord van 1.500 tokens dat daarna
// werd weggegooid omdat de loop bij stop_reason≠tool_use afbreekt. Gemeten op
// 23 augustus 2026: 34,6 seconden voor tekst die nergens terechtkwam.
const ZOEK_SYSTEEM = `Je ondersteunt een Nederlandse familierechtmediator (MfN). Je hebt één taak:
bepalen of er voor de vraag hieronder wetsartikelen, richtlijnen of jurisprudentie opgezocht
moeten worden.

- Moet er iets opgezocht worden: roep zoek_juridisch aan (en zoek_web alleen voor recente
  jurisprudentie of actuele richtlijnen die niet in de kennisbank staan).
- Is alles wat je nodig hebt al binnen: antwoord met precies één woord: gereed.

Schrijf zelf geen antwoord op de vraag. Dat gebeurt in een volgende stap.`;

// ── Tijdsbudget ───────────────────────────────────────────────────────────────
// vercel.json geeft deze functie 60 seconden. Wordt die overschreden, dan kapt
// Vercel de functie af en stuurt een platte foutpagina terug — geen JSON, dus de
// client kon er niets zinnigs mee. Daarom bewaken we de tijd nu zelf en geven we
// altijd een eigen antwoord terug, desnoods een kortere.
//
// De zoekloop mag maximaal zes Claude-aanroepen doen; met een trage zoekopdracht
// ertussen komt dat er makkelijk overheen.
// Gemeten op 23 augustus 2026: drie van de vier aanroepen in een kwartier liepen
// in "Vercel Runtime Timeout Error: Task timed out after 60 seconds".
// De onderdelen die ná het antwoord binnenkomen, in de volgorde van het schema.
// De client toont hiermee wat er nog onderweg is. Alleen velden die het model in
// de praktijk altijd invult: `opties` en `verduidelijkingsvraag` blijven bij de
// meeste vragen leeg, en een blijvend grijs vinkje is verwarrender dan geen vinkje.
const STREAM_ONDERDELEN = [
  { veld: 'bronnen',       label: 'Bronnen' },
  { veld: 'aannames',      label: 'Aannames' },
  { veld: 'signalen',      label: 'Signalen' },
  { veld: 'vervolgacties', label: 'Vervolgacties' },
];

// Wát er gestreamd wordt is iets anders dan waar een voortgangschip voor verschijnt.
// Alles wat het model produceert gaat onderweg mee — anders zag je bij een
// optie-antwoord vrijwel niets, want dan staat de inhoud in `opties` en bevat
// `antwoord` alleen een korte inleiding.
const STREAM_VELDEN = [
  ...STREAM_ONDERDELEN.map(o => o.veld),
  'opties', 'onbekenden', 'verduidelijkingsvraag',
];

// Het model levert een bron als { citation, peildatum } of met een url; de UI
// verwacht een `type`. Deze omzetting stond alleen aan het eind van de handler —
// waardoor een bron die onderweg werd meegestuurd als kapotte weblink verscheen.
// Nu op één plek, zodat streamende en definitieve bronnen dezelfde vorm hebben.
const naarBronUI = (b) => (b?.url
  ? { type: 'web', titel: b.citation || '', url: b.url }
  : { type: 'wet', citation: b?.citation || '', peildatum: b?.peildatum });

// 10s marge op de 120s uit vercel.json.
//
// Stond tot 29 augustus 2026 op 55_000, met maxDuration 60 ernaast — terwijl
// claude-edge.js en analyseer.js al op 120 stonden. Deze functie was dus als enige
// op de helft gezet, en juist die schrijft de langste antwoorden.
//
// Het gevolg was voorspelbaar en stond twintig regels verderop al opgeschreven: "een
// clausule duurt in de praktijk ruim vijftig seconden". Bij een budget van 55 wordt
// zo'n antwoord bijna altijd afgekapt — de gebruiker zag het antwoord verschijnen en
// vervolgens verdwijnen. Bijna elke keer, en terecht.
const FUNCTIE_BUDGET_MS = 110_000;

// Wie de vraag stelt, en welke fase er nu loopt.
//
// Dit stond tot 1 september 2026 in gewone modulevariabelen. Bij twee vragen die tegelijk
// in hetzelfde proces landen overschrijft de één de context van de ander: dan staat het
// verbruik van kantoor A onder kantoor B, en een zoekronde onder het label 'afronding'.
// analyseer.js had dezelfde fout en loste hem op 31 augustus op met AsyncLocalStorage;
// hier bleef hij staan. De ultrareview wees er drie keer op.
//
// AsyncLocalStorage houdt de context vast aan de aanroepketen van één verzoek. Met
// enterWith is dat één regel in de handler, zonder de hele functie in een callback te
// hoeven wikkelen. De fase zit in dezelfde opslag: callClaude en callClaudeStream hoeven
// zo nog steeds geen extra parameter te krijgen die op zeven plekken meemoet.
const _meetOpslag = new AsyncLocalStorage();
const _meting = () => _meetOpslag.getStore()
  || { organisatieId: null, gebruikerId: null, fase: 'onbekend' };
/** Zet de fase voor de rest van dít verzoek. */
const _zetFase = (fase) => { const s = _meetOpslag.getStore(); if (s) s.fase = fase; };
const AFRONDING_MS      = 25_000;   // gereserveerd voor de gestructureerde call
const RONDE_MS          =  8_000;   // wat een zoekronde in de praktijk kost (gemeten: 4–6s)

// ── Helper: Claude aanroepen ──────────────────────────────────────────────────
// `deadline` is een absoluut tijdstip (Date.now()-basis); de call wordt afgebroken
// zodra dat gepasseerd is, zodat het budget nooit bij één trage aanroep opgaat.
async function callClaude(apiKey, body, retries = 2, deadline = Infinity) {
  const _m = _meting();
  const meter = meetAanroep({ endpoint: 'ai-assistent', fase: _m.fase,
                              model: body?.model || 'claude-sonnet-4-6',
                              organisatieId: _m.organisatieId, gebruikerId: _m.gebruikerId });
  const payload = JSON.stringify({ model: 'claude-sonnet-4-6', ...body });
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resterend = deadline - Date.now();
    if (resterend <= 0) throw new Error('Tijdslimiet bereikt vóór het antwoord van Claude');

    const afbreken = AbortSignal.timeout(resterend);
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'prompt-caching-2024-07-31',
        },
        body:   payload,
        signal: afbreken,
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError')
        throw new Error('Claude antwoordde niet binnen de beschikbare tijd');
      throw err;
    }

    if (res.ok) {
      const json = await res.json();
      meter.usage(json.usage);
      meter.klaar();
      return json;
    }
    const isRetryable = res.status === 429 || res.status === 529;
    // Alleen opnieuw proberen als er ná de wachttijd nog tijd over is.
    const wacht = 2000 * (attempt + 1); // 2s, 4s
    if (isRetryable && attempt < retries && Date.now() + wacht < deadline) {
      await new Promise(r => setTimeout(r, wacht));
      continue;
    }
    {
      const e = new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
      meter.mislukt(e);
      throw e;
    }
  }
}

// ── Helper: Claude streamend aanroepen ────────────────────────────────────────
// Geeft hetzelfde eindresultaat als callClaude, maar roept `onJson` aan zodra er
// een stuk van de tool-invoer binnen is. Het antwoord komt terug als tool-aanroep,
// dus als één JSON-object; Anthropic levert dat in stukjes via input_json_delta.
//
// Waarom dit de moeite is: de gestructureerde call duurt tientallen seconden omdat
// het model veel tekst produceert. Zonder streamen ziet de mediator niets tot alles
// binnen is. Met streamen staat de eerste zin er na een paar seconden — `antwoord`
// is veld twee in het schema, dus het komt vroeg langs.
//
// Twee soorten antwoord komen hier langs. Het adviespad levert een tool-aanroep, dus
// JSON in stukjes (`input_json_delta`) — daarvoor is `onJson`. rawModus levert vrije
// tekst (`text_delta`) — daarvoor is `onTekst`. Eén lezer, want het SSE-formaat en de
// afbreek-afhandeling zijn identiek; alleen het soort brokje verschilt.
async function callClaudeStream(apiKey, body, onJson, deadline = Infinity, onTekst = null) {
  const _m = _meting();
  const meter = meetAanroep({ endpoint: 'ai-assistent', fase: _m.fase,
                              model: body?.model || 'claude-sonnet-4-6',
                              organisatieId: _m.organisatieId, gebruikerId: _m.gebruikerId });
  const resterend = deadline - Date.now();
  if (resterend <= 0) throw new Error('Tijdslimiet bereikt vóór het antwoord van Claude');

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body:   JSON.stringify({ model: 'claude-sonnet-4-6', stream: true, ...body }),
      signal: AbortSignal.timeout(resterend),
    });
  } catch (err) {
    const e = (err?.name === 'TimeoutError' || err?.name === 'AbortError')
      ? new Error('Claude antwoordde niet binnen de beschikbare tijd') : err;
    meter.mislukt(e);
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
    meter.mislukt(e);
    throw e;
  }

  const lezer   = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let json   = '';
  let tekst  = '';
  let naam   = '';

  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let grens;
    while ((grens = buffer.indexOf('\n\n')) !== -1) {
      const blok = buffer.slice(0, grens);
      buffer = buffer.slice(grens + 2);

      for (const regel of blok.split('\n')) {
        if (!regel.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(regel.slice(5).trim()); } catch { continue; }
        // usage komt in twee stukken: message_start draagt de invoerkant (met de
        // cachevelden), message_delta de uitvoerkant. Beide zijn nodig.
        meter.usage(usageUitSse(ev));

        if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use')
          naam = ev.content_block.name;
        else if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') {
          if (ev.delta.partial_json) meter.eersteTokenNu();
          json += ev.delta.partial_json || '';
          onJson?.(json);
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          const stuk = ev.delta.text || '';
          if (stuk) meter.eersteTokenNu();
          tekst += stuk;
          if (stuk) onTekst?.(stuk, tekst);
        } else if (ev.type === 'error')
          throw new Error(`Claude stream: ${ev.error?.message || 'onbekende fout'}`);
      }
    }
  }

  if (onTekst) {
    if (!tekst) {
      const e = new Error('Claude gaf geen tekst terug');
      meter.mislukt(e); throw e;
    }
    meter.klaar();
    return { naam, tekst };
  }

  if (!json) {
    const e = new Error('assistent_antwoord niet aangeroepen door het model');
    meter.mislukt(e); throw e;
  }
  try {
    const input = JSON.parse(json);
    meter.klaar();
    return { naam, input };
  } catch {
    // Afgekapt midden in de JSON — meestal een deadline die net te krap was. Juist
    // die wil je kunnen tellen: de tokens zijn betaald, het antwoord kwam niet.
    const e = new Error('Het antwoord kwam onvolledig binnen van Claude');
    meter.mislukt(e); throw e;
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
      const { chunks, methode } = await zoekChunks(supabase, zoektermen, tags, {
        apiKey: process.env.VOYAGE_API_KEY,
      });
      console.log(`[kennisbank] "${(zoektermen || '').slice(0, 50)}" → ${chunks.length} chunks (${methode})`);
      if (chunks.length) {
        tekst = chunks.map(c => `**${c.citation}**\n${c.content}`).join('\n\n---\n\n');
        bronnenAcc.push(...chunks.map(c => ({ citation: c.citation })));
      } else {
        // Expliciet, zodat het model niet blijft herformuleren: bij semantisch
        // zoeken betekent leeg dat het onderwerp écht niet in de kennisbank staat.
        tekst = methode === 'semantisch'
          ? 'Geen resultaten in de kennisbank. Dit onderwerp staat er niet in — '
            + 'herformuleren helpt niet. Gebruik zoek_web of je eigen kennis, en '
            + 'markeer wetsverwijzingen als "(trainingskennis — verifieer bij twijfel)".'
          : 'Geen resultaten in de kennisbank.';
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
/**
 * Dit endpoint heeft een stuk of tien uitgangen — streamend, niet-streamend, en drie
 * foutpaden. In plaats van bij elk daarvan te onthouden dat de metingen nog weg moeten,
 * staat het wachten hier één keer omheen. Zolang deze functie niet klaar is, bevriest de
 * omgeving hem niet, en dat is precies wat een niet-afgewachte insert nodig heeft.
 */
export default async function handler(req, res) {
  try { return await _verwerk(req, res); }
  finally { await wachtOpVerbruik(); }
}

async function _verwerk(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  const eindtijd = Date.now() + FUNCTIE_BUDGET_MS;

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  // gebruikerContext verifieert net als verifieerJWT, maar houdt vast wie het is —
  // nodig om verbruik per gebruiker en per kantoor te kunnen tellen.
  const _ctx = await gebruikerContext(token);
  if (!_ctx) return res.status(401).json({ error: 'Niet geautoriseerd' });
  _meetOpslag.enterWith({ organisatieId: _ctx.organisatieId, gebruikerId: _ctx.gebruikerId,
                          fase: 'onbekend' });

  const {
    vraag,
    conversatie     = [],
    dossierContext  = null,
    resolvedFields  = {},
    dossierId       = null,
    stijl           = 'juridisch_volledig',
    rawModus        = false, // true = lange vrije tekst (klanttekst/mail), geen tool-schema
    stream          = false, // true = antwoord als SSE, zin voor zin (alleen het adviespad)
  } = req.body || {};

  if (!vraag?.trim()) return res.status(400).json({ error: 'Vraag ontbreekt' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const braveKey     = process.env.BRAVE_SEARCH_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY ontbreekt' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // ── Server-side resolvedFields: ophalen uit Supabase (niet afhankelijk van client) ──
  // Client-waarden (userAnswers) winnen over server-defaults bij merge.
  let effectiveResolvedFields = resolvedFields;
  if (dossierId) {
    try {
      const { data: rows } = await supabase
        .from('screeningen')
        .select('classificatie, rapport')
        .eq('dossier_id', dossierId)
        .order('created_at', { ascending: false })
        .limit(1);
      const screening = rows?.[0];
      if (screening?.classificatie) {
        const cl = screening.classificatie;
        const kenmerken = cl.situatie_kenmerken || [];
        const serverFields = kenmerkNaarFields(kenmerken);
        // Directe classificatievelden — niet afleidbaar uit situatie_kenmerken.
        // AVG: datums gaan gegeneraliseerd mee (jaar / leeftijd), zie skill avg-beleid.
        // De sleutelnamen blijven bewust "…datum": daarop filtert de onbekenden-check
        // verderop, zodat Claude niet alsnog naar een al bekende datum vraagt.
        const hwMndJaar = maandJaarUitDatum(cl.huwelijksdatum);
        const lftA      = leeftijdUitDatum(cl.partij_a_geboortedatum);
        const lftB      = leeftijdUitDatum(cl.partij_b_geboortedatum);
        if (hwMndJaar)       serverFields.huwelijksdatum         = hwMndJaar;
        if (lftA !== null)   serverFields.partij_a_geboortedatum = `${lftA} jaar`;
        if (lftB !== null)   serverFields.partij_b_geboortedatum = `${lftB} jaar`;
        // Uitzondering: nationaliteit exact — bepaalt het toepasselijk recht.
        if (cl.nationaliteit_a)        serverFields.nationaliteit_a       = cl.nationaliteit_a;
        if (cl.nationaliteit_b)        serverFields.nationaliteit_b       = cl.nationaliteit_b;
        // Server-feiten als basis; client-waarden (user-answers) als override
        effectiveResolvedFields = { ...serverFields, ...resolvedFields };
      }
    } catch (_) { /* ga door met client-resolvedFields als fallback */ }
  }

  // ── Streamen (alleen het adviespad) ─────────────────────────────
  // Zodra de headers eruit zijn kan er geen res.status(500).json meer volgen; een
  // fout moet dan als SSE-bericht mee. stuurSSE en meldFout dekken beide gevallen af,
  // zodat de rest van de code niet hoeft te weten in welke modus hij draait.
  const stroom = stream === true;
  let sseOpen = false;

  function stuurSSE(obj) {
    if (!sseOpen) return;
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { sseOpen = false; }
  }

  function meldFout(melding, statuscode = 500) {
    if (sseOpen) { stuurSSE({ type: 'fout', melding }); return res.end(); }
    return res.status(statuscode).json({ error: melding });
  }

  if (stroom) {
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');   // zonder dit buffert de proxy alles alsnog
    res.flushHeaders?.();
    sseOpen = true;
    stuurSSE({ type: 'fase', tekst: 'Kennisbank raadplegen…' });
  }

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
      // Zocht tot 23 augustus 2026 op één enkel trefwoord — het eerste woord van
      // vijf tekens of langer dat niet in een stopwoordenlijst stond. Bij "schrijf
      // een clausule over de verdeling van de overwaarde" werd dat "verdeling", en
      // kreeg het model vijf willekeurige chunks waarin dat woord voorkwam.
      const { chunks } = await zoekChunks(supabase, vraag, null, {
        apiKey: process.env.VOYAGE_API_KEY,
      });
      if (chunks.length) {
        kbInjectie = '\n\n[JURIDISCHE KENNISBANK — gebruik als primaire bron voor wetsverwijzingen; noem alleen artikelen die hier daadwerkelijk in staan]\n' +
          chunks.map(c => `**${c.citation}**\n${c.content}`).join('\n\n---\n\n') +
          '\n[/JURIDISCHE KENNISBANK]';
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
      const rawBody = {
        max_tokens:  4000,
        temperature: 0.5,
        system:      SYSTEEM_CACHED, // Fix 3: volledig SYSTEEM-prompt ipv minimale string
        messages:    msgs,
      };

      // Een clausule duurt in de praktijk ruim vijftig seconden en levert zo'n 6.500
      // tekens op — de langste stilte in de app. Hier is streamen eenvoudiger dan op
      // het adviespad: vrije tekst, geen half binnengekomen JSON.
      let tekst;
      if (stroom) {
        stuurSSE({ type: 'fase', tekst: 'Tekst opstellen…' });
        const t0Raw = Date.now();
        _zetFase('clausule');  // rawModus: clausule, mail, klanttekst
        ({ tekst } = await callClaudeStream(
          anthropicKey, rawBody, null, eindtijd,
          stuk => stuurSSE({ type: 'delta', tekst: stuk }),
        ));
        console.log(`[ai-assistent] rawModus streamend ${Date.now() - t0Raw}ms, ${tekst.length} tekens`);
      } else {
        _zetFase('clausule');  // rawModus zonder stroom
        const rawData = await callClaude(anthropicKey, rawBody, 2, eindtijd);
        tekst = rawData.content.find(b => b.type === 'text')?.text || '';
      }

      const rawAntwoord = {
        intent: 'klanttekst', antwoord: tekst, bronnen: [],
        aannames: [], signalen: [], onbekenden: [], vervolgacties: [],
        vragen: [], clausuleRelevant: 'geen',
      };
      if (stroom) { stuurSSE({ type: 'klaar', data: rawAntwoord }); return res.end(); }
      return res.status(200).json(rawAntwoord);
    } catch (err) {
      return meldFout(err.message);
    }
  }

  // ── Context opbouwen ────────────────────────────────────────────
  const prefixBlokken = [];

  if (dossierContext) {
    prefixBlokken.push(`[DOSSIERCONTEXT]\n${dossierContext}\n[/DOSSIERCONTEXT]`);
  }

  const bekendRijen = Object.entries(effectiveResolvedFields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${VELD_LABEL[k] || k}: ${v}`);
  if (bekendRijen.length) {
    prefixBlokken.push(
      `[BEKENDE GEGEVENS — stel hier nooit opnieuw vragen over]\n${bekendRijen.join('\n')}\n[/BEKENDE GEGEVENS]`,
    );
  }

  const rijkeFields = verrijkResolvedFields(effectiveResolvedFields, dossierContext);
  const feitenBlok  = bouwFeitenBlok(rijkeFields);
  if (feitenBlok) prefixBlokken.push(feitenBlok);

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
      // Zoeken is optioneel, antwoorden niet. Er moet ruimte zijn voor een hele ronde
      // én voor de afronding — anders begint er een ronde die halverwege wordt
      // afgekapt, en dan is de tijd besteed zonder dat er iets is opgehaald.
      if (Date.now() + RONDE_MS + AFRONDING_MS > eindtijd) {
        console.warn(`[ai-assistent] zoekloop gestopt na ${i} ronde(s) — tijdsbudget`);
        break;
      }

      // max_tokens laag: een tool-aanroep past er ruim in, een uitgeschreven antwoord
      // niet. Loopt het model er toch tegenaan, dan kost dat vier seconden in plaats
      // van vijfendertig.
      let data;
      try {
        _zetFase('zoekronde');
        data = await callClaude(anthropicKey, {
          max_tokens:  400,
          temperature: 0.3,
          system:      ZOEK_SYSTEEM,
          tools:       ZOEK_TOOLS,
          messages:    zoekMessages,
        }, 2, eindtijd - AFRONDING_MS);
      } catch (zoekErr) {
        // Een mislukte zoekronde is geen mislukt antwoord. Ga door met de bronnen die
        // er al zijn — zonder deze vangst sloopte één afgekapte ronde het hele verzoek.
        console.warn(`[ai-assistent] zoekronde ${i + 1} overgeslagen: ${zoekErr.message}`);
        break;
      }

      if (data.stop_reason !== 'tool_use') break; // Geen zoekactie meer nodig

      zoekMessages.push({ role: 'assistant', content: data.content });

      // De zoekloop duurt ~20 seconden en gebruikt vrijwel altijd al zijn rondes.
      // Laat zien wát er gezocht wordt: een mediator kan meelezen en ziet dat er
      // gewerkt wordt, in plaats van naar een spinner te kijken.
      if (stroom) {
        const termen = data.content
          .filter(b => b.type === 'tool_use')
          .map(b => b.input?.zoektermen || b.input?.zoekvraag || '')
          .filter(Boolean);
        if (termen.length) stuurSSE({ type: 'fase', tekst: `Zoekt: ${termen[0]}` });
      }

      const t0Tools = Date.now();
      const toolResults = await voerToolsUit(data.content, supabase, braveKey, bronnenZoek);
      zoekMessages.push({ role: 'user', content: toolResults });
      // Zonder deze meting is niet te zien of de tijd in Claude of in de zoekopdracht
      // gaat zitten — en dat verschil bepaalt waar een volgende ingreep hoort.
      console.log(`[ai-assistent] zoekronde ${i + 1}: tools ${Date.now() - t0Tools}ms, `
        + `totaal ${Date.now() - (eindtijd - FUNCTIE_BUDGET_MS)}ms`);
    }

    // ── Fase 2: Gestructureerde output ───────────────────────────
    if (stroom) stuurSSE({ type: 'fase', tekst: 'Antwoord opstellen…' });

    const t0Struct = Date.now();
    const fase2 = {
      max_tokens:  4000,
      temperature: 0.3,
      system:      SYSTEEM_CACHED,
      tools:       [ASSISTENT_TOOL],
      tool_choice: { type: 'tool', name: 'assistent_antwoord' },
      messages:    zoekMessages,
    };

    let output;
    if (stroom) {
      // Het antwoord is ongeveer een derde van wat het model schrijft; de rest gaat
      // naar bronnen, aannames en signalen. Die gaan mee zodra ze compleet zijn, zodat
      // de mediator ze kan lezen terwijl de rest nog binnenkomt — in dezelfde opmaak
      // als het eindresultaat, want de client rendert ze met dezelfde functie.
      //
      // `maakSectieVolger` geeft alleen volledige waarden door. Een half signaal of
      // een bron zonder citatie wordt niet verstuurd: dat leest als een afgeronde
      // bevinding terwijl het er geen is.
      const volgAntwoord = maakVeldVolger('antwoord');
      const volgSecties  = maakSectieVolger(STREAM_VELDEN);

      _zetFase('afronding');
      const { input } = await callClaudeStream(anthropicKey, fase2, deelJson => {
        const stuk = volgAntwoord(deelJson);
        if (stuk) stuurSSE({ type: 'delta', tekst: stuk });
        const secties = volgSecties(deelJson);
        for (const [veld, waarde] of Object.entries(secties)) {
          stuurSSE({
            type: 'sectie',
            veld,
            waarde: veld === 'bronnen' && Array.isArray(waarde) ? waarde.map(naarBronUI) : waarde,
          });
        }
      }, eindtijd);
      output = input;
    } else {
      _zetFase('afronding');
      const structData = await callClaude(anthropicKey, fase2, 2, eindtijd);
      const toolBlock = structData.content.find(
        b => b.type === 'tool_use' && b.name === 'assistent_antwoord',
      );
      if (!toolBlock) throw new Error('assistent_antwoord niet aangeroepen door het model');
      output = toolBlock.input;
    }

    console.log(`[ai-assistent] gestructureerde call ${Date.now() - t0Struct}ms, `
      + `totaal ${Date.now() - (eindtijd - FUNCTIE_BUDGET_MS)}ms`);

    // ── Laag 2: consistentievalidatie (code, niet prompt) ────────
    valideerConsistentie(output, rijkeFields);

    // ── Server-side validatie (spec §3) ──────────────────────────
    // Verwijder onbekenden die al in effectiveResolvedFields staan (HARDE REGEL)
    if (output.onbekenden?.length) {
      output.onbekenden = output.onbekenden.filter(o => !(o.veld in effectiveResolvedFields));
    }
    // Verduidelijkingsvraag alleen als er daadwerkelijk een blokkerend onbekende is,
    // of als het een feitencheck-mismatch betreft (veld: 'vraag_context').
    if (output.verduidelijkingsvraag &&
        !output.onbekenden?.some(o => o.blokkerend) &&
        output.verduidelijkingsvraag.veld !== 'vraag_context') {
      delete output.verduidelijkingsvraag;
    }
    // Een aangekondigde clausule die er niet is. Zie src/assistent/clausule-belofte.js:
    // dit kwam voort uit een verwijzing naar een veld dat niet bestond, en was van
    // buiten niet van een gewoon antwoord te onderscheiden.
    const belofte = beoordeelClausuleBelofte(output);
    if (belofte.gebroken) {
      console.warn(`[ai-assistent] ${belofte.reden}`);
      output.antwoord = vulClausuleBelofteAan(output.antwoord, belofte);
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

    // Formaat voor bestaande UI — type='wet' voor citaten, type='web' voor links.
    // Zelfde omzetting als bij de streamende bronnen; zie naarBronUI.
    const bronnenUI = alleBronnen.map(naarBronUI);

    // ── Backward-compat: vragen + clausuleRelevant ────────────────
    const vragen = output.verduidelijkingsvraag
      ? [{
          label:  output.verduidelijkingsvraag.vraag,
          keuzes: output.verduidelijkingsvraag.antwoordopties || [],
          veld:   output.verduidelijkingsvraag.veld || '',
        }]
      : [];

    const clausuleRelevant = output.intent === 'clausule'
      ? 'convenant'
      : output.vervolgacties?.includes('clausule_opstellen') ? 'convenant' : 'geen';

    const antwoordObj = {
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
      // Backward-compat (UI stap 2 vervangt dit)
      vragen,
      clausuleRelevant,
    };

    if (stroom) {
      // Het antwoord is al streamend doorgegeven; dit bericht levert de rest —
      // bronnen, signalen, aannames — en de definitieve, gevalideerde tekst.
      stuurSSE({ type: 'klaar', data: antwoordObj });
      return res.end();
    }
    return res.status(200).json(antwoordObj);

  } catch (err) {
    console.error('[ai-assistent]', err.message);
    return meldFout(err.message);
  }
}
