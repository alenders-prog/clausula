# Fase 0 — Inventarisatie Clausula refactor

> Geen productiecode gewijzigd. Dit is uitsluitend een lees-rapport.  
> Datum: 2026-07-30 | Codebase: `index.html` 13.013 regels, 239 functies.

---

## 1. Dode code in `src/`

Alle vijf modules zijn bevestigd dood in productie. Geen enkele wordt geïmporteerd door `index.html`, andere HTML-pagina's of `vercel.json`. Ze worden alleen gerefereerd vanuit unit-tests.

| Bestand | Exports | Inline kopie in `index.html`? |
|---|---|---|
| `src/pii-anonimiseer.js` | `piiAnonimiseer` | Ja — r. 8037 (comment erkent dit) |
| `src/chips/hml-counts.js` | `telHml`, `filterActief`, `kopKlasse`, `hmlSegs`, `maakGrad` | Ja — `maakGrad` als const arrow r. 10486 |
| `src/rapport/sorteer-docs.js` | `DOC_VOLGORDE`, `sorteerOpDocType`, `sorteerOpType` | Deels — inline versie heeft 4 doc-types, src heeft er 2 (divergent) |
| `src/rapport/merge-rapport.js` | `bouwSubRapport` | Niet gevonden — mogelijk verouderd of verwijderd uit `index.html` |
| `src/viewer/primaire-best.js` | `CONTEXT_HOOFD_MAP`, `raadDocType`, `contextVoorHoofd`, `vindEigenBestanden`, `bouwPrimaireBest` | Ja — `raadDocType` r. 10073, `contextVoorHoofd` r. 10068, `CONTEXT_HOOFD_MAP` r. 10061 |

**Conclusie:** de `src/`-extracties zijn een eerdere, gestrande splitsingspoging. Ze lopen uit de pas met de inline versies (zie `sorteer-docs.js`). In Fase 3 moet per module beslist worden welke versie leidend is.

---

## 2. Globals inventarisatie

### Centrale state-variabelen (meest gemuteerd, bepalend voor extractievolgorde)

| Naam | Type | ~Schrijvers | Betekenis |
|---|---|---|---|
| `huidigRapport` | object | 15+ | Het complete analyserapport van de geladen screening — meest gemuteerde object in de hele app |
| `_assist` | object (properties) | 20+ | Volledige embedded-assistent state (conversatie, dossierkoppeling, UI-flags) |
| `tray` | array | 10+ | Actieve upload-bestanden met metadata |
| `huidigeDocumenten` | array | 5 | Alle geladen documenten in de huidige analyse |
| `huidigeDossierId` | string | 5 | ID van het actieve dossier |
| `huidigDossierNaam` | string | 5 | Naam van het actieve dossier |
| `huidigeDocIdx` | number | 6 | Actieve tab-index in multi-document view |
| `_generaties` | Map | 5 | Alle concept-generaties (id → status/tekst/wijzigingen) |
| `_conceptWijzigingen` | array | 4 | Wijzigingslijst van het actieve concept |
| `_wijzigingAcceptatie` | Map | 4 | Accept/afwijs-status per wijziging-index |
| `huidigeNaarAnon` | Map | 3 | Naam → pseudoniem mapping (AVG-pipeline) |
| `huidigeNaarEcht` | Map | 3 | Pseudoniem → echte naam mapping (AVG-pipeline) |
| `huidigeNaarEchtVolledig` | Map | 2 | Uitgebreide reverse-mapping voor herstel |
| `huidigeBestandenLijst` | array | 4 | Geladen bestandsobjecten voor de viewer |
| `huidigePrimaireBest` | array | 3 | Primaire bestanden per hoofddocument |
| `tekstPerPad` | Map | 4 | Cache: bestandspad → geëxtraheerde tekst |
| `docxPerBestandsnaam` | Map | 3 | Cache: bestandsnaam → DOCX-blob |
| `huidigeClassificatie` | object | 4 | Document-type classificatie van de huidige screening |
| `huidigeId` | string | 5 | Supabase-ID van de geladen screening |

### Hulpvariabelen (1–3 schrijvers, minder kritiek)

Auth: `_bearerToken`, `_praktijknaam`, `_mediatorNaam`, `_orgId`, `_userId`, `_userRol`, `_orgNaam`  
Viewer: `huidigePdfDocCache`, `docPanelGereed`, `renderGeneratie`, `_docZoom`, `_docHuidigePagina`, `_docTotalPaginas`, `_paginaObserver`  
Zoek: `_zoekAnkers`, `_zoekIdx`, `_passageHintFrac`  
Concept: `_conceptDocumentTekst`, `_conceptOriginelePdf`, `_conceptGewijzigdDocx`, `_conceptDocType`, `_conceptGenId`, `_toegepasteWijzigingIdx`, `_alVerwerktWijzigingIdx`, `_genTeller`  
Overig: `_ocrWorker`, `_docxLib`, `_autoSaveTimer`, `_issueSortModus`, `_activeerAnalysePanelFn`, `_assistClausuleBuffer`  
Wizard: `_wizDossierId`, `_wizDossierNaam`, `wizardRoepnaamA`, `wizardRoepnaamB`, `_wizTray`  
Dossier: `huidigDossierData`, `huidigDossierVersies`, `huidigFilter`, `alleDosCacheData`, `splitOrigin`, `actieveKaart`, `huidigeExtractedTexts`

### Constanten / definities (0 mutaties na declaratie)

`MFN_ELEMENTEN`, `classificatieTool`, `rapportTool`, `OCR_DREMPEL_CHARS_PER_PAGINA`, `DOC_TYPES`, `DOC_TYPE_LABELS`, `DOC_TYPE_ICONS`, `HOOFD_TYPES`, `CONTEXT_HOOFD_MAP` (dubbele van `src/`), `WIZARD_DOC_TYPES`, `TC_D0/D1/I0/I1`, `_ASSIST_PFX`, `_KOPIEER_ICO`, `_CHECK_ICO`, plus DOM-referenties (`dropzone`, `fileInput` e.a.)

### Bijzonderheid: in-HTML state-mutaties

Enkele `oninput`/`onchange`-handlers muteren `huidigRapport` direct via template-literal-subscripting zonder functiegrens:

```html
onchange="huidigRapport['${cat}'][${idx}].afgehandeld=this.checked;updateConceptKnop();autoSlaOp()"
oninput="huidigRapport['${cat}'][${idx}].opmerking=this.value;autoSlaOp()"
```

Dit zijn de moeilijkste migratiepunten: de state-mutatie zit in de HTML-string, niet in een benoemde functie.

---

## 3. Inline handlers

| Type | Aantal |
|---|---|
| `onclick=` | 82 |
| `onchange=` | 6 |
| `oninput=` | 5 |
| `onkeydown=` | 3 |
| **Totaal** | **96** |

Voorbeelden van aangeroepen functies:
`toggleAssistPanel()`, `toggleUserMenu(event)`, `wizTerug()`, `wizNaarStap2()`, `wizAnalyseStarten()`, `zoekVorig()`, `zoekVolgend()`, `docPaginaNav(-1)`, `docZoomWijzig(-1)`, `expandAll()`, `collapseAll()`, `cycleCardCheck(idx)`, `diepteAnalyse(idx)`, `verwijderGebruiker(id, naam)`, `setSortModus(value)`, `_assistVerstuur()`

**Consequentie voor Fase 3:** alle 96 functies moeten op `window` bereikbaar blijven zolang ze in inline handlers staan. Elke extractie naar een ES-module vereist tijdelijk `window.fnNaam = fnNaam` totdat de handler omgebouwd is naar `addEventListener`.

---

## 4. Functie-clusters

| Cluster | Functies (globaal) | Centrale globals gelezen | Centrale globals geschreven |
|---|---|---|---|
| **A. Auth/sessie** | uitloggen, laadPraktijknaam, toggleUserMenu, openInstellingen, wisselInstTab, laadGebruikersLijst, wisselRol, wisselDossierToegang, verwijderGebruiker (~9) | `db`, `_orgId`, `_userId` | `_praktijknaam`, `_orgNaam` |
| **B. Dossier/CRUD** | laadDossiers, slaDosnamenOp, toonDossierDetail, gaTerug, slaPartijNamenOp, maakDossier, zetDossierContext (~9) | `db`, `huidigFilter` | `huidigeDossierId`, `huidigDossierNaam`, `tray`, `alleDosCacheData` |
| **C. Screening/analyse** | analyseDocument, extractText, ocrWorkerOphalen, ocrPagina, bestandNaarBase64, adobeConverteerPdf, askClaudeForJson, _saniteerToolJson, vindDocVolgorde, checkIssueKwaliteit, dedupIssues (~11) | `tray`, `tekstPerPad`, `_bearerToken` | `huidigeClassificatie`, `huidigRapport`, `huidigeDocumenten`, `tekstPerPad` |
| **D. Rapport opslaan** | opslaan, autoSlaOp, voegStandaardveldenToe, samenstellenBestandsnaam (~4) | `huidigRapport`, `huidigeId`, `huidigeNaarEcht` | `huidigeId`, `_autoSaveTimer` |
| **E. Rapport renderen/UI** | toonRapport, herlaadChipTellers, sorteerIssues, setSortModus, issueKaart, kaart, lijstKaarten, syncCrossDocIssue, cycleCardCheck, toggleCardBody, filterIssues, diepteAnalyse, updateConceptKnop, expandAll, collapseAll (~24) | `huidigRapport`, `huidigeClassificatie`, `huidigeDocIdx`, `_generaties` | `huidigRapport` (cycleCardCheck), `_issueSortModus`, `actieveKaart` |
| **F. Rapport/PDF-afdrukken** | buildPdfDef (+ 7 inners), berekenGemiddeldeScore, berekenDeelscores, bouwScoreBannerHtml, dossierChipsHtml, maakDocKolommenHtml, maakBestandenHtml (~14) | `huidigRapport`, `huidigeClassificatie` (via args) | Geen — pure render-functies |
| **G. RTF-export** | rtfEscape, rtfPar, rtfItem, rtfSectie, buildRtf (~5) | Geen | Geen — pure functies |
| **H. Document-viewer** | renderDocPanel, renderPdfPaginas, _updateDocNav, _setupPaginaObserver, docPaginaNav, docZoomWijzig, openSplitView, closeSplitView, zoekInDocument, zoekVolgend, zoekVorig, highlightInPdf, highlightInDocx, toonTekstFallback, normChars, normPassage, vindPassageFractie, zoekEnScrollNaarPassage (~25) | `huidigeBestandenLijst`, `huidigePrimaireBest`, `huidigeDocIdx`, `_zoekAnkers` | `huidigePdfDocCache`, `_zoekAnkers`, `_zoekIdx`, `huidigeDocIdx` |
| **I. Concept-generatie** | pasWijzigingenToe, slaConceptOp, renderConceptChips, haalDocTypeTekst, toonConceptReview (+ inners), markeerWijzigingenInDom, bouwTrackChangesOpOrigineel, bouwTrackChangesTekst, renderRegelMetTC, preprocessConceptTekst, documentTekstNaarHtml, _geaccepteerdeWijzigingen, verzamelAangevinkt (~20) | `huidigRapport`, `huidigeDocIdx`, `huidigePrimaireBest`, `_conceptWijzigingen` | `_conceptDocumentTekst`, `_conceptWijzigingen`, `_wijzigingAcceptatie`, `_generaties`, `_genTeller` |
| **J. DOCX-export** | _bouwExportDocx, maakDocxVanTekst, laadDocxLib, documentTekstNaarDocx, pasWijzigingenToeInDocx, pasWijzigingenToeSchoon, vervangInDocxXml, voegVoettekstToeAanDocx, cleanupDocxArtefacten, schoonmaakMammothHtml (~10) | `_conceptOriginelePdf`, `_conceptWijzigingen`, `_wijzigingAcceptatie`, `_bearerToken` | `docxPerBestandsnaam`, `_conceptGewijzigdDocx`, `_docxLib` |
| **K. PII-pseudonimisering** | bouwAnonMap, _maakPiiTracker, anonimiseerTekst, piiAnonimiseer (inline kopie), herstelAnonObj, anonimiseerObj, bouwClassificatiePseudo, escRx (~8) | `huidigeNaarAnon`, `huidigeNaarEcht` | `huidigeNaarAnon`, `huidigeNaarEcht`, `huidigeNaarEchtVolledig` |
| **L. Upload-tray** | trayUid, trayTypeOpties, trayRender, trayVoegToe, trayVoegOpslaanToe, raadDocType (inline kopie), contextVoorHoofd (inline kopie) (~7) | `tray`, `DOC_TYPES` | `tray` |
| **M. Wizard** | openWizard, sluitWizard, wizTerug, wizNaarStap2, wizAnalyseStarten, wizRenderDocs, wizVoegBestandenToe, wizInit (~17) | `_wizTray`, `db` | `_wizDossierId`, `wizardRoepnaamA/B`, `_wizTray` |
| **N. Embedded assistent** | toggleAssistPanel, _assistVerstuur, _assistVoegToeAlsIssue, _assistGenClausule, _assistGenKlanttekst, _assistHerstelNamen, _assistLaadDossiers, + ~35 overig (~45) | `_assist`, `huidigRapport`, `huidigeNaarAnon`, `_bearerToken` | `_assist` (alle velden), `huidigRapport` |
| **O. UI-helpers / pure** | escH, _dossierNaam, maakGrad (const), segCircle (const), maakDocCircels (const), getPassage, isGehighlightd, haalCitaatUitTekst (~8) | Minimaal | Geen |
| **Totaal** | **~216 functies** | | |

**Aantekening:** 239 functies vs. ~216 in clusters — ~23 zijn geneste inners (gedefinieerd binnen andere functies, niet top-level), met name in `buildPdfDef` en `toonConceptReview`.

---

## 5. Kritieke flows

### Flow 1: Inloggen
Startup-IIFE → `db.auth.getSession()` → redirect naar `login.html` als geen sessie → `db.from('gebruikersprofiel').select()` → zet `_orgId`, `_userId`, `_userRol`, `_mediatorNaam` → `laadPraktijknaam()` → vult topbar-DOM → `laadDossiers()`.  
*Testbaar via:* sessie-state check op landing + aanwezigheid dossiertabel.

### Flow 2: Dossier openen / state opbouwen
Klik `.dos-kaart` (event listener) → `laadScreening(id, origin)` → `openSplitView()` → Supabase-query screeningen → `naam-decrypt` API → `herstelAnonObj` → `bouwAnonMap` → download bestanden Supabase Storage → `toonRapport` → `renderDocPanel`.  
*Globals geïnitialiseerd:* `huidigeId`, `huidigRapport`, `huidigeNaarEcht/Anon`, `huidigeBestandenLijst`, `huidigePrimaireBest`, `huidigeDocumenten`.

### Flow 3: Screening starten → rapport renderen
`analyseBtn` click → `analyseDocument(tray)` → `extractText` (mammoth/PDF.js/Tesseract) → `askClaudeForJson(classificatieTool)` → `askClaudeForJson(rapportTool)` → `dedupIssues` → `bouwAnonMap` → `voegStandaardveldenToe` → `toonRapport` → `opslaan`.  
*Testbaar met:* gemockte `/api/analyseer` SSE-respons + fixture-data.

### Flow 4: Rapport bekijken / PDF afdrukken
`toonRapport` → `bouwAnalyseHtml` → `issueKaart`/`kaart` (DOM-inject) → passage-klik → `zoekEnScrollNaarPassage` → `highlightInPdf`/`highlightInDocx`.  
PDF: print-knop → `buildPdfDef` → `pdfMake.createPdf().download()`.  
RTF: export-knop → `buildRtf` → Blob-download.  
*Testbaar via:* DOM-assertions na `toonRapport` met fixture-rapport.

### Flow 5: Concept genereren → DOCX exporteren
"Genereer concept"-knop → `verzamelAangevinkt` → SSE-fetch `/api/claude-edge` → `pasWijzigingenToe` → `slaConceptOp` → `renderConceptChips`.  
Chip klik → `toonConceptReview` → accept/afwijs per kaart → vult `_wijzigingAcceptatie`.  
Download → `_bouwExportDocx` → `adobeConverteerPdf` (als PDF-basis) → `pasWijzigingenToeInDocx` → Blob-download.  
*Testbaar via:* gemockte SSE-stream met fixture-wijzigingen + assert op chip-render.

---

## Bevindingen voor faseplanning

| Bevinding | Impact op fasen |
|---|---|
| `huidigRapport` heeft 15+ schrijvers verspreid over 6 clusters | Fase 2 (state expliciet): begin met `huidigRapport` als eerste — het is de risicovolste global |
| 82 `onclick=`-handlers vereisen globale bereikbaarheid | Fase 3: elke extractie tijdelijk via `window.fn = fn` totdat handlers omgebouwd zijn |
| In-HTML state-mutaties (`onchange="huidigRapport[...]=..."`) | Fa 3/4: moeten als laatste worden aangepakt — ze zijn niet te migreren zonder de HTML-template te herschrijven |
| `src/rapport/sorteer-docs.js` is divergent (2 vs. 4 doc-types) | Fase 3: inline versie is leidend; src-versie corrigeren of overschrijven |
| Clusters G (RTF) en O (UI-helpers/pure) zijn volledig puur | Eerste kandidaten voor Fase 3-extractie — geen globals, geen online handlers |
| Cluster F (PDF-definitie) is nagenoeg puur (krijgt data via args) | Tweede kandidaat Fase 3 |
| Clusters I (concept) en N (assistent) raken de meeste globals | Laatste voor extractie — pas aan het eind van Fase 3 of Fase 4 |

---

## Acceptatiecriteria Fase 0

- [x] Rapport aanwezig met alle vijf onderdelen
- [x] Geen enkele regel productiecode gewijzigd
