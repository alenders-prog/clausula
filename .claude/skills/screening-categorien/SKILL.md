---
name: screening-categorien
description: Definities, criteria en outputconventies voor de screeningcategorieën van Clausula (Juridisch, Conflicten, Volledigheid, Balans, Grammatica en de aparte MfN-score). Gebruik deze skill ALTIJD bij het schrijven of aanpassen van screening-prompts, categoriedefinities, ernst-logica, tool-use schema's voor screeningoutput, of bij het beoordelen van convenanten en ouderschapsplannen — ook als de gebruiker niet expliciet "screening" zegt maar wel werkt aan bevindingen, toetsing, of de kwaliteit van screeningresultaten.
---

# Clausula Screeningcategorieën

Deze skill is de enige bron van waarheid voor wat elke screeningcategorie betekent,
wat wél en níet een bevinding is, en hoe bevindingen worden gestructureerd.
Wijzigingen aan screening-logica moeten consistent zijn met dit bestand;
wijkt de code of een prompt af, meld dat dan expliciet aan de gebruiker.

---

## Architectuur: twee parallelle Claude-calls + Haiku-consolidatie per document

Elke analyse bestaat uit twee gelijktijdige Sonnet-calls + één afsluitende Haiku-consolidatiepass:

| Stap | Dimensies / doel | Tool / model |
|------|-----------------|--------------|
| **structuur** | `volledigheid` + aparte `mfn_score` | `registreer_structuur` / Sonnet |
| **bevindingen** | `juridisch`, `balans`, `grammatica`, `conflicten` | `registreer_bevindingen` / Sonnet |
| **cross_doc** | inconsistenties over twee documenten heen | `registreer_cross_doc_bevindingen` / Sonnet |
| **IBAN-validatie** | verwijdert issues met hallucinated of tegenstrijdige IBAN-vermeldingen | server-side code / geen LLM |
| **consolidatie** | semantische deduplicatie van alle bovenstaande issues | `consolideer_issues` / Haiku |
| **consistentie** | titel die meer beweert dan de bevinding aantoont | `controleer_consistentie` / Haiku |

**IBAN-validatie (vóór Haiku-consolidatie, `filterIssuesOpIban` in `api/analyseer.js`):**
Twee checks op basis van regex `\bNL\d{2}[A-Z]{4}\d{10}\b`:
1. Issues waarbij een vermeld IBAN *niet exact* in de documenttekst staat worden verwijderd (voorkomt verwisseling van vergelijkbare nummers zoals NL36 vs NL32).
2. Als twee issues over hetzelfde IBAN tegenstrijdige conclusies trekken ("ontbreekt" vs "aanwezig"), wordt het minder ernstige verwijderd.

**IBANs worden gepseudonimiseerd** in `index.html` vóór server-verzending via `_maakPiiTracker`:
echte IBANs worden vervangen door bracket-placeholders `[IBAN_0]`, `[IBAN_1]`, etc.
De IBAN_RE in `analyseer.js` matcht zowel echte NL-IBANs als `[IBAN_n]`-placeholders.
De mapping (`[IBAN_0]` → echt IBAN) zit in `naarEcht` en wordt hersteld door `herstelAnonObj` via `replaceAll`.

De Haiku-consolidatiestap ontvangt alle issues (structuur + bevindingen + cross_doc) als genummerde
lijst en retourneert de te bewaren indices. De frontend gebruikt het `consolidatie`-event als
definitieve issue-lijst; als het event uitblijft, valt de frontend terug op `dedupIssues()`.

De tool-schema's worden gedefinieerd in `api/analyseer.js`. Dit bestand is leidend
bij discrepanties tussen skill en code.

---

## Output-veldnamen (exact zoals in het tool-schema)

Elke bevinding is een object met:

| Veld | Type | Toelichting |
|------|------|-------------|
| `onderwerp` | string | Max ~10 woorden, concreet ("Nihilbeding kinderalimentatie is nietig") |
| `ernst` | `"hoog"` \| `"midden"` \| `"laag"` | Zie `references/severity.md` |
| `dimensies` | string[] | Exact één waarde uit: `juridisch`, `conflicten`, `volledigheid`, `balans`, `grammatica` |
| `bevinding` | string | 2–5 zinnen: wat, waarom probleem, met wetsartikel of norm indien van toepassing |
| `aanbeveling` | string | Concrete herformulering of handeling die de mediator direct kan overnemen |
| `artikel` | string? | Sectienummer of kopje (bijv. `"3.2.1"`, `"Artikel 5"`, `"Bankrekeningen"`). Optioneel — leeg als het document geen duidelijke nummering heeft. Wordt in de client gebruikt als Tier-5-fallback voor `vindDocVolgorde` wanneer de passage niet gevonden wordt. |
| `passage` | string | Letterlijk verbatim citaat (1–2 zinnen) uit het document — leeg laten als sectie volledig ontbreekt |

> **Let op:** `mfn_score` is een apart structured object (geen gewone issue) — zie sectie MfN hieronder.

Bevindingen worden ALTIJD via het tool-use mechanisme gestructureerd geretourneerd
(nooit JSON-als-tekst — bekende bron van malformed responses).

Toelichtingen/bevindingen richten zich tot de mediator (professional, Nederlands,
u-vorm vermijden — schrijf neutraal-zakelijk). Nooit juridisch advies aan partijen
formuleren; altijd "aandachtspunt voor de mediator".

Zie `references/voorbeelden.md` voor goede en slechte voorbeeldbevindingen per categorie.

---

## De vijf issue-categorieën (dimensies)

### 1. juridisch
Toetst of afspraken juridisch correct, geldig en afdwingbaar zijn naar Nederlands recht.

**Wel een bevinding:**
- Afspraken in strijd met dwingend recht (bijv. afstand van kinderalimentatie, art. 1:400 lid 2 BW)
- Onjuiste of verouderde wetsverwijzingen
- Fiscaal onjuiste constructies (partneralimentatie, verrekening pensioen, eigenwoningregeling)
- Afspraken die de rechter bij homologatie waarschijnlijk niet accepteert
- Ontbrekende juridisch verplichte elementen (bijv. nihilbeding zonder correcte formulering)

**Geen bevinding:**
- Afspraken die juridisch geldig maar ongebruikelijk zijn (dat is hooguit balans of conflicten)
- Stilistische keuzes in juridische formulering
- Niet-ingevulde velden (lege bedragen, sjabloonplaatshouders, "€ ,–") → altijd volledigheid
- Inhoudelijk lege zinnen (zin noemt onderwerp maar bevat geen concrete afspraak) → altijd volledigheid

**IPR-checks (iprChecks in sysBevindingen — alleen convenant):**
Claude detecteert internationaal elementen in de documenttekst (buitenlandse nationaliteit, huwelijk in buitenland, woonhistorie buiten NL, buitenlands vermogen) en rapporteert:
- IPR-A: toepasselijk recht niet benoemd → volledigheid (midden)
- IPR-B: huwelijk 1992–2019 + buitenlandse woonhistorie + geen wagonstelsel-vaststelling → volledigheid (midden)
- IPR-C: verdeling op NL gemeenschap terwijl buitenlands recht van toepassing lijkt → juridisch (hoog)
- IPR-D: buitenlands pensioen zonder verevening-afspraak (WVPS niet automatisch) → volledigheid (midden)
Als GEEN internationaal signaal aanwezig → géén IPR-issues. Verwijzingsregel per tijdvak: zie `legal_chunks` IPR-HVR-chunks (SQL 009).

### 2. conflicten
Toetst op interne tegenstrijdigheden en toekomstige geschilrisico's binnen het document.

**Wel een bevinding — op ALLE niveaus:**
- **Inter-artikel**: artikel X en artikel Y spreken elkaar tegen over hetzelfde onderwerp
- **Intra-sectie**: twee opeenvolgende zinnen of bullets binnen hetzelfde onderdeel die het tegenovergestelde beweren (bijv. "uitsluitend mondeling" gevolgd door "schriftelijk vastgelegd"; vakantieregeling met intern inconsistente wekenaantallen of data)
- **Bedrag/datum**: hetzelfde bedrag of dezelfde datum wordt op twee plaatsen anders vermeld
- **Rekenkundige fout** (ZELFCONTROLE-stap 5, 2026-07): vermelde rekensommen (optellingen, A−B, procenten) worden door Claude ZELF nageteld. Afwijking → issue dimensie `conflicten`, ernst `hoog`. Passage = de zin met het onjuiste getal. Voorbeeld: "834 + 861 + 238 = 1.695" staat in document maar 834+861+238=1.933 → rapporteer.
- **DEDUPLICATIE** (prompt-regel, 2025-07): als meerdere inconsistenties voortkomen uit dezelfde
  onderliggende oorzaak (bijv. één fout overbedelingsbedrag dat doorwerkt in totaalbedrag),
  rapporteer EEN bevinding met de kernfout + gevolgen — geen apart issue per plek.
- Vage formuleringen die tot uitleggeschillen leiden ("in redelijkheid", "zo veel mogelijk" zonder invulling)
- Afspraken zonder geschillenregeling waar die voorzienbaar nodig is

> **Valkuil**: De balans-call stuurde vroeger alleen op inter-artikel conflicten. Intra-sectie tegenspraken (twee aaneengesloten bullets) werden gemist. De `sysBalansGram`-prompt bevat nu expliciete instructie voor beide niveaus.

**Geen bevinding:**
- Bewust open geformuleerde intentie-afspraken in een ouderschapsplan (mits als zodanig herkenbaar)

### 3. volledigheid
Toetst of alle onderwerpen aanwezig zijn EN of aanwezige secties voldoende uitgewerkt zijn.

**Wel een bevinding:**
- **Ontbrekend**: verplicht of gebruikelijk onderdeel staat geheel niet in het document
- **Onvolledig**: sectie is aanwezig maar mist essentiële details voor uitvoerbaarheid:
  - Vakantieregelingen zonder concrete wisseltijden per feestdag (Pasen, Pinksteren, Hemelvaartsdag)
  - Zorgregeling zonder specificatie welke weekenden (even/oneven)
  - Alimentatie zonder ingangsdatum, indexering of beëindigingsdatum
- Ontbrekend verplicht onderdeel (art. 815 lid 2 Rv voor OP: zorgverdeling, kinderalimentatie, informatie/consultatie)
- **Niet ingevuld** (ALTIJD volledigheid, NOOIT juridisch of balans): een bedrag, datum, naam of andere waarde is leeggelaten of bevat een sjabloonplaatshouder. Herkenbaar aan: "€ ,–", "€ __", "____", "*OF", "te noemen __", streepjes of puntjes als invulruimte. Reden: het is een invulfout, geen fout in de inhoud. Geldt ook als het een juridisch verplicht bedrag betreft (bijv. alimentatie, afkoopsom).
- **Onvolledige zin** (ALTIJD volledigheid, NOOIT juridisch): een zin die wél aanwezig is maar geen concrete afspraak, verplichting of bepaling bevat.
- **Onlogisch rekeningnummer** (2026-07): aaneensluitende of herhalende cijfers (bijv. 010203040, 123456789, 0000000000) zijn testgetallen — rapporteer als niet-ingevuld rekeningnummer onder volledigheid.
- **Onlogische datum** (2026-07): jaar vóór 1900 of na 2099, of duidelijk onmogelijke datum (bijv. 01-01-0001, 00-00-0000) is plaatshouder — rapporteer als niet-ingevulde datum onder volledigheid. Herkenbaar aan: de zin noemt een onderwerp maar zegt niet wat partijen zijn overeengekomen. Voorbeeld: "Afspraken over een betaling of een splitsing van het rentecontract." — er staat geen afspraak, alleen een aankondiging.

> **Valkuil**: Vroeger checkte de structuur-call alleen aanwezigheid van secties, niet de inhoudelijke volledigheid. De `sysStructuur`-prompt bevat nu expliciete instructie voor ONTBREKEND én ONVOLLEDIG.

> **Valkuil (2026-07)**: Niet-ingevulde velden (sjabloonresten) en onvolledige zinnen werden regelmatig als "juridisch" geclassificeerd. De prompt bevat nu expliciete NOOIT-regels: lege velden en inhoudelijk lege zinnen zijn ALTIJD volledigheid, ook als het onderwerp juridisch relevant is.

**Geen bevinding:**
- Onderwerpen die aantoonbaar niet van toepassing zijn (geen koopwoning → geen woningparagraaf)
- Detail-invulling die partijen bewust openlaten, mits benoemd
- Zaken die geregeld zijn in een ánder document in het dossier, mits het te analyseren document
  daar correct naar verwijst (zie sectie Verificatieplicht hieronder)

Raadpleeg `references/verplichte-onderdelen.md` voor de checklist per documenttype.

### 4. balans
Toetst of de afspraken niet eenzijdig nadelig zijn voor één partij, met oog voor de
mediationcontext (informed consent, geen misbruik van omstandigheden).

**Wel een bevinding:**
- Substantieel afwijken van wettelijke maatstaven (alimentatie, verdeling) zonder motivering in het document
- Eenzijdige afstand van rechten zonder compensatie of toelichting
- Asymmetrische boete- of verplichtingsclausules

**Geen bevinding:**
- Afwijkingen die in het document gemotiveerd zijn ("partijen zijn zich bewust dat...")
- Ongelijke uitkomsten die volgen uit ongelijke situaties (inkomensverschil → verschillende bijdragen)

Balansbevindingen zijn altijd signalerend, nooit normerend: formuleer als aandachtspunt
voor de mediator, niet als oordeel over partijen.

### 5. grammatica
Toetst taal, consistentie en verzorging voor zover die de betekenis of professionaliteit raken.

**Wel een bevinding:**
- Spelling- en tikfouten (bijv. 'invullen' waar 'invulling' bedoeld is)
- Foutieve of onvolledige zinsconstructies (bijv. ontbrekend hoofdwerkwoord: 'Moeder die ze naar school brengt' is geen volledige zin)
- Fouten die de betekenis veranderen of onduidelijk maken
- Inconsistente namen, bedragen in cijfers vs. letters die verschillen, wisselende terminologie voor hetzelfde begrip
- Verkeerde partij-aanduiding (naam van de man waar de vrouw wordt bedoeld)
- Rapporteer ELKE tikfout/grammaticakwestie als een APART issue (niet bundelen)
- Dubbele woorden (bijv. "Land Rover Land Rover", "de de kinderen") = expliciete scanlijst in prompt
- **Roepnamen (voornamen) zijn geldige verwijzingen** — "Peter" of "Peters" als verwijzing naar "Peter Adriaan Dikkeschei" is NOOIT een naamsfout of onbekende partijverwijzing. Promptregel (2026-07): als een partij met volledige naam is geïntroduceerd, is de voornaam of bezitsvorm ervan een geldige verkorte aanduiding.
- **Tweede voornamen weglaten is normaal** (2026-07): als partij wordt geïntroduceerd als "Willem David ter Kulve", zijn "Willem ter Kulve" en "W. ter Kulve" geldige verkorte aanduidingen — ook in bankrekening-vermeldingen of kopregels. NOOIT als naaminconsistentie rapporteren.
- **Bedragopmaak — verplicht onderscheid** (2026-07): (a) ontbrekend €-teken = echt probleem; (b) ontbrekende ',-' suffix terwijl €-teken WEL aanwezig is (bijv. "€ 5.569" vs "€ 5.569,-") = opmaakinconsistentie. NOOIT beweren dat €-teken ontbreekt als het er wél staat. Rekeningnummers/kenmerken altijd exact citeren en koppelen aan het juiste bedrag — nooit hetzelfde kenmerk voor twee bedragen.

> **Valkuil — HANDTEKENINGEN (2026-07):** Drie strikte regels:
> 1. De sectie "Ondergetekenden" of "Partijen" bovenaan het document is de **partij-introductie** (naam, geboortedatum, adres) — NOOIT een handtekeningenblok.
> 2. Een handtekening-issue mag alleen worden gerapporteerd als het **ondertekeningsblok onderaan** (herkenbaar aan "Aldus overeengekomen", "Handtekening:", lege signeerregels, namen als slotblok) ontbreekt of leeg is. Passage = altijd uit dit slotblok.
> 3. CONCEPT-watermerk in document → ontbrekende handtekeningen zijn LAAG ernst (concepten worden pas definitief ondertekend).

> **Genderregel (2026-07, aangescherpt):** Een genderkwestie mag uitsluitend worden gerapporteerd als in **beide** passages het individu **bij naam of vaste aanduiding** expliciet wordt benoemd én tegenstrijdige voornaamwoorden worden gebruikt. Je mag NOOIT redeneren dat een naamloze paragraaf over een specifiek kind gaat. Bij meerdere kinderen (zoon én dochter) geldt dit nog strenger: 'hij' kan de zoon betreffen, 'haar' de dochter — dat is geen inconsistentie. Concreet vals-positief patroon dat nooit geflagged mag worden: 'Pascal … hij heeft begeleiding' in alinea A, en 'haar dochter' of 'menstruatie' in alinea B — alinea B noemt Pascal niet bij naam en kan over het andere kind gaan.

> **Valkuil**: de vorige prompt omschreef `grammatica` als "vage verwijzingen en inconsistente datums" — dat zijn semantische issues, geen taalfouten. Spelling- en syntaxfouten werden hierdoor gemist. De `sysBalansGram`-prompt bevat nu een expliciete scanlijst inclusief tikfouten en onvolledige zinnen.

> **Valkuil — incoherentie tussen velden**: na unbundeling (elk issue apart) kan Claude de velden `onderwerp`, `bevinding` en `passage` van VERSCHILLENDE fouten door elkaar halen — bijv. `onderwerp` over "Land Rover Land Rover" maar `bevinding`+`passage` over social media. Veroorzaakt: gele markering landt op verkeerde plek én de kaart is onbegrijpelijk. Fix: prompt bevat expliciete eis "ALLE drie velden moeten over DEZELFDE fout gaan" + tool-schema bevat `description` op `passage`-veld die dit herhaalt.

**Geen bevinding:**
- Stijlvoorkeuren zonder betekenisgevolg

---

## MfN-score (apart structured object — geen gewone issue)

De MfN-normtoets levert GEEN issues op in de gewone issues-array.
In plaats daarvan retourneert de structuur-call een apart `mfn_score` object:

```json
{
  "score_aanwezig": 10,
  "score_totaal": 15,
  "elementen": [
    { "element": "Kinderalimentatie: berekening conform Tremanormen", "status": "aanwezig", "toelichting": "..." },
    { "element": "Pensioenverevening conform WVPS", "status": "ontbreekt", "toelichting": "..." }
  ],
  "extra_elementen": ["Niet-wijzigingsbeding partneralimentatie"]
}
```

`status` is altijd één van: `aanwezig` | `onvolledig` | `ontbreekt`.
`score_aanwezig` = aantal "aanwezig". `score_totaal` = vaste lengte van de MfN-elementenlijst.

De MfN-elementenlijsten per documenttype staan in `api/analyseer.js` (variabele `MFN_ELEMENTEN`).
Raadpleeg `references/mfn-normen.md` voor de onderliggende gedragsregels.

---

## Categorietoewijzing

Elke bevinding krijgt exact één waarde in `dimensies`. Bij overlap geldt deze voorrangsvolgorde:
**juridisch > conflicten > volledigheid > balans > grammatica.**
Dus: een tegenstrijdigheid die ook juridisch ongeldig is → `juridisch`.
Dupliceer nooit dezelfde bevinding over meerdere dimensies.

---

## Ernst-niveaus

Drie niveaus. Zie `references/severity.md` voor criteria en grensgevallen. Kort:
- **hoog** — juridisch ongeldig, niet-homologeerbaar, of dwingend recht geschonden; mediator móet handelen
- **midden** — geschilrisico, onbalans, of ontbrekend gebruikelijk onderdeel; mediator behoort te beoordelen
- **laag** — verbetering mogelijk, geen risico; mediator kan negeren

---

## Analysiscontext: wat Claude ziet

### Pseudonimisering
Documenten worden vóór verzending naar de API automatisch pseudonimiseerd:
- Namen → **nep-namen** (bijv. "Thomas Bergman", "Lisette Hartwijk", "Finn")
  - Geen `[PERSOON_A]`-placeholders meer — nep-namen voorkomen dat Claude een placeholder
    per ongeluk herhaalt in zijn output, wat na de-pseudonimisering een vals alarm geeft.
  - Nep-namenpool: `bouwAnonMap()` in `index.html`. Legacy-placeholders ([PERSOON_A] etc.)
    worden nog herkend door `herstelAnonObj()` voor backward-compat met bestaande data.
  - **Component-mapping (2025-07):** `NEP_PERSONEN` zijn `{fn, an}`-objecten. Voornaam
    mapt naar `nep.fn` ("Thomas"), achternaam naar `nep.an` ("Bergman") — NIET naar de
    volledige nep-naam. Zo wordt "Martijn Jasperse" (verkorte naam) → "Thomas Bergman"
    (één keer). Vroeger (string): beide deelvervangingen → "Thomas Bergman Thomas Bergman"
    → vals alarm "dubbele naam" in grammatica-bevinding.
  - **herstelAnonObj sorteert** naarEcht-entries op lengte (langste eerst): "Thomas Bergman"
    wordt vervangen vóór "Thomas" of "Bergman" afzonderlijk — anders dubbele de-anonimisering.
- **Roepnaam-detectie (2026-07):** `bouwAnonMap()` detecteert roepnamen uit bestandsnamen/dossiernaam. Als "Sander" in de bestandsnaam staat bij "Alexander Lenders", wordt "sander" geregistreerd als alias voor dezelfde nep-voornaam. `naarEcht` wordt bijgewerkt: `nep.fn` → "Sander" (de roepnaam, i.p.v. de formele voornaam "Alexander"). Dit voorkomt dat Claude "Sander" als onbekende persoon ziet.
  - **Roepnamen-prompt (2026-07, bijgewerkt)**: Als roepnamen gevonden zijn, injecteert `api/analyseer.js` een `roepnamenNota` in `sysStructuur` én `sysBevindingen`. Drie verplichte regels bij roepnaam-issues: (1) ONDERSCHEID officieel vs. roepnaam — officiële naam staat in introductiezin, roepnaam is de afwijkende aanduiding elders; (2) PASSAGE = de zin ELDERS in het document (de introductiezin is correct); (3) AANBEVELING altijd "Voeg 'ook te noemen [roepnaam]' toe aan de introductiezin", nooit de roepnaam tot hoofdnaam maken.
  - **Huidige datum in prompt (2026-07):** `api/analyseer.js` injecteert `vandaag = new Date().toLocaleDateString('nl-NL', ...)` in de `pseudonimiseringNota`. Claude gebruikt dit voor temporele beoordeling (peildata, ondertekeningsdatums, ingangsdatums). Zonder datum markeerde Claude alle verleden-peildata als "in de toekomst".
- Adressen/woonplaatsen → `[ADRES]`, `[WOONPLAATS]`, `[POSTCODE]`
- Persoonsnummers → `[BSN]`, `[TEL]`, `[EMAIL]`
- IBAN: bewust NIET gemaskeerd (Claude heeft het nodig voor rekeningnummer-verificatie)
- **IBAN-fix (2026-07):** BSN-regex heeft negatieve lookbehind `(?<![A-Z] )` om te voorkomen dat de 9-cijferige IBAN-accountblock (bijv. "ASNB 010203040") als BSN wordt gemaskeerd.

**Gevolg voor bevindingen:**
- Maak GEEN issue over verkeerd formaat van BSN/TEL (placeholder heeft geen formaat)
- Maak GEEN issue over ontbrekend adres of woonplaats (placeholder staat WEL in het origineel)
- Gebruik in `aanbeveling` altijd `[WOONPLAATS]` / `[ADRES]` — nooit echte plaatsnamen

### Cross-document context
**Vanaf 2025-07: andere documenten worden NIET meer meegegeven als context.**

> **Motivatie**: het meegeven van de tekst van het andere document (bijv. OP als context
> bij analyse van Convenant) veroorzaakte structurele cross-document besmetting — issues
> die alleen in het andere document staan, werden gerapporteerd onder het verkeerde document.
> Dit vereiste 4 filterlagen (server-side passage-filter, client-side label-filter,
> concept-filter, plus heuristische Haiku-consolidatie).

In plaats daarvan:
- Claude analyseert elk document in isolatie.
- Externe verwijzingen ("zie het ouderschapsplan") worden afgehandeld met de minimale regel:
  "rapporteer hooguit als `laag` dat het referentiedocument ontbreekt als bijlage."
- **Cross-doc verificatie is geïmplementeerd** als een aparte Sonnet-call ná alle per-document analyses (tool: `registreer_cross_doc_bevindingen`). Issues bevatten het verplichte veld `betreft_documenten` (`["convenant"]`, `["ouderschapsplan"]`, of `["convenant","ouderschapsplan"]`). De server stuurt per document alleen de relevante subset als `cross_doc`-SSE-event. Zie `api/analyseer.js` regels 571–631 voor de implementatie.

### Verificatieplicht bij "ontbreekt"-claims
Voordat je rapporteert dat iets ontbreekt:
1. Doorzoek de VOLLEDIGE documenttekst actief
2. Controleer bij genummerde verwijzingen ("zie punt 21") of dat nummer ELDERS in het document voorkomt als sectietitel of genummerd lid
3. Bij aantoonbaar doorlopende sectienummering: ga er altijd vanuit dat hogere nummers bestaan
4. Rapporteer een afwezigheid uitsluitend als je na actief zoeken bevestigt dat het er absoluut niet in staat

### Verificatieplicht bij berekende en normatieve claims

Toegevoegd 19 augustus 2026, na een issue met de titel *"Zorgkorting-percentages optellen
tot meer dan 100%"* waarvan de eigen bevinding `30% + 39% = 69%` berekende. De kop
weerlegde zichzelf in de eerste zin, en omdat de ernst op de kop wordt bepaald stond het
issue op `hoog`.

- Reken elke bewering over bedragen, percentages of termijnen voor **in de bevinding**.
- Spreekt de uitkomst de bewering tegen, dan vervalt het issue — of blijft alleen de
  observatie over die wél onderbouwd is, met een titel die dáárbij past.
- Een afwijking van een standaardwaarde is een afwijking, geen overtreding. Claim alleen
  een normschending als die norm in de aangeleverde kennisbank staat.

### Samenhang tussen kop en bevinding

`onderwerp` was tot 19 augustus 2026 het enige veld in `issueItem` **zonder beschrijving**
(`{ type: 'string' }`), terwijl `passage` ernaast een beschrijving van vijf regels had die
zelfs eist dat het citaat overeenkomt met "de fout in onderwerp en bevinding". De samenhang
werd dus verondersteld maar nergens opgelegd, en zonder sturing drijven koppen af naar
alarmerend.

> De regel *"NOOIT: onderwerp over fout X, maar bevinding/passage over een totaal ander
> onderwerp Y"* bestond al — maar alleen in het **grammaticablok**. Hij staat nu ook in
> `stabielGedeeld`, dus voor alle calls. Let hierop bij nieuwe promptregels: een instructie
> die maar in één call-blok staat, geldt niet voor de rest.

**Vangnet:** `controleer_consistentie` (Haiku, `api/_consistentie.js`) draait ná de
consolidatie over de hele issuelijst per document en herschrijft koppen die meer beweren
dan hun bevinding aantoont. Hij verwijdert nooit een issue en verlaagt de ernst hooguit één
stap — nooit omhoog, want hij beoordeelt samenhang, geen juridische ernst. Mislukt de
aanroep, dan gaat de lijst ongewijzigd door.

> **Waarom niet de diepe verificatie overal draaien?** Die kost op `claude-fable-5` ruwweg
> $0,15 per issue — bij 26 issues meer dan tien keer de kosten van de hele analyse — en ze
> krijgt de documenttekst niet mee, dus valse "dit ontbreekt"-claims vangt ze evenmin.
> Bovendien is `claude-fable-5` niet beschikbaar onder zero data retention; de ZDR-aanvraag
> bij Anthropic staat nog open. De consistentiecontrole kost één Haiku-aanroep per document.

### OOXML auto-nummering in tekst zichtbaar voor Claude

**Technische achtergrond (niet aanpassen zonder `index.html` te lezen):**
Word-documenten gebruiken `<w:numPr>` auto-nummering in plaats van getypte nummers. `mammoth.extractRawText` verwijdert deze nummering → Claude ziet "Partneralimentatie" i.p.v. "2.2 Partneralimentatie" → valse "ontbreekt"-issues en onverifieerbare kruisverwijzingen.

**Fix** (`injecteerNummering` in `src/docx/nummering.js`, aangeroepen vanuit `bewerkDocx` in `index.html`):
Leest `word/numbering.xml`, lost `<w:numPr>`-verwijzingen op en schrijft berekende nummerlabels (bijv. `"2.3\t"`) als expliciete `<w:r><w:t>`-runs in de DOCX terug — vóórdat `mammoth.extractRawText` de tekst extraheert. Daarna gaat de `<w:numPr>` weg, anders nummert de viewer er nog eens overheen ("10. 10. Vakanties"). Hierdoor ziet Claude:
- "2.3\tPartneralimentatie" i.p.v. "Partneralimentatie"
- Kan "zie artikel 2.2.3" verifiëren omdat sectie 2.2.3 zichtbaar is in de tekst

> **Kernregel**: `bewerkDocx(blob)` draait op **élke** DOCX — ook een die de gebruiker
> zelf uploadt. `bewerkDocx(blob, { artefacten: true })` voegt daar de Adobe-opruiming
> aan toe en hoort **alleen** na een PDF→DOCX-conversie. Die opruiming (voetteksten weg,
> gebroken zinnen plakken, lege alinea's opruimen) is geschreven tegen Adobe's
> eigenaardigheden en richt op een handgeschreven Word-bestand juist schade aan.

> **Valkuil**: tot 23 augustus 2026 draaide de nummering-injectie alléén na een
> Adobe-conversie. Een als DOCX geüpload ouderschapsplan leverde daardoor drie
> verschillende teksten op: Word toonde "1. Ouderlijk gezag", Claude las "Ouderlijk
> gezag", en de viewer rekende zelf "(A) Ouderlijk gezag" uit. Passages werden niet
> teruggevonden omdat Claude en de viewer nooit dezelfde tekst zagen. Elk pad dat een
> DOCX in `docxPerBestandsnaam` zet moet daarom door `bewerkDocx` — en elk pad dat een
> DOCX toont of exporteert moet de blob uit die cache verkiezen boven het ruwe bestand.

Formaatondersteuning: `decimal`, `lowerLetter`, `upperLetter`, `lowerRoman`, `upperRoman`, `none`. Bullets worden overgeslagen (geen nummerlabel). `lvlText`-templates als `%1.%2.` worden opgelost, en een `<w:lvlOverride>` (ander formaat of afwijkende start) wint van het abstracte niveau. Getest in `tests/unit/nummering.test.js` tegen echte OOXML.

---

## Client-side deduplicatie (`dedupIssues` in `index.html`)

Na de Claude-calls worden issues in de browser samengevoegd via `dedupIssues()`. Dit is de enige dedup-laag — `analyseer.js` doet géén deduplicatie meer. De functie doorloopt vijf passes:

| Pass | Methode | Wat het vangt |
|------|---------|---------------|
| 1 | Exacte titelmatch | Identieke `onderwerp`-tekst |
| 2 | Exacte passagematch | Identiek verbatim citaat (≥15 tekens) |
| **2b** | **Passage-substring** (2026-07) | **Eén passage is een deelstring van de andere — bijv. kortere variant van hetzelfde citaat** |
| 3 | Bedragpaar-fingerprint | Zelfde set van ≥2 EUR-bedragen in onderwerp/bevinding |
| 3b | Datumpaar-fingerprint | Zelfde set van ≥2 datums in onderwerp |
| 4 | Jaccard-titelsimilariteit | Titels met ≥50% overlap op kernwoorden (>4 tekens, niet in stoplijst) |

> **Valkuil (opgelost 2026-07):** Issues #7 en #8 over hetzelfde probleem (bijv. "Peters kant") hadden verschillende titels (Jaccard < 0.5) maar overlappende passages. Pass 2 miste dit omdat de passages niet *identiek* maar *gedeeltelijk* overlapten. Pass 2b vangt dit nu door substring-check.

---

## Wat deze skill NIET dekt

- Technische implementatie van de SSE-stream, prompt-caching of Supabase-integratie → zie `CLAUDE.md` en `api/analyseer.js`
- Exportformaten (DOCX, RTF) → zie `api/export-docx.js`
- Concept-generatie flow (zoek_tekst/vervang_door, cross-doc filter, accept/afwijs) → zie `concept-generatie/SKILL.md`
