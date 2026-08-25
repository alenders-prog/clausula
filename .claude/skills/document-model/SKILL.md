---
name: document-model
description: Datamodel, documenttypes, multi-document architectuur en opzoekpatronen voor Clausula. Gebruik deze skill bij het aanpassen van tab-handling, documenttype-logica, rapport-structuur, huidigRapport-velden, _concepts/_concept storage, of de combinatie van Convenant en Ouderschapsplan in één dossier.
---

# Clausula Document-datamodel

## Documenttypes (8 waarden)

| Waarde | Label | Rol |
|--------|-------|-----|
| `convenant` | Echtscheidingsconvenant | **HOOFD_TYPE** — eigen analyse-tab |
| `ouderschapsplan` | Ouderschapsplan | **HOOFD_TYPE** — eigen analyse-tab |
| `zorgverdeling` | Zorgverdeling | Context van `ouderschapsplan` |
| `huwelijkse_voorwaarden` | Huwelijkse voorwaarden | Context van `convenant` |
| `waarde_verdeling` | Waardebepaling | Context van `convenant` |
| `pensioenopgave` | Pensioenopgave | Context van `convenant` |
| `id_bewijs` | Identiteitsbewijs | Context van alle hoofddocs |
| `overig` | Overig | Context van alle hoofddocs |

`HOOFD_TYPES = new Set(['convenant', 'ouderschapsplan'])` — alleen deze worden
afzonderlijk geanalyseerd met hun eigen tab en issues-lijst.

**Fallback**: als er geen HOOFD_TYPES in de tray zitten, worden álle documenten
behandeld als HOOFD_TYPE (analyse gaat gewoon door).

### Tabvolgorde (huidigeDocumenten[])
```
ouderschapsplan  → 0
zorgverdeling    → 1
convenant        → 10
waarde_verdeling → 11
overige          → 99 (tiebreaker, altijd achteraan)
```
De gaten tussen 1 en 10 zijn opzet: ze laten ruimte om later types tussen te
voegen zonder de bestaande rangen te herschikken. De fallback moet daarom
**hoger dan elk bekend type** zijn (99) — met een waarde als 9 belanden
onbekende documenten tussen zorgverdeling en convenant in plaats van achteraan.

Canonieke bron: `src/rapport/sorteer-docs.js` (`DOC_VOLGORDE`, `sorteerOpDocType`,
`sorteerOpType`). Let op: `index.html` heeft nog twee inline kopieën van deze map
(in `toonRapport` en `laadScreening`/`_TAB_VOLGORDE`) — houd die gelijk. De
losse `DOC_VOLGORDE` in `maakDocKolommenHtml` is iets anders: die bepaalt
kolompositie voor alleen OP/convenant.

### Actief documenttype opzoeken — altijd zo:
```js
huidigeDocumenten[huidigeDocIdx]?.doc_type || huidigeClassificatie?.doc_type || ''
```
Gebruik **nooit** `huidigeClassificatie.doc_type` alleen — dat is het type van de
top-level screening, niet van het actieve tabblad in multi-doc modus.

---

## Gecombineerde _document_tekst

Wanneer meerdere documenten zijn geanalyseerd, worden hun teksten samengevoegd met een
scheidingsregel:

```
=== CONVENANT: bestandsnaam.pdf ===
[tekst van convenant]

=== OUDERSCHAPSPLAN: ander-bestand.pdf ===
[tekst van ouderschapsplan]
```

`haalDocTypeTekst(volledigeTekst, docType)` extraheert één sectie hieruit. De functie:
- Zoekt regels die matchen op `/^={2,}\s*.+\s*={2,}$/`
- Vergelijkt het label (na strip van `==`) case-insensitief met `DOC_TYPE_LABELS[docType].toUpperCase()`
- **Fallback**: als de sectie niet gevonden wordt, retourneert het de volledige gecombineerde tekst

De `_document_tekst` is **pseudonimiseerd** (echte namen zijn vervangen door placeholders).

---

## huidigRapport — volledige structuur

```
{
  // Issues (twee schema's, v2 heeft voorrang):
  issues: [...],           // v2: platte array (preferred)
  juridisch: [...],        // oud schema
  volledigheid: [...],
  balans: [...],
  grammatica: [...],
  conflicten: [...],

  // MfN-score (zie screening-categorien skill):
  mfn_score: { score_aanwezig, score_totaal, elementen: [...] },

  samenvatting: "...",     // AI-samenvatting van het document

  // Multi-doc sub-rapporten:
  documenten: [
    {
      doc_type: "convenant",
      issues: [...],
      mfn_score: {...},
      samenvatting: "...",
    },
    {
      doc_type: "ouderschapsplan",
      ...
    }
  ],

  // Tekst en concepten:
  _document_tekst: "...",  // pseudonimiseerd; gecombineerd voor multi-doc
  _concepts: {             // per-doctype conceptopslag
    convenant: {
      document_tekst: "...",    // aangepaste versie
      origineel_tekst: "...",   // snapshot origineel
      wijzigingen: [...],
      gegenereerd_op: "ISO-8601"
    },
    ouderschapsplan: { ... }
  },
  _concept: { ... },       // LEGACY: enkelvoudige screening (zelfde structuur)

  // Opgeslagen bestandsinfo:
  _document_bestanden: [{ pad, naam, type }],
  _teksten_per_pad: { "pad/naar/file.pdf": "tekst..." },
}
```

### Concept opzoeken — altijd deze compound expression:
```js
rapport._concepts?.[docType]
  || (docType === classificatie?.doc_type ? rapport._concept : null)
```
De legacy `_concept` fallback is alleen geldig als `docType` overeenkomt met de
top-level classificatie — in multi-doc modus altijd `_concepts[docType]` gebruiken.

---

## huidigePrimaireBest — bestanden per tab

Array van arrays, geïndexeerd op tabvolgorde (`huidigeDocIdx`):

```js
huidigePrimaireBest[huidigeDocIdx]
  // PDF voor Adobe/DOCX-conversie:
  ?.find(f => f.name?.toLowerCase().endsWith('.pdf'))
  || huidigePrimaireBest[huidigeDocIdx]?.[0]
```

Elke inner array bevat `File`-objecten voor dat tabblad. Voor het concept-reviewscherm
wordt het PDF-bestand van het actieve tabblad gebruikt voor track-changes in de DOCX-export.

---

## voegStandaardveldenToe() — backward-compat patching

Wordt aangeroepen na het laden van elk rapport (zowel nieuw als opgeslagen).
Zorgt voor:
- Elk issue heeft `afgehandeld: false` (als dat veld ontbreekt)
- Elk issue heeft `opmerking: ''` (als dat veld ontbreekt)
- Als `rapport[cat]` een object `{}` is (Claude-bug bij onbekende doctypes) → reset naar `[]`
- Wordt ook recursief toegepast op `rapport.documenten[]` items

> **Valkuil**: als je issues direct aanpast in `rapport` zonder `voegStandaardveldenToe()`
> daarna aan te roepen, kan `afgehandeld` of `opmerking` ontbreken en crasht de UI.

---

## Documenttype-detectie op basis van bestandsnaam (raadDocType)

Keyword-matching, eerste treffer wint:

| Keywords in bestandsnaam | Gedetecteerd type |
|--------------------------|-------------------|
| `convenant` | `convenant` |
| `ouderschap` | `ouderschapsplan` |
| `zorgverdeling`, `zorgregeling`, `zorg-` | `zorgverdeling` |
| `huwelijkse`, `hvw`, `\bhv\b` | `huwelijkse_voorwaarden` |
| `waarde`, `waardebepaling`, `bijlage` | `waarde_verdeling` |
| `pensioen` | `pensioenopgave` |
| `paspoort`, `rijbewijs`, `\bid\b` | `id_bewijs` |
| (geen match) | `overig` |

---

## Terminologie: dossier / screening / rapport

| Term | Betekenis |
|------|-----------|
| **Dossier** | Benoemde houder van **één** screening (aparte tabel) — zie hieronder |
| **Screening** | Één rij in `screeningen` tabel: bevat `classificatie` (jsonb) + `rapport` (jsonb) |
| **classificatie** | Metadata: `doc_type`, `partij_a_naam`, `partij_b_naam`, `situatie_kenmerken`, `samenvatting` |
| **rapport** | Alle analyse-output: issues, mfn_score, documenten[], _document_tekst, _concepts |
| `huidigeId` | UUID van de actieve screening |
| `huidigeClassificatie` | Het `classificatie` jsonb-object |
| `huidigRapport` | Het `rapport` jsonb-object; in multi-doc = het rapport van het actieve tabblad (na tab-switch) |

### Eén dossier houdt één screening — vervangen, niet versioneren

Het datamodel staat meerdere screenings per dossier toe (`dossier_id` is een gewone
foreign key), maar de app doet dat niet meer. In `opslaan()` staat:

```js
// 2. Als er een dossier is maar nog geen screeningId: zoek bestaande screening op (vervangen).
if (app.dossierId && !app.screeningId) { … app.screeningId = bestaand.id; }
```

Een nieuwe analyse in een bestaand dossier werkt dus de bestaande rij bij. `laadDossiers()`
toont per dossier alleen de nieuwste screening; er is **geen** weergave van oudere versies
en **geen** weergave van screenings zonder dossier.

> **Valkuil.** In de CSS en de eventhandlers zaten tot 19 augustus 2026 resten van het
> oude versiemodel: `.dos-oud-kaart`, `.dos-expand-btn` en een tweede
> versie-verwijderknop in `laadDossiers()`. Die verwezen naar HTML die niemand meer
> genereerde en suggereerden functionaliteit die er niet was. Verwijderd. Kom je nog
> zoiets tegen: controleer eerst of iets de betreffende class nog uitschrijft.
>
> Gevolg voor opruimen: laat een screening nooit achter zonder dossier. Er is geen
> scherm dat hem toont, dus hij wordt onvindbaar terwijl zijn PDF's blijven staan.
> Zie de skill `avg-beleid` voor de drie routes die moeten opruimen.

---

## Tekstrendering: lijnclassificatie

Hetzelfde classificatiepatroon wordt op drie plekken gebruikt
(`documentTekstNaarHtml`, `renderTekstFallback`, `soortVan`). Wijzigingen moeten
op alle drie plekken consistent doorgevoerd worden:

| CSS-klasse | Triggerpatroon |
|------------|----------------|
| `cdoc-kop` | `^(Artikel\|ARTIKEL)\s+\d+`, of all-caps (4–80 tekens), of markdown `#`/`##` |
| `cdoc-sub` | `^\d+\.\d+\.?\s`, of `^\d+\.\s+[A-Z]` (< 200 tekens), of markdown `###`+ |
| `cdoc-lijst` | `^[a-z]\)\s` of `^[-–•*]\s` |
| `cdoc-par` | alles overig |

`==`-scheidingsregels (`/^={2,}\s*.+\s*={2,}$/`) worden `cdoc-scheiding` divs;
het label wordt gestript van `CONVENANT:` / `OUDERSCHAPSPLAN:` / `CONTEXT:` prefixen.

---

## MfN-score: niet vertrouwen op opgeslagen score-velden

`renderMfnScore()` berekent `aanwezig`/`onvolledig`/`ontbreekt` altijd opnieuw vanuit
`mfn.elementen[]` — de opgeslagen `score_aanwezig` en `score_totaal` worden genegeerd.
Claude's telwaarden zijn informatief; gebruik altijd de elementen-array als bron.

---

## Analyse-architectuur (recap voor context)

De `api/analyseer.js` handler ontvangt `{ classificatie, documenten[] }`. Per HOOFD_TYPE:

1. **Twee parallelle Sonnet-calls** per document:
   - `registreer_structuur` — volledigheid + MfN-score
   - `registreer_bevindingen` — juridisch + balans + grammatica + conflicten (gecombineerd in één call)
2. Elk document wordt **in isolatie** geanalyseerd — andere hoofddocumenten worden niet als context meegegeven (voorkomt cross-document besmetting).
3. SSE-events per document: `structuur`, `juridisch`, `balans` (dummy voor frontend-compat, leeg resultaat).
4. **Na alle per-document analyses** (alleen bij 2+ hoofddocumenten): één aparte cross-doc Sonnet-call via `registreer_cross_doc_bevindingen`. Issues bevatten `betreft_documenten: ["convenant"]`, `["ouderschapsplan"]` of `["convenant","ouderschapsplan"]`. De server stuurt per document alleen relevante cross-doc issues via `cross_doc`-events.
5. **Haiku-consolidatie per document**: na de cross-doc stap stuurt de server voor elk hoofd-document een `consolidatie`-event met een semantisch gededupliceerde versie van alle issues (structuur + bevindingen + cross_doc gecombineerd). Implementatie: `consolideer_issues`-tool, model `claude-haiku-4-5-20251001`. Als de call mislukt → niet-fataal, frontend valt terug op `dedupIssues()`.
6. Afsluiting: `klaar`-event.

**`perDocResultaten`** (Map): bestandsnaam → `{ structuurR, bevindingenR }` — interne accumulator die na de per-doc loop de ruwe resultaten per document vasthoudt voor de consolidatiepass.

**`crossIssuesPerDoc`** (Map): bestandsnaam → issues[] — vasthouden van cross-doc issues per document voor dezelfde consolidatiepass.

**Er is geen Haiku-consolidatiestap meer.** Deduplicatie binnen één document zit in de bevindingen-prompt (`ZELFCONTROLE`-sectie). Cross-document deduplicatie zit niet in de client maar in de aparte cross-doc call.

### Cross-doc issues: tabblad-toewijzing en passage-zoeken

Cross-doc issues worden door de server toegewezen aan het `bestandsnaam`-slot van één van de documenten. De frontend kent `betreft_documenten` **niet** — het veld bestaat niet in `index.html`. De badge "Cross-doc" wordt uitsluitend gebaseerd op aanwezigheid van `cross_doc_id`.

**Passage-zoeken bij cross-doc kaart (2026-07):** Als de gebruiker op een cross-doc issue-kaart klikt en de passage niet gevonden wordt in het huidige tabblad, schakelt de app automatisch naar het andere tabblad en zoekt daar:
```js
if (_isCrossDoc && !isGehighlightd() && huidigeDocumenten.length > 1) {
  const inactieveTab = document.querySelector('.doc-tab:not(.actief)');
  inactieveTab?.click();
  await new Promise(r => setTimeout(r, 120));
  await zoekEnScrollNaarPassage(passage);
  // als nog steeds niet gevonden → terug naar origineel tabblad
}
```

### Zoeken in het documentpaneel: de highlighters leveren de ankers

`_zoekAnkers` is de lijst waar de teller (`1 / 12`) en de vorige/volgende-knoppen op
draaien. **`highlightInPdf()` en `highlightInDocx()` vullen die lijst zelf**, met precies
één anker per treffer. De aanroepers (`zoekInDocument`, `renderDocPanel`) resetten hem en
roepen beide highlighters aan — meer niet.

Zelf `querySelectorAll('.hl-match')` doen ná die aanroepen telt alles dubbel:

- `highlightInPdf` markeert élke `.textLayer`-span die een treffer raakt, maar duwt alleen
  de eerste in `_zoekAnkers` — één treffer kan over drie spans lopen.
- `highlightInDocx` maakt één `<mark>` per **tekstnode**; een woord dat halverwege vet
  wordt levert twee marks op. Vandaar `mark.dataset.match` als volgnummer van de treffer,
  en één anker per uniek nummer.
- `.docx-inhoud` en `.textLayer` staan bovendien niet alleen in `#documentPanel` — het
  conceptpaneel heeft er ook een. Document-brede selectors halen die er dus bij.

Op 24-08-2026 gaf de zoekbalk daardoor `9 / 21` op een document met tien treffers, en liep
vorige/volgende door dezelfde plek heen. Bewaakt door `tests/e2e/smoke/08-doc-zoeken.spec.js`;
`hintFrac` in `highlightInPdf` zet bovendien `_zoekIdx` op een index in de PDF-ankers, dus
er mag niets vóór die ankers in de lijst belanden.

**De cross-doc-call kreeg tot 24-08-2026 de gedeelde regels NIET.** Hij startte met alleen
`bouwSysCrossDoc()` + de documentteksten — geen `stabielGedeeld`. Daardoor golden voor hem
niet: de verwijzingsregel (verwijst document A voor een onderwerp naar document B, rapporteer
dan geen ontbrekende regeling), de samenhangregels voor kop/bevinding/passage, en de
pseudonimiseringsnota — terwijl de tekst wél door `vervangPii` gaat.

Dat leverde bevindingen op als *"convenant vermeldt één woonadres voor alle kinderen"*, terwijl
datzelfde convenant in de aanhef naar het ouderschapsplan verwijst voor álle kinderafspraken.
De regel die dat had moeten tegenhouden gebruikt die zin letterlijk als voorbeeld.

Hij krijgt nu `bouwStabielCrossDoc(vandaag, situatieKenmerken)` — hetzelfde blok mín
`ERNST_CRITERIA`, want die staan al in `cross-doc.js` zelf. Let op: `vandaag` is daarvoor uit
`analyseDoc` naar het verzoek-bereik verplaatst; stond hij daar nog, dan gooit de cross-doc-call
een `ReferenceError` — en die treedt alleen op bij twee of meer documenten.

**Twee inhoudelijke regels in `cross-doc.js`:**
- **Hoofdverblijfplaats ≠ woonadres.** Het ouderschapsplan wijst een OUDER aan, het convenant
  noemt een ADRES. Wonen beide ouders nog op hetzelfde adres — bij een concept de regel — dan
  hóórt er één adres te staan. Geen tegenstrijdigheid.
- **Een aangekondigde wijziging is geen tegenstrijdigheid.** "De vrouw betrekt binnen zes maanden
  eigen woonruimte" naast de huidige toestand is een volgorde in de tijd.

**Eval-dekking:** `tests/golden/fixtures/cross-doc-hoofdverblijf.json` is de enige fixture met
twee documenten, en dus de enige die dit pad raakt. Hij ving bij zijn eerste run meteen twee
fouten: de `vandaag`-scope hierboven, en dat de eval bij elk consolidatie-event zijn issuelijst
wiste — waardoor bij twee documenten alleen het laatste overbleef.

## Horen deze documenten bij hetzelfde dossier?

Tot 25-08-2026 was dat een **aanname**, nergens getoetst. Belandde er een document van een
andere cliënt in dezelfde analyse, dan vergeleek de cross-doc-call ze braaf en leverde een
rapport vol verschillen op die geen van alle iets betekenen — terwijl de enige nuttige
melding, *dít hoort niet bij elkaar*, nergens stond.

`src/dossier-samenhang.js` (19 tests) vergelijkt de namen per document: onderscheidende
naamdelen uit tekst én bestandsnaam, tussenvoegsels en delen korter dan drie tekens
weggelaten. Per documentpaar → `ok` / `twijfel` (overlap onder de helft) / `mismatch` (geen
enkele gedeelde naam). Een document zónder herkenbare naam levert nooit een oordeel op —
een taxatierapport noemt de partijen vaak niet, en zwijgen is daar het goede antwoord.

Aangeroepen in `index.html` vlak vóór de eerste analyse-call (na `bouwAnonMap`, want dan
zijn de namen bekend; vóór de PII-placeholders bij `naarAnon` komen). Bij niet-`ok` een
`confirm()`; kiest de gebruiker afbreken, dan gaat er een `Error` met `afgebroken = true`
omhoog, die de catch in `startAnalyse` neutraal toont in plaats van "Kon de documenten niet
analyseren" — dat zou een keuze als storing presenteren.

> **Waarom deterministisch en niet in de prompt.** Dat is gemeten, niet aangenomen. De
> hoofdverblijf-regel hierboven hield in zes runs vier keer stand en twee keer niet, en
> aanscherpen naar het "ABSOLUUT VERBOD"-register — dezelfde formulering als de
> voornaamwoord-regel, die wél lijkt te houden — veranderde daar niets aan: 2 van 3 vóór,
> 2 van 3 ná. Een promptregel geeft hier een neiging, geen slot.
>
> `_prompts/cross-doc.js` heeft daarnaast wél een dossier-mismatch-regel als backstop, en
> die werkt: precies één cross-doc-bevinding, ernst hoog, met de namen uit beide documenten.
> Eén afgeleide bevinding blijft staan (een bedragvergelijking uit een *per-document*-pass,
> waar cross-doc.js niet bij kan) — bewust niet achterna gejaagd; zie `_bekend_residu` in
> `tests/golden/fixtures/cross-doc-verschillende-dossiers.json`.

Zie de `screening-categorien` skill voor categoriedefinities en ernst-criteria.

---

## Issue-telling: chip vs. overzichtsring vs. opgeslagen rapport

Er zijn drie plaatsen die issue-aantallen tonen — ze gebruiken bewust dezelfde filter:

| Context | Functie | Filter |
|---------|---------|--------|
| Analyse-chip (split-view) | `_renderProgressief` | `!negeer && !afgehandeld` + `_geenIssuePat` |
| Dossier-overzichtsring | `maakDocKolommenHtml` | `!negeer && !afgehandeld` |
| Opgeslagen rapport (`_docResultaten`) | `analyseer.js` → `index.html` | `_geenIssuePat` |

**Valkuilen:**
- `_geenIssuePat` verwijdert positieve bevestigingen die Claude toch laat doorglippen (bijv. `"Geen actie vereist"`). Deze filter staat in zowel `_docResultaten` als `_renderProgressief` — ze moeten synchroon blijven.
- `negeer: true` = permanent verborgen door gebruiker → telt nooit mee in chip of overzichtsring.
- `afgehandeld: true` = afgehandeld door gebruiker → telt ook niet mee (behandeld als gesloten).
- De overzichtsring toont aantallen **open issues** (= wat de chip toont), NIET het historische totaal.
- Roepnaam-kaarten komen er in `_renderProgressief` én `_docResultaten` **per bestandsnaam**
  bij, uit `_roepnaamIssuesPerBestand` — nooit als één lijst voor alle documenten. Zie de
  `screening-categorien` skill.

**Bij wijziging van de issue-filter:** pas altijd `_renderProgressief` (index.html) EN de toelichting in dit skill-bestand aan.
