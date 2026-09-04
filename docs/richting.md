# Waar Clausula heen kan — markt, aangrenzende functies, en wat de basis draagt

Opgesteld 2 september 2026, als voorwerk voor de vraag waar Clausula het komende jaar heen
gaat. Dat is een vraag die Alexander beantwoordt, niet ik; dit stuk levert wat ik kan
opzoeken en meten, zodat het antwoord niet op gevoel hoeft.

Drie delen: wat de markt doet, welke functies in het verlengde liggen, en waar de basis
óók voor te gebruiken zou zijn. Bij elk deel staat de architecturale gevolgtrekking,
want dat is uiteindelijk waar dit voor dient.

---

## 1. Wat de markt doet — en waarom Clausula er haaks op staat

### De naaste buren maken documenten; Clausula leest ze

**Mediationportaal** (Nieuwe Stap) laat cliënten een vragenformulier invullen, waarna de
mediator met één klik een convenant, vaststellingsovereenkomst en ouderschapsplan
genereert. Er is een cliëntportaal met dossier, documenten worden automatisch bij cliënten
opgevraagd, collega's kunnen meelezen, en de sjablonen worden twee keer per jaar met een
advocaat herijkt.

**ScheidingsWijze** doet iets vergelijkbaars: documentsoftware die gemaakte afspraken
automatisch in convenant en ouderschapsplan verwerkt.

Allebei zijn het **generatoren**: gestructureerde invoer in, document uit. Ze bezitten de
werkwijze en de cliëntrelatie.

Clausula werkt precies andersom. De invoer is een **bestaand document** — een PDF of DOCX,
uit welke bron dan ook — en de uitvoer is een oordeel erover. Dat is geen kleine nuance
maar de belangrijkste strategische eigenschap die er is:

> Omdat de invoer een bestánd is en geen werkwijze, kan Clausula documenten beoordelen die
> in Mediationportaal zijn gemaakt, door een advocaat zijn opgesteld, of uit een sjabloon
> van het kantoor zelf komen. Een generator kan dat niet: die kent alleen wat hij zelf
> heeft voortgebracht.

De keerzijde is even scherp: een generator zit in de werkwijze en wordt elke dag gebruikt.
Een beoordelaar wordt aan het eind gebruikt, en is makkelijker weg te laten.

### De bredere legal-tech markt zit op review, maar niet hier

De grote namen — Legora, Kira, Luminance, Harvey — doen contractreview en due diligence
voor advocatenkantoren. Groot, Engelstalig, generiek contractrecht. Het gebruik van AI bij
contractreview is in een jaar verdubbeld.

Wat daar níét zit: Nederlands familierecht, MfN-normen, convenant en ouderschapsplan als
documenttype, en de meerpartijdigheid die een mediator moet bewaken. Dat is de nis waar
Clausula in staat, en die is smal genoeg om door de grote spelers overgeslagen te worden.

Eén Nederlandse partij is het vermelden waard: **LegalPA** presenteert zich als de enige
Nederlandse aanbieder die juridische documenten automatisch anonimiseert. Clausula doet
dat al — en strenger, want de pseudonimisering gebeurt in de browser vóórdat er iets naar
een server gaat. Dat is nu een technisch detail; het kan een verkoopargument worden.

### Twee dingen die van buitenaf komen

**De EU AI Act** scherpt in 2026 de eisen aan transparantie en risicobeheersing aan: wees
tegenover cliënten duidelijk waar AI wordt ingezet, en zorg dat de verwerking en
documentatie op orde zijn. Clausula toont die melding al ("Antwoorden zijn aanbevelingen.
Eindverantwoordelijkheid ligt bij de mediator"). Wat nog ontbreekt zijn de
verwerkersovereenkomsten — die staan al op de backlog en worden hierdoor dringender.

**De MfN-regelgeving is per 1 januari 2026 gewijzigd**, en de staatssecretaris van Justitie
heeft de Tweede Kamer op 29 juni 2026 geïnformeerd over de voortgang van een **wettelijk
mediatorsregister**.

> **Nagetrokken op 4 september 2026 — en mijn eerste lezing hiervan was fout.**
>
> Hier stond: *"Komt dat er, dan komen er waarschijnlijk eisen aan dossiervorming en
> kwaliteitsborging mee. Een instrument dat aantoonbaar op MfN-normen toetst wordt daarmee
> eerder een verplichting dan een gemak."* Dat was speculatie op grond van twee zinnen uit
> een zoekresultaat, en ze houdt geen stand.
>
> Wat er per 1 januari 2026 werkelijk is veranderd: de losse toelichting is ín het
> reglement opgenomen en het aparte document is vervallen, "geschil" is in de definities
> vervangen door "kwestie", en de vertalingen zijn gepubliceerd. **Redactioneel en
> terminologisch.** Niets over dossiervorming, niets over kwaliteitsborging.
>
> En het wettelijk register: de brief van 29 juni gaat over de vóórtgang, met een
> kwartiermaker en een adviescommissie. In voorbereiding — geen wet, geen eisen, geen
> termijn.
>
> **Er is dus vandaag geen enkele externe verplichting die Clausula raakt.** Wie dit stuk
> leest en op grond hiervan haast maakt, doet dat op mijn gissing en niet op een feit.

Wat wél overeind blijft, maar op eigen kracht en met minder gewicht: `MFN_ELEMENTEN` is een
lijst in `api/analyseer.js` (en nog eens in `index.html`) waartegen een score van 9 op 15
wordt afgegeven. Wordt die lijst ooit herzien, dan is de score van een oude analyse niet
meer vergelijkbaar met een nieuwe, en er is niets dat vastlegt welke versie gold. Dat is
een klein maar echt gebrek in de vergelijkbaarheid over tijd — geen aanleiding tot een
verbouwing.

---

## 2. Functies die in het verlengde liggen

Op volgorde van hoe dicht ze bij de huidige basis staan.

### Dichtbij — de basis draagt het al grotendeels

**Versies vergelijken.** Er is al `versie_nr` en `versie_label` op een screening. Wat
ontbreekt is het scherm dat twee versies naast elkaar legt en zegt wat er is opgelost en
wat erbij is gekomen. Voor een mediator die een tweede ronde doet is dat het bewijs dat
zijn correcties werkten. De gegevens liggen er; het is vooral werk aan de viewer.

**Meer documenttypes binnen dezelfde flow.** Huwelijkse voorwaarden en samenlevings-
contracten zijn er al als contexttype. Ze tot volwaardig hoofddocument maken is prompts
plus `document_templates`-rijen — géén nieuwe architectuur.

**Een kantoorsjabloon als norm.** Nu toetst Clausula aan wet, MfN en interne consistentie.
Een kantoor met een eigen huisstijl-convenant zou daar zijn eigen sjabloon naast willen
leggen: "wijkt dit af van hoe wij het doen?" De `document_templates`-tabel is daar al de
juiste plek voor.

### Middellang — vraagt een nieuw stuk, maar past in de vorm

**Arbeidsmediation.** Dit is de opvallendste. MfN-registermediators doen niet alleen
familiezaken maar ook arbeids- en zakelijke mediation, en de vaststellingsovereenkomst bij
ontslag is een sterk geformaliseerd document: opzegtermijn, transitievergoeding,
finale kwijting, concurrentiebeding, WW-veiligheid. Precies het soort tekst waar een
checklist-toets werkt.

Het is dezelfde mediator, dezelfde werkwijze, een ander rechtsgebied. Dat maakt het de
goedkoopste marktuitbreiding die er is — mits de architectuur het toelaat, en daar zit
het probleem (zie deel 3).

**Een oordeel dat je kunt overleggen.** Een ondertekend, gedateerd rapport dat aantoont
dat een document is getoetst, met welke normversie. Bij een wettelijk register of een
klacht is dat waardevoller dan een schermweergave.

### Verderweg — ander product

**Cliëntportaal en werkwijze.** Dat is het terrein van Mediationportaal, en het betekent
concurreren op hun sterkte in plaats van de eigen. Ik zou het niet doen zonder een heel
goede reden.

---

## 3. Waar de basis óók voor te gebruiken is — en wat dat kost

### Wat de basis eigenlijk is

Ontdaan van het familierecht is Clausula een keten van zes stappen:

```
pseudonimiseer in de browser  →  haal tekst uit PDF/DOCX  →  toets tegen een normenset
     →  gestructureerde bevindingen mét citaat  →  voorstel als tracked change  →  export
```

Geen van die zes is inhoudelijk gebonden aan echtscheiding. Wat wél gebonden is: de
normenset, de documenttypes, en de checklists.

Dat maakt dezelfde keten in beginsel bruikbaar voor vaststellingsovereenkomsten,
huurcontracten, algemene voorwaarden, notariële akten, subsidieaanvragen — overal waar een
document tegen een vaste normenset moet worden gelegd en iemand persoonlijk
verantwoordelijk is voor de uitkomst.

### Maar de basis is nu níét losgemaakt, en dat is gemeten

Twintig bestanden kennen de woorden `ouderschapsplan` of `convenant`, met ruim honderd
verwijzingen:

| bestand | verwijzingen |
|---|---|
| `index.html` | 45 |
| `api/analyseer.js` | 22 |
| `api/_prompts/fragmenten.js` | 11 |
| `api/ai-assistent.js` | 9 |
| `api/_prompts/cross-doc.js` | 8 |
| `src/viewer/primaire-best.js` | 6 |
| plus zeven bestanden met 2–5 | |

Het domein zit niet in één laag maar door de hele keten heen: in de tabellen die de
volgorde bepalen, in de prompts, in de tabbladen, in het dashboard, in de MfN-elementen,
in de contexttoewijzing.

> **De kernvraag voor het komende jaar, architecturaal gesteld:** is Clausula een
> familierechtproduct dat toevallig een goede motor heeft, of een toetsmotor die toevallig
> met familierecht begon?
>
> Het antwoord bepaalt of die honderd verwijzingen een probleem zijn of niet. Blijft het
> familierecht, dan zijn ze prima — dan is het domein juist goed geïntegreerd. Wordt het
> een tweede rechtsgebied, dan is dit de verbouwing die eerst moet, en dan is hij groter
> dan het opknippen van `analyseDocument`.

### Wat een tweede rechtsgebied concreet zou vragen

Niet alles hoeft tegelijk. De volgorde die de meting suggereert:

1. **Documenttypes uit de code, in gegevens.** `HOOFD_TYPES`, `DOC_VOLGORDE`,
   `CONTEXT_HOOFD_MAP` en `MFN_ELEMENTEN` zijn nu constanten. Als ze rijen in een tabel
   worden — per rechtsgebied — verdwijnt het merendeel van die honderd verwijzingen.
2. **Prompts per rechtsgebied in plaats van per bestand.** `api/_prompts/` is al apart;
   wat ontbreekt is een dimensie "welk rechtsgebied".
3. **De normenset versioneerbaar.** Nodig voor arbeidsrecht én voor het wettelijk register
   (zie deel 1).

Pas daarna is "een tweede rechtsgebied" een kwestie van invullen in plaats van bouwen.

---

## 4. Wat dit betekent voor de vragen die openstaan

De drie vragen die het meest bepalen, met wat het onderzoek eraan toevoegt:

**Wordt het generen of beoordelen?** De markt zegt: de generatoren zitten al vast in de
werkwijze en zijn moeilijk te verdringen. Beoordelen is de open plek, en het is de plek
waar Clausula's onafhankelijkheid van de bron een voordeel is in plaats van een gemis.

**Blijft het familierecht?** Dit is de duurste vraag om laat te beantwoorden. Zeg je nu
"alleen familierecht", dan is de huidige verweving een kenmerk en niet een schuld — en
kan het opknippen van `analyseDocument` gewoon doorgaan. Zeg je "arbeidsrecht erbij", dan
gaat het losmaken van het domein vóór alle andere structuurstappen.

**Hoeveel kantoren?** Bij vijf tot vijftig verandert er technisch bijna niets. De rest van
de vragen uit het vorige gesprek blijft staan, maar deze drie hebben de grootste
architecturale spreiding.

---

## 5. De keuze is gemaakt: flexibel, en genereren niet uitgesloten

*Toegevoegd 3 september 2026, nadat Alexander de richtingvraag beantwoordde: de basis moet
ook andere markten kunnen bedienen, en het opstellen van convenanten en ouderschapsplannen
is voor later niet uitgesloten.*

Dat verandert de volgorde uit `docs/structuur.md`. Hieronder wat het kost, gemeten.

### Hoeveel domein zit er werkelijk in de code?

387 regels noemen een documenttype. Maar die zijn niet gelijk — en het verschil bepaalt
het werk:

| soort | regels | moet mee veranderen? |
|---|---|---|
| commentaar | 105 (27%) | nee — wel bijwerken, geen risico |
| overig (opsomming, tekstsamenstelling) | 118 (30%) | grotendeels niet |
| **besturing** (`if`, `filter`, `.has()`) | **62 (16%)** | **ja — dit is het echte werk** |
| **tabel/constante** | **51 (13%)** | **ja — dit is de kern** |
| UI-tekst (labels, tabbladen) | 26 (7%) | ja, maar triviaal |
| prompttekst | 25 (6%) | dit ís inhoud; hoort sowieso in gegevens |

**Structureel gaat het dus om 113 regels die gedrag bepalen**, verspreid over een stuk of
vijftien bestanden. Dat is een reëel maar begrensd karwei — geen herbouw.

### Het meevallertje: één ingreep dient beide doelen

`document_templates` bevat nu al per documenttype: `section_name`, `required`,
`applies_when`, `section_order`, `instructions`. Dat **is** een documentskelet. Vandaag
wordt het maar één kant op gelezen — als "VERWACHTE SECTIES" voor de volledigheidstoets.

> Toetsen is: *welke van deze secties ontbreken?*
> Genereren is: *vul deze secties.*
>
> Zelfde gegevens, andere leesrichting.

Dat maakt de generatierichting goedkoper dan hij oogt, en het betekent dat de investering
in "domein als gegevens" niet speculatief is: het is dezelfde tabel die je voor een tweede
markt én voor genereren nodig hebt.

Eén detail verraadt hoe dichtbij dit is — de tabel wordt nu bevraagd met een letterlijke
documentsoort:

```js
supabase.from('document_templates')…eq('doc_type', 'convenant')
supabase.from('document_templates')…eq('doc_type', 'ouderschapsplan')
```

Twee regels. Dáár begint de ontkoppeling.

### Complexiteit: omlaag én omhoog

**Omlaag**, want er verdwijnt dubbeling. `HOOFD_TYPES` en `MFN_ELEMENTEN` staan nu
letterlijk twee keer — in `api/analyseer.js` en in `index.html`. Dat is dezelfde
schaduwtabelklasse die op 1 september het waardeoverzicht vóór het convenant zette, nu op
domeinniveau. Eén bron maakt de code korter, niet langer.

**Omhoog**, want gedrag dat uit gegevens komt is moeilijker te volgen dan gedrag dat in een
`if` staat. "Waarom staat dit tabblad hier?" is straks een vraag aan de database. Dat is de
prijs, en hij is echt.

Netto: voor twee rechtsgebieden is dit winst. Voor één rechtsgebied zou het verlies zijn —
en dat is precies waarom deze richtingvraag eerst beantwoord moest worden.

### Testbaarheid: hier zit de grootste, minst zichtbare winst

Vandaag moet elke fixture een realistisch echtscheidingsdocument zijn. Dat heeft drie
kosten die zelden worden opgeteld:

- de eval kost ongeveer een dollar en zeven minuten per run;
- fixtures mogen geen echte cliëntgegevens bevatten, dus ze moeten met de hand worden
  verzonnen én realistisch blijven;
- een randgeval als "drie hoofddocumenten" is niet te testen zonder een constante te
  wijzigen.

Met het domein als gegevens kun je in een test een **verzonnen rechtsgebied** neerzetten:
twee documenttypes, drie secties, één regel. Dan toets je de mótor zonder een
echtscheidingsdocument nodig te hebben — sneller, gratis, en zonder AVG-rand.

Dat is meer waard dan de flexibiliteit zelf.

### Inspanning, en waar hij vandaan komt

Bij het huidige tempo, in ronden zoals we ze nu doen:

| | ronden | opmerking |
|---|---|---|
| `HOOFD_TYPES` en `MFN_ELEMENTEN` ontdubbelen | 1 | pure winst, kan meteen |
| `document_templates` niet meer op letterlijke doc_type | 1 | twee regels plus de gevolgen |
| volgorde-, context- en labeltabellen naar één bron | 1–2 | `DOC_VOLGORDE`, `CONTEXT_HOOFD_MAP`, `DOC_TYPEN` |
| de 62 besturingsregels langslopen | 3–4 | per stuk beoordelen; niet alles kán naar gegevens |
| prompts een dimensie "rechtsgebied" geven | 1–2 | **elke ronde een eval: ~$1 en 7 minuten** |
| **samen** | **7–10** | ruwweg een week |

De promptstap is de enige met een terugkerende prijs. Dat is ook de stap waar de kwaliteit
van de screening op het spel staat, dus daar hoort de eval-discipline uit `CLAUDE.md`:
gerichte telling op één signaal, twee runs, niet de diff lezen als bewijs.

**Wat hier níét in zit: genereren.** De skeletgegevens liggen klaar, maar een document
samenstellen is iets anders dan een document patchen. `vervangInDocxXml` en `bewerkDocx`
wijzigen een bestaande DOCX; een nieuwe opbouwen vraagt DOCX-assemblage en een
invoerkant — en die invoerkant is precies het terrein van Mediationportaal. Dat is een
eigen project, geen vervolgstap. Ik kan het pas begroten als duidelijk is of het om
"vul een sjabloon" of "voer een gesprek en bouw daaruit op" gaat.

### Wat dit doet met de volgorde uit `docs/structuur.md`

Gemeten: binnen `analyseDocument` staan 21 domeinregels, en **nul** daarvan zijn
besturing. De twee klussen zitten elkaar dus niet in de weg — opknippen en ontkoppelen
kunnen in willekeurige volgorde.

Maar de risicokaart en deze richting wijzen dezelfde kant op: `api/analyseer.js` heeft het
hoogste reparatieaandeel (36% van 55 commits) én de meeste domeinconstanten. Dat is waar
ik zou beginnen, niet bij de langste functie in `index.html`.

---

## Bronnen

- [Mediationportaal](https://mediationportaal.nl/) · [Nieuwe Stap — Mediationportaal](https://nieuwestap.nl/etalage/mediationportaal/)
- [ScheidingsWijze — het scheidingsplatform](https://www.scheidingswijze.nl/blog/het-scheidingsplatform-voor-het-nieuwe-scheiden/)
- [AI-tools voor de juridische sector in Nederland 2026](https://aitoolhub.nl/gids/ai-tools-juridische-sector-nederland-2026) · [AI voor juristen en advocaten in 2026](https://aitoolhub.nl/gids/ai-voor-juristen-advocaten-2026)
- [Wolters Kluwer — AI-gestuurde contractreview](https://www.wolterskluwer.com/nl-nl/expert-insights/ai-for-contract-review)
- [LegalOn — AI-adoptie in contractreview verdubbeld](https://www.businesswire.com/news/home/20260112080673/en/LegalOn-Report-Finds-AI-Adoption-in-Contract-Review-Doubles-Year-Over-Year)
- [MfN-register — vernieuwde regelgeving per 1 januari 2026](https://mfnregister.nl/nieuws/mfn-regelgeving-per-1-januari-2026/) · [regelgeving en documenten](https://mfnregister.nl/mediators/regelgeving-en-documenten/) · [nieuws](https://mfnregister.nl/categorie/nieuws/)
- [Mr. Online — welke juridische AI-tool past bij jouw kantoor](https://www.mr-online.nl/welke-juridische-ai-tool-past-bij-jouw-advocatenkantoor/)
