---
name: clausula-assistent
description: Architectuur, API-routing, separators, kennisbank-injectie, issue-flow en verificatie-persistentie voor de Clausula Assistent (actie-balk commandomodel). Gebruik bij het aanpassen van _assistVerstuur, _assistGenClausuleUitvoeren, _assistCmdMail, diepteAnalyse, _assistVoegToeAlsIssue, of api/ai-assistent.js.
---

# Clausula Assistent — architectuur & valkuilen

## Commandomodel: actie-balk altijd zichtbaar

De assistent werkt zonder pre-flight vragen. De mediator configureert instellingen één keer in het instellingen-panel; daarna roept de actie-balk direct de juiste functie aan.

| Knop | Functie | API-pad |
|---|---|---|
| 📝 Clausule | `_assistCmdClausule()` → `_assistGenClausuleUitvoeren()` | rawModus |
| 💡 Opties | `_assistCmdOpties()` | zoekloop |
| ✉️ Mail | `_assistCmdMail()` → `_assistGenConceptMail()` | rawModus |
| 📋 Samenvatting | `_assistCmdSamenvatting()` → `_assistGenInhoudelsTekst()` | rawModus |
| Vrije chat | `_assistVerstuur()` | zoekloop |

Instellingen worden opgeslagen in `localStorage` onder sleutel `assist_cmd_defaults` via `_assistGetDefaults()` / `_assistSlaInstellingenOp()`:

```js
{ referentie, varianten, schrijfstijl_mail, documentstijl }
```

---

## API-routing: twee paden

### Pad 1 — Zoekloop (`/api/ai-assistent`, `rawModus=false`)

Gebruikt voor: vrije chat, opties, vervolgacties.

- Claude beschikt over `zoek_juridisch` en `zoek_web` tools (max 5 iteraties)
- Systeem-prompt instrueert: "Zoek via zoek_juridisch vóór het antwoord"
- Output via `assistent_antwoord` tool (gestructureerd JSON): intent · antwoord · bronnen · aannames · signalen · onbekenden · vervolgacties · opties · clausule
- Model: `claude-sonnet-4-6`

### Pad 2 — rawModus (`/api/ai-assistent`, `rawModus=true`)

Gebruikt voor: clausule-generatie, mail, klanttekst, herschrijven.

- **Geen zoekloop** — directe Claude-call
- **Kennisbank pre-injectie** (zie hieronder) vóór de Claude-aanroep
- Output: vrije tekst met separators
- Model: `claude-sonnet-4-6`, max 4000 tokens

> **Valkuil**: als je `rawModus=true` aanpast, heeft dit GEEN invloed op de zoekloop of `assistent_antwoord` tool. Dit zijn volstrekt afzonderlijke code-paden in `api/ai-assistent.js`.

---

## Tijdsbudget — de functie moet altijd zélf antwoorden

`vercel.json` geeft `api/ai-assistent.js` 60 seconden; het Hobby-plan staat niet meer
toe. De zoekloop kan tot vijf Claude-aanroepen doen plus web-zoekopdrachten, en daarna
komt de gestructureerde call er nog overheen. Op 23 augustus 2026 liepen daardoor drie
van de vier aanroepen in een kwartier in `Vercel Runtime Timeout Error: Task timed out
after 60 seconds`.

Dat is niet alleen traag maar onzichtbaar: bij een time-out stuurt Vercel een **platte
foutpagina** terug, geen JSON. De client deed `await resp.json()` en toonde de gebruiker
`Unexpected token 'A', "An error o"... is not valid JSON` — de binnenkant van de parser
in plaats van de reden.

**Twee maatregelen, allebei nodig:**

1. **Server** — `FUNCTIE_BUDGET_MS` (55s) en `AFRONDING_MS` (25s) in `api/ai-assistent.js`.
   De zoekloop stopt zodra er nog maar 25 seconden over zijn; elke `callClaude` krijgt een
   absolute deadline mee en breekt af via `AbortSignal.timeout`. Liever een antwoord met
   minder bronnen dan een afgekapte functie. De rondetijden gaan naar `console.log` — zonder
   die meting is niet te zien of de tijd in Claude of in de zoekopdracht zit.
2. **Client** — `leesAntwoord()` uit `src/api-antwoord.js`, gebruikt door alle
   acht aanroepen (5× `index.html`, 2× `assistent-mobiel.html`, 1× `assistent-core.js`).
   Leest via `resp.text()` en vertaalt platform- en applicatiefouten naar één begrijpelijke
   zin. **Nooit `resp.json()` rechtstreeks op deze endpoint.**

> Verhogen van `maxDuration` is geen uitweg: 60s is het maximum op het Hobby-plan.

---

## Waar de tijd heen gaat (gemeten 23 augustus 2026)

Op de vraag *"getrouwd, gezamenlijke koopwoning, gaan scheiden, woning komt nog in de
verkoop, heeft de vertrekkende partij nog zeggenschap"* — geen zware vraag:

| | vóór | na |
|---|---|---|
| zoekloop | 39,3s | ~20s (3 rondes) |
| gestructureerd antwoord | 61,0s | ~28s |
| **totaal** | **100,3s** | **~53s** |
| uitvoer-tokens | 2.822 | ~1.400 |
| eerste letter zichtbaar | pas aan het eind | ~30s |

**Het is geen denktijd, het is typewerk.** Sonnet produceert hier ~46 tokens per seconde;
2.822 tokens ís een minuut. Wie de assistent sneller wil maken moet dus kijken naar wat
er geproduceerd wordt, niet naar hoe "moeilijk" de vraag is.

Drie oorzaken, alle drie aangepakt:

1. **De zoekloop schreef een volledig antwoord dat werd weggegooid.** Hij kreeg dezelfde
   12.000 tekens `SYSTEEM` mee als de antwoordfase, las daar "antwoord altijd eerst
   inhoudelijk", en deed dat — 1.500 tokens die de loop bij `stop_reason≠tool_use` liet
   vallen. 34,6 seconden voor niets. Nu draait de loop op `ZOEK_SYSTEEM` met
   `max_tokens: 400`.
2. **`clausule` en `mailconcept` zijn uit `ASSISTENT_TOOL` verwijderd.** Bij intent=casus
   schreef het model een clausule van 4.350 tekens mee. Geen enkele client las die velden
   ooit — nul verwijzingen in `index.html`, `assistent-core.js`, `assistent-mobiel.html`.
   Een echte clausule komt via `rawModus=true`, als vrije tekst in `antwoord`.
3. **Het antwoord streamt.** Zie hieronder.

> **Nog open**: `MAX_ZOEK` staat op 5 en de loop gebruikte in de metingen zijn hele
> allowance. Elke ronde kost ~5 seconden en is puur wachttijd vóór de eerste letter.
> Verlagen naar 2–3 scheelt 10–15 seconden, maar levert minder bronnen op. Dat is een
> kwaliteitsafweging, geen technische.
>
---

## Kennisbank-zoekopdracht — semantisch, met terugval

Beide plekken die `legal_chunks` raadplegen (de tool `zoek_juridisch` en de
kennisbank-pre-injectie voor rawModus) gaan sinds 23 augustus 2026 via
`zoekChunks()` uit `src/kennisbank/zoek.js`.

**Wat er stond**: `ilike('content', '%' + woorden[0] + '%')` — alléén het eerste woord
van de zoekopdracht, zonder sortering. De pre-injectie was nog grover: één trefwoord
van vijf letters of langer dat niet in een stopwoordenlijst stond.

**Gemeten over twaalf realistische vragen** (94 chunks), relevante chunks in de top 5:

| methode | score | vragen zonder enige treffer |
|---|---|---|
| eerste woord (oud) | 11 | **6 van 12** |
| alle woorden + relevantiescore | 22 | 1 van 12 |
| **semantisch (voyage-law-2)** | **34** | **0 van 12** |

**Waarom beter woordzoeken niet volstaat**: op "heeft de vertrekkende partij nog
zeggenschap over de woning" hoort art. 3:170 BW het antwoord te zijn, maar het woord
"zeggenschap" staat niet in die chunk. Woordzoeken gaf vier procedurele artikelen
(art. 815 Rv, 826 Rv) omdat "echtscheiding" toevallig in hún titel staat.

> **De terugval is bedoeld, niet tijdelijk.** Zonder `VOYAGE_API_KEY`, of zolang
> `supabase/kennisbank-semantisch.sql` niet gedraaid is, zakt `zoekChunks()` terug op
> alle-woorden-met-score. Dat is nog altijd twee keer zo goed als de oude situatie.
> `methode` in het resultaat zegt welke route gelopen is, en dat staat ook in de logs:
> `[kennisbank] "…" → N chunks (semantisch|woorden)`.

> **Bij nul treffers zegt de tool nu waaróm.** Semantisch zoeken dat niets vindt
> betekent dat het onderwerp echt niet in de kennisbank staat — herformuleren helpt
> dan niet. Zonder die toevoeging bleef het model varianten proberen, en dat kostte
> zoekrondes van vijf seconden.

> **Na elke wijziging aan `legal_chunks`: `node scripts/kennisbank-embed.mjs`.**
> Een chunk met gewijzigde tekst maar oude embedding wordt gevonden op zijn oude
> inhoud. Zie CLAUDE.md.

**Dit geldt niet voor `api/analyseer.js`.** Die selecteert niet, maar stuurt vrijwel
alles mee: `topic_tags` tegen `situatie_kenmerken`, gerangschikt op tag-overlap, tot
`MAX_WETTEKSTEN = 80` — in de praktijk ~67 van de 94 chunks. Waar je bijna alles
meestuurt, doet de rangschikking er weinig toe. Twee kanttekeningen staan in het
technisch document §9: acht chunks dragen geen enkele tag die in `situatie_kenmerken`
voorkomt en bereiken de analyse dus nooit, en zodra de kennisbank boven de 80 groeit
gaat die rangschikking wél kiezen.

---

## Streamen (`stream: true`)

Het adviespad kan het antwoord zin voor zin doorgeven. Alleen daar: `rawModus` levert
vrije tekst zonder tool-schema en heeft geen veld om te volgen.

**De client vraagt erom** met `stream: true` in de body, en controleert het antwoord op
`content-type: text/event-stream`. Staat dat er niet, dan valt hij terug op
`leesAntwoord()` — zo blijft een oudere of terugvallende server werken.

**De server** stuurt vier soorten berichten:

| bericht | betekenis |
|---|---|
| `{type:'fase', tekst}` | voortgang; vervangt het label in de denkbubbel |
| `{type:'delta', tekst}` | een stuk van het `antwoord`-veld |
| `{type:'klaar', data}` | het volledige, gevalideerde object |
| `{type:'fout', melding}` | de server gaf het op |

**Hoe de deltas ontstaan**: het antwoord komt terug als tool-aanroep, dus als één
JSON-object dat Anthropic in stukjes levert (`input_json_delta`). Halverwege is dat geen
geldige JSON. `src/assistent/deelbare-json.js` leest er tóch het veld `antwoord` uit —
het staat op plaats twee in het schema, dus het komt vroeg langs. Wat nog niet binnen is
(een halve escape, een afgebroken `\u`-reeks) wordt overgeslagen tot het volgende stuk.

> **Valkuil bij het renderen**: herstel pseudoniemen over de héle tekst tot nu toe, niet
> per stukje. Een pseudoniem kan over twee deltas verdeeld binnenkomen.

> **Valkuil bij het aanpassen**: zodra de SSE-headers eruit zijn kan er geen
> `res.status(500).json()` meer volgen. Gebruik `meldFout()` — die kiest zelf tussen een
> SSE-foutbericht en een JSON-respons.

> **De stroom-bubbel is een voorvertoning.** Zodra `klaar` binnen is verdwijnt hij en
> bouwt `_assistVoegAssistBerichtToe` (desktop) of `voegAssistentBericht` (mobiel) het
> echte bericht op, met bronnen, signalen en vervolgacties. Er blijft dus één plek waar
> een assistent-bericht gerenderd wordt.

> **Zoeken mag mislukken, antwoorden niet.** Een zoekronde die in zijn deadline loopt
> `break`t de loop; hij mag het verzoek niet slopen. Op 23 augustus 2026 deed hij dat wél:
> ronde 5 begon met nog 5 seconden op de klok en de afgekapte call gooide een fout die
> tot de buitenste `catch` doorliep. Vandaar `RONDE_MS` — er moet ruimte zijn voor een
> hele ronde plus de afronding voordat er een nieuwe begint.

---

## Kennisbank-injectie (rawModus)

Vóór elke rawModus-aanroep zoekt de server zelf in `legal_chunks`:

```js
// api/ai-assistent.js — in de rawModus-branch
const trefwoord = vraag.trim().toLowerCase()
  .replace(/[^\w\s]/g, ' ')
  .split(/\s+/)
  .find(w => w.length >= 5 && !stopw.has(w)) || '';

const { data: chunks } = await supabase
  .from('legal_chunks')
  .select('citation,content')
  .ilike('content', `%${trefwoord}%`)
  .limit(5);
```

De gevonden chunks worden als `[JURIDISCHE KENNISBANK]`-blok geïnjecteerd in de user-message, vóór de Claude-aanroep. Claude wordt geïnstrueerd alleen wetsartikelen te noemen die daadwerkelijk in dit blok staan.

**Waarom client-side niet**: de `supabase`-client wordt server-side aangemaakt; de browser stuurt enkel de vraag.

**Valkuil — stopwoorden**: de stopwoordenlijst bevat generieke assistent-woorden (`clausule`, `artikel`, `partijen`, `convenant`, `stijl`…). Als een relevant juridisch trefwoord hierin terechtkomt, wordt het overgeslagen en vindt er géén kennisbank-lookup plaats. Houd de lijst smal.

### Extra verificatie — dossiercontext

`diepteAnalyse()` injecteert vóór de issue-velden dezelfde dossiercontext als de reguliere assistent-antwoorden:

```js
if (_assist.dossierContext) {
  _prefixBlokken.push(`[DOSSIERCONTEXT]\n${_assist.dossierContext}\n[/DOSSIERCONTEXT]`);
}
// + [BEKENDE GEGEVENS] via _assistGetResolvedFields()
```

> **Valkuil**: zonder deze context beoordeelt de verificatie het issue geïsoleerd — zonder kennis van hv-stelsel, eigendomssituatie, etc. — en kan daardoor onjuiste conclusies trekken.

### Namen herstellen bij weergave — élk renderpad

Claude krijgt pseudoniemen en geeft ze terug. De client vertaalt ze bij weergave
terug: `_assistHerstelNamen()` in `index.html`, `_mobHerstelNamen()` in
`assistent-mobiel.html` (die laatste vult `mobNaarEcht` via `_ontsleutelNamen`,
dezelfde `/api/naam-decrypt`-stap als `laadScreening`).

> **Valkuil**: dit moet op **ieder** veld dat tekst van Claude toont — antwoord,
> aannames, signalen, onbekenden, optiekaartjes én de optie-keuzechips. Sla er één
> over en je krijgt één antwoord waarin de bovenste helft de echte namen toont en
> de kaartjes eronder "Thomas en Lisette". Precies dat gebeurde tot 10 augustus 2026
> met `opties`. Voeg je een nieuw veld toe aan het antwoordschema, voeg dan meteen
> de herstelaanroep toe.

> **AVG-valkuil bij nieuwe velden**: alles wat je aan `serverFields` (in `api/ai-assistent.js`)
> of aan `bouwDossierContext` toevoegt gaat rechtstreeks naar Anthropic. Datums worden
> daarom gegeneraliseerd meegestuurd — jaar in plaats van datum, leeftijd in plaats van
> geboortedatum — met nationaliteit als bewuste uitzondering. Zie de skill `avg-beleid`
> vóór je een veld toevoegt; de sleutelnamen blijven `…datum` omdat de onbekenden-filter
> daarop matcht, alleen waarde en `VELD_LABEL` zijn gegeneraliseerd.

### Extra verificatie — kennisbank-injectie (client-side)

`diepteAnalyse()` in `index.html` doet een eigen lookup vóór de `/api/claude-edge`-aanroep:

```js
// Client-side, vóór fetch naar /api/claude-edge
const eersteWoord = (issue.onderwerp || '').trim().split(/\s+/)[0] || '';
const dimTags = (issue.dimensies || []).flatMap(d => tagMap[d] || []);
let q = db.from('legal_chunks').select('citation,content').limit(5);
if (eersteWoord) q = q.ilike('content', `%${eersteWoord}%`);
if (dimTags.length) q = q.overlaps('topic_tags', dimTags);
```

Model: `claude-fable-5`, max 16 000 tokens.

---

## Tekst-separators

### `---TOELICHTING---`

Scheidt de clausuletekst van de toelichting voor de mediator.

```
[clausuletekst]

---TOELICHTING---

**Minimale vereisten**
...
**Valkuilen**
...
**Toekomstige discussiepunten**
...
*Dit is een aanbeveling — eindverantwoordelijkheid ligt bij de mediator of advocaat.*
```

Gebruik: `volledigeTekst.split('\n---TOELICHTING---')[0]` om alleen de clausuletekst te krijgen (bijv. voor `passage`-veld).

### `---VOORSTEL---`

Scheidt de verificatie-analyse van het gestructureerde voorstel.

```
[vrije analyse-tekst]

---VOORSTEL---
{"ernst":"hoog","bevinding":"...","aanbeveling":"..."}
```

Parser in `diepteAnalyse`:
```js
const _voorstelIdx = _raw.indexOf('\n---VOORSTEL---\n');
const _analyse = _raw.slice(0, _voorstelIdx).trim();
const _voorstel = JSON.parse(_raw.slice(_voorstelIdx + 16).trim());
```

> **Valkuil**: de offset is 16 (`'\n---VOORSTEL---\n'.length`). Als de separator ooit verandert, breekt de parser.

---

## Issue-flow: `_assistVoegToeAlsIssue(bufId, docType)`

### Duplicaat-guard

```js
if (_assistAddedBufIds.has(bufId)) return;
_assistAddedBufIds.add(bufId);
```

`_assistAddedBufIds` is een module-level `Set`. Voorkomt dat snel dubbelklikken twee identieke issues aanmaakt. De Set leeft in het geheugen — na pagina-ververs kan dezelfde bufId opnieuw worden ingediend.

### `passage`-veld

```js
passage: clausuleTekst
  .replace(/^#{1,4}\s+.+\n?/m, '')   // heading weghalen
  .replace(/\*\*(.+?)\*\*/g, '$1')    // bold weghalen
  .trim()
  .slice(0, 600),
```

`clausuleTekst` = `volledigeTekst.split('\n---TOELICHTING---')[0].trim()` — de clausule zónder toelichting.

### Live refresh issuelijst

```js
if (typeof _activeerAnalysePanelFn === 'function') _activeerAnalysePanelFn(app.rapport);
```

`_activeerAnalysePanelFn` is een closure-referentie die wordt gezet op regel ~5894. Geeft een volledige hertekening van het analyse-panel zonder pagina-reload. Gebruik dit; `renderIssues` bestaat niet.

---

## Extra verificatie: persistentie en pre-filling

### Opslaan na streaming

```js
issue.diepteResultaat = _raw;          // volledig (incl. ---VOORSTEL--- JSON)
issue.diepteVoorstel  = _voorstel;     // parsed JSON object
autoSlaOp();
```

`_raw` bevat de volledige SSE-output inclusief het `---VOORSTEL---`-blok. Dit is bewust: de splitsing op het scheidingsteken gebeurt bij het renderen, niet bij opslaan.

### Knop-staat op issue-kaart

```js
issue.diepteResultaat ? '👁 Bekijk extra verificatie' : '⟳ Extra verificatie'
```

De kaart wordt hertekend door `_activeerAnalysePanelFn` na toepassen van wijzigingen.

### Cached-resultaat pad

```js
// Toon alleen analyse (niet de JSON)
const _cachedAnalyse = issue.diepteResultaat.split('\n---VOORSTEL---\n')[0].trim();
body.innerHTML = cachedBar + _diepteMarkdown(_cachedAnalyse) + _aanpasHtml;
_pasVoorstelToe(issue.diepteVoorstel || null);
```

### `_pasVoorstelToe(v)`

Pre-vult de drie form-velden en toont de badge:

```js
function _pasVoorstelToe(v) {
  if (!v) return;
  document.getElementById('daErnst')?.value = v.ernst        ?? '';
  document.getElementById('daBevinding')?.value = v.bevinding   ?? '';
  document.getElementById('daAanbeveling')?.value = v.aanbeveling ?? '';
  document.getElementById('daVoorstelBadge')?.style.removeProperty('display');
}
```

### `_aanpasHtml` — locatie

`_aanpasHtml` wordt vóór de vroege-return (cached-path) gebouwd — één keer, herbruikbaar voor zowel het cached-path als het live-streamingpad. Verplaats het nooit náár de try-block.

### Sticky apply-knop

`.da-toepassen-footer` heeft `position:sticky; bottom:0` — blijft altijd onderin de scrollbare modal-body zichtbaar.

---

## Wetten URL-formaat (bronnen-links)

Juriconnect persistent URL voor directe artikellinks:

```js
`https://wetten.overheid.nl/jci1.3:c:${BWBR}&artikel=${artikelNr}`
```

BWBR-nummers:

| Wet | BWBR |
|---|---|
| BW Boek 1 | BWBR0002656 |
| BW Boek 2 | BWBR0003045 |
| BW Boek 3 | BWBR0005291 |
| BW Boek 4 | BWBR0002761 |
| BW Boek 5 | BWBR0005288 |
| BW Boek 6 | BWBR0005289 |
| BW Boek 7 | BWBR0005290 |
| BW Boek 8 | BWBR0005294 |
| Rv | BWBR0001827 |
| Leegstandwet | BWBR0003403 |

Fallback (onbekend artikel): `https://wetten.overheid.nl/zoeken?q=${encodeURIComponent(citation)}`

Functie: `_wetUrl(citation)` in `index.html` (~regel 12787).

---

## Optie-pad: `pendingOptieContext`

Wanneer de mediator een optie uitwerkt tot een clausule:

```js
_assist.pendingOptieContext = { index, titel, kern, afwegingen };
_assist.pendingClausule = { btn: null, docType, varianten: 'enkelvoudig', referentie: null };
_assistVoegKeuzeVraagToe(true); // alleenReferentie=true — slechts één vraag
```

`alleenReferentie=true` toont alleen de partijverwijzingsvraag, niet de varianten-vraag. Het is de enige pre-flight interruptie die nog overblijft in het commandomodel.

---

## Art. 1:88 BW — bekende valkuil

Claude citeert art. 1:88 BW uit trainingsdata als algemene regel ("toestemming vereist voor ingebruikgeving woning") zonder de toepassingsvoorwaarden te toetsen. De bewoning-conditie (lid 1 sub a) wordt daardoor makkelijk overgeslagen.

**Kritieke correctie** (geverifieerd tegen wettekst): de formulering "bewoont of kortgeleden heeft bewoond" staat NIET in de wettekst. De wettekst gebruikt uitsluitend "bewoonde woning" (tegenwoordige tijd). Er bestaat geen wettelijke "kortgeleden"-termijn — die parafrase is een fabricatie.

Gedocumenteerde nuances staan in de `DOMEINKENNIS`-sectie van de systeem-prompt in `api/ai-assistent.js`:
- Wettekst: "bewoonde woning" (tegenwoordige tijd) — geen "kortgeleden heeft bewoond" in de wet
- Rechtspraak legt het begrip beschermingsgericht uit: vertrek tijdens scheiding ≠ definitieve beëindiging bewoning
- Grijs gebied bij echtgenoot die feitelijk is vertrokken maar nog geen definitieve woning heeft
- Veiligste praktijkadvies: schriftelijke instemming eisen tot inschrijving echtscheidingsbeschikking
- Art. 1:88 vervalt ná inschrijving echtscheidingsbeschikking
- Voor periode ná ontbinding maar vóór levering: contractuele grondslag, NIET art. 1:88 BW
- Art. 3:264 BW (hypotheekbeding): staat los van art. 1:88 — hypotheekakte verbiedt ingebruikgeving zonder banktoestemming
- Ingebruikgeving aan derde: bruikleen (om niet) vs. huur (tegenprestatie) — tegenprestatie in natura kan al huur zijn

> **Wanneer kennisbank-lookup onbetrouwbaar is**: als Claude het antwoord al "kent" (bekende regel), slaat het `zoek_juridisch` soms over. Juiste nuances staan daarom in de systeem-prompt als DOMEINKENNIS, niet alleen in de kennisbank.

### Citaatmarkering (WETSCITATEN-sectie)

Toegevoegd in `SYSTEEM` (api/ai-assistent.js) en `systeemPrompt` (diepteAnalyse, index.html):

- Als een artikel in de `[JURIDISCHE KENNISBANK]` staat → letterlijk citaat toegestaan, duidelijk attribueren
- Als het er niet in staat → strekking beschrijven, NOOIT als letterlijk citaat; achter de verwijzing: "(trainingskennis — verifieer bij twijfel)"
- Doel: voorkomen dat Claude een parafrase uit trainingsdata als wettekst presenteert

Voorbeeld van correct gedrag na deze rule:
> "Strekking van art. 1:88 lid 1 sub a BW: een echtgenoot heeft toestemming nodig voor ingebruikgeving van de bewoonde woning. (trainingskennis — verifieer bij twijfel)"

Voorbeeld van correct gedrag als kennisbank het artikel bevat:
> "Art. 1:88 lid 1 sub a BW bepaalt: '[letterlijke tekst uit kennisbank]'."

## Kennisbank — waarom externe chunks essentieel zijn

### Het probleem met Claude's eigen trainingsdata voor wetsartikelen

Claude bevat in zijn trainingsdata een grote hoeveelheid Nederlandse juridische teksten: wetsartikelen, handboeken, jurisprudentie-samenvattingen, vakartikelen, commentaren en syllabi. Dit klinkt als een voordeel, maar levert een fundamenteel probleem op: Claude kan niet betrouwbaar onderscheiden welke zinsnede letterlijke wettekst is en welke een parafrase, samenvatting of uitleg van een handboek.

**Praktisch gevolg**: wanneer Claude een wetsartikel noemt dat het "kent" uit zijn trainingsdata, kan de geproduceerde tekst een mix zijn van:
- de literale wettekst (correct),
- formuleringen uit juridische commentaren (parafrase, niet letterlijk),
- vereenvoudigde samenvattingen uit syllabi (soms feitelijk afwijkend),
- formuleringen die in meerdere contexten voorkomen en door het model zijn geblend.

Claude presenteert dit als één coherent citaat — zonder te beseffen dat het fabriceert.

### Het kortgeleden-voorbeeld (concrete illustratie)

Bij het analyseren van een convenant produceerde de assistent de volgende formulering voor art. 1:88 BW:

> "Art. 1:88 lid 1 sub a BW bepaalt dat een echtgenoot toestemming nodig heeft voor ingebruikgeving van een woning die de andere echtgenoot **bewoont of kortgeleden heeft bewoond**."

Dit klinkt precies als een wettekst — maar de zinsnede "of kortgeleden heeft bewoond" bestaat **niet** in de wettekst. De werkelijke tekst gebruikt uitsluitend "bewoonde woning" (tegenwoordige tijd). Er bestaat geen wettelijke termijn voor "kortgeleden".

**Herkomst van de fabricatie**: juridische handboeken en vakartikelen over art. 1:88 BW gebruiken soms de omschrijving "woont of kortgeleden heeft gewoond" als pragmatische vuistregel voor hoe rechters de toets in de praktijk aanleggen. Deze omschrijving is geen wettekst maar jurisprudentie-duiding. Claude heeft deze formulering meerdere keren in zijn trainingsdata gezien — naast de echte wettekst — en kon ze niet meer van elkaar onderscheiden. Het resultaat is dat de parafrase als citaat wordt gepresenteerd.

**De juridische impact**: als iemand op basis van deze output concludeert dat de echtgenoot die 3 maanden geleden vertrok "kortgeleden heeft bewoond" en dus toestemming moet geven, terwijl de feitelijke situatie als "bewoning beëindigd" wordt gekwalificeerd, mist de partij een wezenlijk beschermingsmechanisme. De fout zit niet in de conclusie (soms is de conclusie toevallig correct), maar in de grondslag: een gefabriceerde wettekst kan nooit de grondslag zijn voor een juridisch advies.

### Waarom `zoek_juridisch` (de zoekloop) dit niet volledig oplost

De assistent beschikt over een `zoek_juridisch`-tool waarmee Claude zelf de `legal_chunks`-database kan doorzoeken. Dit helpt — maar heeft beperkingen:

1. **Claude zoekt pas als het twijfelt.** Voor "bekende" artikelen (1:88, 1:94, 1:157) is Claude zelfverzekerd en slaat de zoekstap soms over. Juist voor de meest voorkomende artikelen — waar het risico op geïnternaliseerde parafrasen het grootst is — activeert de zoekloop het minst betrouwbaar.

2. **De zoekloop is asynchroon en niet gegarandeerd.** In rawModus (clausule-generatie, mail) is er helemaal geen zoekloop. In de vrije chat is het max 5 iteraties; de tool kan worden overgeslagen als Claude het antwoord "al weet".

3. **Trainingsdata overschrijft gevonden chunks.** Als de zoekloop een chunk teruggeeft die afwijkt van wat het model "verwacht", bestaat het risico dat het model de chunk herinterpreteert vanuit de trainingsdata-parafrase.

### Waarom de kennisbank + WETSCITATEN-aanpak betrouwbaarder is

De drielaagse aanpak in dit project pakt het probleem structureel aan:

**Laag 1 — Autoritatieve bronnen in de kennisbank.** De chunks in `legal_chunks` bevatten geverifieerde letterlijke wetteksten (wetten.overheid.nl). Claude krijgt deze tekst aangeleverd als context, zonder dat het zelf hoeft te "herinneren" wat er staat. De tekst wordt geïnjecteerd vóór de Claude-aanroep, dus het model verwerkt hem als input, niet als herinnering.

**Laag 2 — WETSCITATEN-instructie in de systeem-prompt.** De instructie legt aan Claude uit dat het alleen letterlijk mag citeren uit de kennisbank. Als een artikel er niet in staat, mag het de strekking beschrijven maar niet citeren. Dit vermindert de kans dat het model fabriceert ook wanneer de chunk er wel in staat.

**Laag 3 — Expliciete bronmarkering.** Bronnen buiten de kennisbank krijgen het label "(trainingskennis — verifieer bij twijfel)" zodat de mediator weet dat verificatie nodig is.

**Kernprincipe**: de betrouwbaarheid wordt niet bepaald door hoeveel juridische kennis het model heeft, maar door hoe gedisciplineerd het onderscheid maakt tussen wat het *weet* (onzeker) en wat het *heeft gelezen* (de chunk). Externe chunks maken dat onderscheid expliciet; trainingsdata maakt het onmogelijk.

### Wanneer de kennisbank ontoereikend is

De chunks dekken niet alle artikelen. Voor artikelen die er niet in staan geldt WETSCITATEN-regel 2: strekking beschrijven + "(trainingskennis — verifieer bij twijfel)". Uitbreiding van de kennisbank (zie `supabase/legal_chunks_wettekst.sql`) is de structurele oplossing voor een bredere dekking.

---

## Mail → Clausule overgang

Na het genereren van een mail verschijnt optioneel de knop "Clausule opstellen". Dit pad roept `_assistVoegKeuzeVraagToe(true)` aan — ook met `alleenReferentie=true`. De varianten-keuze is dan al vastgelegd via `_assist.lastVarianten`.
