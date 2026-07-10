---
name: screening-categorien
description: Definities, criteria en outputconventies voor de zes screeningcategorieën van Clausula (Juridisch, Conflicten, Volledigheid, Balans, Grammatica, MfN-normtoets). Gebruik deze skill ALTIJD bij het schrijven of aanpassen van screening-prompts, categoriedefinities, severity-logica, tool-use schema's voor screeningoutput, of bij het beoordelen van convenanten en ouderschapsplannen — ook als de gebruiker niet expliciet "screening" zegt maar wel werkt aan bevindingen, toetsing, of de kwaliteit van screeningresultaten.
---

# Clausula Screeningcategorieën

Deze skill is de enige bron van waarheid voor wat elke screeningcategorie betekent,
wat wél en níet een bevinding is, en hoe bevindingen worden gestructureerd.
Wijzigingen aan screening-logica moeten consistent zijn met dit bestand;
wijkt de code of prompt af, meld dat dan expliciet aan de gebruiker.

## De zes categorieën

### 1. Juridisch
Toetst of afspraken juridisch correct, geldig en afdwingbaar zijn naar Nederlands recht.

**Wel een bevinding:**
- Afspraken in strijd met dwingend recht (bijv. afstand van kinderalimentatie, art. 1:400 lid 2 BW)
- Onjuiste of verouderde wetsverwijzingen
- Fiscaal onjuiste constructies (partneralimentatie, verrekening pensioen, eigenwoningregeling)
- Afspraken die de rechter bij homologatie waarschijnlijk niet accepteert
- Ontbrekende juridisch verplichte elementen (bijv. nihilbeding zonder correcte formulering)

**Geen bevinding:**
- Afspraken die juridisch geldig maar ongebruikelijk zijn (dat is hooguit Balans of Conflicten)
- Stilistische keuzes in juridische formulering

### 2. Conflicten
Toetst op interne tegenstrijdigheden en toekomstige geschilrisico's binnen het document.

**Wel een bevinding:**
- Twee bepalingen die elkaar tegenspreken (bedrag, datum, verdeling)
- Vage formuleringen die tot uitleggeschillen leiden ("in redelijkheid", "zo veel mogelijk" zonder invulling)
- Afspraken zonder geschillenregeling waar die voorzienbaar nodig is
- Verwijzingen naar bijlagen of artikelen die niet bestaan

**Geen bevinding:**
- Bewust open geformuleerde intentie-afspraken in een ouderschapsplan (mits als zodanig herkenbaar)

### 3. Volledigheid
Toetst of alle onderwerpen die in dit type document thuishoren, geregeld zijn.

**Wel een bevinding:**
- Ontbrekend verplicht onderdeel (ouderschapsplan: zorgverdeling, kinderalimentatie, informatie/consultatie — art. 815 lid 2 Rv)
- Ontbrekende gebruikelijke onderdelen gegeven de situatie (eigen woning aanwezig maar geen woningverdeling; pensioen niet genoemd terwijl partijen ouder dan ~30 met dienstverbanden)
- Ontbrekende ingangsdata, indexeringsclausules, of einde-afspraken

**Geen bevinding:**
- Onderwerpen die aantoonbaar niet van toepassing zijn (geen koopwoning → geen woningparagraaf)
- Detail-invulling die partijen bewust openlaten, mits benoemd

Raadpleeg `references/verplichte-onderdelen.md` voor de checklist per documenttype.

### 4. Balans
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

### 5. Grammatica
Toetst taal, consistentie en verzorging voor zover die de betekenis of professionaliteit raken.

**Wel een bevinding:**
- Fouten die de betekenis veranderen of onduidelijk maken
- Inconsistente namen, bedragen in cijfers vs. letters die verschillen, wisselende terminologie voor hetzelfde begrip
- Verkeerde partij-aanduiding (naam van de man waar de vrouw wordt bedoeld)

**Geen bevinding:**
- Losse typfouten zonder betekenisgevolg → maximaal bundelen in één bevinding met opsomming
- Stijlvoorkeuren

### 6. MfN-normtoets
Toetst tegen de MfN-gedragsregels en het mediationreglement: vrijwilligheid,
vertrouwelijkheid, onpartijdigheid van de mediator, en correcte procesafspraken.

**Wel een bevinding:**
- Ontbrekende of onjuiste geheimhoudingsbepaling
- Formuleringen die de onpartijdigheid van de mediator compromitteren
- Ontbrekende verwijzing naar vrijwilligheid / mogelijkheid tot beëindiging waar het reglement dat vereist
- Strijdigheid met de mediationovereenkomst

**Geen bevinding:**
- Zaken die het MfN-reglement niet raken maar elders thuishoren (verwijs naar de juiste categorie)

Raadpleeg `references/mfn-normen.md` voor de relevante gedragsregels.

## Categorietoewijzing

Elke bevinding krijgt exact één categorie. Bij overlap geldt deze voorrangsvolgorde:
**Juridisch > MfN-normtoets > Conflicten > Volledigheid > Balans > Grammatica.**
Dus: een tegenstrijdigheid die ook juridisch ongeldig is → Juridisch.
Dupliceer nooit dezelfde bevinding over meerdere categorieën.

## Severity

Drie niveaus. Zie `references/severity.md` voor criteria en grensgevallen. Kort:
- **kritiek** — juridisch ongeldig, niet-homologeerbaar, of dwingend recht geschonden; mediator móet handelen
- **waarschuwing** — geschilrisico, onbalans, of ontbrekend gebruikelijk onderdeel; mediator behoort te beoordelen
- **info** — verbetering mogelijk, geen risico; mediator kan negeren

## Outputconventies

Bevindingen worden ALTIJD via het tool-use mechanisme gestructureerd geretourneerd
(nooit JSON-als-tekst — bekende bron van malformed responses). Elke bevinding bevat:

- `categorie` — een van de zes, exact gespeld zoals hierboven
- `severity` — kritiek | waarschuwing | info
- `titel` — max ~10 woorden, concreet ("Nihilbeding kinderalimentatie is nietig")
- `toelichting` — 2–5 zinnen: wat, waarom een probleem, met wetsartikel of norm indien van toepassing
- `citaat` — de letterlijke passage uit het document (voor highlighting in de UI)
- `suggestie` — concrete herformulering of handeling voor de mediator (optioneel bij info)

Toelichtingen richten zich tot de mediator (professional, Nederlands, u-vorm vermijden — 
schrijf neutraal-zakelijk). Nooit juridisch advies aan partijen formuleren; altijd
"aandachtspunt voor de mediator".

Zie `references/voorbeelden.md` voor goede en slechte voorbeeldbevindingen per categorie.
