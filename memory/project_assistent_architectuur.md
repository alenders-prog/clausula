---
name: project-assistent-architectuur
description: "Clausula Assistent commandomodel — API-routing, kennisbank-injectie, issue-flow, verificatie-persistentie. Slaat de niet-voor-de-hand-liggende designbeslissingen op zodat toekomstige sessies de context kennen."
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-08-05T09:02:27.394Z
---

De Clausula Assistent (in `index.html` + `api/ai-assistent.js`) werkt met een **commandomodel**: de actie-balk is altijd zichtbaar, instellingen worden één keer geconfigureerd in localStorage, en er zijn vrijwel geen pre-flight vragen.

**Why:** eerder waren er meerdere pre-flight vragen per actie (varianten, referentie, stijl) wat de mediator het gevoel gaf de regie kwijt te zijn. Het commandomodel herstelt controle.

**How to apply:** bij nieuwe assistent-features: geen vragen toevoegen aan het pad, alleen aan het instellingen-panel.

Twee API-paden — NIET verwisselen:
- **Zoekloop** (`rawModus=false`): vrije chat + opties. Claude heeft `zoek_juridisch` + `zoek_web` tools beschikbaar.
- **rawModus** (`rawModus=true`): clausule/mail/klanttekst. Geen zoekloop. Kennisbank wordt server-side pre-geïnjecteerd als `[JURIDISCHE KENNISBANK]`-blok op basis van eerste significant woord uit de vraag.

Issue-flow non-obvious details:
- `_assistAddedBufIds` Set voorkomt duplicaten bij dubbele klik (leeft in geheugen, niet persistent)
- `passage`-veld = clausuletekst vóór `---TOELICHTING---`, max 600 tekens
- Live refresh via `_activeerAnalysePanelFn(app.rapport)` — `renderIssues` bestaat niet

Extra verificatie persistentie:
- `issue.diepteResultaat` = volledige SSE-output incl. `---VOORSTEL---` JSON
- `issue.diepteVoorstel` = geparsed JSON `{ernst, bevinding, aanbeveling}`
- Knop wisselt naar "👁 Bekijk" zodra resultaat opgeslagen is
- `_pasVoorstelToe()` vult form-velden pre; sticky footer toont apply-knop altijd

Zie skill [[clausula-assistent]] voor code-details en valkuilen.
