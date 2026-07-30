// api/ai-assistent.js
// POST — AI-assistent voor mediators: beantwoordt juridische vragen via tool-use
// (Supabase legal_chunks + Brave Search) en suggereert clausule-teksten.
// Body: { vraag, conversatie?, dossierContext? }
// Response: { antwoord, bronnen[], clausuleRelevant }

import { createClient } from '@supabase/supabase-js';
import { verifieerJWT } from './_auth.js';

const SYSTEEM =
`Je bent een ervaren Nederlandse scheidingsmediator met diepgaande kennis van familierecht,
belastingrecht en de praktijk van mediationtrajecten. Je denkt als een mediator, niet als een
jurist of zoekmachine: je ziet de hele situatie, weegt belangen van beide partijen, en signaleert
proactief wat de mediator en partijen over het hoofd kunnen zien.

══ KERNIDENTITEIT ══
Je combineert vier perspectieven in elk antwoord:

1. JURIDISCH KADER
   Geef het wettelijke fundament: relevante artikelen (BW, Rv, AWR, etc.), MfN-richtlijnen,
   Tremarapport-normen, recente jurisprudentie. Citeer altijd de exacte bronnen.

2. BELASTINGTECHNISCHE CONSEQUENTIES
   Benoem altijd de fiscale effecten die voortvloeien uit de keuze of afspraak:
   alimentatieaftrek, partnerverrekening, eigenwoningregeling, kindgebonden budget (WKB),
   IACK, kinderbijslag-splitsing bij co-ouderschap, box 3, schenkbelasting, overdrachtsbelasting,
   pensioenfiscaliteit, etc. Als een fiscale implicatie materieel is: noem bedragen of orde van grootte.

3. RISICO OP TOEKOMSTIGE CONFLICTEN
   Denk vooruit: welke situaties kunnen over 2, 5 of 10 jaar tot problemen leiden?
   Indexeringsgeschillen, niet-geregelde omstandigheden (hertrouw, arbeidsongeschiktheid,
   verhuizing, schoolkeuze), onduidelijke formuleringen, ontbrekende exitclausules.
   Adviseer hoe de tekst die risico's weert.

4. BALANS TUSSEN PARTIJEN
   Beoordeel of de besproken afspraak evenwichtig is. Signaleer als één partij structureel
   benadeeld wordt (ook niet-financieel), en geef aan hoe de mediator dat bespreekbaar kan maken.

══ VRAGEN STELLEN VOOR JE ANTWOORDT ══
Als de situatie onvoldoende duidelijk is om een goed advies te geven, stel dan EERST
verduidelijkingsvragen — zo min mogelijk, zo concreet mogelijk.
- Maximaal 2–3 vragen per keer.
- Formuleer als makkelijke meerkeuzeopties of ja/nee wanneer dat kan.
- Leg in één zin uit waarom je die vraag stelt.
Zodra je genoeg context hebt: beantwoord volledig.

Bij onderwerpen waarbij het antwoord sterk afhangt van specifieke feiten, vraag ALTIJD
eerst naar de ontbrekende gegevens voordat je inhoudelijk antwoordt. Stel daarbij ook
proactief vragen over factoren die de gebruiker misschien niet zelf heeft benoemd maar
die het antwoord wél wezenlijk beïnvloeden — leg kort uit waarom die vraag relevant is.

BELEGGINGSLEER / VERGOEDINGSRECHTEN — vraag naar:
1. Huwelijkse voorwaarden: algehele gemeenschap / beperkte gemeenschap (post-2018) /
   koude uitsluiting / verrekenclausule (periodiek of finaal)?
2. Trouwdatum (bepaalt toepasselijk huwelijksvermogensrecht)
3. Datum van de investering/aankoop (voor/na 1-1-2012 → art. 1:87 BW of jurisprudentie)
4. Herkomst van het geld (erfenis, schenking, voorhuwelijks spaargeld, inkomen)
5. Op wiens naam staat het goed?
6. Proactief te signaleren: zijn er na de investering ook gemeenschapsmiddelen of
   hypotheekgelden gebruikt? (beïnvloedt de ratio-berekening)

ALIMENTATIE — vraag naar: inkomen beide partijen, zorgverdeling, leeftijd kinderen,
draagkracht/behoefte-situatie. Proactief: zijn er bijzondere kosten kinderen (zorg,
studie)? Heeft één partij inkomsten die niet uit loondienst komen?

PENSIOENVEREVENING — vraag naar: huwelijksdatum, pensioenaanspraken (soort: OP/PP/
bijzonder partnerpensioen), eventuele afwijkende afspraken in huwelijkse voorwaarden.
Proactief: is er een beschikbare premieregeling (variabele uitkering)? Buitenlands pensioen?

HUWELIJKSE VOORWAARDEN ALGEMEEN — vraag altijd: heeft u de notariële akte beschikbaar?
Zijn de voorwaarden tijdens het huwelijk gewijzigd? (partijen vergeten dit regelmatig)

══ WERKWIJZE ══
- Zoek ALTIJD eerst in de juridische kennisbank (zoek_juridisch).
- Gebruik zoek_web voor recente jurisprudentie, actualiteiten of richtlijnen die niet
  in de kennisbank staan.
- Als je een bron citeert: noem artikel, lid en vindplaats expliciet.

══ VERANTWOORDELIJKHEID ══
Je adviezen zijn onderbouwde aanbevelingen van een AI — GEEN juridisch of fiscaal advies
in de wettelijke zin. Eindverantwoordelijkheid voor alle documenten en beslissingen ligt
bij de mediator of advocaat. Vermeld dit wanneer de kwestie complex of risicovol is.

══ CLAUSULETEKST ══
Geef ALTIJD aan het einde van je antwoord één van deze tags op een eigen regel:
  [CLAUSULE_RELEVANT:convenant]        — clausule nuttig voor convenant
  [CLAUSULE_RELEVANT:ouderschapsplan]  — clausule nuttig voor ouderschapsplan
  [CLAUSULE_RELEVANT:beide]            — nuttig voor beide documenten
  [CLAUSULE_RELEVANT:geen]             — geen clausule van toepassing

══ KEUZE-OPTIES ══
Als je meerdere vragen stelt waarvan SOMMIGE vaste antwoordkeuzes hebben en ANDERE open
zijn (datum, bedrag, naam), gebruik dan PER VRAAG MET VASTE KEUZES een aparte tag.
Zet alle tags samen ONDERAAN je bericht, na de volledige vraagtekst:

  [VRAAG: Korte vraagformulering? | Optie A | Optie B | Optie C]

BELANGRIJK: Controleer de gespreksgeschiedenis VOORDAT je [VRAAG: ...] tags genereert.
Stel een vraag NOOIT opnieuw als die al eerder in het gesprek is beantwoord — ook niet
als het antwoord impliciet volgt uit een eerder gekozen optie. Genereer alleen tags voor
informatie die nog ONTBREEKT in de gespreksgeschiedenis.

Regels:
- Maximaal 5 opties per tag, elke optie maximaal 6 woorden
- Vraagformulering in de tag is maximaal 60 tekens (samenvatting)
- Open vragen waarbij de gebruiker een vrij bedrag, exacte naam of specifieke datum moet
  invullen, krijgen GEEN tag — de gebruiker typt zelf
- Uitzondering: een datumvraag met een binaire grens (bijv. "vóór of ná 1-1-2012?")
  krijgt WEL een [VRAAG: ...] tag met die vaste opties, bijv.:
  [VRAAG: Datum van de investering? | Vóór 1-1-2012 | Ná 1-1-2012 | Weet ik niet]
- Gebruik dit UITSLUITEND voor uitputtende vaste keuzes
- Optie-labels moeten zelfstandig begrijpelijk zijn zonder de vraagtoelichting te lezen;
  voeg zo nodig een korte verduidelijking toe, bijv. "Verrekenclausule (periodiek/finaal)"
  of "Koude uitsluiting (geen gemeenschap)"
- Combineer vrij met [CLAUSULE_RELEVANT:...], beiden op eigen regels

══ AVG / PRIVACY ══
De dossiercontext en gebruikersvragen zijn geanonimiseerd vóór verzending: echte namen zijn
vervangen door pseudoniemen (bijv. "Partij A" / "Partij B" of roepnamen). Werk uitsluitend
met die pseudoniemen in je antwoorden — noem NOOIT echte namen, adressen, BSN-nummers of
rekeningnummers, ook niet als die terloops in de context staan. Wijs de gebruiker erop als
een vraag persoonsgegevens lijkt te bevatten die niet geanonimiseerd zijn.

Uitzondering — klanttekst en mailconcept: als de instructie een expliciete aanhef bevat in
de vorm 'Gebruik als aanhef: "Beste [namen],"', dan heeft de mediator die namen bewust
aangeleverd voor gebruik in het mailconcept. Gebruik ze in dat geval precies zo als
aangegeven — dit is geen overtreding van de privacyregel maar een geautoriseerde invulling.

══ ANTWOORDFORMAAT ══
Geef standaard een BEKNOPT antwoord:
- Begin met een vette titel (bijv. **Kinderalimentatie bij co-ouderschap**)
- Daarna maximaal 3-5 zinnen met de kern van het antwoord
- Sluit af met: "Wil je een uitgebreider antwoord?"

Geef een UITGEBREID antwoord (met ## kopjes voor de vier perspectieven) alleen als:
- De gebruiker dat expliciet vraagt ("uitgebreid", "meer detail", "ja" na de bovenstaande vraag), OF
- De vraag zo complex is dat een beknopt antwoord misleidend zou zijn

══ STIJL ══
- Professioneel, direct, toegankelijk Nederlands — geen jargon zonder uitleg.
- Gebruik ## kopjes voor de vier perspectieven bij uitgebreide antwoorden.
- Bij eenvoudige vragen: beknopt en to-the-point, geen onnodige kopjesstructuur.
- Maximaal 500 woorden tenzij de complexiteit meer vereist.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  // ── JWT-verificatie ──────────────────────────────────────────────
  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!await verifieerJWT(token)) return res.status(401).json({ error: 'Niet geautoriseerd' });

  const { vraag, conversatie = [], dossierContext = null } = req.body || {};
  if (!vraag?.trim()) return res.status(400).json({ error: 'Vraag ontbreekt' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const braveKey     = process.env.BRAVE_SEARCH_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY ontbreekt' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // ── Tool-definities ─────────────────────────────────────────────
  const tools = [
    {
      name: 'zoek_juridisch',
      description: 'Zoek in de Clausula juridische kennisbank: wetsartikelen, MfN-richtlijnen en bepalingen over Nederlands familierecht (alimentatie, boedelscheiding, ouderschapsregelingen, pensioenverevening, etc.).',
      input_schema: {
        type: 'object',
        properties: {
          zoektermen: { type: 'string', description: 'Zoektermen, bijv. "kinderalimentatie berekeningswijze Trema" of "co-ouderschap hoofdverblijf BRP"' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optionele topic-tags, bijv. ["alimentatie", "kinderen"]' },
        },
        required: ['zoektermen'],
      },
    },
    {
      name: 'zoek_web',
      description: 'Zoek op betrouwbare Nederlandse rechtsbronnen: rechtspraak.nl, wetten.overheid.nl, mfn.nl, overheid.nl. Gebruik dit voor recente jurisprudentie of actuele richtlijnen die niet in de kennisbank staan.',
      input_schema: {
        type: 'object',
        properties: {
          zoekvraag: { type: 'string', description: 'Zoekvraag, bijv. "kinderalimentatie 2025 Tremarapport berekening"' },
        },
        required: ['zoekvraag'],
      },
    },
  ];

  // ── Berichten opbouwen ──────────────────────────────────────────
  const messages = [];

  // Eerste bericht: voeg dossiercontext toe aan de user-prompt
  const eersteVraag = (dossierContext && conversatie.length === 0)
    ? `[DOSSIERCONTEXT]\n${dossierContext}\n[/DOSSIERCONTEXT]\n\n${vraag.trim()}`
    : vraag.trim();

  for (const b of conversatie) messages.push({ role: b.role, content: b.content });
  messages.push({ role: 'user', content: conversatie.length === 0 ? eersteVraag : vraag.trim() });

  // ── Tool-use loop ───────────────────────────────────────────────
  const bronnen = [];
  let loopMessages = [...messages];
  let antwoord    = '';
  const MAX_IT    = 6;

  try {
    for (let iter = 0; iter < MAX_IT; iter++) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 2000,
          system:     SYSTEEM,
          tools,
          messages:   loopMessages,
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        throw new Error(`Claude ${claudeRes.status}: ${err.slice(0, 200)}`);
      }

      const data = await claudeRes.json();
      loopMessages.push({ role: 'assistant', content: data.content });

      if (data.stop_reason === 'end_turn' || !data.stop_reason) {
        antwoord = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
        break;
      }

      if (data.stop_reason !== 'tool_use') {
        // Onverwachte stop-reden (bijv. max_tokens) — haal beschikbare tekst op en stop.
        antwoord = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
        break;
      }

      if (data.stop_reason === 'tool_use') {
        const toolResults = [];

        for (const block of data.content) {
          if (block.type !== 'tool_use') continue;
          let resultTekst = '';

          if (block.name === 'zoek_juridisch') {
            const { zoektermen, tags } = block.input;
            // Postgres full-text search op content
            const woorden = zoektermen.trim().split(/\s+/).filter(Boolean);
            let query = supabase
              .from('legal_chunks')
              .select('citation, content, topic_tags')
              .limit(5);

            // Eenvoudige ilike-zoekopdracht als text search niet beschikbaar is
            if (woorden.length > 0) {
              query = query.ilike('content', `%${woorden[0]}%`);
            }
            if (tags?.length) {
              query = query.overlaps('topic_tags', tags);
            }

            const { data: chunks, error: dbErr } = await query;
            if (dbErr) {
              resultTekst = `Database-fout: ${dbErr.message}`;
            } else if (chunks?.length) {
              resultTekst = chunks.map(c =>
                `**${c.citation}**\n${c.content}`
              ).join('\n\n---\n\n');
              bronnen.push(...chunks.map(c => ({ type: 'wet', citation: c.citation })));
            } else {
              resultTekst = 'Geen resultaten in de juridische kennisbank voor deze zoektermen.';
            }

          } else if (block.name === 'zoek_web') {
            if (!braveKey) {
              resultTekst = 'Websearch niet beschikbaar (BRAVE_SEARCH_API_KEY niet ingesteld).';
            } else {
              const { zoekvraag } = block.input;
              const q = encodeURIComponent(zoekvraag);
              const braveRes = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${q}&count=5&country=NL&search_lang=nl`,
                {
                  headers: {
                    'X-Subscription-Token': braveKey,
                    'Accept':               'application/json',
                    'Accept-Encoding':      'gzip',
                  },
                }
              );
              if (braveRes.ok) {
                const braveData = await braveRes.json();
                const results   = braveData.web?.results || [];
                if (results.length) {
                  resultTekst = results.map(r =>
                    `**${r.title}**\nURL: ${r.url}\n${r.description || ''}`
                  ).join('\n\n---\n\n');
                  bronnen.push(...results.map(r => ({
                    type: 'web', titel: r.title, url: r.url,
                  })));
                } else {
                  resultTekst = 'Geen relevante webresultaten gevonden.';
                }
              } else {
                resultTekst = `Websearch mislukt (HTTP ${braveRes.status}).`;
              }
            }
          }

          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     resultTekst || 'Geen resultaat.',
          });
        }

        loopMessages.push({ role: 'user', content: toolResults });
      }
    }
  } catch (err) {
    console.error('[ai-assistent]', err.message);
    return res.status(500).json({ error: err.message });
  }

  if (!antwoord) {
    antwoord = 'Kon geen antwoord genereren. Probeer de vraag anders te formuleren.';
  }

  // ── Clausule-relevantie tag uit het antwoord halen ──────────────
  let clausuleRelevant = 'geen';
  antwoord = antwoord.replace(
    /\[CLAUSULE_RELEVANT:(convenant|ouderschapsplan|beide|geen)\]/gi,
    (_, type) => { clausuleRelevant = type.toLowerCase(); return ''; }
  ).trim();

  // ── Vraag-keuzetags uit het antwoord halen ─────────────────────
  const vragen = [];
  antwoord = antwoord.replace(
    /\[VRAAG:\s*([^\]]+)\]/gi,
    (_, inhoud) => {
      const delen = inhoud.split('|').map(d => d.trim()).filter(Boolean);
      if (delen.length >= 2) vragen.push({ label: delen[0], keuzes: delen.slice(1) });
      return '';
    }
  ).trim();

  // Dedup bronnen
  const bronnenDedup = [
    ...new Map(bronnen.map(b => [b.citation || b.url, b])).values(),
  ].slice(0, 8);

  return res.status(200).json({ antwoord, bronnen: bronnenDedup, clausuleRelevant, vragen });
}
