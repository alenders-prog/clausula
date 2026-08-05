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
