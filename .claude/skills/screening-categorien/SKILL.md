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

## Architectuur: twee parallelle Claude-calls per document

Elke analyse bestaat uit twee gelijktijdige Sonnet-calls:

| Call | Dimensies die worden gevonden | Tool |
|------|-------------------------------|------|
| **structuur** | `volledigheid` + aparte `mfn_score` | `registreer_structuur` |
| **bevindingen** | `juridisch`, `balans`, `grammatica`, `conflicten` | `registreer_bevindingen` |

> **Architectuurkeuze (2025-07):** Voorheen 3 calls (structuur + juridisch + balans/grammatica)
> met een vierde Haiku-consolidatiestap voor cross-call deduplicatie. Samengevoegd tot 2 calls
> omdat:
> - Claude in één call zijn eigen output kan dedupliceren → consolidatie niet meer nodig
> - Minder infrastructurele complexiteit (geen preGroepeerOpPrefix, geen Haiku-call)
> - Kortere doorlooptijd (~30-40% minder API-latency voor het niet-structuur-deel)
> - De kruisref-context van het andere document is ook verwijderd (zie §Cross-document context)

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

### 2. conflicten
Toetst op interne tegenstrijdigheden en toekomstige geschilrisico's binnen het document.

**Wel een bevinding — op ALLE niveaus:**
- **Inter-artikel**: artikel X en artikel Y spreken elkaar tegen over hetzelfde onderwerp
- **Intra-sectie**: twee opeenvolgende zinnen of bullets binnen hetzelfde onderdeel die het tegenovergestelde beweren (bijv. "uitsluitend mondeling" gevolgd door "schriftelijk vastgelegd"; vakantieregeling met intern inconsistente wekenaantallen of data)
- **Bedrag/datum**: hetzelfde bedrag of dezelfde datum wordt op twee plaatsen anders vermeld
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

> **Valkuil**: Vroeger checkte de structuur-call alleen aanwezigheid van secties, niet de inhoudelijke volledigheid. De `sysStructuur`-prompt bevat nu expliciete instructie voor ONTBREKEND én ONVOLLEDIG.

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
- Adressen/woonplaatsen → `[ADRES]`, `[WOONPLAATS]`, `[POSTCODE]`
- Persoonsnummers → `[BSN]`, `[TEL]`, `[EMAIL]`
- IBAN: bewust NIET gemaskeerd (Claude heeft het nodig voor rekeningnummer-verificatie)

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
- Cross-doc verificatie kan later als gerichte micro-call worden toegevoegd.

### Verificatieplicht bij "ontbreekt"-claims
Voordat je rapporteert dat iets ontbreekt:
1. Doorzoek de VOLLEDIGE documenttekst actief
2. Controleer bij genummerde verwijzingen ("zie punt 21") of dat nummer ELDERS in het document voorkomt als sectietitel of genummerd lid
3. Bij aantoonbaar doorlopende sectienummering: ga er altijd vanuit dat hogere nummers bestaan
4. Rapporteer een afwezigheid uitsluitend als je na actief zoeken bevestigt dat het er absoluut niet in staat

### OOXML auto-nummering in tekst zichtbaar voor Claude

**Technische achtergrond (niet aanpassen zonder `index.html` te lezen):**
Word-documenten (m.n. gegenereerd via Adobe PDF→DOCX) gebruiken soms `<w:numPr>` auto-nummering in plaats van getypte nummers. `mammoth.extractRawText` verwijdert deze nummering → Claude ziet "Partneralimentatie" i.p.v. "2.2 Partneralimentatie" → valse "ontbreekt"-issues en onverifieerbare kruisverwijzingen.

**Fix** (geïmplementeerd in `cleanupDocxArtefacten` in `index.html`):
De functie leest `word/numbering.xml`, lost `<w:numPr>`-verwijzingen op en schrijft berekende nummerlabels (bijv. `"2.3\t"`) als expliciete `<w:r><w:t>`-runs in de DOCX terug — vóórdat `mammoth.extractRawText` de tekst extraheert. Hierdoor ziet Claude:
- "2.3\tPartneralimentatie" i.p.v. "Partneralimentatie"
- Kan "zie artikel 2.2.3" verifiëren omdat sectie 2.2.3 zichtbaar is in de tekst

> **Valkuil**: `cleanupDocxArtefacten` wordt aangeroepen bij upload (achtergrond-conversie van PDF) én bij heranalyse. Als je de DOCX-blob uit de cache haalt (`docxPerBestandsnaam`) sla je de cleanup over — zie `api/analyseer.js` voor hoe de cache wordt gevuld met schone blobs.

Formaatondersteuning: `decimal`, `lowerLetter`, `upperLetter`, `lowerRoman`, `upperRoman`. Bullets worden overgeslagen (geen nummerlabel). `lvlText`-templates als `%1.%2.` worden correct opgelost.

---

## Wat deze skill NIET dekt

- Technische implementatie van de SSE-stream, prompt-caching of Supabase-integratie → zie `CLAUDE.md` en `api/analyseer.js`
- Exportformaten (DOCX, RTF) → zie `api/export-docx.js`
- Concept-generatie flow (zoek_tekst/vervang_door, cross-doc filter, accept/afwijs) → zie `concept-generatie/SKILL.md`
