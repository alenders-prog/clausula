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
   - `TEST_EMAIL`, `TEST_PASSWORD` — testaccount voor `npm run test:eval`. Daarmee
     haalt de eval bij elke run zelf een verse Supabase-token op. Zonder deze twee
     valt hij terug op `TEST_JWT_TOKEN`, en die verloopt binnen een uur — met een
     401 die eruitziet als een promptregressie. Zie `tests/helpers/test-token.mjs`.
3. `vercel dev` starten

Het `.env` bestand staat in `.gitignore` — nooit committen.

### `vercel dev` valt om bij het antwoord dat een bestand draagt

Sinds 29 augustus 2026 bekend. De PDF→DOCX-conversie bleef staan op "Converteren… (1s)"
en kwam nooit meer terug. Niet Adobe (volledige flow: ~8s), niet de tokencontrole (35ms),
niet `fixDocxArtifacts` (regex 2ms, inpakken 58ms) — allemaal gemeten en vrijgepleit.

Het kindproces waarin `vercel dev` de functie draait sterft terwijl het zijn antwoord nog
verstuurt. De socket valt weg, undici zendt een `error`-event dat niemand afvangt, en Node
doodt daarop de hele dev-server:

```
SocketError: closed   code: 'UND_ERR_SOCKET'
  Emitted 'error' event on BodyReadable instance   ← onafgevangen
Error: Command failed: taskkill /pid … — ERROR: The process not found.
```

Het treft alleen het antwoord dát een bestand draagt (`status: 'done'` met de DOCX als
base64); de kleine `in_progress`-antwoorden overleven het altijd. Het is **niet**
groottegebonden — het gebeurde bij 1,44 MB én bij 130 KB — en niet documentgebonden,
waardoor het lijkt te verspringen naar "het volgende document".

Alleen lokaal: productie heeft die proxy er niet tussen. Ga bij zo'n hang dus **eerst
kijken of de dev-server nog leeft** (`curl localhost:3000/login.html`) voordat je in de
applicatiecode zoekt. Start hem met een logbestand, anders is de stacktrace weg.

> **Wat hiervan wél van ons was.** De app wachtte er oneindig op. Geen enkele fetch had
> een tijdslimiet, en de grens van 90 seconden telde alleen de *slaaptijd* tussen de
> pogingen op — niet de aanroepen zelf — en werd bovenaan de lus getoetst. Bij het enige
> geval dat ertoe deed, een aanroep die blijft hangen, kón hij dus niet afgaan.
>
> Vandaar de regel: **een tijdsgrens is een wandklokgrens.** Hij telt alles mee, en de
> limiet van één aanroep is nooit langer dan wat er van het totaal over is. Staat in
> `src/conversie/wachtschema.js` met tests; de lus in `index.html` gebruikt die.
>
> Toets zo'n grens door hem te laten afgaan — een server die verbindt en nooit antwoordt.
> Anders weet je alleen dat de code compileert.

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

> **Die hook meldde tot 24 augustus 2026 niets.** Hij draaide de controle via
> `execFileSync` — dat geeft alleen stdout terug — en zocht naar `⚠` in de uitvoer.
> Alle bevindingen gingen via `console.warn` naar stderr, waar hij er niet bij kon.
> Hij voerde de controle dus keurig uit en gooide precies de uitkomst weg.
>
> `kennisbank-check.mjs` zet sindsdien ook een exitcode (1 bij bevindingen) en sluit
> af met een `UITKOMST:`-regel op stdout. Daarmee is hij ook in CI als poort te
> gebruiken. De hook leest beide stromen én die exitcode.

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

> **De eval haalt zijn eigen token op.** Staan `TEST_EMAIL` en `TEST_PASSWORD` in
> `.env`, dan logt hij bij elke run zelf in. Daarvóór hing hij aan een handmatige
> `TEST_JWT_TOKEN` die binnen een uur verloopt — op 24 augustus 2026 bleek die al
> vijf dagen dood, en de 401 die dat opleverde zag eruit als een promptregressie.
>
> **De baseline bestaat nu ook echt.** `tests/golden/laatste-run-*.json` staat in
> `.gitignore` en wordt élke run overschreven; er viel dus niets te vergelijken.
> `tests/golden/baseline/` gaat wél mee in git. Na afloop toont de eval wat erbij
> kwam en wat verdween, en schrijft dat naar `tests/golden/laatste-diff.txt`.
>
> Klopt de nieuwe uitkomst? Leg hem vast met `npm run eval:baseline` en neem de
> diff mee in het commitbericht. Dat is bewust een aparte opdracht: verschuift de
> norm, dan is dat een besluit dat in de diff staat — niet een bijproduct.
>
> De vergelijking is géén assertie. Titels komen van een taalmodel en variëren
> ("of" versus "/"), dus falen daarop zou een flakkerende test geven die je leert
> negeren. Ze worden vergeleken op woordoverlap; de harde controle blijft dat de
> verwachte issues gevonden zijn en de bekende valse positieven afwezig.
>
> **Lees die diff niet als bewijs dat een promptwijziging werkte.** Op 24 augustus
> 2026 gemeten met twee controleruns op identieke code: die verschilden 8 tot 10
> bevindingen per fixture, en het aantal issues schommelde met ±4. De verschillen
> mét de baseline vallen daar binnen. De diff deugt om een ráms op te merken —
> een gehalveerd aantal, een verdwenen ernstcategorie — niet om effect toe te
> schrijven.
>
> Wat wél meet: de harde assertions van de fixtures (die staan op sleutelwoorden
> en zijn dus ongevoelig voor herformulering), en een **gerichte telling op één
> signaal in meerdere runs**. "Komt art. 1:159 nog voor?" gaf 0 en 0; "staat de
> informatieplicht dubbel?" gaf 2 en 2. Wil je weten of een wijziging werkte,
> stel dan zo'n vraag en draai twee keer — niet één keer en dan de lijst lezen.

> **Raak witruimte en spelling niet zonder reden aan.** De gedeelde blokken worden
> byte-exact door Anthropic gecachet — elke wijziging kost eenmalig een volledige
> cache-miss op alle lopende analyses.

## Ontwerpbesluiten staan in de skill `analyse-ontwerpbesluiten`

Waaróm de analysepijplijn is zoals hij is, met de meting eronder en de voorwaarde
waaronder je een besluit mag terugdraaien. **Raadpleeg die skill voordat je iets aan de
structuur van de analyse verandert** — de meeste besluiten daar zijn tegenintuïtief en
worden anders met de beste bedoelingen teruggedraaid.

> Stond tot 5 september 2026 in `docs/ontwerpbesluiten.md`. Als skill biedt hij zichzelf
> aan zodra iemand aan de analysestructuur komt, in plaats van alleen gelezen te worden
> als deze regel wordt opgevolgd. **De skill is de bron**; de twee wetten hieronder staan
> hier alleen omdat ze in elke sessie van pas komen. Wijzigt er iets aan de meting, dan
> gaat dat in de skill en pas daarna hier.

De twee verbanden waar alles uit volgt, allebei gemeten:

- **Tijd is uitvoer.** `duur ≈ 6,3 s + 16,6 ms per uitvoertoken` (n=53, R² 0,94).
  Correlatie met de invoergrootte is negatief. Meer context kost geld, geen tijd.
- **Kosten zijn invoer.** Van een gemeten analyse van $0,97 was 71% invoer.

Die twee wijzen naar verschillende plekken, dus een maatregel die het ene verbetert maakt
het andere meestal slechter. En bovenal: **toets bij elke voorgestelde herstructurering
eerst of het geen promptprobleem is.** Vijf keer in twee dagen leek iets architectuur en
was het een instructie of een instelling.

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
| `api/claude-edge.js` | `concept-generatie`, `clausula-assistent` |
| `api/adobe-result.js` | `concept-generatie` |
| `api/ai-assistent.js` | `clausula-assistent` |
| `src/naam-anonimiseer.js`, `src/avg/` | `avg-beleid` |
| `api/_prompts/`, `src/api/prompt-cache.js`, `src/tijdsbudget.js` | `analyse-ontwerpbesluiten` |
| `index.html` — analyse-flow | `screening-categorien`, `document-model` |
| `index.html` — concept-flow | `concept-generatie` |
| `index.html` — assistent-flow | `clausula-assistent` |

> **Twee van deze regels wezen tot 5 september 2026 nergens naar.** `api/genereer-concept.js`
> en `api/export-docx.js` bestaan niet (en hebben, voor zover de geschiedenis reikt, nooit
> bestaan): de conceptgeneratie loopt via `index.html` met `api/claude-edge.js` als
> doorgeefluik, en de DOCX-kant via `index.html` (JSZip, in de browser) met
> `fixDocxArtifacts` in `api/adobe-result.js`. Twee van de zeven regels konden dus nooit
> afgaan, en dat was nergens aan te zien — de tabel die het bijwerken moet afdwingen was
> zelf niet bijgewerkt.
>
> `tests/unit/skill-tabel.test.js` bewaakt dit nu: elk pad in deze tabel moet bestaan, en
> elke genoemde skill moet een `SKILL.md` hebben. Verplaats of hernoem je een bestand
> hierboven, dan gaat die test rood in plaats van dat de regel stil verdampt.

Update de skill alleen als de wijziging **non-obvieuze** kennis toevoegt of verandert
(veldnamen, algoritmen, valkuilen, designbeslissingen). Triviale fixes hoeven niet.

Als code en skill **afwijken**: meld dit altijd expliciet aan de gebruiker.

De PostToolUse hook in `.claude/settings.json` geeft een automatisch signaal bij edits
op de API-bestanden — reageer daarop door de skill te beoordelen.
