# Wat een andere leverancier hier zou kosten en opleveren

Opgesteld 22 september 2026, naar het voorbeeld van de MfN-trainer. Daar leidde een
gemeten vergelijking op 11 september tot een overstap naar OpenAI voor de vraaggeneratie.
De methode staat daar in `MEETMETHODE.md`; het gereedschap in `lib/modellen.js`,
`lib/prijzen.js` en `scripts/vergelijk-modellen.js`.

> **Dit is een plan, geen besluit.** Per fase staat wat het kost en wat eruit moet komen
> voordat de volgende begint. Wat hier niet staat is een uitkomst — die hoort bij de
> uitvoering, niet bij het voorstel.

---

## Wat de trainer opleverde, en wat daarvan hier geldt

De vijf regels daar — gelijkschakelen, mechanisch tellen, blind laten lezen, prijzen
opzoeken, ruwe tellingen wegschrijven — zijn niet aan dat project gebonden. Het
gereedschap deels wel. De trainer noemt zelf drie dingen die je per project opnieuw moet
maken: de mechanische controle, de gelijkschakeling, en de prijstabel.

Voor Clausula geldt dat maar half — er staat hier al veel.

| Wat de trainer moest bouwen | Wat Clausula al heeft |
|---|---|
| prijstabel met vier tarieven | `src/api/kosten.js` — vier tarieven, bijgewerkt 29 aug 2026, mét "onbekend model" in plaats van een schatting |
| tokens en tijd per aanroep wegschrijven | `api_verbruik` — per aanroep tokens, cache, duur, kosten, fase, **in productie** |
| vaste opdrachten om mee te meten | `tests/golden/fixtures/` — vijf fixtures met harde assertions op sleutelwoorden |
| gerichte telling over meerdere runs | `scripts/meet-signalen.mjs` |
| weten hoeveel ruis er op één draai zit | **al gemeten**: twee identieke runs verschillen 8–10 bevindingen per fixture, issues ±4 |

Die laatste rij is de belangrijkste. De trainer moest achteraf ontdekken dat een ranglijst
tussen draaien niets waard is. Hier staat dat getal al in CLAUDE.md, en het is groot.

---

## Vier dingen die hier anders liggen dan bij de trainer

### 1. Tool-use maakt "dezelfde opdracht" een ontwerpvraag

`askClaude` in `api/analyseer.js:132` dwingt de uitvoer af met `tools` plus
`tool_choice: {type:'tool', name}` — een `input_schema` dat het model moet invullen. De
trainer gaf zijn deelnemers een JSON-instructie ín de prompt, en kon daardoor letterlijk
dezelfde tekst aan beide sturen.

Dat kan hier niet. `MEETMETHODE.md` benoemt precies dit geval en zegt: schrijf dan éérst
op wat "dezelfde opdracht" betekent, vóór je gaat meten. Dat is werk, geen formaliteit —
een afgedwongen tool met schema en een structuuroutput met json-schema zijn niet vanzelf
hetzelfde ding, en het verschil landt in de uitvoer die we gaan tellen.

**Dit is fase 0 en het blokkeert al het andere.**

### 2. Er is een derde as: waar de documenttekst blijft

`docs/architectuurbeoordeling.md` stelt vast dat Clausula van drie vergeleken partijen de
enige is die documenttekst naar de VS stuurt. LegalMike houdt alles in de EER via het
Europese OpenAI-endpoint en zegt juist daarom niet te hoeven anonimiseren.

Bij de trainer ging het over studiemateriaal en telde dit niet mee. Hier kan het de
uitslag dragen, ook als kosten en kwaliteit gelijk uitvallen. Neem datalocatie dus op als
volwaardige derde as, niet als voetnoot — en let op dat het ook de andere kant op kan
vallen: een tweede verwerker erbij zonder verwerkersovereenkomst is een verslechtering.
De openstaande overeenkomsten staan in `docs/avg-verwerkersovereenkomst.md`.

### 3. Het cache-beeld is hier omgekeerd, en dat is een toetsbare hypothese

De prompt-cache staat uit, en waarom staat gemeten in `src/api/prompt-cache.js`: 153.284
tokens aangelegd, **nul gelezen** — $0,115 premie per analyse voor voorraad die niemand
aanspreekt. De reden is structureel: elke fase heeft een eigen tooldefinitie, en die hoort
bij het cache-voorvoegsel, dus tussen fasen valt principieel niets te delen. Daar komt bij
dat de aanroepen gelijktijdig koud starten.

De trainer heeft gemeten dat OpenAI vanzelf cacht op een gedeelde prefix en voor het
schrijven niets extra rekent — vandaar dat `cacheSchrijf` daar gelijk is aan `vers`. Als
dat hier ook opgaat, raakt het precies de plek waar Clausula duur is: **71% van een
gemeten analyse van $0,97 was invoer** (CLAUDE.md, de tweede wet).

Dat is geen argument om over te stappen. Het is de scherpste vraag die deze vergelijking
kan beantwoorden, en hij is met één draai te beantwoorden: *hoeveel invoertokens komen bij
de uitdager uit de cache, bij exact dezelfde vier aanroepen?* Nul zou betekenen dat
dezelfde structurele reden geldt en het voordeel wegvalt.

### 4. Vier aanroepplekken, dus vier losse besluiten

| plek | model nu | heeft fixtures? |
|---|---|---|
| `api/analyseer.js` — structuur, bevindingen, cross-doc | `claude-sonnet-4-6` | ja |
| `api/analyseer.js` — consolidatie | `claude-haiku-4-5` | indirect |
| `api/claude-edge.js` — concept, vraag-antwoord | streaming | nee |
| `api/ai-assistent.js` — assistent | `claude-sonnet-4-6` | nee |

De trainer eindigde met **twee leveranciers naast elkaar**: OpenAI schrijft de vragen,
Anthropic doet het gesprek. Zijn CLAUDE.md zegt erbij dat dit drie losse keuzes zijn en
geen inconsistentie, en dat je ze niet gelijk moet trekken zonder te meten.

Neem dat hier over. Alleen `analyseer.js` heeft fixtures en draagt het leeuwendeel van de
kosten; dat is de enige plek waar nu iets te meten valt.

---

## Het plan

### Fase 0 — beslissen vóór er één aanroep gedaan wordt

Kost niets aan API's. Levert drie stukken tekst op.

1. **Wat is "dezelfde opdracht"?** Leg naast elkaar wat een afgedwongen Anthropic-tool en
   de structuuroutput van de uitdager van het model verlangen, en schrijf op welke
   vertaling we eerlijk vinden. Wordt het schema anders aangeboden, dan meten we dat mee
   en zeggen we dat erbij.
2. **Mag het?** Documenttekst naar een tweede leverancier is een nieuwe verwerker. Ga na
   wat er daadwerkelijk de deur uit gaat — de pseudonimisering in `src/naam-anonimiseer.js`
   draait al vóór verzending — en of een EU-endpoint beschikbaar is.
   **Stop/go:** is het antwoord nee, dan stopt het hier voor `analyseer.js`.
3. **Prijzen opzoeken, met de datum erbij.** Van beide leveranciers, van de prijspagina.
   Bij de trainer stonden drie tarieven verkeerd in de tabel waarop de keuze rustte —
   beide leveranciers fout, in tegengestelde richting. `src/api/kosten.js` gaat van één
   leverancier naar twee; een onbekend model blijft "onbekend" en wordt geen schatting.

### Fase 1 — de mechanische controle

Regel 2 staat of valt met een lijst van dingen die objectief fout zijn aan de uitvoer.
De trainer had daar `lib/vraagcontrole.js` voor, over maanden gegroeid. Hier bestaat dat
nog niet als één ding, maar de onderdelen liggen er:

- schema geldig — `tests/golden/schema.test.js`
- geen persoonsgegevens in de uitvoer — `tests/golden/pii.test.js`
- verwachte issues gevonden, bekende valse positieven afwezig — de fixtures
- **citaat komt niet letterlijk in het document voor** — `docs/centraliseren.md`, laatste
  sectie: het model parafraseert en stelt dan op zijn eigen parafrase een gebrek vast. Te
  zien zonder het document te lezen, en het rekenwerk bestaat al (`vindPositie`)
- dimensie buiten de vastgestelde lijst, ernst buiten bereik, dubbele bevinding over twee
  dimensies

Dit is het meeste werk van het hele plan, en het is ook zonder vergelijking waardevol:
het is dezelfde controle die een promptwijziging toetsbaar maakt. Bouw het daarom als
module in `src/` met unittests, niet als onderdeel van het meetharnas.

### Fase 2 — het harnas

Naar het model van `scripts/vergelijk-modellen.js` bij de trainer:

- Eén aanroepfunctie in `src/`, ongeacht van wie het model is, die
  `{tekst, ms, vers, cacheSchrijf, cacheLees, uit, afgekapt}` teruggeeft. Let op de
  functielimiet van twaalf: dit hoort in `src/`, en een tweede SDK in de bundel is reden
  genoeg om de uitdager met `fetch` aan te roepen in plaats van met zijn SDK — zo doet de
  trainer het, om precies die reden.
- Deelnemers als `leverancier:model@diepte`, zodat één model tegen zichzelf op een andere
  stand ook een deelnemer is. Bij de trainer bleek dát vaak de vraag die ertoe deed.
- Uitvoer: een JSON met per aanroep de ruwe tellingen, én een blind leesbestand met de
  varianten als A/B/C in wisselende volgorde en de sleutel onderaan.

### Fase 3 — meten, met de ruisvloer in acht

Begin bij `analyseer.js`, met de bestaande fixtures.

**Wat hier telt als bewijs**, gegeven dat twee identieke runs 8–10 bevindingen schelen:

- **Kosten.** Stabiel over draaien heen, en dus het enige dat je na één draai al mag
  opschrijven. Dit is ook de as waarop het verschil het grootst kan zijn.
- **Gepaard binnen één draai**: dezelfde fixtures, dezelfde documenten, alleen de
  leverancier anders.
- **Eén gericht signaal over meerdere runs**, in de trant van `meet-signalen.mjs`. "Vindt
  hij `wordtgekregen`?" — 3 van 3 tegen 0 van 3 is een uitspraak. Twee bevindingenlijsten
  naast elkaar leggen is dat niet.
- **Niet**: het aantal bevindingen, of welke lijst er beter uitziet.

Kosten van de meting zelf: `meet-signalen.mjs` noemt ongeveer $0,90 per run over de
meetfixture. Vier deelnemers × drie runs is dan ordegrootte tien dollar — de meting is
goedkoop, het bouwen eromheen is het werk.

### Fase 4 — besluiten, per plek, met de terugdraaivoorwaarde erbij

Wat eruit komt gaat als besluit naar de skill `analyse-ontwerpbesluiten`, in het formaat
dat daar geldt: het besluit, de meting eronder, en waaronder je het terugdraait. Een
besluit zonder meting is daar een vermoeden.

---

## Volgorde, en wat we niet doen

1. **Fase 0** eerst en helemaal. Zonder vastgelegde gelijkschakeling meet je je eigen
   vertaalwerk, en zonder het AVG-antwoord meet je iets wat misschien niet mag.
2. **Fase 1** daarna — nuttig ook als de vergelijking nooit doorgaat.
3. Fase 2 en 3 pas daarna, en alleen voor `analyseer.js`.
4. `claude-edge.js` en `ai-assistent.js` blijven erbuiten tot er voor die flows fixtures
   bestaan. Daar valt nu niets te meten, alleen iets te vinden.

**Wat we niet doen:** de prompts aanpassen om de uitdager beter te laten scoren. De
prompts hier zijn over tientallen rondes bijgeslepen op fouten van Claude, precies zoals
bij de trainer. Die voorsprong zit in de prompt, niet in het model — een uitdager die
gelijk eindigt doet het feitelijk beter, en dat hoort in de uitslag te staan in plaats van
weggepoetst te worden. Repareer alleen wat bij **beide** leveranciers misgaat; een defect
bij één is een modeleigenaardigheid, en die in de prompt dichttimmeren bakt precies de
scheefheid in waar deze methode tegen bedoeld is.

---

# Fase 0 — uitkomst, 22 september 2026

Geen API-aanroepen gedaan. Drie antwoorden, waarvan één beslissender dan verwacht.

## 1. Prijzen, nagekeken bij de bron

Van `platform.claude.com/docs/en/about-claude/pricing` en
`developers.openai.com/api/docs/pricing`, beide op 22 september 2026.

| model | invoer | cache schrijven (5m) | cache lezen | uitvoer |
|---|---|---|---|---|
| `claude-sonnet-4-6` *(draait nu)* | $3,00 | $3,75 | $0,30 | $15,00 |
| `claude-sonnet-5` | $2,00 | $2,50 | $0,20 | $10,00 |
| `claude-haiku-4-5` *(consolidatie)* | $1,00 | $1,25 | $0,10 | $5,00 |
| `claude-opus-5` | $5,00 | $6,25 | $0,50 | $25,00 |
| `gpt-5.6-luna` | $0,20 | $0,25 | $0,02 | $1,20 |
| `gpt-5.6-terra` | $2,00 | $2,50 | $0,20 | $12,00 |
| `gpt-5.6-sol` | $4,00 | $5,00 | $0,40 | $20,00 |
| `gpt-5.4` | $2,50 | — | $0,25 | $15,00 |
| `gpt-5.2` | $1,75 | — | $0,175 | $14,00 |

**Eén fout gevonden en gerepareerd.** `claude-sonnet-5` stond in `src/api/kosten.js` op
$3/$15 en is $2/$10 — een derde te hoog. Hij wordt nergens aangeroepen, dus er is geen
regel in `api_verbruik` mee misrekend.

Het interessante is hóé die fout er kwam. Anthropic kondigde $2/$10 aan als
introductieprijs tot 31 augustus 2026, met een verhoging naar $3/$15 per 1 september.
Die verhoging is afgeblazen en $2/$10 is de standaardprijs geworden. Het getal was dus
ooit juist — en werd onjuist zonder dat iemand het bestand aanraakte. Precies dezelfde
regel met precies dezelfde bedragen stond fout in de MfN-trainer.

> Dat is het argument voor de regel "prijzen opzoeken, met de datum erbij", scherper dan
> de trainer hem kon stellen: een prijstabel veroudert ook als niemand eraan zit.

**En een correctie op het gereedschap van de trainer.** `lib/prijzen.js` daar gaat ervan
uit dat OpenAI voor cache-schrijven niets extra rekent, en zet `cacheSchrijf` gelijk aan
`vers` voor álle OpenAI-modellen. Dat klopt voor de gpt-5.2/5.4/5.5-reeks, maar niet voor
de gpt-5.6-familie en gpt-6: die noemen een apart cache-schrijftarief, en dat is 1,25×
de invoerprijs — dezelfde factor als Anthropic. Het raakt `gpt-5.6-luna`, precies het
model dat de trainer heeft gekozen, dus de kostencijfers daar zijn aan die kant te laag.

Voor dit plan vervalt daarmee de aanname uit deel 3 hierboven in zijn simpele vorm:
"de uitdager schrijft gratis naar de cache" geldt niet voor de modellen die nu in beeld
zijn. Wat blijft staan is de vraag zelf — of er überhaupt uit de cache gelézen wordt —
en die is alleen met een draai te beantwoorden.

## 2. Datalocatie: er is geen Anthropic-instelling die dit oplost

De vraag was of de derde as ook zónder leverancierswissel te regelen valt. Dat kan niet.

**Anthropic.** `inference_geo` kent twee waarden: `"us"` en `"global"`. Meer niet. De
workspace-geo kent alleen `"us"` en is na aanmaak onveranderlijk. Er bestaat dus geen
stand waarin Clausula's documenttekst binnen de EU wordt verwerkt. (`claude-sonnet-4-6`
ondersteunt de parameter wel — 4.6 en later — maar de waarde die we nodig hebben bestaat
niet.)

**OpenAI.** Europese dataresidentie bestaat wel: een project in de API-omgeving met
Europa als regio, verkeer via `eu.api.openai.com`, in-regio verwerkt, en op zulke
projecten zonder opslag van verzoeken en antwoorden. Het gaat niet vanzelf — het moet
ingericht worden, en de zwaardere varianten staan achter goedkeuring.

Daarmee is de architectuurbeoordeling ingehaald door de feiten: de vaststelling dat
Clausula als enige documenttekst naar de VS stuurt is niet op te lossen door een vinkje
bij de huidige leverancier. **Dit is geen stop, maar het is wel het sterkste argument in
de hele oefening, en het staat los van kosten en kwaliteit.**

Wat er hoe dan ook bij hoort: een verwerkersovereenkomst. Een tweede leverancier is een
tweede verwerker, en die lijst staat al open.

### Wat Europese verwerking precies inhoudt

Nagekeken op de ruwe documentatiepagina, 22 september 2026. De regiotabel zegt:

```
Europe (EEA + Switzerland)   eu.api.openai.com
    Storage Yes   Processing Yes   Requires MAM or ZDR
    /v1/chat/completions   Storage  Processing
```

Verwerking in de EU geldt dus voor `/v1/chat/completions` — het endpoint dat hier in
beeld is — en de endpointtabel noemt daar `gpt-5.6-sol`, `gpt-5.6-terra` én
`gpt-5.6-luna` bij, naast de hele oudere reeks. **Het goedkoopste model valt er niet
buiten.** Australië, Canada en Japan hebben `Processing No` en zijn alleen opslag; de
Verenigde Arabische Emiraten hebben verwerking met een korte modellenlijst.

**Wat er wél bij hoort: `Requires MAM or ZDR`.** Europese verwerking staat niet aan door
een project in Europa te zetten — hij vereist goedkeuring voor aangepaste
abuse-monitoring of zero data retention. Dat is het enige onderdeel met doorlooptijd, en
dus het enige dat baat heeft bij vroeg beginnen. De verwerkersovereenkomst zelf is
papierwerk dat parallel kan lopen.

Eén ding blijft na te gaan: uitgebreide prompt caching in regio's zónder regionale
verwerking kan inhoud tijdelijk buiten de regio verwerken. Europa hééft regionale
verwerking, dus waarschijnlijk raakt het ons niet — maar "waarschijnlijk" is hier niet
genoeg, en het kruist deel 3 hierboven.

> **Hoe dit is vastgesteld, want dat is zelf een les.** Drie samenvattingen van dezelfde
> pagina gaven drie verschillende antwoorden: één noemde terra wél en luna niet, één
> noemde alles ondersteund, en één noemde luna wél en terra en sol niet. Die laatste las
> de regel van de Verenigde Arabische Emiraten aan voor die van Europa — die staan er
> direct naast, met een kortere modellenlijst.
>
> Er stond een versie van die eerste lezing in dit document, met de conclusie dat het
> kostenvoordeel wegviel. Onjuist, en het had de deelnemerslijst van fase 2 gestuurd.
>
> De pagina zelf ophalen en er deterministisch in zoeken kostte twee minuten en gaf één
> antwoord. **In een project dat een taalmodel meet, is een taalmodel geen bron.**

## 3. Gelijkschakeling onder tool-use

**Het besluit: aan beide kanten een afgedwongen functie-aanroep met hetzelfde JSON
Schema** — niet een afgedwongen tool tegenover een `json_schema`-antwoordformaat. De
vorm is dan aan beide kanten dezelfde: één benoemde functie die het model moet aanroepen,
met een schema dat het moet invullen.

Dat is ook de eerlijkste keuze inhoudelijk, want in dit project draagt het schema een
flink deel van de instructie. `onderwerpBeschrijving` en de beschrijving bij
`samenvatting` zijn geen typeannotaties maar opdrachten, en die reizen woord voor woord
mee.

### Wat niet gelijk te schakelen is, en dus vermeld hoort te worden

| | nu bij Claude | bij de uitdager | gevolg |
|---|---|---|---|
| `temperature` | `0.3` | redeneermodellen accepteren alleen de standaard, anders 400 | niet gelijk te trekken — vermelden |
| tokenbudget | `max_tokens` telt alleen uitvoer | `max_completion_tokens` telt redeneertokens mee | gelijke getallen zijn ongelijke budgetten |
| tool-overhead | geforceerde keuze kost 589 systeemtokens op Sonnet 4.6, tegen 497 bij `auto` | eigen overhead | zit in de invoertelling die we vergelijken |
| `strict` | staat uit | beschikbaar | laat uit, om de productiestand te houden |

Het tokenbudget is de val waar de trainer in liep: met 4000 ging bij de uitdager het
grootste deel op aan nadenken en kwam de JSON er half uit. Dat leest als een slecht
model en is een instellingsfout. Geef de uitdager dus ruimer budget, en zeg erbij dat je
dat gedaan hebt.

`strict` verdient een eigen paar deelnemers als we er iets van willen weten — aan beide
kanten aan, tegen aan beide kanten uit. Het is een stand, geen eigenschap, net als de
promptvariant bij de trainer. Let op dat beide leveranciers er dan
`additionalProperties: false` bij verlangen, en dat staat nu in geen enkel schema.

### Eén ding dat de meting stilletjes scheef zou trekken

`askClaude` probeert bij `max_tokens` automatisch opnieuw met een verdubbeld budget, en
daarnaast tot twee keer bij een fout. Laat je dat staan, dan krijgt de ene deelnemer twee
of drie pogingen en de andere één — en dat komt in de telling terecht als kwaliteit.
Zet de herpogingen in het harnas voor iedereen gelijk of voor iedereen uit, en tel
afgekapte antwoorden apart.

## Wat hieruit volgt voor de volgorde

Fase 0 is af, op één punt na: `src/api/kosten.js` draagt nog één leverancier. Dat blijft
zo tot fase 2 — er valt nu niets te beprijzen wat er niet is, en een tweede prijstabel
zonder gebruiker is precies het soort losse eindje dat hier bewaakt wordt.

De rest van het plan staat. Fase 1, de mechanische controle, is onveranderd het meeste
werk en het eerste dat aan de beurt is.

---

## Wie er meedoen, en waarom

**De uitkomst van de trainer draagt hier niet naar over.** Daar won `gpt-5.6-luna` voor
vraaggeneratie. Dat is een andere taak dan deze:

| | trainer | Clausula |
|---|---|---|
| invoer | één hoofdstuk | twee documenten, lang |
| uitvoer | één examenvraag | een gestructureerde bevindingenlijst |
| wat er misgaat | een vraag die niet deugt | een gemist gebrek in een document dat naar de rechter gaat |

Twee dingen volgen daaruit, en ze wijzen tegen elkaar in. De kosten hier zijn voor 71%
invoer, en op die post scheelt luna vijftien keer ($0,20 tegen $3,00). Maar een convenant
nalopen op juridische gebreken is zwaarder werk dan een examenvraag schrijven, en juist
daar kan een klein model omvallen. Dat valt niet te beredeneren.

### De voorgestelde startlijst

```
claude:claude-sonnet-4-6@low        de huidige stand — de maatstaf
claude:claude-sonnet-5@low          zelfde merk, nieuwer, $2/$10 in plaats van $3/$15
chatgpt:gpt-5.6-luna@low            de goedkoopste kandidaat
chatgpt:gpt-5.6-luna@high           dezelfde, dieper
chatgpt:gpt-5.6-terra@low           het middenmodel, $2/$12
```

Vier keuzes zitten daarin.

**`claude-sonnet-5` doet mee**, en dat is geen vanzelfsprekendheid: het is een derde
goedkoper dan wat er nu draait, bij dezelfde leverancier. Blijkt dat gelijk te scoren,
dan is er een besparing zonder verwerker erbij, zonder EU-traject en zonder migratie.
Dat is de goedkoopste uitkomst die deze oefening kan opleveren en hij hoort daarom in de
eerste ronde, niet als nagedachte.

**Luna staat er twee keer in, op twee standen.** De trainer heeft gemeten dat `low` goed
genoeg was op Sonnet, maar dat op luna de bevindingen halveerden op `high`. "Low is goed
genoeg" was dus een eigenschap van dat ene model, niet van de taak. **Diepte is hier een
deelnemer, geen instelling** — en één model tegen zichzelf is bovendien het sterkste wat
deze opzet oplevert, want dan is werkelijk alles gelijk behalve die ene knop.

**Terra als middenmodel**, omdat het de eerlijke vergelijking is als luna omvalt: $2/$12
tegen $3/$15 is nog steeds goedkoper, maar in dezelfde klasse.

**Sol en gpt-6-astra blijven er eerst buiten.** Sol kost $4/$20 en astra $10/$50 — duurder
dan wat er nu draait. Die hebben alleen zin als het hele verhaal kwaliteit wordt in plaats
van kosten, en dat is nu niet de vraag.

> Let op bij het uitbreiden van deze lijst: de modellenlijst van de leverancier is
> alfabetisch, en bij de trainer sneed een `head -30` precies het model weg dat
> uiteindelijk gekozen werd. Filter op inhoud, niet op aantal.

---

# Uitkomst ronde 1: binnen Anthropic, 22 september 2026

Twaalf gepaarde aanroepen op `tests/golden/meting/twee-documenten.json`, één fase
(`bevindingen`), samen ongeveer $2.

## `claude-sonnet-5` is geen vervanger voor deze taak

| deelnemer | bevindingen | bekende fouten | tijd | kosten |
|---|---|---|---|---|
| `claude-sonnet-4-6` (huidige stand) | 15,3 | **4 van 6** | 106s | $0,1829 |
| `claude-sonnet-5` standaard | 9,0 | 2 van 6 | 45s | $0,1287 |
| `claude-sonnet-5@xhigh` | 8,0 | 2 van 6 | 40s | $0,1268 |
| `claude-sonnet-5@max` | 5,0 | 2 van 6 | 46s | $0,1316 |

Het mist `wordtgekregen` en `identiteitsbewijzen` — de twee waarvan in CLAUDE.md al
stond dat de betrouwbaarheid erop twijfelachtig is. Het verschil van zeven bevindingen
ligt ver buiten de ruis, die op deze fixture ±2 bleek.

**Meer diepte maakt het niet beter maar stiller**: van 9 naar 8 naar 5 bevindingen, met
de recall onveranderd op 2 van 6. De hypothese dat "low is goed genoeg" hier een
eigenschap van één model zou zijn, gaat dus niet op — het probleem zit niet in de diepte.

> **Terugdraaivoorwaarde.** Dit besluit geldt voor de `bevindingen`-aanroep op deze
> fixture. Het zegt niets over `structuur`, `cross_doc` of `consolidatie`, en niets over
> een andere prompt. Meet opnieuw als een van die drie verandert.

## De tokenprijs is niet de prijs

Voor exact dezelfde tekst telt `claude-sonnet-4-6` 31.698 invoertokens en
`claude-sonnet-5` er **44.746** — 41% meer. Dat is de tokenizer die Anthropic vanaf 4.7
gebruikt; de prijspagina noemt ~30% en voegt eraan toe dat het van de inhoud afhangt.

Gevolg voor de rekening:

| | invoer | uitvoer |
|---|---|---|
| sonnet-4-6 | 31.698 tok → $0,0951 | 6.119 tok → $0,0918 |
| sonnet-5 | 44.746 tok → $0,0895 | 3.926 tok → $0,0393 |

**Een tarief dat een derde lager is, levert op de invoer 6% op.** En het verschil dat
overblijft zit vooral in de uitvoer, dus in het feit dát het minder schrijft. Reken bij
elk Anthropic-model van 4.7 of nieuwer dus niet met de prijs per token maar met een
gemeten tokenaantal op je eigen tekst.

## Twee bekende fouten vindt niemand

`dwingrechtelijke` en `etc:` staan op 0/3 bij álle deelnemers. Dat is geen
modeleigenschap maar een eigenschap van de prompt of de pijplijn — en dat is precies het
soort defect dat je volgens de methode wél mag repareren, want het treedt bij meerdere
modellen op. Apart spoor.

## Wat de meting over productie zei

`sonnet-5@max` riep één keer op drie de tool netjes aan en liet het veld `issues` weg,
met `stop_reason: tool_use`. Het schema zegt `required: ['issues']`, maar een afgedwongen
tool-aanroep garandeert geen geldig schema — daar is `strict: true` voor, en dat staat in
`api/analyseer.js` niet aan.

Productie crasht er niet op: overal staat `Array.isArray(result?.issues)` of `?? []`. Het
**degradeert stil** — die aanroep levert dan nul bevindingen, en een rapport zonder
bevindingen is niet te onderscheiden van een schoon document.

Eerlijk over de omvang: dit is waargenomen op een model dat niet in productie draait, op
een diepte die niet gebruikt wordt. Op `claude-sonnet-4-6` is het in negen runs **nul
keer** voorgekomen. Het mechanisme geldt wel, de frequentie is onbekend.

Te overwegen, als apart besluit: `strict: true` op de tooldefinities (vereist
`additionalProperties: false`), of een ontbrekend `issues`-veld in `askClaude` behandelen
als een mislukte poging in plaats van als een leeg antwoord.

## Wat dit kostte, en wat het opleverde

Ongeveer $2 aan aanroepen. Daarvoor: één leveranciersvraag beantwoord, drie fouten in het
meetharnas gevonden (temperature als modeleigenschap, de diepte die Claude nooit bereikte,
en nul bevindingen die drie oorzaken verhulde), één gat in de prompt aangewezen, en één
stille degradatie in productie blootgelegd.

**Alle drie de harnasfouten zijn gevonden door een uitslag te controleren in plaats van te
lezen.** Dat is de enige reden om de goedkope, bekende ronde eerst te draaien.

---

# Uitkomst ronde 2: OpenAI ernaast, 22 september 2026

Negen gepaarde aanroepen, `bevindingen`-fase, dezelfde fixture. **Op het globale
endpoint** — het Europese weigert een gewone sleutel met een 401, zie hierboven.

## De cijfers

| | kosten (gemeten) | **zonder cache** | tijd | bevindingen | defecten |
|---|---|---|---|---|---|
| `claude-sonnet-4-6` | $0,1775 | $0,1775 | 100s | 15,3 | 1,0 |
| `gpt-5.6-luna` | $0,0054 | **$0,0096** | 42s | 10,3 | 0,0 |
| `gpt-5.6-terra` | $0,0704 | $0,0947 | 67s | 11,0 | 0,0 |

**Lees de gemeten kolom niet als de rekening.** Het harnas stuurt drie keer exact
dezelfde invoer, en OpenAI cacht automatisch op een gedeelde prefix: 23.470 van de
23.604 invoertokens kwamen uit de cache, elke run. In productie verschilt elk document,
dus dat voordeel is er grotendeels niet. De kolom "zonder cache" rekent het terug tegen
het verse tarief; realistisch zit het daartussen, want de systeemprompt (36% van de
invoer) is wél over analyses heen gedeeld — dan komt luna op $0,0081 uit.

Dit is de valkuil "het harnas is geen productie" uit `MEETMETHODE.md`, in een vorm die
precies de conclusie raakt waar het om gaat.

**Hoe dan ook: luna is ordegrootte twintig keer goedkoper, terra ongeveer twee keer.**
Dat verschil is zo groot dat geen enkele cache-aanname het wegneemt.

Daar komt een tweede factor bij die dezelfde kant op wijst: voor dezelfde tekst telt
OpenAI **23.604** invoertokens en Anthropic **31.698** — 26% minder. Het spiegelbeeld
van wat we bij `claude-sonnet-5` zagen, en opnieuw: de prijs per token is de prijs niet.

## De kwaliteit is niet geordend maar complementair

Bekende fouten, gevonden in hoeveel van de drie runs:

| fout | sonnet-4-6 | luna | terra |
|---|---|---|---|
| `wordtgekregen` | **2/3** | 0/3 | 0/3 |
| `gezamelijke` | 3/3 | 2/3 | 3/3 |
| `dwingrechtelijke` | 0/3 | **2/3** | 0/3 |
| `identiteitsbewijzen` | **1/3** | 0/3 | 0/3 |
| `de de vrouw` | 3/3 | 3/3 | 3/3 |
| `etc:` | 0/3 | 0/3 | 0/3 |

Op "gevonden in minstens één run" staat het 4–3–2 in het voordeel van sonnet-4-6. Maar
dat is niet het hele verhaal: **luna vindt `dwingrechtelijke`, en dat heeft geen enkel
Claude-model in negen runs gedaan.** Andersom vindt sonnet-4-6 `wordtgekregen` en
`identiteitsbewijzen`, die luna nooit vindt.

Ze missen dus verschillende dingen. Dat is een andere uitkomst dan "de een is beter", en
het is een uitkomst die je alleen ziet als je per fout telt in plaats van per totaal.

> **Correctie op ronde 1.** Daar staat dat `dwingrechtelijke` en `etc:` "door geen enkel
> model" worden gevonden en dus een promptprobleem zijn. Dat klopte niet: geen enkel
> *Claude*-model vond ze. Voor `dwingrechtelijke` was het een modelverschil.
>
> Voor `etc:` staat het wél overeind — nul keer, bij zes deelnemers over eenentwintig
> runs. Dát is een promptprobleem, en nu met meer gewicht dan eerst.

## Het verschil zit in de inhoud, niet in de taal — en de maat zag dat niet

Uit het lezen in de viewer kwam een waarneming die de telling niet had opgeleverd:
Claude pakt dieper liggende zaken op, zoals het narekenen van bedragen en de balans
tussen partijen. Dat is getoetst over alle drie de runs en het houdt stand.

**Bevindingen per dimensie, opgeteld over drie runs:**

| dimensie | sonnet-4-6 | luna | terra |
|---|---|---|---|
| grammatica | 19 | 18 | 20 |
| juridisch | 11 | 13 | 9 |
| conflicten | 9 | 8 | 3 |
| volledigheid | **6** | **0** | 3 |
| balans | **2** | **0** | **0** |
| *totaal* | 46 | 31 | 33 |

**Het rekenwerk**, langs twee kanten gemeten:

| | sonnet-4-6 | luna | terra |
|---|---|---|---|
| noemt een berekening of bedrag | 18/46 (39%) | 6/31 (19%) | 4/33 (12%) |
| citaat met een getal erin | 28/46 (61%) | 18/31 (58%) | 13/33 (39%) |

Op grammatica zijn ze gelijk. Op inhoud niet: luna levert nul volledigheids- én nul
balansbevindingen over 31 stuks, en Claude gaat twee tot drie keer zo vaak over een
bedrag of een berekening.

> **Voorbehoud bij de dimensietelling.** Die labels zet het model zelf, dus een model
> dat anders labelt telt anders zonder zich anders te gedragen. Nul balans over 64
> OpenAI-bevindingen tegen 2 over 46 is daarmee niet weg te verklaren, en de
> rekensignalen wijzen dezelfde kant op — maar het is corroboratie, geen bewijs.

### Correctie: het scorebord 4–3–2 mat maar één dimensie

Hierboven staat de conclusie "complementair in plaats van geordend", op grond van de
recall op de bekende fouten. Die conclusie is te gunstig voor de uitdagers geweest, en
de oorzaak zit in de fixture.

De zes bekende fouten zijn `wordtgekregen`, `gezamelijke`, `dwingrechtelijke`,
`identiteitsbewijzen`, `de de vrouw` en `etc:` — **alle zes taalfouten.** De
recall-maat meet dus uitsluitend de dimensie waarop de drie modellen gelijk scoren, en
is blind voor het verschil dat er werkelijk is. Het scorebord 4–3–2 is ruis op één
dimensie, geen kwaliteitsoordeel.

Dat is de valkuil "een maat kan juist misgaan op wat je meet", in de scherpste vorm:
de maat wees niet de verkeerde kant op, hij keek de verkeerde kant op.

**Wat de meetopzet nodig heeft:** bekende fouten in de inhoudelijke dimensies — een
ontbrekende peildatum, een eenzijdig beding, een bedrag dat niet klopt. Zolang die er
niet zijn, kan geen enkele telling hier een uitspraak over doen en blijft het lezen de
enige weg.

**En het laat zien waar het lezen voor is.** Eén ronde lezen leverde op wat negen runs
tellen niet opleverde.

## Wat er nog niet gelijkgeschakeld is

Drie dingen, en ze staan alle drie in de uitvoer van het harnas zelf:

- **De regio.** Gemeten op het globale endpoint. Tokens, kosten en bevindingen zijn
  overdraagbaar naar de EU; de tijden niet.
- **`temperature`.** Claude krijgt 0,3, de uitdager de standaard — die modellen
  accepteren de parameter niet.
- **De cache.** Hierboven behandeld.

## Wat dit betekent voor de keuze

Het is geen uitgemaakte zaak, en dat is zelf de uitkomst. Er staat nu:

- een kostenvoordeel van een orde van grootte, dat geen enkele aanname wegpoetst;
- een kwaliteitsbeeld dat complementair is in plaats van geordend;
- een AVG-argument dat één kant op wijst en waarvoor het traject nog moet beginnen.

**Wat dit nog niet is:** een oordeel over de inhoud. De telling ziet niet of een
bevinding ergens op slaat. `tests/golden/vergelijking-openai.md` bevat de bevindingen
per deelnemer; dat lezen is de volgende stap en die is menselijk.

En het is één fase (`bevindingen`) op één fixture. `structuur`, `cross_doc` en
`consolidatie` zijn niet gemeten.

---

# Ronde 3: de zorgkortingsregel in de prompt, 22 september 2026

Na ronde 2 stond de hypothese open dat het verschil een promptprobleem kon zijn: de
prompt is maandenlang op Claude bijgeslepen, dus een gebrek dat alleen Claude meldt kan
net zo goed betekenen dat de instructie bij Claude aanslaat en bij de rest niet.

Dat is nu getoetst. De zorgkortingsregel stond **niet** in de prompt — er stond alleen
een balansregel over onderbouwing die in het voordeel van één partij uitvalt. Claude
leidde de eis dus af. De regel is er expliciet in gezet: de vier bandbreedtes uit
par. 4.3.5 van het Rapport Alimentatienormen, met een procedure in vier stappen
(zorgverdeling opzoeken → gemiddelde dagen per week uitrekenen → percentage opzoeken →
vergelijken), de eis om de berekening in de bevinding te zetten, en een terugval voor
een zorgverdeling die te vaag is om te berekenen.

## De uitkomst

| `zorgkorting-niet-gemotiveerd` | vóór | ná |
|---|---|---|
| `claude-sonnet-4-6` | 5/6 (83%) | **3/3** |
| `gpt-5.6-luna` | 0/9 | **0/3** |
| `gpt-5.6-terra` | 0/9 | **0/3** |

**De regel maakt Claude betrouwbaar en doet bij de uitdagers niets.** Ze kregen exact
dezelfde prompt — het harnas bouwt hem uit één bron — met de tabel, de stappen en de
vindplaats erin. Een expliciete, uitgeschreven instructie met een opzoektabel bracht ze
niet van nul.

Daarmee is de hypothese uit ronde 2 verworpen: **het verschil op inhoud is geen
promptgat.** Dat had het kunnen zijn, en het was de eerlijke vraag om te stellen, maar
het antwoord is nee.

## Wat er verder uit kwam

**De eval blijft groen**: 5 van de 5 harde assertions. De promptwijziging breekt niets.

**De terugvalregel werkt**, en levert een bevinding op die er zonder deze wijziging niet
was:

> *Zorgverdeling te vaag voor berekening zorgkorting* — "Omdat artikel 3 geen enkel
> concreet zorgpatroon beschrijft (geen dagen, geen weekwissels, geen vakantieregeling),
> is het onmogelijk het gemiddeld aantal verblijfsdagen per week per kind te berekenen en
> daarmee de toepasselijke zorgkorting (par. 4.3.5 Rapport Alimentatienormen) vast te
> stellen."

Geen enkel geval waarin een percentage uit de tabel ten onrechte werd afgekeurd — de
niet-flag-regel houdt stand.

## Hoe sterk is dit bewijs

Matig, en dat hoort erbij. 5/6 tegen 3/3 is een klein verschil op een klein aantal runs;
het kan ruis zijn. Wat wél stevig is: de regel gáát af, met de redenering erbij, in een
vorm die een mediator kan narekenen — en de uitdagers staan op nul bij een instructie die
niet duidelijker kan.

De andere getallen bewogen binnen de verwachte bandbreedte (`wordtgekregen` 2/3 → 3/3,
`artikel-vorderingen-ontbreekt` 2/6 → 0/3). Daar valt niets aan toe te schrijven.

## Wat nog open staat

- Of `consolidatie` (nu Haiku) een eigen, kleinere vergelijking verdient. Laagste risico,
  kleinste inzet.
- Het lezen gebeurt nu in een markdown-bestand, en dat haalt het oordeel uit zijn context:
  een bevinding beoordeel je met het document ernaast en de passage gemarkeerd, niet als
  opsommingsteken. Beide varianten als twee gelabelde screenings in één dossier laden zou
  dat oplossen — dezelfde documenten, hetzelfde moment, maar gelezen in de echte viewer.
