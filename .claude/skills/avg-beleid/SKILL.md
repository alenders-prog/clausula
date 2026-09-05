---
name: avg-beleid
description: AVG/GDPR-architectuur en design-beslissingen in Clausula. Gebruik bij features die persoonsdata opslaan, verwerken of transporteren — bijv. nieuwe velden in screeningen, Storage-uploads, export-functies of wijzigingen in de pseudonimisering-pipeline.
---

# AVG-beleid in Clausula

## Welke data gaat waarheen

| Data | Opslag | Toelichting |
|------|--------|-------------|
| Rapport-JSON (issues, scores, samenvatting) | Supabase DB `screeningen.rapport` | **Gepseudonimiseerd**: echte namen vervangen door nep-namen via `anonimiseerObj` |
| Bestandsnaam (`{partij A} - {partij B}, {uploadnamen}`) | Supabase DB `screeningen.bestandsnaam` | **Gepseudonimiseerd** sinds 19-08-2026 (`_opsl_bestandsnaam`); hersteld in `laadScreening()` |
| Dossiernaam en partijvelden | Supabase DB `dossiers.naam`, `partij_a`, `partij_b` | **Bewust in klare tekst** — zie hieronder |
| Classificatie (doc_type, partijnamen) | Supabase DB `screeningen.classificatie` | **Gepseudonimiseerd** via `bouwClassificatiePseudo` |
| Naam-koppeling (nep → echt) | Supabase DB `screeningen.namen_map` | **AES-256-GCM versleuteld** met `NAAM_ENCRYPTION_KEY` |
| Ruwe geëxtraheerde tekst (`_teksten_per_pad`) | **Nooit opgeslagen** | Wordt gestript vóór opslaan (regel in `opslaan()`) |
| PDF-bestanden | Supabase Storage bucket `documenten` | Ruw (niet geanonimiseerd) — zie §PDF-opslag |
| Persoonsdata in geheugen (echte namen) | Browser-sessie — **desktop én mobiel** | Verdwijnt bij afsluiten tab |

> **Sinds 10 augustus 2026 ontsleutelt ook `assistent-mobiel.html` de `namen_map`**
> (`_ontsleutelNamen`), zodat de assistent echte namen toont in plaats van
> "Thomas Bergman". Gevolg: er staan nu ook op een telefoon echte cliëntnamen in
> het browsergeheugen. Bewuste keuze van de gebruiker; wil je die weer weghalen,
> dan is het verwijderen van die ene aanroep genoeg — de rest valt automatisch
> terug op pseudoniemen.

### De dossierlaag blijft in klare tekst — bewuste uitzondering

`dossiers.naam`, `partij_a` en `partij_b` staan onversleuteld in de database. Dat is geen
omissie: een mediator moet zijn zaak kunnen terugvinden, en een dossierlijst met
"Thomas Bergman" is onbruikbaar. Zoeken en sorteren zouden bovendien een ontsleutelronde
per rij vergen.

Gevolg voor de verantwoording: de echte namen wonen op **precies één plek per dossier** —
de `dossiers`-rij — beschermd door RLS per organisatie en per eigenaar. Alles eromheen
(rapport, classificatie, bestandsnaam, storage-metadata) draagt nep-namen. Schrijf in het
verwerkingsregister dus niet dat de database geen persoonsgegevens bevat; schrijf dat ze
tot één tabel beperkt zijn.

### Bestandsnamen gaan niet naar de server

`documentenVoorServer` stuurt `doc-1`, `doc-2` in plaats van de echte bestandsnaam.
Bestandsnamen dragen routinematig cliëntnamen ("Convenant fam. Schreven-van Zand def2.pdf")
en `api/analyseer.js` zet ze onbewerkt in de prompt (regels 323, 488, 733).

> Pseudonimiseren zou hier niet volstaan: de kaart matcht op formele naamvormen, terwijl
> een bestandsnaam juist afkortingen en samenstellingen bevat die daarbuiten vallen.
>
> De server echoot het kenmerk terug in elk SSE-event. `_bnVanServer` vertaalt het bij
> binnenkomst terug, want `_sseAcc` en de documenttabbladen zijn op de échte bestandsnaam
> gesleuteld. Voeg je een nieuw SSE-event toe: vertaal daar dus ook.

## De classificatiestap — waarom de kaart uit de wizard komt

Er zijn twee Claude-aanroepen: **classificatie** (Haiku, documenttype + situatiekenmerken
+ datums) en **analyse**. De kaart werd vroeger opgebouwd uít het antwoord van de
classificatie, dus die eerste aanroep kreeg noodzakelijkerwijs **ruwe tekst** — de eerste
3.000 tekens per document, of 6.000 bij één document. Precies het personaliablok.

Sinds 19 augustus 2026 komt de kaart uit de wizard-invoer: `huidigDossierPartijA/B` en
`wizardRoepnaamA/B` staan al in de browser vóór er iets verstuurd wordt (*Voornamen* is
zelfs een verplicht veld). Daarmee gaan de partijnamen in **geen van beide** stappen naar
Anthropic.

```
wizard-invoer → _voorlopigeCls → bouwAnonMap → _voorafKaart
                                                  │
                       classificatietekst ────────┼──► anonimiseerTekst ──► Anthropic
                                                  │
                       antwoord met nep-namen ◄───┘
                                                  │
                                          herstelAnonObj ──► classificatie met echte namen
```

> **Twee kaarten, dezelfde nep-namen.** `bouwAnonMap` deelt `NEP_PERSONEN` uit in vaste
> volgorde: partij A krijgt index 0, partij B index 1, daarna mediator en notaris. De
> voorlopige kaart en de definitieve kaart geven de partijen dus dezelfde nep-naam.
> Verander je die registratievolgorde, dan lopen ze uiteen en herstelt het antwoord van
> de classificatie naar de verkeerde persoon.

> **Wat nog steeds ruw meegaat**: namen die de browser vooraf niet kán kennen — kinderen,
> mediator, notaris. Die haalt de classificatie juist uit de tekst. Wil je die ook
> dichtzetten, dan moet de wizard ernaar vragen. Postcodes, adressen en woonplaatsen gaan
> wél gemaskeerd: de PII-tracker wordt nu vóór de classificatie aangemaakt en over beide
> stappen gedeeld.

### Naamcontrole — waarom die er moet zijn

De kaart matcht op **letterlijke tekst** (`naarAnon` op kleine letters: volledige naam,
voornaam, achternaam, bezitsvorm). Zolang de namen uit het document kwamen, matchten ze
per definitie. Nu ze uit een invoerveld komen, betekent één tikfout dat die naam **nergens**
vervangen wordt — niet in de tekst naar Anthropic, niet in het opgeslagen rapport — zonder
enig signaal.

`controleerNamenTegenTekst()` draait daarom vóór de eerste aanroep: komt elke opgegeven
naam letterlijk voor? Zo niet, dan zoekt hij via Levenshtein de meest gelijkende
kandidaat in het personaliablok (drempel: een kwart van de naamlengte) en vraagt
`toonNaamControle()` wat de bedoeling was. Wie doorgaat zonder correctie krijgt een
`console.warn` met welke namen onvervangen meegaan.

> Bijvangst: dit vangt ook het geval dat er een document aan het verkeerde dossier hangt.
> Dan komt geen van de namen voor.

## Pseudonimisering-pipeline (opslaan)

```
huidigRapport (echte namen in geheugen)
  │
  ├─ strip _teksten_per_pad
  │
  └─ anonimiseerObj(rapportZonderBulk, huidigeNaarAnon)
       │
       └─ _opsl_rapport (nep-namen, opgeslagen in Supabase)
```

`huidigeNaarAnon` = Map<echteNaam → nepNaam> (opgebouwd tijdens classificatie).
`anonimiseerObj` vervangt **recursief** alle string-waarden waar een echte naam in voorkomt.

## Pseudonimisering-pipeline (laden)

```
Supabase record (nep-namen)
  │
  ├─ decrypt namen_map via /api/naam-decrypt
  │
  └─ herstelAnonObj(rapport, snapNaarEcht)
       │
       └─ rapport met echte namen (alleen in browser-geheugen)
```

## Woonplaatsen — waar ze wél en niet worden vervangen

De plaatspatronen in `src/naam-anonimiseer.js` zijn **verankerd**, niet vrij. Een los
`te <Hoofdletter>` komt in juridische tekst overal voor ("te zijner tijd", "te koop",
"de rechtbank te Deventer"), dus elk patroon hangt aan een ankerwoord: `geboren`,
`wonende/woonachtig/gevestigd/gedomicilieerd/ingeschreven`, of een woord over de woning
(`gelegen`, `woning`, `woonhuis`, `pand`). Dat laatste blok kwam er op 5 september 2026 bij
omdat de residu-controle op een echte analyse "Holten" bleef melden: *"de echtelijke woning
is gelegen te Holten"* is in een convenant de gangbaarste vorm, en geen enkel patroon
raakte hem.

> **Nooit de `i`-vlag op deze patronen.** Met `/i` wordt óók `[A-Z]` hoofdletterongevoelig,
> en dan matcht het optionele tweede naamdeel gewoon het volgende woord. Gemeten:
> `"De woning te Holten wordt verkocht"` werd `"De woning te [WOONPLAATS_0] verkocht"` —
> **er verdween tekst uit het document dat naar Claude gaat**, niet alleen een plaatsnaam.
> Schrijf het ankerwoord daarom als `[Ww]onende`, niet als `wonende` met `/i`.
>
> Diezelfde vlag stond vanaf het begin op de `wonende te`-regel. Hij viel pas op door een
> testbatterij die óók de gevallen bevatte die *niet* vervangen mogen worden — een battery
> met alleen positieve gevallen had hem nooit gevonden.

**Landen blijven staan** (`NIET_WOONPLAATS` in dezelfde module). Een land is geen woonplaats
maar een rechtsgebied, en `src/rapport/internationaal.js` leidt uit "partijen wonen in
verschillende landen" af welke verordening geldt. Wordt "Duitsland" een placeholder, dan
verdwijnt precies het gegeven waarop de IPR-toets draait. Die lijst is een uitzondering op
de bescherming en hoort dus alleen te groeien met een reden die opgeschreven kan worden.

## Datums en nationaliteit — generaliseren, niet pseudonimiseren

Vastgelegd 8 augustus 2026. Geldt voor `huwelijksdatum`, `partij_*_geboortedatum`,
`kinderen_geboortedatums`/`-jaren` en `nationaliteit_*`.

**Waarom niet pseudonimiseren.** Een naam vervangen door `[PERSOON_A]` kost niets —
de redenering heeft de naam niet nodig. Bij deze velden is de waarde juist de
juridische betekenis: de huwelijksdatum bepaalt de 1-1-2018-grens, de geboortedatum
de leeftijd (AOW, alimentatieduur), de kinderleeftijd het hoorrecht. `[DATUM]` maakt
de assistent dom op precies de punten waar hij scherp moet zijn.

**Wat wel: generaliseren op de grens naar Anthropic.**

| Veld | Wat er meegaat |
|---|---|
| `huwelijksdatum` | **maand-jaar** (`06-2019`) — fijn genoeg voor huwelijks- en alimentatieduur |
| `partij_*_geboortedatum` | alleen de **leeftijd** |
| `kinderen_geboortedatums` | alleen de **leeftijd** per kind |
| `nationaliteit_a` / `_b` | **exact** — zie uitzondering |

**Uitzondering nationaliteit.** Gaat onverkort mee. `niet-NL` volstaat niet: de
concrete nationaliteit bepaalt het toepasselijk recht (Rome III, Brussel IIb) en
daarmee welke regels de assistent moet noemen.

**Vier plekken, allemaal aangepast:**
- `assistent-core.js` → `bouwDossierContext` (helper `_maandJaarUitDatum`)
- `api/_feiten.js` → `bouwFeitenBlok` (helpers `maandJaarUitDatum`, `leeftijdUitDatum`)
- `api/ai-assistent.js` → `serverFields` voor `[BEKENDE GEGEVENS]`; sleutelnamen
  blijven bewust `…datum` omdat de onbekenden-filter daarop matcht, alleen de
  waarde en het `VELD_LABEL` zijn gegeneraliseerd
- `src/avg/persoonsdetails.js` → **de documenttekst zelf** (sinds 4 september 2026)

> **Die vierde ontbrak drieënhalve week.** De regel gold voor het feitenblok van de
> assistent, maar niet voor de documenttekst die naar `api/analyseer.js` gaat — en dáár
> gaat het hele convenant doorheen. Nagespeeld op een gewone alinea bleef dit staan nádat
> alle vervangingen hadden gedraaid:
>
>     Robin Bergman, geboren te Enschede op 12-12-1996, wonende te [POSTCODE_1]
>     [WOONPLAATS_2] aan Markendoel 16, werkzaam bij Pensioenfonds Zorg en Welzijn.
>
> Geboortedatum, geboorteplaats, huwelijksplaats, werkgever, en een adres waarvan de
> straatnaam niet op -straat/-laan/-weg eindigt (het bestaande patroon eist zo'n suffix).
> Geboortedatum plus geboorteplaats plus werkgever is in Nederland vrijwel altijd tot één
> persoon te herleiden.
>
> In de documenttekst wordt de geboortedatum tot **alleen het jaar** teruggebracht, niet tot
> een leeftijd: een leeftijd verandert mee met de datum van vandaag en maakt de tekst
> intern tegenstrijdig ("geboren 42, in 2011 geboren"). Het jaar houdt de 1-1-1970-grens
> van art. 1:157 lid 3 BW toetsbaar. De huwelijksdatum blijft maand-jaar, gelijk aan de
> tabel hierboven.

## De belofte is een meting, geen garantie

Sinds 4 september 2026 draait `src/avg/residu.js` na elke vervanging over de tekst die het
kantoor verlaat, en meldt wat er nóg identificerend uitziet. Aangesloten in `index.html`
op de plek waar `documentenVoorServer` wordt opgebouwd; de balk heet `#residuBalk`.

**Waarom dit er moest komen.** De vervanging kent alleen de namen die de classificatie
heeft opgehaald. Een kind dat daar niet bij zat gaat er ongemerkt doorheen — nagespeeld:
"Uit het huwelijk is geboren: **Jochem** ter Bergman". Er was geen enkel signaal.

**Wat patronen principieel niet vangen**, en waarom de tekst in de app is aangepast:

    "de vrouw werkt als tandarts in het dorp waar beide partijen zijn opgegroeid"

Geen naam, geen datum, geen adres — en herleidbaar. Daar bestaat geen regel voor, niet
hier en niet in enig ander regelgebaseerd systeem. **"Volledig geanonimiseerd" en
"Volledig AVG-proof" staan daarom niet meer in de app.** Wat er staat is wat waar te maken
is: welke soorten gegevens worden vervangen, dát er daarna gecontroleerd wordt, en wat die
controle vond. Nul residu betekent "geen van de patronen vond nog iets" — niet "deze tekst
is niet herleidbaar". Houd dat onderscheid intact bij elke herformulering.

**Bij wijzigen van `residu.js`:** de woordenlijst `BEKEND` bepaalt de valse meldingen, en
een melder die te vaak afgaat wordt genegeerd — dat is een echt risico, geen netheidskwestie.
`tests/unit/residu.test.js` legt beide kanten vast: nul meldingen op de golden fixtures mét
volledige namenkaart, én een melding zodra er een kind ontbreekt. Die tweede is wat de
eerste betekenis geeft. `tests/e2e/smoke/16-avg-residu.spec.js` toetst de bedrading in de
browser — de brug-toewijzing weghalen maakt hem rood (nagegaan).

**Bij opslag blijven de ruwe waarden staan** — bewuste uitzondering op regel 4
hieronder, gedocumenteerd boven `bouwClassificatiePseudo` in `index.html`.
Reden: eigen database, RLS per organisatie, en de bron-PDF met dezelfde gegevens
staat er toch al in. De kop van de dossiercontext heet daarom
`Dossier (namen gepseudonimiseerd)` en niet meer `(geanonimiseerd)` — dat laatste
klopte niet zodra er datums in stonden.

## PDF-opslag (Supabase Storage)

**Bucket**: `documenten` (privaat — geen publieke toegang).

**Twee pad-formaten in gebruik** — geen van beide bevat persoonsdata (AVG-eis), maar
ze worden verschillend opgeruimd:

| Waar | Pad |
|---|---|
| `index.html` multi-doc upload (~regel 6353) | `{organisatie_id}/{tijdstempel}-{random}.{ext}` |
| `index.html` eerste `opslaan()` (~regel 6484) | `{screeningId}/{volgnummer}.pdf` |

**Opruimen bij verwijderen** gaat via `storagePadenVanScreening(id)` in `index.html`.
Die leest de werkelijke paden uit `rapport._document_bestanden` — dat dekt beide
indelingen — en neemt de map `{screeningId}/` als fallback voor oudere records.

> **Roep hem aan vóór het verwijderen van de rij**: daarna is het rapport weg en
> daarmee de enige plek waar de paden van de eerste indeling staan. Dat was de
> oorzaak van de oude bug (10 augustus 2026): de cleanup deed alleen
> `storage.list(versieId)` en liet dus alles onder het organisatie-id staan —
> 336 verweesde PDF's met persoonsgegevens tegenover 111 screenings.

**Drie routes waarlangs bestanden verdwijnen — alle drie moeten opruimen.**
Op 19 augustus 2026 bleek dat er maar één werkte, wat de tweede bron van die 336
verweesde PDF's was:

| Route | Waar | Opruiming |
|---|---|---|
| Analyse verwijderen in een geopend dossier | `toonDossierDetail()` | `storagePadenVanScreening` |
| Dossier verwijderen (overzicht én detail) | `verwijderDossierMetAnalyses()` | `storagePadenVanDossier` |
| Analyse vervangen door een nieuwe | update-tak van `opslaan()` | oude paden minus nieuwe |

> Bij het vervangen geldt een voorwaarde: ruim alleen op als het **nieuwe** rapport
> zelf `_document_bestanden` heeft. Een tussentijdse opslag zonder bestandenlijst
> zou anders het verschil als "verlopen" zien en alles wissen.

> Het verwijderen van een dossier zette `dossier_id` vroeger op `null` (de
> foreign key is `ON DELETE SET NULL`) met de belofte dat de analyse onder "losse
> analyses" zou verschijnen. Dat scherm bestaat niet — de analyse werd onvindbaar
> en hield zijn PDF's. Sindsdien gaan de analyses mee.

**Metadata** (`rapport._document_bestanden`): `[{ pad, naam }]`
- `pad` = storage-pad (geen persoonsdata)
- `naam` = oorspronkelijke bestandsnaam (voor UI-weergave + file-matching)

**Toegang**: via signed URL (3600 seconden geldig), gegenereerd in `laadScreening()`.

**Risico-overweging**: PDFs bevatten ruwe persoonsdata (namen, adressen, financiën, handtekeningen). Opslag in Supabase Storage is acceptabel mits:
1. Bucket is **privaat** (geen publieke URL)
2. RLS-policy beperkt toegang tot de eigen organisatie
3. Signed URLs zijn tijdgebonden (1 uur)
4. Geen indexering door zoekmachines

**Wanneer Storage upload plaatsvindt**: alleen bij de eerste `opslaan()` call (INSERT), daarna niet meer. Herhaalde auto-saves updaten alleen de DB-rij (geen re-upload).

## Bewaartermijn — de opgeslagen bestanden zijn de originelen

**Alles in dit systeem is afgeleid — rapport, classificatie, feiten — behálve de bestanden
in Storage.** Beide uploadpaden sturen het `File`-object zoals de mediator het koos; de
pseudonimisering werkt op de tekst die naar Anthropic gaat, niet op wat er in de opslag
ligt. Dat maakt de bucket het waardevolste doelwit dat er is, en het is precies wat er op
5 september 2026 zonder inloggen bereikbaar bleek (`docs/incident-2026-09-05-storage.md`).

**De termijn staat in `organisaties.retention_maanden`** — sinds `001_multitenancy.sql`,
standaard 12 maanden. Die kolom werd tot 5 september 2026 door niets gelezen: gebouwd en
nooit aangesloten, dezelfde vorm als `screening_id` in `api_verbruik`.

| Wat | Waar |
|---|---|
| de regel (verlopen? vervaldatum? melding?) | `src/avg/bewaartermijn.js`, 13 tests |
| het opruimen zelf | `scripts/opschonen.mjs` — `npm run opschonen`, **droogloop tenzij `--ja`** |

**Alleen het bestand gaat weg.** De screening, het rapport en de bevindingen blijven; die
zijn gepseudonimiseerd en dragen de waarde van het werk. Wat daarna niet meer kan: het
originele stuk inzien, downloaden, en heranalyseren zonder opnieuw te uploaden.

> **Bij twijfel blijft het staan.** `isVerlopen()` geeft `false` bij een ontbrekende datum
> of een termijn van nul — een opruimscript dat bij twijfel weggooit, gooit precies één keer
> te veel weg. Let daarbij op `new Date(null)`: dat is 1 januari 1970, een geldige datum
> waarvan élke termijn verstreken is. Zonder een expliciete toets op ontbreken zou een
> bestand zónder uploaddatum dus als eerste verdwijnen. Een test ving dat.

Na het opruimen krijgt een screening waarvan **alle** bronbestanden weg zijn
`rapport._bronbestanden_verwijderd_op`. `bronbestandMelding()` gebruikt dat om de mediator
te vertellen wat er is gebeurd, in plaats van "Download mislukt: Object not found" — die
twee horen niet hetzelfde te klinken.

## Cliëntnamen horen niet in een logregel

Een bestandsnaam is in dit vak "Convenant Jansen-de Vries.pdf". Zes logregels in
`api/analyseer.js` zetten die in de **Vercel-logs**: een externe verwerker, met een
bewaartermijn waar wij niet over gaan, voor een gegeven dat bij het opsporen van een storing
niets toevoegt — het gaat om wélk document, niet om wiens document. Twee regels in
`api/_iban.js` konden een volledig rekeningnummer loggen, juist omdat dat patroon bewust
óók echte IBANs matcht.

**Gebruik `docRef()` en `ibanRef()` uit `src/avg/logref.js`** in alles wat server-side
logt. Dezelfde invoer geeft dezelfde verwijzing, dus logregels over hetzelfde document
blijven aan elkaar te knopen. Placeholders als `[IBAN_0]` blijven staan — juist die
nummering maakt een logregel bruikbaar.

> **De browserconsole is bewust ongemoeid.** Die verlaat de machine niet, en daar is de
> bestandsnaam juist nuttig. **Dat verandert zodra er foutmonitoring komt**: een SDK als
> Sentry stuurt console-breadcrumbs én exception-teksten mee. Loop dan eerst deze plekken
> in `index.html` na — de logregels rond 3839 (documentpassages), 4079, 4450, 4922, 4930,
> 6871, 6901, en de `throw` op 7219 met de bestandsnaam erin.

## HTML-ontsnapping en de CSP

**`escH()` ontsnapt `&<>"'` — óók de aanhalingstekens.** Dat verschil is het verschil tussen
tekst en attribuut. Er staan achttien attributen in `index.html` van de vorm
`title="${escH(bestandsnaam)}"`; ontsnapt `escH` de `"` niet, dan breekt een waarde daar
gewoon uit en past er een `onerror=` achter. Tot 5 september 2026 deden `index.html` en
`assistent-core.js` dat niet; `src/dashboard/scherm.js` en `src/auth/mfa-scherm.js` wel.
Alle vier zijn nu gelijk en worden bewaakt door `tests/unit/esc-html.test.js`, die de
definities uit de bron leest.

> **`escH` is niet genoeg binnen een `on…`-attribuut.** Een attribuutwaarde wordt eerst
> HTML-ontsnapt en pás daarna als JavaScript gelezen, dus `&#39;` wordt weer een `'` vóórdat
> de JS-parser kijkt. `onclick="f('${escH(naam)}')"` is dus niet veilig. Geef zulke waarden
> door via een `data-`attribuut en lees ze met `this.dataset.…`.
>
> Dat was geen theorie: de gebruikerslijst zette `u.naam` in zo'n string, en die naam typt de
> gebruiker zelf bij registratie (en kan hij later wijzigen). Het scherm waar hij landt is
> het **beheerdersscherm**, waar rollen worden gewisseld en dossiertoegang wordt aangezet.

**De CSP staat bewust op `Report-Only`** (`vercel.json`). Wat hij wel en niet doet:

| | |
|---|---|
| **wel** | geen externe scripts buiten jsdelivr/cdnjs, geen exfiltratie naar een vreemde host (`connect-src`), `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` |
| **niet** | ingespoten *inline* script tegenhouden — met 135 `on…`-attributen en de hele app in één inline `<script>` is `'unsafe-inline'` onvermijdelijk |

Hij is dus diepteverdediging naast het ontsnappen, geen vervanging ervan.

> **Waarom report-only en niet meteen afdwingen.** De OCR-route laadt op het moment zelf
> zijn worker, wasm en taaldata bij een CDN (`Tesseract.createWorker` zonder paden — gemeten:
> de bundel verwijst alleen naar `cdn.jsdelivr.net`), en pdf.js haalt zijn worker bij cdnjs.
> Een te strakke CSP breekt dat stil, en dat merkt niemand tot een mediator erop stuit.
> Loop dus eerst de zware routes door met de console open — OCR, PDF-export (pdfmake),
> DOCX-voorbeeld (mammoth/docx-preview), downloaden — en zet hem pas daarna om naar
> `Content-Security-Policy`.

## Wat NOOIT naar de server mag

- `_teksten_per_pad` — ruwe bulk-tekst, bevat onbewerkte persoonsdata
- `huidigeNaarAnon` / `huidigeNaarEcht` Maps — pseudonimiserings-sleutels, alleen browser-geheugen
- Plaintext namen zonder eerst te pseudonimiseren

## Regels bij nieuwe features

1. **Nieuw veld in rapport opslaan?** → Controleer of het persoonsdata kan bevatten. Zo ja: zorg dat `anonimiseerObj` het verwerkt (of sluit het expliciet uit en documenteer waarom).

2. **Nieuw bestand/blob uploaden naar Storage?** → Gebruik het formaat `{screeningId}/{index}` (geen namen in het pad). Sla de originele naam op als metadata. Overweeg of geanonimiseerde versie voldoet.

3. **Export-functie?** → Exporteer alleen gepseudonimiseerde data, tenzij de gebruiker expliciet toestaat echte namen te exporteren (en dit wordt gelogd).

4. **Nieuw veld in classificatie?** → Controleer of het persoonsdata bevat. Zo ja: voeg toe aan `bouwClassificatiePseudo`.

5. **Server-side functie krijgt request-body?** → Ga ervan uit dat de body gepseudonimiseerde data bevat. Nooit opslaan zonder te controleren op nep-namen vs. echte namen.

## Relevante code-locaties

| Wat | Bestand | Zoekterm |
|-----|---------|----------|
| Pseudonimisering bij opslaan | `index.html` | `anonimiseerObj` |
| Naam-versleuteling | `api/naam-encrypt.js` | `NAAM_ENCRYPTION_KEY` |
| Naam-ontsleuteling bij laden | `index.html` | `laadScreening` → `decrypt_namen` |
| PDF-upload naar Storage | `index.html` | `_wasInsert && huidigeBestandenLijst` |
| PDF-download van Storage | `index.html` | `_document_bestanden` |
| Storage cleanup bij delete | `index.html` | `Storage cleanup` |

## Storage: het dashboard laat geen bestand achter

Op 5 september 2026 stond de `documenten`-bucket open voor anonieme bezoekers. Met alleen
de publieke sleutel uit `config.js` — die aan elke bezoeker van app.clausula.nl wordt
geserveerd, en die géén geheim is — kon iemand zonder in te loggen:

```
mappen opsommen (dossier-UUID's)      HTTP 200
bestanden in een map opsommen         HTTP 200   12 bestanden
een cliëntdocument downloaden         HTTP 200   107.422 bytes
een ondertekende URL aanvragen        HTTP 200
```

`supabase/001_multitenancy.sql` bevat wél de juiste drie policies: `TO authenticated`, en
de eerste mapnaam moet de organisatie van de gebruiker zijn. Die stonden er ook. Ernaast
stonden er drie op de anon-rol — `allow anon download / signed url / upload`, met de
naamsuffix die de **policywizard in het Supabase-dashboard** genereert. Ook een
INSERT-policy, dus anoniem plaatsen kon eveneens.

**De les is niet "let op je policies".** Die stonden goed in de repo. De les is:

> **Een wijziging via het Supabase-dashboard laat geen bestand achter.** Geen migratie,
> geen diff, geen hook, geen test, geen review kan er iets van zien. Alles wat dit project
> aan poorten heeft, kijkt naar bestanden — en dit stond buiten die hele wereld.

Dezelfde faalvorm als de kennisbank-tags die je in het dashboard aanpast (zie CLAUDE.md);
daar is het gevolg een chunk die nergens opduikt, hier waren het cliëntdossiers.

**Daarom `npm run check:storage`** (`scripts/storage-toegang-check.mjs`): die leest geen
beleid en gelooft geen migratie, maar doet wat een willekeurige bezoeker doet en kijkt wat
er terugkomt. Exitcode 1 zodra er iets doorkomt. Draai hem na élke wijziging aan Storage,
en bij voorkeur periodiek — dit is de enige controle in deze repo die een dashboardwijziging
kan betrappen.

Hij haalt bewust geen documentinhoud op (de body wordt afgebroken) en schrijft niets, dus
de INSERT-kant blijft handwerk: kijk in het dashboard of er een INSERT-policy op anon staat.

Herstel: `supabase/2026-09-05-storage-anon-dicht.sql`.
