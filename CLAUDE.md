# CLAUDE.md

Guidance voor Claude Code bij dit project.

## Stack & Deployment

- **Frontend**: Één `index.html` — vanilla HTML/CSS/JS, geen build step.
- **Backend**: Vercel serverless functies in `/api/` (Node.js, ES modules).
- **Database**: Supabase (tabellen: `screeningen`, `situatie_kenmerken`, `document_templates`, `legal_chunks`).
- **AI**: Claude via Anthropic API (`claude-sonnet-4-6`), tool-use voor gestructureerde JSON-output.

## Lokaal draaien

```bash
vercel dev
```

Open daarna: http://localhost:3000

`vercel dev` emuleert de serverless omgeving lokaal en leest de `.env` voor de API-sleutels.

**Eerste keer opzetten:**
1. `vercel link` — project koppelen aan Vercel account
2. Vul `.env` in met de variabelen (te vinden in Vercel dashboard → Settings → Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` — JWT-format publieke key (voor server-side JWT-verificatie via `/auth/v1/user`)
   - `ANTHROPIC_API_KEY`
   - `NAAM_ENCRYPTION_KEY` — exact 64 hex-tekens (AES-256-GCM voor namen_map-versleuteling)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — eigen mailserver
     op clausula.nl, voor uitnodigings-e-mails via `api/uitnodigen.js`
   - `ADOBE_CLIENT_ID` — voor PDF→DOCX conversie via Adobe PDF Services
   - `ADOBE_CLIENT_SECRET`
3. `vercel dev` starten

Het `.env` bestand staat in `.gitignore` — nooit committen.

## Bestandsstructuur

| Bestand / map | Doel |
|---|---|
| `index.html` | Volledige frontend (upload, rapport, opgeslagen analyses, concepten) |
| `api/analyseer.js` | POST — document analyseren via Claude, SSE-streaming |
| `api/_prompts/` | De screening-prompts, apart van de orkestratie — zie hieronder |
| `api/claude-edge.js` | POST — Claude proxy (concept-generatie, vraag-antwoord), SSE |
| `api/adobe-start.js` | POST — PDF uploaden naar Adobe PDF Services, start export-job |
| `api/adobe-result.js` | POST — Adobe export-job status opvragen / DOCX ophalen |
| `api/naam-encrypt.js` | POST — namen versleutelen (AES-256-GCM) voor namen_map opslag |
| `api/naam-decrypt.js` | POST — namen ontsleutelen voor weergave / export |
| `api/uitnodigen.js` | POST — uitnodigingsmail sturen via SMTP (eigen mailserver) |
| `api/registreer.js` | POST — nieuwe gebruiker registreren (geen JWT vereist) |
| `api/_crypto.js` | Helper — AES-256-GCM encrypt/decrypt (gebruikt door naam-encrypt/decrypt) |
| `config.js` | Publieke Supabase-URL en anon key (ingeladen door `index.html`) |
| `vercel.json` | Vercel-configuratie (rewrites, maxDuration) |
| `.env` | Lokale API-sleutels (nooit committen) |

## Supabase-tabellen

- **`screeningen`** — opgeslagen analyses (`id`, `bestandsnaam`, `classificatie` jsonb, `rapport` jsonb, `namen_map` text (encrypted), `dossier_id` uuid, `versie_nr` integer, `versie_label` text, `created_at`, `updated_at`)
- **`situatie_kenmerken`** — taxonomie: `key`, `label`, `categorie`
- **`document_templates`** — verwachte secties per documenttype: `doc_type`, `section_name`, `required`, `applies_when`, `section_order`, `instructions`
- **`legal_chunks`** — wetsartikelen: `citation`, `content`, `topic_tags` (array, gebruikt `.overlaps()`)

## API-patroon

Alle endpoints gebruiken ES modules (`export default async function handler(req, res)`).  
Alle endpoints behalve `api/registreer.js` vereisen een Supabase JWT via `Authorization: Bearer <token>` — gevalideerd via `GET /auth/v1/user`.  
Claude wordt aangeroepen via `askClaude()` in `api/analyseer.js` (tool-use, gestructureerde JSON) en via streaming in `api/claude-edge.js` (concept-generatie, SSE).

> **Maximaal 12 serverless functies.** Vercel maakt van élk bestand in `api/` een
> aparte functie, en het Hobby-plan staat er hoogstens twaalf toe. Er zijn negen
> endpoints, dus er is weinig ruimte.
>
> Bestanden en mappen met een **liggend streepje ervoor** worden niet als endpoint
> geteld — vandaar `_auth.js`, `_iban.js`, `_crypto.js` en de map `_prompts/`.
> Zet nieuwe helpers of promptbestanden dus altijd achter een `_`.
>
> Op 21 augustus 2026 sneuvelde een deploy hierop: de map `api/prompts/` voegde zes
> bestanden toe en bracht het totaal op vijftien. De build slaagde, het uitrollen
> niet — met als gevolg dat elf commits stil op GitHub bleven staan terwijl de
> site gewoon de oude versie bleef serveren.

## Git

Nooit automatisch pushen. Alleen pushen als de gebruiker dat expliciet vraagt.

**Controleer na een push of de deploy ook echt geslaagd is.** Een mislukte
deployment verandert niets aan de site: die blijft de vorige versie serveren, dus
alles lijkt te werken terwijl je wijziging nergens staat.

## Kennisbank (`legal_chunks`) wijzigen

**Na elke wijziging of toevoeging van chunks — ook via het Supabase-dashboard —
twee scripts draaien:**

```bash
node scripts/kennisbank-check.mjs    # tags: underscore vs streepje
node scripts/kennisbank-embed.mjs    # embeddings voor semantisch zoeken
```

Het tweede is er sinds 23 augustus 2026. De assistent zoekt semantisch in de
kennisbank; een chunk waarvan de tekst is aangepast maar de embedding niet, wordt
gevonden op zijn **oude** inhoud. De tekst klopt dan wel, de vindbaarheid niet, en
dat is nergens aan te zien. Waarom semantisch: technisch document §8 — zes van twaalf
realistische vragen gaven met het oude woordzoeken nul relevante chunks.

> **Die regel ging tot 24 augustus 2026 niet af.** `kennisbank-embed.mjs` koos zijn
> werk met `chunks.filter(c => !c.embedding_bij)` — alleen chunks die nog nóóit
> waren ingelezen. Een chunk waarvan de tekst veranderde hield zijn stempel en werd
> dus nooit bijgewerkt. Na het herschrijven van drie alimentatie-chunks meldde het
> script `in te lezen: 0` en de controle `✓ Alles staat klaar`.
>
> Er staat nu bij elke chunk een `embedding_hash`: de sha256 van de tekst zoals die
> is ingelezen. Wijkt die af van de huidige tekst, dan is de embedding verouderd —
> `kennisbank-embed.mjs` pakt hem op en noemt hem bij naam, en
> `kennisbank-semantisch-check.mjs` meldt hem ook zónder dat je de embedder draait.
> De kolom komt uit `supabase/2026-08-24-embedding-hash.sql`.
>
> Verander je wat aan de tekst die wordt ingelezen (nu `citation` + newline +
> `content`, afgekapt op 8000 tekens), pas dat dan in **beide** scripts aan. Lopen ze
> uiteen, dan meldt de controle alles als verouderd — hinderlijk, maar zichtbaar.

De selectie in `api/analyseer.js` matcht `topic_tags` tegen `situatie_kenmerken.key`,
en die keys gebruiken **underscores**. Een chunk die je tagt met `koude-uitsluiting`
in plaats van `koude_uitsluiting` matcht daardoor nooit: hij staat in de database,
wordt nooit opgehaald, en er verschijnt nergens een foutmelding. In augustus 2026
stonden er zo zes tags in twee schrijfwijzen, waaronder tien chunks onder
`huwelijkse-voorwaarden` die buiten elke analyse vielen.

Let op: niet élk streepje is fout — `art-1:94-bw`, `pre-2012` en `hr-2006` horen zo.
Het gaat om tags die een tegenhanger met underscore hebben. De controle signaleert
precies dat onderscheid.

De controle meldt sinds 23 augustus 2026 ook **onbereikbare chunks**: die waarvan geen
enkele tag in `situatie_kenmerken` voorkomt. Acht chunks stonden zo buiten élke analyse,
waaronder het complete IPR-blok. Zie `supabase/kennisbank-bereikbaarheid.sql` voor het
patroon om ze binnen te halen — en let op dat zo'n `update` nauw geformuleerd blijft:
een bredere variant raakte ook vier chunks die al goed stonden.

Een PostToolUse-hook draait deze controle automatisch bij het bewerken van bestanden
met `legal_chunk`, `wettekst` of `kennisbank` in de naam. Wijzigingen die je
rechtstreeks in het dashboard doet laten geen bestand achter, dus die vangt de hook
niet — daarvoor geldt de regel hierboven.

## Screening-prompts staan in `api/_prompts/`

Sinds 20 augustus 2026 staan de prompts niet meer in `api/analyseer.js` — dat
bestand was voor 84% prompttekst, waardoor elke promptwijziging hetzelfde bestand
raakte als elke logicawijziging en er dus niets aan te koppelen viel.

| Bestand | Inhoud |
|---|---|
| `_prompts/gedeeld.js` | Ernst-criteria, verificatieplicht, pseudonimiseringsnota — samen één gecachet blok |
| `_prompts/structuur.js` | System prompt voor volledigheid + MfN-score |
| `_prompts/bevindingen.js` | System prompt voor juridisch, balans, grammatica, conflicten |
| `_prompts/cross-doc.js` | System prompt voor inconsistenties tussen documenten |
| `_prompts/consolidatie.js` | Deduplicatiestap (Haiku) |
| `_prompts/fragmenten.js` | Voorwaardelijke blokken: notities en checklijsten per documenttype |

**Na elke wijziging hier: `npm run test:eval` draaien** en vergelijken met de
baseline (`docs/auto-test-setup.md`, punt D10). Een PostToolUse-hook herinnert
daaraan; `api/_consistentie.js` valt onder dezelfde regel.

> **Raak witruimte en spelling niet zonder reden aan.** De gedeelde blokken worden
> byte-exact door Anthropic gecachet — elke wijziging kost eenmalig een volledige
> cache-miss op alle lopende analyses.

## Nieuwe logica gaat naar `src/`

`index.html` telt bijna 15.000 regels en 286 functies. Het refactorplan in
`docs/REFACTOR-PLAN-clausula.md` ging uit van 13.000 — het bestand groeide dus
tijdens de refactor. Daarom een harde regel in plaats van een voornemen:

**Nieuwe logica met een eigen redenering — een berekening, een validatie, een
transformatie — komt in `src/` te staan, met een unittest.** UI-bedrading en
DOM-opbouw mogen in `index.html` blijven.

De reden is toetsbaarheid, niet netheid: alles wat in `src/` staat heeft tests,
niets van de 286 functies in `index.html` heeft die. Dat is geen toeval — het is
de enige manier waarop die code bereikbaar wordt voor een test.

`tests/unit/omvang.test.js` bewaakt dit met twee grenzen: op het totaal, en — sinds
23 augustus 2026 — op alleen de regels binnen `<script>`. Die tweede is degene die
iets zegt: CSS en HTML kunnen nergens heen (er is geen build-stap), en groei daarin
zegt niets over toetsbaarheid.
Die grens mag **alleen omlaag**. Loopt hij vol, verplaats dan eerst iets; verhoog
je hem toch, dan staat dat in de diff en is het een besluit.

> **De grens is een aanleiding tot een vraag, geen wet.** Werkt hij in een concreet
> geval averechts — code dichtschrijven om regels te sparen, commentaar schrappen
> dat de code juist verklaart, of iets verplaatsen zonder dat er een test bij komt
> die iets bewijst — **meld dat dan eerst**, met het alternatief erbij, en ga daarna
> door zoals gevraagd. Meestal is het alternatief: de grens bewust verhogen, of het
> gedrag met een browsertest afdekken in plaats van de code te verhuizen.
>
> Extractie is geen doel op zich. Van de fouten die op 19–20 augustus 2026 boven
> water kwamen — een ongedefinieerde CSS-variabele, een kapot SVG-pad, verouderde
> golden tests, stille `catch`-blokken — had verplaatsen er vrijwel geen voorkomen.
> Tests en waarneming wel.

Aansluiten gaat via de bestaande ESM-brug onderaan `index.html` (`<script
type="module">`), zonder build-stap.

## Browsertests: waar de unittests ophouden

`npm run test:e2e` — Playwright, zeven smoketests in `tests/e2e/smoke/`.

Ze bestaan voor één klasse fouten die geen enkele andere controle ziet: code die
zonder syntaxfout laadt en pas bij de eerste klik breekt. Op 23 augustus 2026 haalden
er twee productie — `bouwVerificatieContext is not defined` en
`STREAM_ONDERDELEN is not defined`. Beide waren correcte JavaScript; de unittests
dekten de losse modules, maar niemand liep de flow ooit dóór.

Elke test roept `volgPaginafouten(page)` aan het begin en
`verwachtGeenPaginafouten(fouten)` aan het eind — zie `tests/e2e/helpers/paginafouten.js`.

> **Let op waar zo'n fout terechtkomt.** `pageerror` vuurt alleen bij een ónafgevangen
> fout. De assistent vangt alles af in een try/catch en toont het als bericht in de
> chat, wat van buiten niet van een normaal antwoord te onderscheiden is. Daarvoor is
> `verwachtGeenFoutbericht(bericht)`, die de inhoud van de bubbel nakijkt.

Nieuwe flow gebouwd? Eén smoketest erbij die hem daadwerkelijk doorloopt. Dat is
goedkoper dan de melding van een mediator.

## Skills bijhouden

Skills in `.claude/skills/` leggen non-obvieuze kennis vast die niet direct uit de code
af te lezen is. Ze worden **niet automatisch bijgewerkt** — dit moet expliciet gebeuren.

**Bijwerkregel (verplicht toepassen):**
Na elke wijziging aan de bestanden hieronder — controleer of de bijbehorende skill(s)
bijgewerkt moeten worden en doe dat **in dezelfde sessie, vóór de commit**:

| Gewijzigd bestand | Betrokken skill(s) |
|---|---|
| `api/analyseer.js` | `screening-categorien`, `document-model` |
| `api/genereer-concept.js` | `concept-generatie` |
| `api/export-docx.js` | `concept-generatie` |
| `api/ai-assistent.js` | `clausula-assistent` |
| `index.html` — analyse-flow | `screening-categorien`, `document-model` |
| `index.html` — concept-flow | `concept-generatie` |
| `index.html` — assistent-flow | `clausula-assistent` |

Update de skill alleen als de wijziging **non-obvieuze** kennis toevoegt of verandert
(veldnamen, algoritmen, valkuilen, designbeslissingen). Triviale fixes hoeven niet.

Als code en skill **afwijken**: meld dit altijd expliciet aan de gebruiker.

De PostToolUse hook in `.claude/settings.json` geeft een automatisch signaal bij edits
op de API-bestanden — reageer daarop door de skill te beoordelen.
