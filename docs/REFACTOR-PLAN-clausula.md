# Refactorplan Clausula — van 13k-regel monoliet naar onderhoudbare modules

> **Voor Claude Code:** dit document is een opdracht in fasen. Voer eerst Fase 0 (verificatie) volledig uit en rapporteer de bevindingen voordat je iets wijzigt. Elke fase eindigt met acceptatiecriteria; ga pas door naar de volgende fase als die zijn gehaald. Werk in kleine commits, één logische stap per commit. `index.html` moet na elke commit blijven werken.

---

## Context

- `index.html` is ~13.000 regels met ~239 functies.
- `src/` bevat 5 modules die door niets worden geïmporteerd — vermoedelijk dode code van een eerdere, gestrande splitsingspoging.
- Er is bewust géén build-stap; deployment is statisch via Vercel.
- Losse pagina's bestaan al en werken: `login.html`, `registreer.html`, `assistent-mobiel.html`.
- Gedeelde mutabele globale state: o.a. `_huidig`, `_analyse`, `_assist`, `_generaties`, `_rapport`.
- Er zijn (voor zover bekend) geen geautomatiseerde tests.

**Kerndiagnose:** het probleem is niet het ontbreken van een bundler, maar (a) de gedeelde mutabele globals en (b) het feit dat module-scope ≠ global scope, waardoor functies in ES-modules niet bereikbaar zijn vanuit inline `onclick`-handlers. Native `<script type="module">` werkt prima op Vercel zonder build-stap — Vite is dus optioneel en komt pas aan het eind in beeld, niet aan het begin.

**Strategie in één zin:** eerst een vangnet (smoketests), dan de state expliciet maken, dan pas code verplaatsen.

---

## Fase 0 — Verificatie en inventarisatie (alleen lezen, niets wijzigen)

Controleer de aannames hierboven tegen de werkelijke codebase en rapporteer:

1. **Dode code bevestigen.** Welke bestanden staan in `src/`? Wordt er ergens (index.html, andere HTML-pagina's, Vercel-config) naar verwezen? Zo ja, waar?
2. **Globals inventariseren.** Zoek alle top-level `let`/`var`/`const` declaraties en impliciete window-assignments in de `<script>`-blokken van `index.html`. Lever een lijst: naam, type (object/array/primitief), en een schatting van hoeveel functies elke global lezen en/of muteren. Focus op `_huidig`, `_analyse`, `_assist`, `_generaties`, `_rapport` maar wees volledig.
3. **Inline handlers tellen.** Hoeveel `onclick=`, `onchange=`, `oninput=`, `onsubmit=` etc. staan er in de HTML? Deze bepalen hoeveel functies op `window` bereikbaar moeten blijven tijdens de migratie.
4. **Functie-clusters identificeren.** Groepeer de ~239 functies grofweg per domein: auth, dossier/state, screening/analyse, concept-generatie (SSE/track-changes), rapport/PDF, DOCX/RTF-export, embedded assistent, PII-anonimisering, UI-helpers, overig. Per cluster: aantal functies en welke globals ze raken.
5. **Kritieke flows benoemen.** Welke user-flows zijn end-to-end te testen? Minimaal verwacht: inloggen → dossier openen → screening draaien → rapport bekijken → exporteren.

**Output van deze fase:** een beknopt rapport (mag als `docs/fase0-inventarisatie.md` in de repo) met bovenstaande vijf punten. **Stop daarna en wacht op akkoord.**

Acceptatiecriteria:
- [ ] Rapport aanwezig met alle vijf onderdelen
- [ ] Geen enkele regel productiecode gewijzigd

---

## Fase 1 — Vangnet: Playwright-smoketests

Doel: regressiezekerheid vóór er ook maar iets verplaatst wordt. Geen unit-tests op 239 functies — dat is nu niet haalbaar — maar 4 à 6 end-to-end smoketests op de kritieke flows uit Fase 0.

1. Installeer Playwright als dev-dependency (aparte `package.json` mag; dit raakt de runtime niet).
2. Schrijf smoketests voor minimaal:
   - Login-flow (met een testaccount of gemockte Supabase-auth — kies wat haalbaar is en licht toe)
   - Dossier openen en state-opbouw (assert dat de UI de verwachte secties toont)
   - Screening starten en resultaat renderen (API-respons mag gemockt/gefixtured worden om kosten en flakiness te vermijden)
   - Rapportweergave
   - Export-trigger (RTF/DOCX): assert dat de download start of het juiste endpoint wordt aangeroepen
3. Mock externe calls (Anthropic API, Voyage) met fixtures; test tegen een lokale static server of Vercel preview.
4. Voeg een npm-script toe: `npm test` draait de suite headless.

Acceptatiecriteria:
- [ ] `npm test` draait groen, lokaal reproduceerbaar
- [ ] De tests falen aantoonbaar als je een kritieke functie bewust breekt (verifieer dit één keer)
- [ ] Geen wijzigingen aan `index.html` zelf, behalve eventueel `data-testid`-attributen

---

## Fase 2 — State expliciet maken

Doel: de gedeelde globals krijgen één eigenaar, zodat functies daarna verplaatsbaar worden. Nog steeds geen build-stap nodig.

1. Maak `src/state.js` (of hergebruik/vervang wat er al staat als dat past) met een eenvoudig store-object:
   ```js
   export const app = {
     huidig: null,
     analyse: null,
     assist: null,
     generaties: [],
     rapport: null,
   };
   // Overgangsbrug voor niet-module code en inline handlers:
   window.app = app;
   ```
   Geen framework, geen reactivity — alleen een expliciet, geëxporteerd object.
2. Vervang in `index.html` alle lees/schrijf-referenties naar de losse globals door `app.huidig`, `app.analyse`, etc. Doe dit mechanisch en per global (één commit per global), draai na elke global de smoketests.
3. Verwijder de oude losse declaraties pas als alle referenties zijn omgezet.
4. Documenteer in `docs/state.md` kort welke velden er zijn, wat ze betekenen en wie ze muteert (op clusterniveau uit Fase 0).

Bewust níet in deze fase: getters/setters, events, immutability. Eerst alleen centraliseren; verfijnen kan later als het nodig blijkt.

Acceptatiecriteria:
- [ ] Alle voormalige globals leven op één plek (`app`)
- [ ] Smoketests groen na elke commit
- [ ] `docs/state.md` aanwezig

---

## Fase 3 — `src/` aansluiten via native ESM (of opruimen)

Doel: einde aan de dode code. Alles in `src/` wordt óf echt gebruikt, óf verwijderd.

1. Beoordeel per bestaande module in `src/` (o.a. `pii-anonimiseer.js`): is de code actueel ten opzichte van de kopie in `index.html`? Zo nee: welke versie is leidend? Rapporteer eerst, kies dan.
2. Sluit bruikbare modules aan met native ESM, zonder build-stap:
   ```html
   <script type="module">
     import { app } from './src/state.js';
     import { anonimiseer } from './src/pii-anonimiseer.js';
     // Functies die inline handlers nodig hebben tijdelijk exposen:
     window.anonimiseer = anonimiseer;
   </script>
   ```
3. Verwijder de nu dubbele implementaties uit `index.html` zodra de module-versie aantoonbaar wordt gebruikt (smoketests + handmatige check).
4. Extraheer daarna in dit patroon de laag-risico clusters uit Fase 0 — kandidaten in oplopende koppeling: pure helpers → PII-anonimisering → PDF-definitie (`buildPdfDef()`) → export-client. **Niet** in deze fase: concept-generatie (SSE/track-changes) en de embedded assistent; die blijven in `index.html` tot Fase 4 of een expliciet besluit.
5. Elke extractie: één module per commit, smoketests groen, inline handlers die de functie gebruiken via `window.*` bereikbaar houden of ombouwen naar `addEventListener`.
6. Wat niet aangesloten wordt, gaat weg. Geen half-dode code laten staan.

Let op (bekende valkuilen zonder bundler):
- Module-scripts zijn `deferred` — code die vóór DOM-ready op globals rekent kan volgorde-gevoelig zijn.
- Lokaal testen vereist een HTTP-server (`npx serve` o.i.d.); `file://` werkt niet met ESM.
- Vercel serveert `.js` met correcte MIME-type; geen configuratie nodig, maar verifieer één keer op een preview-deploy.

Acceptatiecriteria:
- [ ] Nul dode bestanden in `src/`
- [ ] Minimaal PII-anonimisering en één export-gerelateerde module draaien aantoonbaar vanuit `src/`
- [ ] `index.html` bevat geen dubbele implementaties meer van geëxtraheerde functies
- [ ] Smoketests groen op een Vercel preview-deploy

---

## Fase 4 (optioneel, apart besluit) — Vite incrementeel

Alleen starten na expliciet akkoord, en alleen als er na Fase 3 nog concrete behoefte is (TypeScript, bundling, tree-shaking, of extractie van de zwaar gekoppelde clusters: concept-generatie en embedded assistent).

Aanpak als het zover komt:
1. Vite toevoegen met `index.html` als entry point — Vite gebruikt HTML als entry, dus de bestaande pagina kan vrijwel ongewijzigd blijven draaien. Dit is géén big-bang.
2. Verifieer dat de Vercel-deploy (build output) identiek gedrag geeft; smoketests tegen de preview.
3. Daarna pas de resterende clusters extraheren, in dezelfde stijl als Fase 3: één cluster per keer, tests groen.

---

## Werkafspraken (gelden voor alle fasen)

- **Kleine commits**, beschrijvende messages, `index.html` werkt na elke commit.
- **Smoketests draaien** vóór elke commit vanaf Fase 1.
- **Geen scope-creep:** geen framework introduceren, geen TypeScript, geen restyling, geen "nu we toch bezig zijn"-refactors buiten de fase-omschrijving.
- **Rapporteer en stop** bij elk acceptatiecriterium dat niet haalbaar blijkt; niet zelf een alternatieve route kiezen zonder overleg.
- Bij twijfel over welke code leidend is (index.html vs. `src/`): eerst rapporteren, dan pas kiezen.
