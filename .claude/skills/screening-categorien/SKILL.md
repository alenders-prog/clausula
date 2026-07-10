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

## Architectuur: drie parallelle Claude-calls per document

Elke analyse bestaat uit drie gelijktijdige Sonnet-calls, elk gericht op één dimensie:

| Call | Dimensies die worden gevonden | Tool |
|------|-------------------------------|------|
| **structuur** | `volledigheid` + aparte `mfn_score` | `registreer_structuur` |
| **juridisch** | `juridisch` | `registreer_juridisch` |
| **balans** | `balans`, `grammatica`, `conflicten` | `registreer_balans_grammatica` |

Daarna voegt een Haiku-call semantisch verwante issues samen (cross-call dedup).

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

**Wel een bevinding:**
- Twee bepalingen die elkaar tegenspreken (bedrag, datum, verdeling)
- Vage formuleringen die tot uitleggeschillen leiden ("in redelijkheid", "zo veel mogelijk" zonder invulling)
- Afspraken zonder geschillenregeling waar die voorzienbaar nodig is
- Verwijzingen naar bijlagen of artikelen die niet bestaan

**Geen bevinding:**
- Bewust open geformuleerde intentie-afspraken in een ouderschapsplan (mits als zodanig herkenbaar)

### 3. volledigheid
Toetst of alle onderwerpen die in dit type document thuishoren, geregeld zijn.

**Wel een bevinding:**
- Ontbrekend verplicht onderdeel (ouderschapsplan: zorgverdeling, kinderalimentatie, informatie/consultatie — art. 815 lid 2 Rv)
- Ontbrekende gebruikelijke onderdelen gegeven de situatie (eigen woning aanwezig maar geen woningverdeling; pensioen niet genoemd terwijl partijen ouder dan ~30 met dienstverbanden)
- Ontbrekende ingangsdata, indexeringsclausules, of einde-afspraken

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
- Fouten die de betekenis veranderen of onduidelijk maken
- Inconsistente namen, bedragen in cijfers vs. letters die verschillen, wisselende terminologie voor hetzelfde begrip
- Verkeerde partij-aanduiding (naam van de man waar de vrouw wordt bedoeld)

**Geen bevinding:**
- Losse typfouten zonder betekenisgevolg → maximaal bundelen in één bevinding met opsomming
- Stijlvoorkeuren

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
- Namen → `[PERSOON_A]`, `[PERSOON_B]`, `[KIND_1]` etc.
- Adressen/woonplaatsen → `[ADRES]`, `[WOONPLAATS]`, `[POSTCODE]`
- Financiële/persoonlijke nummers → `[IBAN]`, `[BSN]`, `[TEL]`, `[EMAIL]`

**Gevolg voor bevindingen:**
- Maak GEEN issue over verkeerd formaat van IBAN/BSN (placeholder heeft geen formaat)
- Maak GEEN issue over ontbrekend adres of woonplaats (placeholder staat WEL in het origineel)
- Gebruik in `aanbeveling` altijd `[WOONPLAATS]` / `[ADRES]` — nooit echte plaatsnamen

### Cross-document context
Als meerdere documenten zijn geüpload (bijv. Convenant + Ouderschapsplan), ziet elke
document-analyse de andere documenten als `ANDERE DOCUMENTEN IN DIT DOSSIER`.

**Verificatieregel bij externe verwijzingen** ("zie het ouderschapsplan", "conform bijlage X"):
- Ander document aanwezig ÉN bevat de afspraak → GEEN volledigheids-issue; hooguit `laag` over formele bijlagenverwijzing
- Ander document aanwezig maar afspraak ontbreekt daarin → issue in DÁT document
- Ander document ontbreekt volledig → issue: document als bijlage toevoegen

### Verificatieplicht bij "ontbreekt"-claims
Voordat je rapporteert dat iets ontbreekt:
1. Doorzoek de VOLLEDIGE documenttekst actief
2. Controleer bij genummerde verwijzingen ("zie punt 21") of dat nummer ELDERS in het document voorkomt als sectietitel of genummerd lid
3. Bij aantoonbaar doorlopende sectienummering: ga er altijd vanuit dat hogere nummers bestaan
4. Rapporteer een afwezigheid uitsluitend als je na actief zoeken bevestigt dat het er absoluut niet in staat

---

## Wat deze skill NIET dekt

- Technische implementatie van de SSE-stream, prompt-caching of Supabase-integratie → zie `CLAUDE.md` en `api/analyseer.js`
- De deduplicatie/consolidatie-logica (Haiku-call na de drie parallelle calls) → zie `api/analyseer.js`
- Exportformaten (DOCX, RTF) → zie `api/export-docx.js`
