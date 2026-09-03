# Architectuurbeoordeling Clausula

Opgesteld 3 september 2026, op basis van acht beantwoorde richtingvragen en een ronde
meten en lezen. Dit vervangt `docs/structuur.md` en `docs/richting.md` als leidend stuk;
die blijven staan als onderbouwing.

**Hoe dit stuk te gebruiken.** Vooraan staat een aannameregister. Elke bevinding en elke
stap is gemerkt met de aannames waarop hij rust. Verandert er een aanname, zoek hem dan op
in § 1 en volg de verwijzingen — dan ziet u wat er meeschuift, zonder dat het geheel
herschreven hoeft te worden. Dat is precies wat er de afgelopen dagen mis ging: elk nieuw
inzicht wierp het hele advies om.

---

## 1. Aannameregister

| | aanname | bron | zekerheid |
|---|---|---|---|
| **A1** | Circa 100 kantoren binnen een jaar | antwoord 1 | opgegeven |
| **A2** | Abonnement met limieten; kosten per analyse tellen mee | antwoord 2 | opgegeven |
| **A3** | Het ergste is een **foute bevinding waarop een mediator handelt** | antwoord 3 | opgegeven |
| **A4** | Data buiten de EU is aanvaardbaar **mits absoluut geanonimiseerd** | antwoord 4 | **houdt niet stand — zie B1** |
| **A5** | Mogelijk overdracht of onderhoud door een ander; typecontrole belangrijk | antwoord 5 | opgegeven |
| **A6** | Nu een aaneengesloten periode, later in blokken | antwoord 6 | opgegeven |
| **A7** | Tweede rechtsgebied blijft open; realistisch over ~6 maanden, ná live en stabiel | antwoord 7 | opgegeven |
| **A8** | Eerst: beheerpagina (gebruik, kosten, automatische processen), voorkeuren per gebruiker, uitgebreidere assistent. Later: zelf documenten opstellen. **AVG staat voorop** | antwoord 8 | opgegeven |

> **A4 is de enige aanname die de meting niet overleeft.** Hij is opgegeven als voorwaarde
> ("zolang de data absoluut geanonimiseerd is") en die voorwaarde is vandaag niet vervuld.
> Dat maakt B1 en B2 de belangrijkste bevindingen van dit stuk.

---

## 2. Bevindingen

Op volgorde van ernst, niet van moeite.

### B1 — De anonimisering is niet absoluut · *A4, A8*

Nagespeeld met de echte module op een alinea zoals die in een convenant staat. Wat er
overblijft nadat de tekst is geanonimiseerd en vóór hij naar Anthropic gaat:

```
Robin Bergman, geboren te Enschede op 12-12-1996, wonende te [POSTCODE_1] [WOONPLAATS_2]
aan Markendoel 16, werkzaam bij Pensioenfonds Zorg en Welzijn, e-mail [EMAIL],
telefoon [TEL], BSN [BSN], rekening [IBAN_0].
Uit het huwelijk is geboren: Jochem ter Bergman, geboren 03-04-2011 te Deventer.
```

Vier categorieën blijven staan:

| wat | waarom |
|---|---|
| **geboortedatum** (12-12-1996, 03-04-2011) | er is geen datumpatroon in de anonimisering |
| **geboorteplaats** ("geboren te Enschede", "te Deventer") | het woonplaatspatroon dekt *wonende/woonachtig/gevestigd/gedomicilieerd te*, niet *geboren te* |
| **huisadres zonder straatsuffix** ("Markendoel 16") | het adrespatroon eist een achtervoegsel: straat, laan, weg, plein, singel… "Markendoel" heeft er geen |
| **werkgever / pensioenfonds** | geen patroon voor organisaties |

Geboortedatum plus geboorteplaats plus werkgever is in Nederland vrijwel altijd herleidbaar
tot één persoon. Dit is dus **gepseudonimiseerde persoonsgegevens, geen anonieme gegevens** —
en daarmee valt het volledig onder de AVG, inclusief de doorgifte naar de Verenigde Staten.

*Gevolg voor A4:* de voorwaarde is niet vervuld. Er zijn twee wegen: de anonimisering
werkelijk sluitend maken (moeilijk — "absoluut" is bij vrije tekst een hoge lat), of A4
laten vallen en de doorgifte regelen zoals hij is: verwerkersovereenkomst, en desgewenst
een EU-route.

### B2 — 111 oude screenings met onbeschermde cliëntgegevens · *A8*

`_backup_screeningen` bevat 111 rijen uit de periode 27 juni – 2 augustus 2026.

| | |
|---|---|
| rapporten **zonder enige pseudonimisering** | **57** van 111 |
| rapporten met de volledige documenttekst erin | **111** van 111 |
| rijen met een bestandsnaam (opgebouwd uit partijnamen) | 111 van 111 |
| gemiddelde rapportgrootte | 130–300 KB |

En de afscherming verschilt van de actieve tabellen. Zonder in te loggen, met de publieke
sleutel:

```
screeningen           HTTP 401   permission denied
dossiers              HTTP 401   permission denied
_backup_screeningen   HTTP 200   0 rijen          ← bereikbaar, alleen RLS houdt tegen
_backup_dossiers      HTTP 200   0 rijen
```

Vandaag lekt er niets. Maar de actieve tabellen zijn beschermd doordat de anonieme rol er
geen enkel recht op heeft; de backuptabellen doordat er een RLS-regel geen rijen teruggeeft.
Dat is een dunnere bescherming: één policy die per ongeluk permissief wordt, of RLS die
uitgaat bij een herstelactie, en 57 volledige dossiers met echte namen staan open.

*Aanbeveling:* deze tabellen horen niet in het `public`-schema van een API-project. Ofwel
verwijderen (er is een reden waarom het backups zijn), ofwel verplaatsen naar een schema dat
PostgREST niet bedient.

### B3 — Geen bewaartermijn, geen opschoning · *A8*

Er is geen enkel mechanisme dat dossiers of screenings verwijdert. Voor de AVG is dat een
tekortkoming (opslagbeperking), en het is een schemawijziging die eenvoudiger is bij vier
dossiers dan bij vierduizend. Bij A1 (100 kantoren) is "later" geen optie meer.

### B4 — De dossierlijst haalt élk rapport volledig op · *A1*

```js
.select('id, naam, partij_a, partij_b, status, updated_at,
         screeningen!dossier_id(id, bestandsnaam, classificatie, rapport, created_at, versie_nr)')
```

`rapport` is de volledige jsonb — gemiddeld **130 KB** — inclusief `_document_tekst`. Die
gaat bij élke keer openen van het overzicht over de lijn, voor élk dossier van het kantoor.

| dossiers per kantoor | per paginalading |
|---|---|
| 50 | 6 MB |
| 200 | 25 MB |
| 1000 | 127 MB |

Dit werkt nu omdat er vier dossiers zijn. Bij A1 is dit het eerste dat breekt — en het is
een van de goedkoopste reparaties in dit stuk: de lijst heeft alleen tellingen en een score
nodig, geen rapport. Een aparte kolom of view met de samenvattende cijfers lost het op.

### B5 — Waarneembaarheid ontbreekt, en A3 verschuift wat dat betekent · *A3*

88 catch-blokken, waarvan **46 volledig stil**. Geen foutmonitoring. Elke storing van de
afgelopen dagen is door de gebruiker gevonden, niet door een systeem.

Maar A3 zegt dat het ergste een **foute bevinding** is waarop wordt gehandeld. Dat is geen
crash — dat is een uitkomst die er goed uitziet en niet klopt. Foutmonitoring vangt dat per
definitie niet. Wat A3 wél vraagt:

- **datacontroles op gedrag**, niet op fouten. De duurste storing (elf dagen geen enkele
  analyse bewaard) gaf geen uitzondering; het signaal lag in de gegevens — `api_verbruik`
  had rijen, `screeningen` niet. Een nachtelijke controle had dat op dag één gevonden.
- **de bevinding zelf toetsbaar maken.** De extra verificatie bestaat al maar draait op
  verzoek. Bij A3 hoort de vraag of dat genoeg is.
- **onze eigen foutmeldingen bevatten cliëntnamen** —
  `Uploaden van '${item.bestand.name}' mislukt` en bestandsnamen zijn `Convenant
  Jansen-de Vries.pdf`. Dat moet dicht vóór er ook maar iets naar een externe dienst gaat.

### B6 — Twaalf functies, negen in gebruik, en A8 vraagt om meer · *A1, A8*

Vercel Hobby staat twaalf serverless functies toe; er zijn er negen. A8 vraagt om een
beheerpagina met gebruiks- en kostenoverzichten, om voorkeuren per gebruiker, en om
automatische processen (wetsartikelen en jurisprudentie ophalen). Dat zijn er al gauw drie
tot vijf.

Bovendien: A1 en A2 samen (100 betalende kantoren, abonnement) betekenen commercieel
gebruik, en dat vraagt sowieso om een betaald plan. Dit is geen technisch probleem maar een
planningspunt — beter nu weten dan bij de eerstvolgende deploy die niet meer past.

### B7 — Voorkeuren per gebruiker bestaan niet · *A8*

Er is geen enkele opslag voor "welke zaken wel/niet melden". `gebruikersprofiel` heeft zes
kolommen (id, naam, rol, organisatie). Dit is nieuw te bouwen — en het is precies de plek
waar het ontkoppelen van het domein (§ B8) zich vanzelf aandient, want "welke categorieën
bestaan er" wordt dan een gegeven in plaats van een constante.

### B8 — Het domein zit door de hele keten · *A7*

387 regels noemen een documenttype; **113 daarvan bepalen gedrag** (51 tabellen/constanten,
62 besturing). `HOOFD_TYPES` en `MFN_ELEMENTEN` staan letterlijk dubbel — in
`api/analyseer.js` én `index.html` — al zijn de twee kopieën vandaag nog identiek
(gecontroleerd).

Bij A7 (tweede rechtsgebied over ~6 maanden) is dit **geen urgentie maar wel een
richtinggevende beperking**: de features uit A8 raken dezelfde tabellen. Voorkeuren per
gebruiker en een beheerpagina vragen allebei om "welke documenttypes en categorieën
bestaan er" als gegeven. Doe je dat daar goed, dan is het domein grotendeels los als A7
actueel wordt — zonder aparte verbouwing.

### B9 — Typecontrole is haalbaar en bij A5 belangrijk · *A5*

Gemeten met `tsc --checkJs` op `src/`: 458 meldingen, of **115** met `noImplicitAny` uit.
Drie ervan van dichtbij bekeken: alle drie annotatieruis, geen latente fout. Verwacht dus
geen oogst aan verborgen bugs — de winst zit in wat er hierná misgaat.

Bewezen dat het de duurste fout van deze week vangt:

```
error TS2304: Cannot find name '_klaar'.
```

Met A5 (mogelijk overdracht of verkoop) verschuift dit van "prettig" naar "belangrijk": een
opvolger leest geen commentaar van drieduizend regels, maar een typefout ziet hij meteen.

### B10 — Structuur: één functie domineert · *A5, A6*

278 functies, samen 10.839 regels. 23 functies boven de honderd regels zijn samen 49% van
de functiecode. `analyseDocument` is 937 regels en was de bron van de duurste fout.

`buildPdfDef` (376 regels) is een uitzondering: **nul DOM, nul await, nul globals** — al een
zuivere functie, en hij bouwt het rapport dat de mediator uitprint en meestuurt. Verplaatsen
is knippen en plakken.

### B11 — Klein en bekend

- Eén kwetsbaarheid van gemiddelde ernst, in `@xmldom/xmldom`, en dat is een
  *devDependency* — hij draait niet in productie. `npm audit fix` volstaat.
- Vijf productie-afhankelijkheden (supabase-js, jszip, mammoth, nodemailer, pdf-parse) plus
  negen scripts van twee CDN's in de browser. Die negen zijn een reëel maar geaccepteerd
  risico: valt cdnjs of jsdelivr weg, dan doet de app niets.

---

## 3. De volgorde

Drie blokken. De reden voor deze volgorde: A8 zegt "AVG staat voorop", A3 zegt dat een
foute bevinding het ergste is, en A1 zegt dat er honderd kantoren komen. Structuurwerk komt
daarná — het maakt het bouwen prettiger, maar het lost geen van die drie op.

### Blok 1 — AVG en zichtbaarheid *(nu, aaneengesloten — past bij A6)*

| # | wat | rust op | omvang |
|---|---|---|---|
| 1.1 | Backuptabellen weg uit het API-schema | B2 | een halve ronde |
| 1.2 | Datacontroles: analyses gemeten maar niet bewaard, screenings zonder rapport, verbruik zonder organisatie | B5, A3 | 1 ronde |
| 1.3 | Cliëntnamen uit foutmeldingen | B5 | een halve ronde |
| 1.4 | Anonimisering uitbreiden: geboortedatum, geboorteplaats, adres zonder suffix | B1 | 2 ronden + eval |
| 1.5 | Besluit over A4: sluitend maken of laten vallen en de doorgifte regelen | B1 | uw besluit |
| 1.6 | Bewaartermijn en opschoning | B3 | 1–2 ronden, schemawijziging |

*Waarom 1.4 niet "af" kan zijn:* "absoluut geanonimiseerd" is bij vrije tekst geen
haalbare toestand, alleen een richting. Elke ronde maakt het beter en geen enkele maakt het
zeker. Daarom hoort 1.5 erbij als besluit, niet als sluitstuk.

### Blok 2 — Klaar voor honderd kantoren *(aansluitend)*

| # | wat | rust op | omvang |
|---|---|---|---|
| 2.1 | Dossierlijst zonder volledige rapporten | B4, A1 | 1–2 ronden |
| 2.2 | Vercel-plan en de functiegrens | B6, A1, A2 | uw besluit |
| 2.3 | Verbruik per kantoor per periode, met limiet | A2 | 1–2 ronden |

2.3 is meteen de kern van de beheerpagina uit A8 — `api_verbruik` heeft de gegevens al.

### Blok 3 — Bouwen, met de structuur als bijvangst *(daarna, in blokken — A6)*

Hier komt het structuurwerk, maar **niet als apart project**. De features uit A8 raken
precies de plekken die ontkoppeld moeten worden:

| bouwen (A8) | pakt onderweg mee |
|---|---|
| voorkeuren per gebruiker | categorieën als gegevens in plaats van constanten (B8) |
| beheerpagina | verbruiksaggregatie, en de eerste nieuwe endpoints (B6) |
| automatische processen | de kennisbankscripts als geplande taak |
| uitgebreidere assistent | `ai-assistent.js` (1114 regels) opknippen |

Los daarvan, wanneer het uitkomt:

- **`buildPdfDef` naar `src/`** (B10) — kan altijd, nul koppeling, en het raakt het document
  dat het kantoor verlaat.
- **Typecontrole** (B9, A5) — begin met `src/`, `noImplicitAny` uit. Bij A5 hoort dit vóór
  een eventuele overdracht af te zijn.
- **`analyseDocument` opknippen** (B10) — 937 regels, drie zuivere stukken eruit.

### Blok 4 — Alleen als A7 actueel wordt

Domein volledig als gegevens (B8): 113 gedragsbepalende regels, 7–10 ronden. **Als blok 3
goed is gedaan, is het merendeel hiervan dan al gebeurd.** Dat is de reden om het niet nu te
doen.

---

## 4. Werkwijze

Ongewijzigd, want hij werkt — deze week zijn er negenentwintig reparaties mee gedaan en de
enige fouten die glipten kwamen door ervan af te wijken.

- **Eén wijziging per commit**, met de meting in het bericht.
- **Bij elke bewaker: aantonen dat hij rood gaat** door de fout terug te zetten. Twee keer
  deze week bleek een test niets te bewijzen totdat ik dat deed.
- **Een aantal is geen bewijs.** Wie een telling logt, logt ook de namen — dat heeft deze
  week drie keer het verschil gemaakt tussen "er gaat iets mis" en "dít gaat mis".
- **Promptwijzigingen:** eerst de samengestelde prompt byte-exact vastleggen (bestaat nog
  niet), dan is een eval alleen nodig als die string verandert. Strenger én goedkoper dan
  de huidige regel.
- **Meten vóór adviseren.** Deze week heb ik drie keer een oorzaak beweerd die bij naspelen
  onjuist bleek, en één keer een maatregel bijna toegevoegd (een bovengrens op de
  consolidatie) die niets zou hebben gedaan.

---

## 5. Wat hier níét in staat

Eerlijkheid over de reikwijdte, zodat dit stuk niet meer belooft dan het waarmaakt.

- **De concept- en DOCX-keten is niet doorgelicht.** `vervangInDocxXml` (221 regels) en
  `bewerkDocx` (180) zijn geïnventariseerd, niet gelezen. Bij A8 ("later zelf documenten
  opstellen") verdient dat een eigen ronde.
- **Indexen en queryplannen zijn niet bekeken.** B4 is gevonden door de query te lezen, niet
  door te meten onder belasting. Bij A1 hoort een echte belastingproef.
- **RLS is beoordeeld op bereikbaarheid, niet op volledigheid.** Ik heb getest wat een
  anonieme bezoeker kan; niet wat een ingelogde gebruiker van een ánder kantoor kan. Dat is
  bij A1 een aparte toets waard.
- **De assistent is niet inhoudelijk beoordeeld.** 1114 regels, en A8 wil hem uitbreiden.
- **Geen beveiligingsaudit.** Dit is een architectuurbeoordeling; B2 kwam boven water omdat
  ik de tabellen telde, niet omdat ik gericht naar lekken zocht.

---

## 6. Kort

De codebase is werkbaar en de werkwijze is goed. De drie dingen die aandacht vragen zijn
geen van drieën structuurproblemen:

1. **De anonimisering is niet wat u aanneemt.** Geboortedatum, geboorteplaats en werkgever
   gaan mee naar de VS. Dat raakt de aanname waarop uw hele privacypositie rust.
2. **Er staan 111 oude screenings, 57 zonder pseudonimisering, in een tabel die via de API
   bereikbaar is.** Vandaag lekt er niets; de marge is dunner dan bij de actieve tabellen.
3. **De dossierlijst haalt elk rapport volledig op.** Werkt bij vier dossiers, breekt ruim
   voor honderd kantoren.

Het structuurwerk waar dit gesprek mee begon — `analyseDocument` opknippen, typecontrole,
het domein ontkoppelen — is reëel en verdient te gebeuren, maar het staat achter deze drie.
Het maakt het bouwen prettiger; het lost geen van uw drie prioriteiten op.
