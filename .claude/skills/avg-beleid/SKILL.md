---
name: avg-beleid
description: AVG/GDPR-architectuur en design-beslissingen in Clausula. Gebruik bij features die persoonsdata opslaan, verwerken of transporteren — bijv. nieuwe velden in screeningen, Storage-uploads, export-functies of wijzigingen in de pseudonimisering-pipeline.
---

# AVG-beleid in Clausula

## Welke data gaat waarheen

| Data | Opslag | Toelichting |
|------|--------|-------------|
| Rapport-JSON (issues, scores, samenvatting) | Supabase DB `screeningen.rapport` | **Gepseudonimiseerd**: echte namen vervangen door nep-namen via `anonimiseerObj` |
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

**Drie plekken, allemaal aangepast:**
- `assistent-core.js` → `bouwDossierContext` (helper `_maandJaarUitDatum`)
- `api/_feiten.js` → `bouwFeitenBlok` (helpers `maandJaarUitDatum`, `leeftijdUitDatum`)
- `api/ai-assistent.js` → `serverFields` voor `[BEKENDE GEGEVENS]`; sleutelnamen
  blijven bewust `…datum` omdat de onbekenden-filter daarop matcht, alleen de
  waarde en het `VELD_LABEL` zijn gegeneraliseerd

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
