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
| **A4** | ~~Data buiten de EU is aanvaardbaar **mits absoluut geanonimiseerd**~~ → **herzien 8 sep 2026**, zie hieronder | antwoord 4 · besluit | vervangen |
| **A5** | Mogelijk overdracht of onderhoud door een ander; typecontrole belangrijk | antwoord 5 | opgegeven |
| **A6** | Nu een aaneengesloten periode, later in blokken | antwoord 6 | opgegeven |
| **A7** | Tweede rechtsgebied blijft open; realistisch over ~6 maanden, ná live en stabiel | antwoord 7 | opgegeven |
| **A8** | Eerst: beheerpagina (gebruik, kosten, automatische processen), voorkeuren per gebruiker, uitgebreidere assistent. Later: zelf documenten opstellen. **AVG staat voorop** | antwoord 8 | opgegeven |

> **A4 was de enige aanname die de meting niet overleefde.** Hij was opgegeven als
> voorwaarde ("zolang de data absoluut geanonimiseerd is") en die voorwaarde was niet
> vervuld. Dat maakte B1 en B2 de belangrijkste bevindingen van dit stuk.

### A4 herzien — 8 september 2026

**Verwerking buiten de EU vindt plaats *onder* de AVG, niet daarbuiten.** De aanname dat
anonimisering die doorgifte zou wegnemen is losgelaten. Pseudonimisering verkleint het
risico wél, maar heft de verplichtingen niet op: doorgifte wordt geregeld met
verwerkersovereenkomsten en standaardcontractbepalingen. De pseudonimisering blijft een
aanvullende maatregel die we blijven aanscherpen — geen grondslag.

Waarom de oude formulering niet houdbaar was, in twee punten die allebei te controleren
zijn:

- **"Geanonimiseerd" is het verkeerde woord.** Anonieme gegevens vallen buiten de AVG;
  dát is wat het woord juridisch betekent. Wat hier gebeurt is pseudonimisering — B1 laat
  zien wat er blijft staan (geboortedatum, geboorteplaats, werkgever, adressen zonder
  straatsuffix). Een claim van anonimisering is door een toezichthouder of een cliënt na
  te rekenen, en zou het niet halen.
- **Het geldt niet voor alles wat het apparaat verlaat.** Alleen de documentTEKST voor de
  AI-analyse wordt in de browser gepseudonimiseerd. Het ORIGINELE bestand gaat ongewijzigd
  naar Adobe voor de PDF→DOCX-conversie (`pdfBase64` in index.html) en naar Supabase
  Storage. "Persoonsgegevens verlaten de computer alleen gepseudonimiseerd" is dus onwaar,
  en het is precies de zin die je niet in een privacyverklaring wilt hebben staan.

**Wat wél klopt, en sterk genoeg is om zo op te schrijven:**

> Voor de AI-analyse verlaat de documenttekst het apparaat alleen in gepseudonimiseerde
> vorm: namen zijn vervangen door schuilnamen, en BSN, IBAN, e-mailadres en telefoonnummer
> door plaatsaanduidingen. Het taalmodel ziet de namen van cliënten niet.

Voorgestelde tekst voor de privacyverklaring staat onder 1.5.

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

> **Uitgevoerd 5 september 2026.** Beide tabellen staan nu in schema `archief`, dat PostgREST
> niet bedient (`supabase/2026-09-05-backuptabellen-uit-de-api.sql`). Verplaatst en niet
> verwijderd: omkeerbaar, en er is een reden waarom het backups zijn. Gecontroleerd in
> `information_schema` (beide op `archief`) en van buitenaf: waar eerst HTTP 200 met nul
> rijen kwam, geeft de API ze nu niet meer. `npm run check:anon` bewaakt dat.
>
> Tegelijk is `anon` alle tabelrechten in `public` kwijtgeraakt
> (`supabase/2026-09-05-anon-rechten-intrekken.sql`), inclusief de kennisbanktabellen, met
> `alter default privileges` erachteraan zodat een nieuwe tabel het recht niet stil
> terugkrijgt.
>
> **Eén regel hierboven klopte niet.** "De actieve tabellen zijn beschermd doordat de
> anonieme rol er geen enkel recht op heeft" was afgelezen uit `HTTP 401 permission denied`.
> Die melding bewijst dat niet — hij kwam van het EXECUTE-recht op de functie in de
> policy-expressie, dat eerder wordt getoetst dan het SELECT-recht op de tabel. De anonieme
> rol hád op dat moment leesrecht op álle tabellen in `public`; dat is de Supabase-standaard
> bij aanmaak. Het verschil met de backuptabellen dat deze bevinding beschrijft bestond dus
> niet: beide leunden op RLS alleen. Dat maakt de bevinding niet minder juist, maar wel
> ruimer dan hij was opgeschreven. Gemeten met `has_table_privilege`; zie
> `supabase/anon-rechten-controle.sql`.

### B3 — Geen bewaartermijn, geen opschoning · *A8*

Er is geen enkel mechanisme dat dossiers of screenings verwijdert. Voor de AVG is dat een
tekortkoming (opslagbeperking), en het is een schemawijziging die eenvoudiger is bij vier
dossiers dan bij vierduizend. Bij A1 (100 kantoren) is "later" geen optie meer.

> **Toegevoegd 5 september 2026 — dit punt is zwaarder geworden.** Op die dag bleek de
> `documenten`-bucket zonder inloggen bereikbaar (zie
> `docs/incident-2026-09-05-storage.md`). Daarbij kwam iets aan het licht dat B3 van een
> nette maatregel in een dempende maatregel verandert.
>
> **De opgeslagen bestanden zijn de originelen.** Beide uploadpaden in `index.html`
> sturen het `File`-object zoals de gebruiker het koos; er gaat nergens een bewerkte versie
> naar Storage. De pseudonimisering werkt op de tekst die naar Anthropic gaat, niet op wat
> er in de opslag ligt. Alles in het systeem is afgeleid — rapport, classificatie, feiten —
> behalve deze bestanden. Dit is de bron, en daarmee het waardevolste doelwit.
>
> **En het besluit om dat zo te doen steunt op een voorwaarde die stil kan wegvallen.** De
> skill `avg-beleid` motiveert het bewaren van ruwe waarden met *"eigen database, RLS per
> organisatie"*. Precies die RLS ontbrak, en niets in deze repo kon dat laten zien, want de
> afwijking was in het dashboard aangeklikt.
>
> Waarom bewaren tóch verdedigbaar is: het is de **werkkopie van de mediator**. Vier
> gebruiksplekken in `index.html` — de viewer bij een opgeslagen analyse (13492), drie
> downloadknoppen (12348, 12475, 12601), en de heranalyse die zonder opnieuw uploaden een
> nieuwe versie maakt (4070). Een geanonimiseerde kopie bedient daarvan alleen de laatste:
> een mediator moet het échte stuk zien.
>
> **Daarom is een bewaartermijn hier de goedkoopste maatregel die er is.** Hij houdt het
> hele voordeel overeind en verkleint wat er bij een volgende misconfiguratie op straat
> ligt van "alles wat er ooit is geüpload" naar "wat er nu loopt". Versleuteling at rest is
> het zwaardere alternatief; de afweging daarvan staat hieronder.
>
> **Versleuteling at rest — afgewogen, niet nu.** Het patroon is aanwezig (`api/_crypto.js`,
> AES-256-GCM, nu voor `namen_map`), maar toepassen op bestanden is geen kleine ingreep:
>
> - Zeven raakpunten: twee uploads en vijf leesplekken. Drie daarvan (12348, 12475, 12601)
>   zetten nu `a.href = signedUrl` en laten de browser rechtstreeks downloaden — JS raakt de
>   bytes nooit aan. Die moeten om naar ophalen, ontsleutelen, blob, downloaden.
> - De Adobe-conversie blijft ongemoeid: `adobe-start.js` krijgt de bytes als `pdfBase64`
>   uit de browser, niet uit Storage.
> - **Nieuw risico dat er nu niet is: sleutelverlies is dossierverlies.** Bij `namen_map` is
>   een verloren sleutel hinderlijk; bij bronbestanden is het het stuk van de cliënt kwijt.
>   Dat vraagt een bewaar- en herstelprocedure vóór invoering, niet erna.
> - **Wat het wél afdekt:** precies het scenario van 5 september — een verkeerd gezette
>   Storage-policy is dan niet meer genoeg. **Wat het niet afdekt:** een gekaapte sessie, of
>   iemand met de service-role-sleutel. De ontsleuteling gebeurt in de browser, dus wie een
>   geldige sessie heeft, heeft de sleutel.
>
> Volgorde: **bewaartermijn eerst** (klein, dempt élke toekomstige misser), versleuteling
> pas wanneer er echte cliëntdossiers in staan — en dan mét die herstelprocedure.

> **Uitgevoerd 5 september 2026.** De termijn hoefde niet gebouwd te worden: hij stónd er
> al. `organisaties.retention_maanden` bestaat sinds `001_multitenancy.sql`, staat op 12, en
> werd door niets gelezen — gebouwd en nooit aangesloten, dezelfde vorm als `screening_id`
> in `api_verbruik`. Er was dus geen schemawijziging nodig, alleen een mechanisme.
>
> De regel staat getoetst in `src/avg/bewaartermijn.js` (13 tests), het opruimen in
> `scripts/opschonen.mjs` (`npm run opschonen`, droogloop tenzij `--ja`). Alleen het bestand
> gaat weg; screening, rapport en bevindingen blijven. Een screening waarvan álle
> bronbestanden verdwijnen krijgt `rapport._bronbestanden_verwijderd_op`, en de drie
> downloadknoppen tonen daardoor niet meer "Object not found" maar wat er werkelijk gebeurd
> is.
>
> Gemeten bij het bouwen: de bucket is `{organisatie_id}/{tijdstempel}-{willekeurig}.pdf`,
> twaalf bestanden in één map, oudste 14 augustus 2026. Met twaalf maanden verdwijnt het
> eerste op 14 augustus 2027 — er is vandaag dus niets te verwijderen, en dat is precies het
> moment om dit te bouwen.
>
> **Wat hier niet mee is opgelost:** dossiers en screenings zelf kennen nog steeds geen
> bewaartermijn. Dit dekt de bestanden, en die zijn de bron; de rest is afgeleid en
> gepseudonimiseerd. Voor A1 (100 kantoren) blijft de rest staan.

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

> **Uitgevoerd 5 september 2026 — en de controle vond zichzelf twee keer fout.**
> `npm run check:data` (`scripts/datacontroles.mjs`) doet de drie controles op gedrag.
>
> De eerste versie koppelde `api_verbruik.screening_id` aan `screeningen.id`. Dat is geen
> screening-id maar een **runId** die de browser vooraf aanmaakt (commit `088a53f`), omdat de
> analyse begint voordat de screening bestaat; bij een heranalyse verschilt hij en staat hij
> in `rapport._analyse_run_id`. Zonder die tweede sleutel meldt de controle élke heranalyse
> als verloren — gemeten: 2 van 12 koppelden, beide via `_analyse_run_id`.
>
> De tweede versie meldde twaalf verloren analyses. Maar een analyse niet opslaan is gewoon
> gedrag, en de gegevens kunnen "wilde niet bewaren" niet onderscheiden van "bewaren
> mislukte". Dat is nu een notitie; de poort staat op het **dagpatroon**, want de storing die
> elf dagen duurde was elf aaneengesloten dagen.
>
> **Wat de controle vond.** Van de vijf accounts hebben er twee geen rij in
> `gebruikersprofiel`: het testaccount uit `.env` en één met een vertypt domein
> (`@hotmail.ccom`). Dat is de oorzaak van álle 246 verbruiksregels zonder organisatie, en
> het reikt verder dan de facturatie — zonder profielrij geeft `mijn_organisatie_id()` NULL,
> dus elke RLS-policy geeft nul rijen terug. Zij kunnen inloggen en zien een lege applicatie.
>
> Voor 1.3 zijn de zes logregels in `api/analyseer.js` en de twee in `api/_iban.js` omgezet
> naar `src/avg/logref.js`. Die gingen naar de Vercel-logs, en dat is een externe verwerker.
> De browserconsole is bewust ongemoeid: die verlaat de machine niet, en de bestandsnaam is
> daar juist nuttig. **Dat verandert zodra er foutmonitoring komt** — de na te lopen plekken
> staan in de skill `avg-beleid`.

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
| 1.1 | ~~Backuptabellen weg uit het API-schema~~ — **gedaan 5 sep 2026**, plus alle anon-tabelrechten ingetrokken | B2 | een halve ronde |
| 1.2 | ~~Datacontroles~~ — **gedaan 5 sep 2026**, `npm run check:data` | B5, A3 | 1 ronde |
| 1.3 | ~~Cliëntnamen uit foutmeldingen~~ — **server gedaan 5 sep 2026**; browserconsole wacht op de komst van foutmonitoring | B5 | een halve ronde |
| 1.4 | ~~Anonimisering uitbreiden: geboortedatum, geboorteplaats, adres zonder suffix~~ — **eerste ronde gedaan** (67b5bd0); "af" kan dit punt niet zijn, zie hieronder | B1 | 2 ronden + eval |
| 1.5 | ~~Besluit over A4~~ — **genomen 8 sep 2026**; wat er nu nog moet gebeuren staat hieronder | B1 | administratief |
| 1.6 | ~~Bewaartermijn en opschoning~~ — **gedaan 5 sep 2026**, `npm run opschonen`; geen schemawijziging nodig | B3 | 1–2 ronden, schemawijziging |
| 1.7 | ~~Lidmaatschapscontrole op de laatste endpoints~~ — **gedaan 7 sep 2026**, met een test die de regel bewaakt | B2 | een halve ronde |
| 1.8 | **CSP van report-only naar afdwingen** — wacht op één doorloop van de flows | B5 | uw handeling, dan een halve ronde |
| 1.9 | **Foutmonitoring** — blokkeert de browserkant van 1.3 | B5 | 1 ronde |

*Waarom 1.4 niet "af" kan zijn:* "absoluut geanonimiseerd" is bij vrije tekst geen
haalbare toestand, alleen een richting. Elke ronde maakt het beter en geen enkele maakt het
zeker. Daarom hoort 1.5 erbij als besluit, niet als sluitstuk. Sinds 5 september zijn er
vier ronden bij gekomen: plaatsnamen op naam in plaats van op context, de woonplaats bij de
woning zelf, namen die met een accentletter beginnen, en de positie in de zin als
doorslaggevend bij twijfelgevallen.

#### 1.5 — het besluit is genomen; er ligt nu papierwerk *(8 sep 2026)*

A4 is herzien (zie hoofdstuk 1): de doorgifte wordt geregeld in plaats van weggeredeneerd.
Daarmee verschuift dit punt van een besluit naar een administratieve klus, en die is niet
technisch op te lossen.

**Wat er moet gebeuren, en in deze volgorde:**

1. **Verwerkersovereenkomsten sluiten** met Anthropic, Adobe, Vercel en Supabase. Alle vier
   staan open. Bij Vercel en Adobe is de DPA in het dashboard te accepteren; bij Anthropic
   en Supabase loopt het via hun voorwaarden. Zie `docs/avg-verwerkersovereenkomst.md`.
2. **Pas dáárna** de privacyverklaring publiceren met de tekst hieronder. De laatste zin
   ervan is nu nog onwaar.
3. De pseudonimisering blijven aanscherpen (1.4). Dat is geen voorwaarde meer voor de
   doorgifte, maar wel de maatregel die het risico echt verkleint.

**Voorgestelde tekst voor de privacyverklaring** — pas te gebruiken als stap 1 rond is:

> Documenten worden verwerkt onder de AVG. Voor de AI-analyse wordt de tekst in uw browser
> gepseudonimiseerd voordat hij het apparaat verlaat: namen worden vervangen door
> schuilnamen, en BSN, IBAN, e-mailadres en telefoonnummer door plaatsaanduidingen. Dit is
> pseudonimisering en geen anonimisering — gegevens zoals een geboortedatum of een
> werkgever kunnen in de tekst achterblijven. Voor het omzetten van PDF naar Word en voor
> de opslag van uw bestanden wordt het originele document verwerkt. Met alle betrokken
> verwerkers zijn verwerkersovereenkomsten gesloten; doorgifte buiten de EU vindt plaats op
> basis van de standaardcontractbepalingen.

En voor de site, kort:

> Cliëntnamen bereiken het AI-model niet. De documenttekst wordt in uw eigen browser
> gepseudonimiseerd voordat hij wordt verstuurd.

#### De EU-route: wat er kan, en wat het kost *(uitgezocht 8 sep 2026)*

**Rechtstreeks bij Anthropic kan het niet.** Uit hun eigen privacycentrum, bijgewerkt
15 juni 2026:

> "By default, we may route customer traffic to select countries in the US, Europe, Asia
> and Australia, unless otherwise agreed upon" — **"Note that data is stored in the US."**

Verkeer kan dus in Europa landen, maar de opslag staat in de VS, ongeacht de routering. Er
is geen EU-residency-instelling op de gewone API.

> **Let op waar "Frankfurt" vandaan komt.** `vercel.json` staat op `"regions": ["fra1"]`,
> dus de serverless functies draaien in de EU, en het Supabase-project waarschijnlijk ook.
> Dat zegt niets over waar Anthropic verwerkt: de functie in Frankfurt stuurt het verzoek
> naar `api.anthropic.com`, en de doorgifte gebeurt op het moment dat het die functie
> verlaat. Eigen infrastructuur EU, AI-verwerking niet.

**Twee routes die het wél doen:**

| | AWS Bedrock `eu-central-1` | Google Vertex AI `europe-west4` |
|---|---|---|
| authenticatie | SigV4 — SDK erbij of zelf ondertekenen | OAuth-token van een serviceaccount |
| berichtformaat | vrijwel identiek (`anthropic_version: bedrock-…`, model in de URL) | idem (`vertex-2023-10-16`) |
| **streaming** | **AWS event-stream, binair** | **SSE** |
| overeenkomst met | AWS | Google |

**Die streamingregel is de hele afweging.** `claude-edge.js` en `ai-assistent.js` sluizen de
SSE van Anthropic vrijwel ongewijzigd door naar de browser. Bedrock levert binaire
event-stream-frames: die passthrough breekt en moet server-side worden gedecodeerd en
opnieuw uitgezonden. Vertex levert SSE, dus daar blijft die code grotendeels staan.

**Bedrock is de bekendere keuze; Vertex past beter op wat hier is gebouwd.** Dat is niet
wat je verwacht, en het is de reden om dit op te schrijven in plaats van het later opnieuw
af te wegen.

Wat de ombouw raakt — vier aanroepplekken, alle vier `fetch` met `x-api-key`:

- een provideradapter in `src/api/` die URL, headers en body samenstelt (daar zit de
  redenering, dus met tests)
- de twee streamende endpoints
- `_verbruik.js`: het `usage`-blok komt bij beide anders binnen, en bij streamen in twee
  stukken
- de model-ids, inclusief de Haiku-consolidatie
- omgevingsvariabelen en `vercel.json`
- een evalrun, om te bevestigen dat de screeningkwaliteit niet verschuift

**Schatting, geen meting: Vertex anderhalve dag, Bedrock twee à drie.** Het verschil zit
vrijwel volledig in het streamen.

**Drie dingen die de EU-route níét oplost:**

1. De verwerkersovereenkomst is dan met AWS of Google in plaats van met Anthropic. Eén
   doorgifte verdwijnt, het papierwerk niet.
2. Adobe krijgt het originele PDF-bestand, met namen erin. Dat is een aparte vraag — en
   die bleek meevallen; zie hieronder.
3. De prijs per token verschilt op Bedrock en Vertex van die bij Anthropic. Niet nagekeken.

#### Adobe: omgezet naar de EU-regio *(8 sep 2026, nog te toetsen)*

De PDF→DOCX-conversie stuurt het **originele** bestand naar Adobe — `pdfBase64`, met
cliëntnamen erin. Het is de enige plek in de keten waar een onbewerkt document het apparaat
verlaat; de tekst voor de AI-analyse gaat wél gepseudonimiseerd de deur uit.

Adobe kent twee regio's, en het verschil is een hostnaam:

> "For invoking region specific PDF Services API endpoints, hostnames needs to be changed
> to the following pattern: `https://pdf-services-{regionCode}.adobe.io`"

`ue1` is de Verenigde Staten en de standaard — precies wat hier stond. `ew1` is Europa,
verwerkt en opgeslagen in eu-west-1 (Ierland). De vier aanroepen bouwen hun URL nu met
`adobeHost()` uit `src/conversie/adobe-regio.js`, standaard Europa.

**Nog te toetsen, en alleen met een echte conversie.** De ontwikkelaarsdocumentatie noemt
geen voorwaarde (*"Once you purchase PDF Services API, its APIs can be configured to
process the documents in a specified region"*), maar Adobe's Trust Center zegt *"Enterprise
customers can choose the region"*. Die twee sluiten een abonnementsafhankelijkheid niet uit.
Werkt het niet, dan is `ADOBE_REGIO=us` de terugval — exact de oude hostnaam.

Onbekende waarden vallen bewust naar Europa. Een typefout in een omgevingsvariabele hoort
geen doorgifte naar de Verenigde Staten op te leveren die niemand ziet.

**Twee wegen als het abonnement de EU-regio niet draagt:**

- **ConvertAPI of CloudConvert.** Beide kunnen PDF→DOCX en noemen AVG-naleving, maar geen
  van beide adverteert een harde EU-datalocatie. Je ruilt dan één verwerker zonder
  EU-garantie voor een andere — alleen winst als ze het schriftelijk geven.
- **De conversie overslaan.** De DOCX wordt al in de browser gebouwd met JSZip; Adobe is er
  uitsluitend om de *opmaak van het origineel* te behouden. Als een mediator net zo goed
  een schoon Word-document met de aangepaste tekst kan krijgen, verdwijnt deze verwerker
  volledig uit de keten. Dat is een productvraag, geen technische.

*Ter vergelijking, want het verklaart waarom dit meer is dan een formaliteit:* LegalPA
verwerkt binnen de EU (opslag Amsterdam, AI-verwerking Zweden) en verkoopt anonimisering
als onderscheid; LegalMike houdt alles in de EER via het Europese OpenAI-endpoint en zegt
juist dat anonimiseren dáárom niet nodig is. Beide vermijden de doorgifte in plaats van
hem te regelen. Clausula is van de drie de enige die documenttekst naar de VS stuurt.

#### 1.7 — endpoints kenden alleen de token, niet het kantoor *(gedaan 7 sep 2026)*

Op 5 september bleek een geldige Supabase-token niets te zeggen over lidmaatschap van een
kantoor: wie zich kon aanmelden maar geen profielrij had, kwam overal binnen. Dat is toen
gerepareerd met `magApiGebruiken` (`src/auth/toegang.js`) — maar op drie van de acht
endpoints. De andere vijf bleven op `verifieerJWT` staan, en dat was aan niets te zien: ze
hadden allemaal keurig een auth-blok.

Onder die vijf zat `naam-decrypt.js`, dat cliëntnamen ontsleutelt. Nu sluiten alle acht
aan; `verifieerJWT` wordt nergens meer gebruikt.

> **Eén van de vijf bleek al gedekt, en anders dan ik eerst opschreef.** `uitnodigen.js`
> haalt zijn organisatie op met de RPC `org_info_voor_uitnodiging`, en zonder kantoor geeft
> die geen `org_id` terug — dat werd al een 403. De controle staat er nu toch bij, en wel
> vóór de invoervalidatie, zodat *"elk endpoint behalve `registreer` roept `magApiGebruiken`
> aan"* een regel is die een test kan nakijken in plaats van iets dat per endpoint uit de
> code moet worden afgeleid.

`tests/unit/endpoint-toegang.test.js` bewaakt drie dingen per endpoint: dat de controle er
is, dat de uitkomst het verzoek ook echt stopt, en dat het gebeurt vóórdat de payload wordt
aangeraakt. Een nieuw endpoint gaat rood tot het aansluit, of tot het bewust in
`ZONDER_CONTROLE` wordt gezet — en dan staat die keuze in de diff.

De controle laat een Supabase-storing bewust door (`ONBEKEND` → toestaan): een haperende
profielopvraag hoort geen uitval te worden. Aansluiten maakt deze endpoints dus niet
storingsgevoeliger.

#### 1.8 — de CSP staat te kijken, niet te weren

`npm run check:csp` bestaat sinds 5 september en de header staat op `report-only`. Afdwingen
kan pas als de flows die extern materiaal laden één keer met de console open zijn
doorlopen: OCR, PDF-export, DOCX-voorbeeld en download. Dat is uw handeling — een
report-only CSP meldt alleen wat hij zou blokkeren, en niemand leest die meldingen als er
niemand kijkt.

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
