# Structuur van Clausula — waar de fouten vandaan komen, en wat eraan te doen

Opgesteld 2 september 2026, ná een etmaal waarin negenentwintig commits aan reparaties
zijn gedaan. Dat etmaal is het bewijsmateriaal: elke fout is een steekproef uit wat deze
structuur mogelijk maakt. Dit stuk redeneert daarvandaan terug, niet vanuit een ideaal.

Leesvolgorde: eerst de meting, dan de foutenklassen, dan wat er te doen valt — in de
volgorde waarin het loont. Wie alleen de conclusie wil: § 6.

---

## 1. De meting

```
index.html   13.084 regels script · 278 functies op topniveau · gemiddeld 39 regels
src/             45 bestanden ·  5.248 regels · gemiddeld 117 · 1023 unittests
api/             24 bestanden ·  4.661 regels · gemiddeld 194
ESM-brug         34 modules ingeladen · 74 namen aan window gehangen
```

Het gemiddelde van 39 regels verbergt de werkelijke verdeling:

| functies | aantal | samen | aandeel van de code |
|---|---|---|---|
| > 400 regels | 2 | 1.413 | 13% |
| > 200 regels | 8 | 3.219 | **30%** |
| > 100 regels | 23 | 5.358 | **49%** |
| > 50 regels | 50 | 7.183 | 66% |

De 278 functies beslaan samen 10.839 regels; de rest is code op topniveau, handlers en
opmaak. De twaalf grootste: `analyseDocument` (937), `toonConceptReview` (476),
`buildPdfDef` (376), `_assistVoegAssistBerichtToe` (367), `toonRapport` (307),
`diepteAnalyse` (298), `opslaan` (237), `vervangInDocxXml` (221), `dedupIssues` (194),
`laadScreening` (183), `bewerkDocx` (180), `laadDossiers` (176).

> **Dit is de tweede meting.** De eerste nam als lengte "de afstand tot de volgende
> functie", en dat overschat zodra er losse code tussen staat. Zo verscheen er een
> `pasWijzigingenToe` van 539 regels — een functie die niet bestaat: er zijn drie
> varianten (`…Schoon`, `…InDocx`, `…Tekst`) en de meting plakte de code ertussen erbij.
> De cijfers hierboven tellen tot de afsluitende accolade op kolom nul, wat door de
> opmaak van dit bestand exact is.

En de scheve verhouding die alles bepaalt:

> **71% van alle frontend-JavaScript zit in het bestand zonder unittests.**
> `src/` is 5.248 regels met 1023 tests; `index.html` is 13.084 regels met nul.

Dat is geen kwaliteitsoordeel over de code in `index.html` — die is netjes geschreven en
rijk becommentarieerd. Het is een uitspraak over waar een fout ongezien kan blijven.

---

## 2. Wat er in één etmaal misging, en waarom

Negenentwintig commits. Ze vallen in zes klassen, en de klasse is belangrijker dan de
individuele fout — een klasse zegt wélke structuurkeuze hem mogelijk maakte.

### A. Gedeelde veranderlijke toestand — 3 fouten

`app.rapport` heeft **104 verwijzingen en 11 schrijfplekken** in één bestand. Niemand
bezit hem. Gevolg: hij wordt nooit leeggemaakt bij een nieuwe analyse, en het progressief
renderen spreidt bewust het vórige rapport erin. Toen ik daar een terugval-opslag op
baseerde, kon het rapport van dossier A in dossier B belanden.

Dezelfde klasse, andere plek: `_meetContext` en `_meetFase` stonden als
modulevariabelen in `api/ai-assistent.js`. Twee gelijktijdige verzoeken overschrijven
elkaars context — verbruik van kantoor A onder kantoor B. `analyseer.js` had die fout ook
en loste hem op 31 augustus op met `AsyncLocalStorage`; in `ai-assistent.js` bleef hij
staan tot de ultrareview erop wees.

### B. Functies die te lang zijn om te overzien — 2 fouten

`ReferenceError: _klaar is not defined`. Gedeclareerd met `let` binnen een try-blok,
gelezen honderd regels verderop erbuiten — in `analyseDocument`, 937 regels. Elf dagen
lang werd daardoor geen enkele analyse bewaard.

En in `startAnalyse`: `geslaagd` wordt gezet ná het tekenen van het rapport en honderd
regels verderop gelezen om te bepalen of er opgeslagen wordt. Struikelt er iets tussen die
twee punten, dan staat er een compleet rapport op het scherm en gaat er niets naar de
database.

In een functie van vijftig regels zie je allebei met het blote oog.

### C. Dode of gedupliceerde logica — 4 fouten

`sorteerOpType` bestond, was getest, hing aan `window` — en werd **nul keer aangeroepen**.
Ernaast stonden drie eigen volgordetabellen in `index.html`, alle drie met twee
documenttypes te weinig. Gevolg: het waardeoverzicht vóór het convenant.

`bouwPrimaireBest`: idem, met een kopie van twintig regels ernaast.
`scheidBijlageIssues`: idem — die had ik diezelfde dag zelf geschreven en niet
aangesloten. Plus drie exports die alleen een test hadden en door de app nooit werden
gedraaid: een groene test onder code die niet meedoet.

De ESM-brug maakt dit mogelijk: `window.x = x` is een toewijzing, geen gebruik. Niets
klaagt als de aanroep ontbreekt.

### D. Contractdrift tussen lagen — 2 fouten

De beschrijving van het `antwoord`-veld verwees het model naar `clausule.tekst`. Dat veld
was een maand eerder uit het tool-schema verwijderd. Het model deed precies wat er stond:
twee zinnen intro schrijven en de clausule nergens laten. Geen foutmelding, geldige JSON.

Prompt en schema staan in aparte bestanden en er is niets dat ze aan elkaar toetst.

### E. Foutpaden die nooit zijn doorlopen — 3 fouten

Een 200 van Anthropic zónder tool-aanroep schreef **twee** verbruiksregels: kosten dubbel
geteld. Een HTTP-fout in `claude-edge` keerde terug vóór de `finally` met
`wachtOpVerbruik()`, waardoor juist de 429's en 500's als enige niet werden vastgelegd. En
de `catch` in `startAnalyse` logde niets, waardoor de fout die alles kostte volledig werd
opgeslokt.

Alle drie zitten in code die alleen draait als er iets misgaat — en die werd nooit
getoetst.

### F. Een aantal zonder namen — 3 keer opgelost

`10 van 14 niet teruggevonden`. `6 duplicaat(en) verwijderd`. `Opslaan mislukt`. Genoeg om
een pátroon te zien, te weinig om één geval op te lossen. Ik heb op grond van zo'n getal
twee keer een oorzaak beweerd die bij naspelen onjuist bleek.

---

## 3. Wat dit zegt over de structuur

Drie dingen, en ze zijn niet allemaal even erg.

**Het probleem is niet `src/`.** Vijfenveertig modules, gemiddeld 117 regels, allemaal
getest, elk met een nota over de fout die eraan voorafging. Daar kwam gisteren geen enkele
storing vandaan — behalve doordat een module níét werd aangeroepen.

**Het probleem is de verdeling.** De helft van de functiecode zit in drieëntwintig
functies van meer dan honderd regels. Dat is waar toestand, DOM, netwerk en beslissingen
door elkaar lopen, en waar een scope-fout onzichtbaar is.

**En de brug is een omweg met een prijs.** Geen build-stap is een bewuste, verdedigbare
keuze — geen toolketen om te onderhouden, geen versieconflicten, wat je schrijft is wat er
draait. Maar `window.x = x` betekent dat ontkoppeling geen fout is, en dat is precies de
klasse waar gisteren vier fouten uit kwamen.

---

## 4. Wat te doen, in volgorde van rendement

De volgorde is niet willekeurig: elke stap maakt de volgende goedkoper of veiliger.

### Stap 1 — `analyseDocument` opknippen (937 → ~620 regels)

De langste functie én de bron van de duurste fout. Drie stukken kunnen eruit, elk een
zuivere transformatie:

| naar `src/analyse/` | regels | waarom dit stuk |
|---|---|---|
| `sse-lezer.js` | ~149 | hier zat `_klaar`; in dertig regels is het geldigheidsbereik zichtbaar |
| `sse-accumulator.js` | ~147 | de samenvoeging waar bevindingen stil kunnen verdwijnen |
| `verzoek.js` | ~49 | zuivere samenstelling van kenmerken, wetteksten, templates |

**Blijft staan:** de 295 regels skeleton en progressief renderen. Dat is DOM-bedrading
zonder toetsbare kern; extractie levert een parameterlijst met element-id's op en bewijst
niets. Idem de tekstextractie, die op pdf.js en Tesseract leunt.

Eén module per commit, met tests, en na elke commit de volledige suite. **Bewijzen, niet
aannemen:** na stap 1 de `_klaar`-fout opnieuw introduceren en zien dat smoketest 15 rood
gaat. Lukt dat niet, dan dekt die test hem niet en is de splitsing verplaatsing in plaats
van vooruitgang.

### Stap 2 — Typecontrole zonder build-stap

Dit is de grootste winst per uur, en hij botst niet met de keuze om geen build-stap te
hebben. Een `jsconfig.json` met `checkJs` plus `npx tsc --noEmit` als testopdracht
controleert `src/` en `api/` — samen **9.909 regels** — zonder dat er ook maar iets aan
de uitvoer verandert. Er komt geen transpilatie bij; het is een controle, geen bouwstap.

**Gemeten, niet aangenomen.** De dragende claim is dat dit de duurste fout van gisteren
had gevangen. Nagebouwd in een los bestand — `let _klaar` binnen de try, gelezen erbuiten:

```
error TS2304: Cannot find name '_klaar'.
```

Dat klopt dus. Mét een voorwaarde die niet weg te poetsen is: `tsc` ziet alleen bestanden,
geen inline `<script>`. Voor déze fout werkt het pas nádat stap 1 die code naar `src/`
heeft gebracht. Dat is een argument vóór stap 1, niet tegen stap 2.

**En de omvang van het werk, ook gemeten.** `tsc --checkJs` op de 45 bestanden in `src/`:

| instelling | meldingen |
|---|---|
| standaard | 458 |
| `noImplicitAny: false` | **115** |

Die 458 zijn grotendeels "parameter heeft impliciet type any" — waar. Begin daarom met
`noImplicitAny` uit: dan blijven 115 meldingen over die ergens ánders over gaan.

**Wees niet te optimistisch over die 115.** Ik heb er drie van dichtbij bekeken —
`afgevinktPct` op een afgeleid objectliteral, `[[4, 'woorden4']]` dat als
`(string|number)[][]` wordt gelezen, een ongetypeerde `piiPh`-parameter — en het zijn alle
drie **annotatieruis, geen latente fouten**. Verwacht dus geen oogst aan verborgen bugs
uit de bestaande code; de winst zit in wat er hierná misgaat.

De prijs is navenant: honderdvijftien meldingen wegwerken met JSDoc-annotaties, waarvan
het merendeel geen enkele fout blootlegt. Dat is een dag werk voor een vangnet dat vanaf
dat moment gratis is. Verdedigbaar, maar noem het geen opruimactie.

Begin met `src/`, zet `api/` er daarna bij, en installeer TypeScript als
devDependency — er verandert niets aan wat er draait.

### Stap 3 — Foutpaden toetsen

Drie van de zes foutklassen zaten in code die alleen draait als er iets misgaat. De
nep-Supabase kan sinds gisteren schrijven, dus dat pad is nu bereikbaar. Wat ontbreekt
zijn de tests die het opzoeken:

- opslaan met een falende storage-upload → blijft het rapport bewaard?
- een SSE-stroom die halverwege afbreekt → komt de afkapmelding?
- Anthropic geeft 429 → staat er precies één verbruiksregel?

Elk daarvan is een browsertest van twintig regels met een `page.route` die een fout
teruggeeft. Ze zijn goedkoper dan de fouten die ze vangen.

### Stap 4 — Eigenaarschap voor `app.rapport`

Niet "de globale weghalen" — dat is een grote verbouwing met weinig opbrengst. Wél: de
overgangen op één plek, in `src/analyse/rapport-state.js`, met tests. Wie mag hem zetten,
wanneer wordt hij leeggemaakt, en welk merk hoort erop. Het runmerk dat er gisteren op
kwam is de eerste helft daarvan; de andere tien schrijfplekken zijn de tweede.

### Stap 5 — Twee gates erbij, in de geest van `losse-eindjes.mjs`

Die scanner werkt: van twaalf naar nul, en een test houdt hem daar. Twee soortgelijke
controles zijn mechanisch mogelijk en zouden gisteren elk een fout hebben gevangen:

- **prompt ↔ schema.** Elk veld dat een prompttekst noemt (`clausule.tekst`,
  `passage_document`, …) moet in het bijbehorende tool-schema bestaan. Puur tekstueel te
  controleren.
- **geen veranderlijke modulestaat in `api/`.** Een `let` op modulniveau die per verzoek
  wordt gezet, is in een serverless omgeving een race. Twee keer voorgekomen, beide keren
  pas gevonden door een review.

### Stap 6 — De volgende drie reuzen

Ze verschillen sterk in hoe makkelijk ze zijn, en dat bepaalt de volgorde.

**`buildPdfDef` (376) — verreweg de makkelijkste, en misschien wel vóór stap 4.**

```js
function buildPdfDef(naam, cls, rp, versieNr, versieLabel, mediatorNaam, orgNaam, dossierNaam)
```

Alles komt binnen als parameter. **Nul DOM-aanroepen, nul `await`, nul globals.** Het is
al een zuivere functie — hij bouwt een pdfmake-definitie uit het rapport. Verplaatsen naar
`src/pdf/rapport-def.js` is knippen en plakken, en de test schrijft zichzelf: geef een
rapport, controleer de opbouw.

Waarom dit meer waard is dan zijn omvang doet vermoeden: dit is het cliëntenrapport dat de
mediator uitprint en meestuurt. Een stille regressie — een verdwenen sectie, een verkeerd
totaal — is daar onzichtbaar tot iemand hem in handen heeft. Van alle 376 regels in dit
bestand is dit de enige plek waar een fout het pand verlaat.

**`_assistVoegAssistBerichtToe` (367) — grotendeels HTML-opbouw.** Zeven DOM-aanroepen op
367 regels; de rest is het samenstellen van tekst. De HTML-bouwers zijn eruit te halen als
zuivere functies (`bubbelHtml`, `bronnenHtml`, `signalenHtml`), waarna er een aanroeper
overblijft die alleen nog invoegt.

**`toonConceptReview` (476) — de moeilijkste, en de laatste.** Veertig DOM-aanroepen en
vier `await`s: paneel opbouwen, kaarten markeren die niet in de DOCX zijn toegepast,
accept/afwijs/bulk via event-delegation. Hier valt weinig zuivers uit te halen; wat het
verdient is een browsertest die de accept-afwijs-flow doorloopt, niet een verhuizing.

Pas hieraan beginnen als stap 1 tot 5 staan — met één uitzondering: `buildPdfDef` mag
altijd, want er is niets aan te ontkoppelen.

---

## 5. Wat níét te doen

**Geen grote refactor.** Die is één keer geprobeerd; het bestand groeide er tijdens de
uitvoering van 13.000 naar 15.000 regels. De les staat in `tests/unit/omvang.test.js` en
geldt nog steeds.

**Geen framework.** De keuze voor vanilla zonder build-stap is verdedigbaar en de kosten
van omschakelen zijn hoog. Alles hierboven werkt binnen die keuze — inclusief de
typecontrole.

**Niet extraheren om te extraheren.** Van de fouten die op 19–20 augustus boven water
kwamen had verplaatsen er vrijwel geen voorkomen; tests en waarneming wel. De 295 regels
DOM-bedrading in `analyseDocument` horen te blijven waar ze staan.

**Geen bovengrens op de consolidatie.** Gemeten: die stap haalt routinematig 36 tot 65
procent van de bevindingen weg, en dat is bedoeld gedrag. Elke grens die dat niet breekt,
ligt zo hoog dat hij niets vangt. Dit staat hier omdat ik hem bijna had toegevoegd.

---

## 6. Kort

De codebase is niet in verval; hij is scheef. `src/` is in orde en `api/` is werkbaar. De
helft van de functiecode zit in drieëntwintig functies van meer dan honderd regels,
zonder unittests, met gedeelde veranderlijke toestand — en dáár kwamen gisteren vrijwel
alle fouten vandaan.

De ingreep met het hoogste rendement is niet "opruimen" maar **meetbaarheid**: knip de
grootste functie op zodat er getypeerd en getest kan worden, zet er typecontrole op zonder
build-stap, en toets de foutpaden. Dat is drie klassen van de zes in één beweging.

De remmen die er nu al staan — de omvangsgrens die alleen omlaag mag, de
losse-eindjesteller op nul, zesenveertig browsertests, de meldingen die namen noemen in
plaats van aantallen — zijn geen bijzaak. Ze zijn de reden dat het bovenstaande te meten
viel in plaats van te vermoeden.
