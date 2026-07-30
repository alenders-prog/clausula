# App-state overzicht — Clausula

Centrale mutabele state van de applicatie. Alle velden leven op `window.app`
(gedefinieerd in `index.html` bovenaan het `<script>`-blok; canonieke definitie
in `src/state.js` voor gebruik als ES-module in Fase 3).

---

## Velden

| Property | Type | Was (vóór Fase 2) | Schrijvers (clusters) |
|---|---|---|---|
| `app.dossierId` | `string\|null` | `huidigeDossierId` | B (Dossier/CRUD), M (Wizard) |
| `app.dossierNaam` | `string\|null` | `huidigDossierNaam` | B, M, N (Assistent) |
| `app.screeningId` | `string\|null` | `huidigeId` | C (Analyse), D (Opslaan), laadScreening |
| `app.classificatie` | `object\|null` | `huidigeClassificatie` | C, E (Render), toonRapport |
| `app.rapport` | `object\|null` | `huidigRapport` | C, D, E, cycleCardCheck, autoSlaOp (15+ schrijvers) |
| `app.documenten` | `array` | `huidigeDocumenten` | C, E, toonRapport |
| `app.docIdx` | `number` | `huidigeDocIdx` | H (Viewer), tab-switching |
| `app.bestanden` | `array` | `huidigeBestandenLijst` | H, laadScreening |
| `app.primaireBest` | `array` | `huidigePrimaireBest` | H, laadScreening (geneste array per doc) |
| `app.tray` | `array` | `tray` | L (Upload-tray), zetDossierContext |

**Nog niet op `app`** (buiten scope Fase 2, hogere koppeling):
- `_generaties` (Map) — concept-generatie chips
- `_conceptWijzigingen`, `_wijzigingAcceptatie` — concept-review state
- `huidigeNaarAnon`, `huidigeNaarEcht`, `huidigeNaarEchtVolledig` — PII-mapping
- `tekstPerPad`, `docxPerBestandsnaam` — caches
- `_assist` (complex object) — embedded-assistent state (Cluster N, 20+ schrijvers)

---

## Toegang

**Vanuit JavaScript-functies:**
```js
app.rapport      // lezen
app.rapport = x  // schrijven
```

**Vanuit inline handlers** (genereerde HTML):
```html
onchange="app.rapport['art'][0].afgehandeld=this.checked"
```
Werkt omdat `window.app = app` — `app` is een globale variabele.

**Vanuit tests** (Playwright):
```js
await page.evaluate(() => {
  app.rapport = fixture;
  app.classificatie = cls;
});
```

---

## Schrijversoverzicht per veld

`app.rapport` is het meest gemuteerde veld (15+ schrijvers in 6 clusters):
- `analyseDocument()` — zet initieel rapport na analyse
- `toonRapport()` — leest en rendert
- `cycleCardCheck()` — muteert `.issues[i].afgehandeld`
- `autoSlaOp()` / `opslaan()` — persisteert naar Supabase
- `laadScreening()` — laadt opgeslagen rapport
- Inline handlers via gegenereerde HTML-strings

`app.tray` wordt alleen gemuteerd via de tray-functies (`trayVoegToe`, `trayRender`,
`trayVoegOpslaanToe`) en via directe reset in `zetDossierContext` en `trayWisBtn`.
