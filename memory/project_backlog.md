---
name: project-backlog
description: Openstaande ontwikkeltaken voor het Documentscreening project
metadata: 
  node_type: memory
  type: project
  originSessionId: aaf51451-00e7-4d88-ba07-0617a56385a7
  modified: 2026-08-06T09:01:29.835Z
---

## Backlog

### Sentry foutmonitoring toevoegen
**Wat:** Sentry SDK integreren voor productie-foutmonitoring van de API-laag.

**Prioriteit:** API-functies eerst, met name `api/analyseer.js` en `api/claude-edge.js`.

**Hoe:** Centrale wrapper `api/_sentry.js` + `Sentry.init()` bovenaan elke handler; voor frontend één `<script>`-tag in `index.html`.

**AVG-vereisten:** EU-datalocatie (Frankfurt) instellen bij aanmaken organisatie, PII-scrubbing aan laten, DPA afsluiten via Sentry privacy-portal, nooit documentinhoud of namen in foutmeldingen.

**Geschatte inspanning:** ~2 uur inclusief DPA.

---

### DOCX lege pagina's bij Adobe PDF→DOCX conversie
**Wat:** Adobe ExportPDF geeft elke 2e pagina een blanco pagina bij PDFs met paraaf-footer-layout (bijv. "paraaf man: / paraaf vrouw: 1/28").

**Oorzaak:** Adobe maakt per PDF-pagina een Word-sectie-einde; headers/footers worden zowel als gewone paragraaf meegenomen als als Word-sectie-header/footer → dubbeldruk + blanco pagina.

**Onderzocht:** Adobe REST API (`api/adobe-start.js` r88) ondersteunt geen `noPageBreaks`-optie. Enige paramaters: `assetID`, `targetFormat` (docx/docx_tagged), `ocrLang`.

**Opties:**
1. ~~Adobe export-optie~~ — niet beschikbaar
2. Post-process DOCX-ZIP (`word/document.xml`): verwijder lege `<w:sectPr>` — haalbaar maar risicovol op productie-PDFs
3. **Huidige keuze:** bekende beperking. Workaround voor gebruikers: Ctrl+A → "Leeg alinea's verwijderen" in Word, of gebruik "Verwijder alle lege pagina's" via Word's Find & Replace (`^m` → niks).

**Why:** Geen eenvoudige API-oplossing beschikbaar zonder risico op documentsbreuk.

---

### Beheermodule: Kennisbank-sectie voor legal_chunks
**Wat:** Sectie "Kennisbank" toevoegen aan `docs/clausula-beheer.html` voor beheer van de `legal_chunks`-tabel.

**Inhoud van de sectie:**
- Status-tabel: alle chunks met `citation`, `topic_tags` en datum laatste update
- Waarschuwing als Tremanormen-chunk ouder is dan 1 jaar (update elk januari)
- Knop "Check volledigheid" — triggert `scripts/check-legal-chunks.js` via API-endpoint
- Knop "Artikel toevoegen" — formulier met artikelnummer, triggert `fetch-wetteksten.js` en schrijft direct naar Supabase via service role key (geen handmatige SQL-editor stap)

**Automatisering:**
- `scripts/fetch-wetteksten.js` is al gescript (fetch + Claude-structurering) maar schrijft nog naar een SQL-bestand
- Volgende stap: schrijf direct naar Supabase via REST API met service role key → verwijdert handmatige SQL-editor stap
- Vercel cron-job of beheerknop kan de check periodiek triggeren

**Huidige situatie:** Volledig handmatig — SQL-bestand reviewen → kopiëren naar seed-bestand → uitvoeren in Supabase SQL-editor.

**Why:** Tremanormen worden jaarlijks bijgewerkt (januari); wetswijzigingen zijn ad hoc. Een beheerknop verlaagt de drempel en voorkomt dat updates worden vergeten.

---

### Code-gebaseerde voornaamwoord-inconsistentie detectie
**Wat:** Vervang de Claude-promptregel voor genderfouten door een deterministisch algoritme in `api/analyseer.js` dat na de Claude-calls draait op de ruwe documenttekst.

**Waarom:** Claude redeneert altijd vanuit context en externe kennis (naam-semantiek, medische vermeldingen) en genereert daardoor structureel fout-positieven. Promptregels zijn niet betrouwbaar genoeg gebleken.

**Hoe:**
1. Zoek alle zinnen in de documenttekst die een volledige naam bevatten
2. Detecteer mannelijke (`hij`, `hem`, bezittelijk `zijn`) vs. vrouwelijke (`zij`, `ze`, `haar`) voornaamwoorden in dezelfde zin
3. Als dezelfde naam in sommige zinnen mannelijk en in andere vrouwelijk is → rapporteer als issue (dimensie: `grammatica`, ernst: `midden`)
4. Aandachtspunt: `zijn` is ambigu in het Nederlands — heuristiek nodig om bezittelijk (`zijn verjaardag`) van werkwoord (`zijn er problemen`) te onderscheiden

**Huidige tijdelijke maatregel:** backend-filter in `callMetSse` die issues met "voornaamwoord/geslacht/genderfout/gender" in de tekst weggooit.
