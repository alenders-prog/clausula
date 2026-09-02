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
mediatorsregister**. Komt dat er, dan komen er waarschijnlijk eisen aan dossiervorming en
kwaliteitsborging mee. Een instrument dat aantoonbaar op MfN-normen toetst en dat
vastlegt, wordt daarmee eerder een verplichting dan een gemak.

> **Architecturale gevolgtrekking.** De MfN-toets is nu een lijst in `MFN_ELEMENTEN` in
> `api/analyseer.js`, met een score van 9 op 15. Wordt dat een norm waarop een kantoor
> wordt beoordeeld, dan moet die lijst versioneerbaar zijn — welke versie van de norm gold
> bij welke analyse — en dat is hij niet.

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

## Bronnen

- [Mediationportaal](https://mediationportaal.nl/) · [Nieuwe Stap — Mediationportaal](https://nieuwestap.nl/etalage/mediationportaal/)
- [ScheidingsWijze — het scheidingsplatform](https://www.scheidingswijze.nl/blog/het-scheidingsplatform-voor-het-nieuwe-scheiden/)
- [AI-tools voor de juridische sector in Nederland 2026](https://aitoolhub.nl/gids/ai-tools-juridische-sector-nederland-2026) · [AI voor juristen en advocaten in 2026](https://aitoolhub.nl/gids/ai-voor-juristen-advocaten-2026)
- [Wolters Kluwer — AI-gestuurde contractreview](https://www.wolterskluwer.com/nl-nl/expert-insights/ai-for-contract-review)
- [LegalOn — AI-adoptie in contractreview verdubbeld](https://www.businesswire.com/news/home/20260112080673/en/LegalOn-Report-Finds-AI-Adoption-in-Contract-Review-Doubles-Year-Over-Year)
- [MfN-register — regelgeving en documenten](https://mfnregister.nl/mediators/regelgeving-en-documenten/) · [MfN-register — nieuws](https://mfnregister.nl/categorie/nieuws/)
- [Mr. Online — welke juridische AI-tool past bij jouw kantoor](https://www.mr-online.nl/welke-juridische-ai-tool-past-bij-jouw-advocatenkantoor/)
